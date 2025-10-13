"use client";

import React from 'react';
import { DashboardPageShell } from '@/features/dashboards/DashboardPageShell';

export default function ProgressDashboardClient() {
  return (
    <DashboardPageShell
      dashboard="PROGRESS"
      supportedModes={["AGGREGATED"]}
      titleKey="dashboard.progress.title"
      descriptionKey="dashboard.progress.description"
    />
  );
}
