/**
 * Configuration centralisée de l'API
 * 
 * Architecture avec reverse proxy / rewrites:
 * - Côté client (browser): utilise /api/v1 (URL relative)
 *   Le reverse proxy (Nginx) ou Next.js rewrites redirige vers le backend
 * - Côté serveur (SSR): utilise NEXT_PUBLIC_API_URL ou BACKEND_INTERNAL_URL
 *   pour atteindre directement le backend
 * 
 * Variables d'environnement:
 * - NEXT_PUBLIC_API_URL: URL publique du backend (utilisée côté client si définie)
 * - BACKEND_INTERNAL_URL: URL interne du backend (pour SSR, ex: http://stratum-backend:4001)
 */

// Ajoute exactement une fois /api/v1 (gère les cas /api, /api/, /api/v1)
function ensureApiV1(url: string): string {
  if (!url) return '/api/v1';
  const trimmed = url.trim();
  if (!trimmed) return '/api/v1';

  const withoutTrailingSlash = trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;

  if (withoutTrailingSlash.endsWith('/api/v1')) return withoutTrailingSlash;
  if (withoutTrailingSlash.endsWith('/api')) return `${withoutTrailingSlash}/v1`;

  // URL relative
  if (withoutTrailingSlash.startsWith('/')) return `${withoutTrailingSlash}/api/v1`;

  // URL absolue
  return `${withoutTrailingSlash}/api/v1`;
}

// Fonction pour obtenir l'URL de l'API de manière sécurisée
function getApiUrl(): string {
  // Côté client: utiliser une URL relative pour passer par le proxy/rewrites
  if (typeof window !== 'undefined') {
    return ensureApiV1(process.env.NEXT_PUBLIC_API_URL || '/api/v1');
  }
  
  // Côté serveur (SSR): utiliser l'URL interne du backend (prioritaire) ou l'URL publique
  const serverBase = process.env.BACKEND_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';
  return ensureApiV1(serverBase);
}

export const API_BASE_URL = getApiUrl();

// Options d'authentification helper
export function authOptions(
  accessToken: string,
  options: RequestInit = {}
): RequestInit {
  return {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${accessToken}`,
    },
  };
}
