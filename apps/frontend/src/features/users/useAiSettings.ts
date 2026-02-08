import { useQuery } from "@tanstack/react-query";
import { fetchAiSettings } from "@/features/users/ai-settings-api";

const AI_SETTINGS_KEY = ["users", "ai-settings"];

export function useAiSettings(enabled = true) {
  return useQuery({
    queryKey: AI_SETTINGS_KEY,
    queryFn: fetchAiSettings,
    enabled,
    staleTime: 60_000,
  });
}
