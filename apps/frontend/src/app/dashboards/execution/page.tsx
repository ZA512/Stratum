"use client";

import { DashboardPageShell } from "@/features/dashboards/DashboardPageShell";

export default function ExecutionDashboardPage() {
  return (
    <DashboardPageShell
      dashboard="EXECUTION"
      supportedModes={["AGGREGATED"]}
      titleKey="dashboard.execution.title"
      descriptionKey="dashboard.execution.description"
    />
  );
}
