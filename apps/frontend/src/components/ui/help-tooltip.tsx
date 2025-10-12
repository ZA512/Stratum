"use client";

import React from "react";

interface HelpTooltipProps {
  helpMode?: boolean;
  title?: string;
  description: React.ReactNode;
  hint?: React.ReactNode;
  align?: "left" | "right";
  widthClassName?: string;
  className?: string;
  delay?: number;
  children: React.ReactNode;
}

function renderContent(content: React.ReactNode): React.ReactNode {
  if (typeof content === "string") {
    const parts = content.split(/\n+/);
    return parts.map((part, index) => (
      <p key={index} className={index === 0 ? undefined : "mt-1"}>
        {part}
      </p>
    ));
  }
  return content;
}

export function HelpTooltip({
  helpMode,
  title,
  description,
  hint,
  align = "left",
  widthClassName = "w-72",
  className,
  delay = 200,
  children,
}: HelpTooltipProps) {
  const hasContent =
    description !== undefined &&
    description !== null &&
    !(typeof description === "string" && description.trim().length === 0);

  if (!helpMode || !hasContent) {
    return <>{children}</>;
  }

  const containerClass = ["relative", "inline-flex", "group", className].filter(Boolean).join(" ");
  const tooltipPosition = align === "right" ? "right-0" : "left-0";
  const arrowPosition = align === "right" ? "right-4" : "left-4";

  return (
    <div className={containerClass}>
      {children}
      <div
        className={`pointer-events-none invisible absolute top-full z-[9999] mt-2 rounded-lg border border-white/10 bg-slate-900/95 p-3 text-xs text-slate-200 shadow-2xl opacity-0 transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 ${widthClassName} ${tooltipPosition}`}
        style={{ transitionDelay: `${delay}ms` }}
        role="tooltip"
      >
        <div className={`absolute -top-1 h-2 w-2 rotate-45 border-l border-t border-white/10 bg-slate-900/95 ${arrowPosition}`} />
        <div className="space-y-2 text-left">
          {title && <h4 className="font-semibold text-accent">{title}</h4>}
          <div className="space-y-1 leading-relaxed text-slate-100">{renderContent(description)}</div>
          {hint && (
            <div className="text-[10px] text-slate-400">{renderContent(hint)}</div>
          )}
        </div>
      </div>
    </div>
  );
}

