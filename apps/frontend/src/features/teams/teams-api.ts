const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";

export type Team = {
  id: string;
  name: string;
  slug: string | null;
  membersCount: number;
  createdAt: string;
};

export async function fetchTeams(accessToken: string): Promise<Team[]> {
  const response = await fetch(`${API_BASE_URL}/teams`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Impossible de charger les equipes");
  }

  return (await response.json()) as Team[];
}

export type BootstrapTeamResponse = {
  team: Team;
  rootNodeId: string;
  boardId: string;
};

export async function bootstrapTeams(accessToken: string): Promise<BootstrapTeamResponse> {
  const response = await fetch(`${API_BASE_URL}/teams/bootstrap`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error('Impossible de bootstrap l\'espace');
  }
  return (await response.json()) as BootstrapTeamResponse;
}
