"use client";

export interface DashboardSkeletonProps {
  cards?: number;
}

export function DashboardSkeleton({ cards = 6 }: DashboardSkeletonProps) {
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: cards }).map((_, index) => (
        <div
          key={index}
          className="flex animate-pulse flex-col gap-4 rounded-2xl border border-white/5 bg-card/40 p-6"
        >
          <div className="h-5 w-1/2 rounded bg-white/15" />
          <div className="space-y-3">
            <div className="h-4 w-full rounded bg-white/10" />
            <div className="h-4 w-5/6 rounded bg-white/10" />
            <div className="h-4 w-2/3 rounded bg-white/10" />
          </div>
        </div>
      ))}
    </div>
  );
}
