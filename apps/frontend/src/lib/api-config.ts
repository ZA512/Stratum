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

// Fonction pour obtenir l'URL de l'API de manière sécurisée
function getApiUrl(): string {
  // Côté client: utiliser une URL relative pour passer par le proxy/rewrites
  // Cela évite les problèmes de CORS et simplifie la configuration
  if (typeof window !== 'undefined') {
    // Si NEXT_PUBLIC_API_URL est définie, l'utiliser (pour bypass du proxy)
    // Sinon, utiliser /api/v1 qui sera proxifié par Next.js ou Nginx
    return process.env.NEXT_PUBLIC_API_URL || '/api/v1';
  }
  
  // Côté serveur (SSR): utiliser l'URL interne du backend
  // Priorité: BACKEND_INTERNAL_URL > NEXT_PUBLIC_API_URL > fallback local
  return (
    process.env.BACKEND_INTERNAL_URL 
      ? `${process.env.BACKEND_INTERNAL_URL}/api/v1`
      : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001/api/v1'
  );
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
