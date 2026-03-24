import { getDemoEmail, getDemoPassword } from './../prisma/seed';

export function demoLoginCredentials() {
  return {
    email: getDemoEmail(),
    password: getDemoPassword(),
  };
}

export function buildTestEmail(label = 'user'): string {
  const normalized = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'user';
  const entropy = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `${normalized}.${entropy}@example.test`;
}

export function buildTestPassword(label = 'test'): string {
  const entropy = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `${label}-${entropy}-Aa1!`;
}