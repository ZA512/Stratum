"use client";

import { DashboardPageShell } from "@/features/dashboards/DashboardPageShell";

export default function RiskDashboardPage() {
  return (
    <DashboardPageShell
      dashboard="RISK"
      supportedModes={["AGGREGATED", "COMPARISON"]}
      titleKey="dashboard.risk.title"
      descriptionKey="dashboard.risk.description"
    />
  );
}
