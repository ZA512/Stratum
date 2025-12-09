import { NextResponse, type NextRequest } from 'next/server';

// Routes publiques (auth, assets)
const PUBLIC_PATHS = [
  '/(auth)/login',
  '/(auth)/register',
  '/login',
  '/register',
  '/_next',
  '/favicon',
  '/api/auth',
];

function isPublic(path: string) {
  return PUBLIC_PATHS.some(p => path === p || path.startsWith(p));
}

/**
 * Décode un JWT et retourne le payload (sans vérification de signature).
 * La signature est vérifiée côté backend, ici on vérifie juste l'expiration
 * pour éviter de charger la page avec un token expiré.
 */
function decodeJwtPayload(token: string): { exp?: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    // Base64url decode
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = atob(base64);
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

/**
 * Vérifie si un token JWT est expiré
 */
function isTokenExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return false; // Si pas d'exp, considérer valide (backend vérifiera)
  
  const now = Math.floor(Date.now() / 1000);
  // Ajouter une marge de 30 secondes pour éviter les race conditions
  return payload.exp < now - 30;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  // Lecture de la session depuis le localStorage n'est pas possible côté edge.
  // On s'appuie donc sur un cookie accessToken (optionnel) :
  const access = req.cookies.get('stratum_access');
  
  if (!access?.value) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }
  
  // Vérifier si le token est expiré
  // Note: on ne redirige pas vers login car le frontend tentera un refresh
  // On laisse passer mais on set un header pour indiquer au client
  if (isTokenExpired(access.value)) {
    const response = NextResponse.next();
    // Header custom pour signaler au client que le token est expiré
    // Le client peut utiliser cette info pour forcer un refresh immédiat
    response.headers.set('X-Token-Status', 'expired');
    return response;
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon|public).*)'],
};