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

// Ajoute systématiquement le suffixe /api/v1 si absent (évite les 404 en prod)
function ensureApiV1(url: string): string {
  if (!url) return '/api/v1';
  const trimmed = url.trim();
  if (trimmed === '/api/v1' || trimmed === '/api/v1/') return '/api/v1';

  // Cas où l'URL se termine déjà par /api/v1 ou /api/v1/
  const normalized = trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
  if (normalized.endsWith('/api/v1')) return '/api/v1' === normalized ? '/api/v1' : `${normalized}`;

  // Si c'est une URL relative (commence par /), préfixer /api/v1 correctement
  if (normalized.startsWith('/')) return `${normalized.replace(/\/$/, '')}/api/v1`;

  // URL absolue: ajouter /api/v1
  return `${normalized}/api/v1`;
}

// Fonction pour obtenir l'URL de l'API de manière sécurisée
function getApiUrl(): string {
  // Côté client: utiliser une URL relative pour passer par le proxy/rewrites
  if (typeof window !== 'undefined') {
    return ensureApiV1(process.env.NEXT_PUBLIC_API_URL || '/api/v1');
  }
  
  // Côté serveur (SSR): utiliser l'URL interne du backend (prioritaire) ou l'URL publique
  const serverBase = process.env.BACKEND_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001/api/v1';
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
