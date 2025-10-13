"use client";

import React from 'react';
import { DashboardPageShell } from '@/features/dashboards/DashboardPageShell';

export default function ExecutionDashboardClient() {
  return (
    <DashboardPageShell
      dashboard="EXECUTION"
      supportedModes={["AGGREGATED"]}
      titleKey="dashboard.execution.title"
      descriptionKey="dashboard.execution.description"
    />
  );
}
