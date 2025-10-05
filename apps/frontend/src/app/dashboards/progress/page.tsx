"use client";

import { DashboardPageShell } from "@/features/dashboards/DashboardPageShell";

export default function ProgressDashboardPage() {
  return (
    <DashboardPageShell
      dashboard="PROGRESS"
      supportedModes={["AGGREGATED", "COMPARISON"]}
      titleKey="dashboard.progress.title"
      descriptionKey="dashboard.progress.description"
    />
  );
}
