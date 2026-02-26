/**
 * Client API centralisé avec interception automatique des 401
 * 
 * Ce client gère:
 * - Interception des erreurs 401 et refresh automatique du token
 * - Queue des requêtes pendant le refresh pour éviter les doublons
 * - Retry automatique après refresh réussi
 * - Synchronisation multi-onglets via BroadcastChannel
 */

import { API_BASE_URL } from './api-config';

// Types
type TokenGetter = () => { accessToken: string | null; refreshToken: string | null };
type TokenSetter = (tokens: { accessToken: string; refreshToken: string; refreshExpiresAt: string }) => void;
type OnUnauthorized = () => void;

interface ApiClientConfig {
  getTokens: TokenGetter;
  setTokens: TokenSetter;
  onUnauthorized: OnUnauthorized;
}

interface QueuedRequest {
  resolve: (value: Response) => void;
  reject: (reason: Error) => void;
  apiUrl: string;
  options: RequestInit;
}

// État global du client
let config: ApiClientConfig | null = null;
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;
const pendingRequests: QueuedRequest[] = [];

// BroadcastChannel pour la synchronisation multi-onglets
let broadcastChannel: BroadcastChannel | null = null;

const STORAGE_KEY = 'stratum_auth_session_v1';
const BROADCAST_CHANNEL_NAME = 'stratum_auth_sync';

/**
 * Valide qu'une URL est sûre pour les appels API (prévention SSRF).
 * Autorise uniquement les URLs relatives ou celles pointant vers notre API.
 */
function getAllowedApiBaseUrl(): URL {
  // API_BASE_URL peut être relatif côté client (ex: /api/v1)
  if (/^https?:\/\//i.test(API_BASE_URL)) {
    return new URL(API_BASE_URL);
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
  return new URL(API_BASE_URL, origin);
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

function normalizeAndValidateApiUrl(input: string): URL {
  const allowedBase = getAllowedApiBaseUrl();
  const allowedOrigin = allowedBase.origin;
  const allowedPathPrefix = allowedBase.pathname.endsWith('/')
    ? allowedBase.pathname
    : `${allowedBase.pathname}/`;

  // Bloquer explicitement les URLs "protocol-relative" (//evil.com)
  if (input.startsWith('//')) {
    throw new Error('Invalid API URL: protocol-relative URLs are not allowed.');
  }

  // Ce client ne doit JAMAIS accepter une URL absolue fournie par l'appelant.
  // Cela évite toute possibilité de SSRF (choix de host/protocole) côté serveur.
  if (/^https?:\/\//i.test(input)) {
    throw new Error('Invalid API URL: absolute URLs are not allowed.');
  }

  let candidate: URL;
  try {
    if (input.startsWith('/')) {
      candidate = new URL(input, allowedOrigin);
    } else {
      candidate = new URL(input, ensureTrailingSlash(allowedBase.href));
    }
  } catch {
    throw new Error(`Invalid API URL: ${input}`);
  }

  // Autoriser uniquement l'origin de l'API configurée
  if (candidate.origin !== allowedOrigin) {
    throw new Error(`Invalid API URL: origin ${candidate.origin} is not allowed.`);
  }

  // Autoriser uniquement les chemins sous /api/v1 (ou le préfixe configuré)
  const candidatePath = candidate.pathname.endsWith('/') ? candidate.pathname : `${candidate.pathname}/`;
  if (!candidatePath.startsWith(allowedPathPrefix)) {
    throw new Error(`Invalid API URL: path ${candidate.pathname} is not under ${allowedBase.pathname}.`);
  }

  return candidate;
}

/**
 * Initialise le client API avec les callbacks de gestion des tokens
 */
export function initializeApiClient(cfg: ApiClientConfig): void {
  config = cfg;
  
  // Initialiser le BroadcastChannel pour la synchronisation multi-onglets
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    try {
      broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      broadcastChannel.onmessage = handleBroadcastMessage;
    } catch {
      // Fallback: some browsers do not support BroadcastChannel
    }
  }
  
  // Fallback: écouter les changements de localStorage pour les navigateurs sans BroadcastChannel
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorageChange);
  }
}

/**
 * Nettoie les ressources du client API
 */
export function cleanupApiClient(): void {
  if (broadcastChannel) {
    broadcastChannel.close();
    broadcastChannel = null;
  }
  if (typeof window !== 'undefined') {
    window.removeEventListener('storage', handleStorageChange);
  }
  config = null;
  isRefreshing = false;
  refreshPromise = null;
  pendingRequests.length = 0;
}

/**
 * Gère les messages de synchronisation entre onglets
 */
function handleBroadcastMessage(event: MessageEvent): void {
  if (!config) return;
  
  const { type, payload } = event.data;
  
  switch (type) {
    case 'TOKEN_REFRESHED':
      // Un autre onglet a rafraîchi les tokens, mettre à jour localement
      if (payload?.accessToken && payload?.refreshToken && payload?.refreshExpiresAt) {
        config.setTokens(payload);
      }
      break;
    case 'LOGOUT':
      // Un autre onglet s'est déconnecté
      config.onUnauthorized();
      break;
  }
}

/**
 * Fallback: gère les changements de localStorage pour la synchro multi-onglets
 */
function handleStorageChange(event: StorageEvent): void {
  if (!config) return;
  
  if (event.key === STORAGE_KEY) {
    if (event.newValue === null) {
      // Session supprimée dans un autre onglet = logout
      config.onUnauthorized();
    } else if (event.newValue !== event.oldValue) {
      // Session mise à jour dans un autre onglet
      try {
        const parsed = JSON.parse(event.newValue);
        if (parsed?.tokens?.accessToken) {
          config.setTokens({
            accessToken: parsed.tokens.accessToken,
            refreshToken: parsed.tokens.refreshToken,
            refreshExpiresAt: parsed.tokens.refreshExpiresAt,
          });
        }
      } catch {
        // Ignorer les erreurs de parsing
      }
    }
  }
}

/**
 * Notifie les autres onglets d'un changement de tokens
 */
export function notifyTokenRefresh(tokens: { accessToken: string; refreshToken: string; refreshExpiresAt: string }): void {
  if (broadcastChannel) {
    broadcastChannel.postMessage({ type: 'TOKEN_REFRESHED', payload: tokens });
  }
}

/**
 * Notifie les autres onglets d'une déconnexion
 */
export function notifyLogout(): void {
  if (broadcastChannel) {
    broadcastChannel.postMessage({ type: 'LOGOUT' });
  }
}

/**
 * Effectue le refresh du token
 */
async function performTokenRefresh(): Promise<boolean> {
  if (!config) return false;
  
  const { refreshToken } = config.getTokens();
  if (!refreshToken) {
    return false;
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
    });
    
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        // Refresh token invalide ou expiré
        return false;
      }
      // Autre erreur, on peut réessayer plus tard
      throw new Error(`Refresh failed with status ${response.status}`);
    }
    
    const data = await response.json();
    config.setTokens({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      refreshExpiresAt: data.refreshExpiresAt,
    });
    
    // Notifier les autres onglets
    notifyTokenRefresh({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      refreshExpiresAt: data.refreshExpiresAt,
    });
    
    return true;
  } catch {
    return false;
  }
}

/**
 * Gère le refresh avec protection contre les appels concurrents
 */
async function handleRefresh(): Promise<boolean> {
  // Si un refresh est déjà en cours, attendre sa résolution
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }
  
  isRefreshing = true;
  refreshPromise = performTokenRefresh();
  
  try {
    const success = await refreshPromise;
    
    if (success) {
      // Retry toutes les requêtes en attente avec le nouveau token
      const requests = [...pendingRequests];
      pendingRequests.length = 0;
      
      for (const queuedRequest of requests) {
        // Retry avec le nouveau token
        apiFetch(queuedRequest.apiUrl, queuedRequest.options)
          .then(queuedRequest.resolve)
          .catch(queuedRequest.reject);
      }
    } else {
      // Échec du refresh, rejeter toutes les requêtes en attente
      const requests = [...pendingRequests];
      pendingRequests.length = 0;
      
      for (const req of requests) {
        req.reject(new Error('Session expired'));
      }
      
      // Déclencher le logout
      if (config) {
        config.onUnauthorized();
      }
    }
    
    return success;
  } finally {
    isRefreshing = false;
    refreshPromise = null;
  }
}

/**
 * Client fetch centralisé avec gestion automatique des 401
 * 
 * @param url - URL relative ou absolue
 * @param options - Options fetch standard
 * @returns Promise<Response>
 */
export async function apiFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  if (!config) {
    throw new Error('API client not initialized. Call initializeApiClient first.');
  }
  
  const { accessToken } = config.getTokens();

  const fullUrl = normalizeAndValidateApiUrl(url);
  
  // Ajouter le header Authorization si on a un token
  const headers = new Headers(options.headers);
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }
  
  const response = await fetch(new Request(fullUrl, {
    ...options,
    headers,
  }));
  
  // Si 401 et pas déjà en train de refresh
  if (response.status === 401) {
    // Si un refresh est déjà en cours, mettre la requête en queue
    if (isRefreshing) {
      return new Promise<Response>((resolve, reject) => {
        const apiUrl = `${fullUrl.pathname}${fullUrl.search}${fullUrl.hash}`;

        pendingRequests.push({
          resolve,
          reject,
          apiUrl,
          options,
        });
      });
    }
    
    // Tenter un refresh
    const refreshSuccess = await handleRefresh();
    
    if (refreshSuccess) {
      // Retry avec le nouveau token
      const { accessToken: newToken } = config.getTokens();
      const newHeaders = new Headers(options.headers);
      if (newToken) {
        newHeaders.set('Authorization', `Bearer ${newToken}`);
      }
      
      return fetch(new Request(fullUrl, {
        ...options,
        headers: newHeaders,
      }));
    }
    
    // Refresh échoué, propager l'erreur 401
    return response;
  }
  
  return response;
}

/**
 * Helper pour les requêtes GET authentifiées
 */
export async function apiGet(url: string, options: RequestInit = {}): Promise<Response> {
  return apiFetch(url, {
    ...options,
    method: 'GET',
  });
}

/**
 * Helper pour les requêtes POST authentifiées
 */
export async function apiPost(
  url: string, 
  body?: unknown, 
  options: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(options.headers);
  if (body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  
  return apiFetch(url, {
    ...options,
    method: 'POST',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/**
 * Helper pour les requêtes PATCH authentifiées
 */
export async function apiPatch(
  url: string, 
  body?: unknown, 
  options: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(options.headers);
  if (body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  
  return apiFetch(url, {
    ...options,
    method: 'PATCH',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/**
 * Helper pour les requêtes DELETE authentifiées
 */
export async function apiDelete(url: string, options: RequestInit = {}): Promise<Response> {
  return apiFetch(url, {
    ...options,
    method: 'DELETE',
  });
}

/**
 * Helper pour les requêtes PUT authentifiées
 */
export async function apiPut(
  url: string, 
  body?: unknown, 
  options: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(options.headers);
  if (body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  
  return apiFetch(url, {
    ...options,
    method: 'PUT',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/**
 * Wrapper pour les appels existants qui utilisent encore accessToken en paramètre.
 * Cette fonction permet une migration progressive: elle intercepte les 401 et retry
 * même pour les appels qui passent le token manuellement.
 * 
 * Usage:
 * ```
 * // Ancien code (inchangé)
 * const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
 * 
 * // Nouveau code avec interception 401
 * const response = await authenticatedFetch(url, { headers: { Authorization: `Bearer ${token}` } });
 * ```
 */
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  // Compat: certains appels historiques passent une URL absolue.
  // On la "rebase" vers une URL relative sous l'API configurée, puis on réutilise la validation stricte.
  let rebasedUrl = url;
  if (/^https?:\/\//i.test(url)) {
    const allowedBase = getAllowedApiBaseUrl();
    const allowedOrigin = allowedBase.origin;
    const allowedPathPrefix = allowedBase.pathname.endsWith('/')
      ? allowedBase.pathname
      : `${allowedBase.pathname}/`;

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`Invalid API URL: ${url}`);
    }

    if (parsed.origin !== allowedOrigin) {
      throw new Error(`Invalid API URL: origin ${parsed.origin} is not allowed.`);
    }

    const parsedPath = parsed.pathname.endsWith('/') ? parsed.pathname : `${parsed.pathname}/`;
    if (!parsedPath.startsWith(allowedPathPrefix)) {
      throw new Error(`Invalid API URL: path ${parsed.pathname} is not under ${allowedBase.pathname}.`);
    }

    rebasedUrl = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  }

  // Validation SSRF / allow-list
  const fullUrl = normalizeAndValidateApiUrl(rebasedUrl);
  
  // Si le client n'est pas initialisé, faire un fetch normal
  if (!config) {
    return fetch(new Request(fullUrl, options));
  }
  
  // Utiliser le token du header si fourni, sinon prendre celui du config
  const providedAuth = options.headers instanceof Headers 
    ? options.headers.get('Authorization')
    : (options.headers as Record<string, string>)?.['Authorization'];
  
  const response = await fetch(new Request(fullUrl, options));
  
  // Si 401 et qu'on a un config, tenter le refresh
  if (response.status === 401 && providedAuth) {
    // Si un refresh est déjà en cours, mettre en queue
    if (isRefreshing) {
      return new Promise<Response>((resolve, reject) => {
        const apiUrl = `${fullUrl.pathname}${fullUrl.search}${fullUrl.hash}`;

        pendingRequests.push({
          resolve,
          reject,
          apiUrl,
          options,
        });
      });
    }
    
    // Tenter un refresh
    const refreshSuccess = await handleRefresh();
    
    if (refreshSuccess) {
      // Retry avec le nouveau token
      const { accessToken: newToken } = config.getTokens();
      const newHeaders = new Headers(options.headers);
      if (newToken) {
        newHeaders.set('Authorization', `Bearer ${newToken}`);
      }
      
      return fetch(new Request(fullUrl, {
        ...options,
        headers: newHeaders,
      }));
    }
  }
  
  return response;
}
