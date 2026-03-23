export const dynamic = 'force-dynamic';

import { LoginPageClient } from "./LoginPageClient";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const nextParam = resolvedSearchParams?.next;
  const next = Array.isArray(nextParam) ? nextParam[0] : nextParam;

  return <LoginPageClient next={next ?? null} />;
}
