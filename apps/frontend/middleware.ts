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

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  // Lecture de la session depuis le localStorage n'est pas possible côté edge.
  // On s'appuie donc sur un cookie accessToken (optionnel) :
  const access = req.cookies.get('stratum_access');
  if (!access) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon|public).*)'],
};