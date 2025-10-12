"use client";

import React from "react";
import { createPortal } from "react-dom";

export type HelpTooltipMode = "help" | "always";

interface HelpTooltipProps {
  helpMode?: boolean;
  title?: string;
  description?: React.ReactNode;
  hint?: React.ReactNode;
  align?: "left" | "right";
  widthClassName?: string;
  className?: string;
  delay?: number;
  mode?: HelpTooltipMode;
  children: React.ReactNode;
}

interface TooltipPosition {
  top: number;
  left: number;
  placement: "top" | "bottom";
  arrowX: number;
}

const DEFAULT_POSITION: TooltipPosition = { top: 0, left: 0, placement: "bottom", arrowX: 12 };

function hasRichContent(content: React.ReactNode): boolean {
  if (content === undefined || content === null) return false;
  if (typeof content === "string") return content.trim().length > 0;
  if (Array.isArray(content)) return content.some(hasRichContent);
  return true;
}

function renderContent(content: React.ReactNode): React.ReactNode {
  if (content === undefined || content === null) return null;
  if (typeof content === "string") {
    const trimmed = content.trim();
    if (trimmed.length === 0) return null;
    const parts = trimmed.split(/\n+/);
    return parts.map((part, index) => (
      <p key={index} className={index === 0 ? undefined : "mt-1"}>
        {part}
      </p>
    ));
  }
  return content;
}

function mergeClassNames(...values: Array<string | undefined>): string | undefined {
  const combined = values.filter(Boolean).join(" ");
  return combined.length > 0 ? combined : undefined;
}

function mergeIds(...values: Array<string | undefined>): string | undefined {
  const ids = values.filter((value): value is string => Boolean(value));
  return ids.length > 0 ? ids.join(" ") : undefined;
}

function setRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (!ref) return;
  if (typeof ref === "function") {
    ref(value);
    return;
  }
  try {
    (ref as React.MutableRefObject<T | null>).current = value;
  } catch {
    // ignore
  }
}

function composeEventHandlers<E>(
  theirHandler: ((event: E) => void) | undefined,
  ourHandler: (event: E) => void,
) {
  return (event: E) => {
    theirHandler?.(event);
    if (!(event as unknown as { defaultPrevented?: boolean }).defaultPrevented) {
      ourHandler(event);
    }
  };
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
  mode = "help",
  children,
}: HelpTooltipProps) {
  const hasContent = React.useMemo(() => {
    const titleAvailable = hasRichContent(title);
    return titleAvailable || hasRichContent(description) || hasRichContent(hint);
  }, [title, description, hint]);

  const isHelpEnabled = React.useMemo(() => mode === "always" || Boolean(helpMode), [mode, helpMode]);

  const tooltipId = React.useId();
  const childRef = React.useRef<HTMLElement | null>(null);
  const tooltipRef = React.useRef<HTMLDivElement | null>(null);
  const openTimer = React.useRef<number | null>(null);
  const closeTimer = React.useRef<number | null>(null);

  const [isMounted, setIsMounted] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [position, setPosition] = React.useState<TooltipPosition>(DEFAULT_POSITION);

  const clearTimers = React.useCallback(() => {
    if (openTimer.current !== null) {
      window.clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const requestOpen = React.useCallback(() => {
    if (!isHelpEnabled || !hasContent) return;
    clearTimers();
    openTimer.current = window.setTimeout(() => {
      setOpen(true);
    }, Math.max(delay, 0));
  }, [clearTimers, delay, hasContent, isHelpEnabled]);

  const requestClose = React.useCallback(() => {
    clearTimers();
    closeTimer.current = window.setTimeout(() => {
      setOpen(false);
    }, 80);
  }, [clearTimers]);

  const forceOpen = React.useCallback(() => {
    if (!isHelpEnabled || !hasContent) return;
    clearTimers();
    setOpen(true);
  }, [clearTimers, hasContent, isHelpEnabled]);

  const updatePosition = React.useCallback(() => {
    if (!childRef.current || !tooltipRef.current || !open) return;

    const anchor = childRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const margin = 12;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let placement: "top" | "bottom" = "bottom";
    let top = anchor.bottom + margin;

    if (top + tooltipRect.height > viewportHeight - margin) {
      placement = "top";
      top = anchor.top - tooltipRect.height - margin;
      if (top < margin) {
        top = Math.max(margin, viewportHeight - tooltipRect.height - margin);
      }
    }

    let left = align === "right" ? anchor.right - tooltipRect.width : anchor.left;
    const maxLeft = viewportWidth - margin - tooltipRect.width;

    if (left > maxLeft) {
      left = maxLeft;
    }
    if (left < margin) {
      left = margin;
    }

    const referenceCenter = anchor.left + anchor.width / 2;
    const arrowPadding = 12;
    let arrowX = referenceCenter - left;
    if (arrowX < arrowPadding) arrowX = arrowPadding;
    if (arrowX > tooltipRect.width - arrowPadding) {
      arrowX = tooltipRect.width - arrowPadding;
    }

    setPosition({ top, left, placement, arrowX });
  }, [align, open]);

  React.useEffect(() => {
    setIsMounted(true);
    return () => {
      setIsMounted(false);
      clearTimers();
    };
  }, [clearTimers]);

  React.useEffect(() => {
    if (!open) return;

    const update = () => updatePosition();
    update();

    const handleScroll = () => update();

    window.addEventListener("resize", update);
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [open, updatePosition, description, hint, title, widthClassName]);

  React.useEffect(() => {
    if (!open) return;
    const raf = window.requestAnimationFrame(() => updatePosition());
    return () => window.cancelAnimationFrame(raf);
  }, [open, updatePosition, align]);

  React.useEffect(() => {
    if (!isHelpEnabled) {
      setOpen(false);
      clearTimers();
    }
  }, [clearTimers, isHelpEnabled]);

  if (!isHelpEnabled || !hasContent) {
    return <>{children}</>;
  }

  const childIsElement = React.isValidElement(children);
  const safeChild = childIsElement ? children as React.ReactElement : <span>{children}</span>;
  const existingRef = childIsElement && "ref" in safeChild ? (safeChild as unknown as { ref?: React.Ref<HTMLElement> }).ref : undefined;

  const mergedClassName = mergeClassNames(
    childIsElement ? (safeChild.props as { className?: string }).className : undefined,
    className,
  );

  const childProps: Record<string, unknown> = {
    ref: (node: HTMLElement | null) => {
      childRef.current = node;
      if (childIsElement) {
        setRef(existingRef as React.Ref<HTMLElement>, node);
      }
    },
    onMouseEnter: composeEventHandlers(
      childIsElement ? (safeChild.props as { onMouseEnter?: (event: React.MouseEvent<HTMLElement>) => void }).onMouseEnter : undefined,
      requestOpen,
    ),
    onMouseLeave: composeEventHandlers(
      childIsElement ? (safeChild.props as { onMouseLeave?: (event: React.MouseEvent<HTMLElement>) => void }).onMouseLeave : undefined,
      requestClose,
    ),
    onFocus: composeEventHandlers(
      childIsElement ? (safeChild.props as { onFocus?: (event: React.FocusEvent<HTMLElement>) => void }).onFocus : undefined,
      forceOpen,
    ),
    onBlur: composeEventHandlers(
      childIsElement ? (safeChild.props as { onBlur?: (event: React.FocusEvent<HTMLElement>) => void }).onBlur : undefined,
      requestClose,
    ),
    onKeyDown: composeEventHandlers(
      childIsElement ? (safeChild.props as { onKeyDown?: (event: React.KeyboardEvent<HTMLElement>) => void }).onKeyDown : undefined,
      (event: React.KeyboardEvent<HTMLElement>) => {
        if (event.key === "Escape") {
          requestClose();
        }
      },
    ),
    className: mergedClassName,
    "aria-describedby": open
      ? mergeIds(
          childIsElement ? (safeChild.props as { [key: string]: string | undefined })["aria-describedby"] : undefined,
          tooltipId,
        )
      : (childIsElement ? (safeChild.props as { [key: string]: string | undefined })["aria-describedby"] : undefined),
  };

  const clonedChild = React.cloneElement(safeChild, childProps);

  if (!isMounted) {
    return clonedChild;
  }

  const tooltip = open
    ? createPortal(
        <div
          ref={tooltipRef}
          id={tooltipId}
          role="tooltip"
          data-placement={position.placement}
          className={`pointer-events-none fixed z-[9999] rounded-lg border border-white/10 bg-slate-900/95 p-3 text-xs text-slate-200 shadow-2xl ${widthClassName}`}
          style={{ top: position.top, left: position.left }}
        >
          <div
            className="absolute h-2 w-2 rotate-45 border border-white/10 border-b-0 border-r-0 bg-slate-900/95"
            style={{
              left: position.arrowX,
              transform: "translateX(-50%)",
              ...(position.placement === "top" ? { bottom: -1 } : { top: -1 }),
            }}
          />
          <div className="space-y-2 text-left">
            {title && <h4 className="font-semibold text-accent">{title}</h4>}
            <div className="space-y-1 leading-relaxed text-slate-100">{renderContent(description)}</div>
            {hint && <div className="text-[10px] text-slate-400">{renderContent(hint)}</div>}
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      {clonedChild}
      {tooltip}
    </>
  );
}

