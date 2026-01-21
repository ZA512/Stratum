import { API_BASE_URL } from '@/lib/api-config';
import { authenticatedFetch } from '@/lib/api-client';

function extractFilename(disposition: string | null): string | null {
  if (!disposition) return null;
  const match = /filename\*?=(?:UTF-8''|\")?([^;\"\n]+)/i.exec(disposition);
  if (!match) return null;
  return decodeURIComponent(match[1]).replace(/\"/g, '');
}

export async function exportTestData(
  accessToken: string,
): Promise<{ blob: Blob; filename: string | null }> {
  const response = await authenticatedFetch(`${API_BASE_URL}/test-data/export`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error("Impossible d'exporter les données de test");
  }

  const blob = await response.blob();
  const filename = extractFilename(response.headers.get('Content-Disposition'));
  return { blob, filename };
}

export async function importTestData(
  file: File,
  accessToken: string,
): Promise<void> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await authenticatedFetch(`${API_BASE_URL}/test-data/import`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData,
  });

  if (!response.ok) {
    throw new Error("Impossible d'importer les données de test");
  }
}
