import { API_BASE_URL } from '@/lib/api-config';
import { authenticatedFetch } from '@/lib/api-client';

export type TeamMember = {
  id: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
};

export async function fetchTeamMembers(teamId: string, accessToken: string): Promise<TeamMember[]> {
  const response = await authenticatedFetch(`${API_BASE_URL}/teams/${teamId}/members`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error('Impossible de charger les membres de l\'équipe');
  }
  return (await response.json()) as TeamMember[];
}
