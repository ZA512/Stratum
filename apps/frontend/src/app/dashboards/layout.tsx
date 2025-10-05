import React from "react";

export default function DashboardsLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-surface px-6 py-10">{children}</div>;
}
