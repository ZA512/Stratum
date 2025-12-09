import { API_BASE_URL } from '@/lib/api-config';
import { authenticatedFetch } from '@/lib/api-client';

export type RaciTeamPreset = {
  id: string;
  name: string;
  raci: {
    R: string[];
    A: string[];
    C: string[];
    I: string[];
  };
  createdAt: string;
  updatedAt: string;
};

export async function fetchRaciTeams(accessToken: string): Promise<RaciTeamPreset[]> {
  const response = await authenticatedFetch(`${API_BASE_URL}/users/me/raci-teams`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Impossible de charger les équipes RACI");
  }
  return (await response.json()) as RaciTeamPreset[];
}

export async function createRaciTeam(
  input: { name: string; raci: { R: string[]; A: string[]; C: string[]; I: string[] } },
  accessToken: string,
): Promise<RaciTeamPreset> {
  const response = await authenticatedFetch(`${API_BASE_URL}/users/me/raci-teams`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error("Impossible d'enregistrer l'équipe RACI");
  }
  return (await response.json()) as RaciTeamPreset;
}

export async function renameRaciTeam(
  teamId: string,
  name: string,
  accessToken: string,
): Promise<RaciTeamPreset> {
  const response = await authenticatedFetch(`${API_BASE_URL}/users/me/raci-teams/${teamId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    throw new Error("Impossible de renommer l'équipe RACI");
  }
  return (await response.json()) as RaciTeamPreset;
}

export async function deleteRaciTeam(teamId: string, accessToken: string): Promise<void> {
  const response = await authenticatedFetch(`${API_BASE_URL}/users/me/raci-teams/${teamId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error("Impossible de supprimer l'équipe RACI");
  }
}
