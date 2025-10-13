"use client";

import React from 'react';
import { DashboardPageShell } from '@/features/dashboards/DashboardPageShell';

export default function RiskDashboardClient() {
  return (
    <DashboardPageShell
      dashboard="RISK"
      supportedModes={["AGGREGATED", "COMPARISON"]}
      titleKey="dashboard.risk.title"
      descriptionKey="dashboard.risk.description"
    />
  );
}
