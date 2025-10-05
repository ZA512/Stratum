"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  fetchDashboard,
  type DashboardKind,
  type DashboardMode,
  type DashboardResponse,
} from "@/features/dashboards/dashboards-api";
import { DashboardLayout } from "@/features/dashboards/components/DashboardLayout";
import { DashboardWidgetCard } from "@/features/dashboards/components/DashboardWidgetCard";
import { HiddenWidgetsPanel } from "@/features/dashboards/components/HiddenWidgetsPanel";
import { DashboardSkeleton } from "@/features/dashboards/components/DashboardSkeleton";
import { useAuth } from "@/features/auth/auth-provider";
import { fetchTeams, type Team } from "@/features/teams/teams-api";
import {
  fetchChildBoards,
  fetchRootBoard,
  type NodeChildBoard,
} from "@/features/boards/boards-api";
import { useTranslation } from "@/i18n";

interface BoardOption {
  value: string;
  label: string;
}

interface DashboardPageShellProps {
  dashboard: DashboardKind;
  supportedModes: DashboardMode[];
  titleKey: string;
  descriptionKey: string;
}

export function DashboardPageShell({
  dashboard,
  supportedModes,
  titleKey,
  descriptionKey,
}: DashboardPageShellProps) {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { accessToken } = useAuth();

  const queryTeamId = searchParams.get("teamId");
  const queryBoardId = searchParams.get("boardId");
  const queryMode = searchParams.get("mode") as DashboardMode | null;

  const [mode, setMode] = useState<DashboardMode>(() => {
    if (queryMode && SUPPORTED_DEFAULTS.includes(queryMode) && (queryMode === "SELF" || supportedModes.includes(queryMode))) {
      return queryMode;
    }
    return "SELF";
  });

  const [teams, setTeams] = useState<Team[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(queryTeamId);
  const [boardOptions, setBoardOptions] = useState<BoardOption[]>([]);
  const [boardLoading, setBoardLoading] = useState(false);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(queryBoardId);

  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHiddenPanel, setShowHiddenPanel] = useState(false);

  // Synchronize mode with URL changes triggered externally
  useEffect(() => {
    if (!queryMode) return;
    if (queryMode === mode) return;
    if (queryMode === "SELF" || supportedModes.includes(queryMode)) {
      setMode(queryMode);
    }
  }, [queryMode, mode, supportedModes]);

  const updateUrl = useCallback(
    (next: Partial<{ teamId: string | null; boardId: string | null; mode: DashboardMode }>) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.teamId !== undefined) {
        if (!next.teamId) params.delete("teamId");
        else params.set("teamId", next.teamId);
      }
      if (next.boardId !== undefined) {
        if (!next.boardId) params.delete("boardId");
        else params.set("boardId", next.boardId);
      }
      if (next.mode !== undefined) {
        if (!next.mode || next.mode === "SELF") params.delete("mode");
        else params.set("mode", next.mode);
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    if (!accessToken) return;
    setTeamsLoading(true);
    setTeamsError(null);
    let cancelled = false;
    fetchTeams(accessToken)
      .then((entries) => {
        if (cancelled) return;
        setTeams(entries);
        if (!selectedTeamId && entries.length > 0) {
          const first = entries[0];
          setSelectedTeamId(first.id);
          updateUrl({ teamId: first.id });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setTeamsError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setTeamsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, selectedTeamId, updateUrl]);

  const loadBoardOptions = useCallback(
    async (teamId: string, token: string) => {
      setBoardLoading(true);
      setBoardError(null);
      try {
        const root = await fetchRootBoard(teamId, token);
        const options: BoardOption[] = [
          { value: root.id, label: root.name },
        ];
        if (root.nodeId) {
          try {
            const children = await fetchChildBoards(root.nodeId, token);
            addChildBoards(options, children, 1);
          } catch (err) {
            setBoardError(err instanceof Error ? err.message : String(err));
          }
        }
        setBoardOptions(options);
        if (!selectedBoardId || !options.some((option) => option.value === selectedBoardId)) {
          setSelectedBoardId(root.id);
          updateUrl({ boardId: root.id });
        }
      } catch (err) {
        setBoardError(err instanceof Error ? err.message : String(err));
        setBoardOptions([]);
      } finally {
        setBoardLoading(false);
      }
    },
    [selectedBoardId, updateUrl],
  );

  useEffect(() => {
    if (!accessToken) return;
    if (!selectedTeamId) return;
    void loadBoardOptions(selectedTeamId, accessToken);
  }, [accessToken, selectedTeamId, loadBoardOptions]);

  useEffect(() => {
    if (!accessToken) return;
    if (!selectedTeamId || !selectedBoardId) return;
    setLoading(true);
    setError(null);
    setData(null);
    const controller = new AbortController();
    fetchDashboard({
      dashboard,
      mode,
      boardId: selectedBoardId,
      teamId: selectedTeamId,
      accessToken,
      locale,
      signal: controller.signal,
    })
      .then((response) => {
        setData(response);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [accessToken, dashboard, mode, selectedBoardId, selectedTeamId, locale]);

  const handleModeChange = useCallback(
    (nextMode: DashboardMode) => {
      setMode(nextMode);
      updateUrl({ mode: nextMode });
    },
    [updateUrl],
  );

  const handleTeamChange = (teamId: string) => {
    setSelectedTeamId(teamId);
    setSelectedBoardId(null);
    setBoardOptions([]);
    setBoardError(null);
    updateUrl({ teamId, boardId: null });
  };

  const handleBoardChange = (boardId: string) => {
    setSelectedBoardId(boardId);
    updateUrl({ boardId });
  };

  const metadataSummary = useMemo(() => {
    if (!data) return null;
    return (
      <div className="flex flex-col items-start gap-1 text-xs text-muted md:items-end">
        <span>{t("dashboard.metadata.taskCount", { count: data.metadata.taskCount })}</span>
        <span>{t("dashboard.metadata.duration", { value: Math.round(data.metadata.totalDurationMs) })}</span>
      </div>
    );
  }, [data, t]);

  const layoutTitle = t(titleKey);
  const layoutDescription = t(descriptionKey);

  return (
    <>
      <DashboardLayout
        dashboard={dashboard}
        title={layoutTitle}
        description={layoutDescription}
        mode={mode}
        supportedModes={["SELF", ...supportedModes.filter((m) => m !== "SELF")]}
        onModeChange={handleModeChange}
        hiddenWidgetsCount={data?.hiddenWidgets.length ?? 0}
        onHiddenWidgetsClick={data ? () => setShowHiddenPanel(true) : undefined}
        generatedAt={data?.generatedAt}
        datasetRefreshedAt={data?.datasetRefreshedAt ?? null}
        metadataSummary={metadataSummary}
        actions={
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide">{t("dashboard.filters.team")}</span>
              <select
                value={selectedTeamId ?? ""}
                onChange={(event) => handleTeamChange(event.target.value)}
                className="min-w-[180px] rounded-xl border border-white/10 bg-surface px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                disabled={teamsLoading || teamsError !== null}
              >
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide">{t("dashboard.filters.board")}</span>
              <select
                value={selectedBoardId ?? ""}
                onChange={(event) => handleBoardChange(event.target.value)}
                className="min-w-[200px] rounded-xl border border-white/10 bg-surface px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                disabled={boardLoading || boardOptions.length === 0}
              >
                {boardOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        }
      >
        {teamsError ? (
          <ErrorCallout message={teamsError} />
        ) : null}
        {boardError ? (
          <ErrorCallout message={boardError} />
        ) : null}
        {error ? <ErrorCallout message={error} /> : null}
        {loading ? (
          <DashboardSkeleton />
        ) : data ? (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {data.widgets.map((widget) => (
              <DashboardWidgetCard key={widget.id} widget={widget} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/10 bg-card/40 p-10 text-center text-sm text-muted">
            {t("dashboard.states.selectBoard")}
          </div>
        )}
      </DashboardLayout>
      <HiddenWidgetsPanel
        open={showHiddenPanel}
        widgets={data?.hiddenWidgets ?? []}
        onClose={() => setShowHiddenPanel(false)}
      />
    </>
  );
}

function addChildBoards(options: BoardOption[], children: NodeChildBoard[], depth: number) {
  const prefix = `${"› ".repeat(depth)}`;
  children.forEach((child) => {
    options.push({ value: child.boardId, label: `${prefix}${child.name}` });
  });
}

function ErrorCallout({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
      {message}
    </div>
  );
}

const SUPPORTED_DEFAULTS: DashboardMode[] = ["SELF", "AGGREGATED", "COMPARISON"];
