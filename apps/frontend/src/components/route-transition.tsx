"use client";

import { AnimatePresence, motion, type Variants } from "framer-motion";
import { usePathname } from "next/navigation";
import React, { useEffect, useMemo, useRef } from "react";
import { useUiShellStore, type UiShellState } from "@/stores/ui-shell";

type RouteTransitionProps = {
  children: React.ReactNode;
};

const getDepth = (pathname: string) => pathname.split("/").filter(Boolean).length;

export function RouteTransition({ children }: RouteTransitionProps) {
  const pathname = usePathname();
  const setNavigation = useUiShellStore((state: UiShellState) => state.setNavigation);
  const direction = useUiShellStore((state: UiShellState) => state.direction);
  const prevDepthRef = useRef(getDepth(pathname));
  const disableRouteAnimation = pathname.startsWith("/boards");

  useEffect(() => {
    const nextDepth = getDepth(pathname);
    const prevDepth = prevDepthRef.current;
    const nextDirection = nextDepth === prevDepth ? 0 : nextDepth > prevDepth ? 1 : -1;
    setNavigation(nextDepth, nextDirection);
    prevDepthRef.current = nextDepth;
  }, [pathname, setNavigation]);

  const variants = useMemo<Variants>(
    () => ({
      initial: (dir: number) => ({
        opacity: 1,
        x: dir >= 0 ? 14 : -14,
        y: dir >= 0 ? 14 : -14,
      }),
      animate: {
        opacity: 1,
        x: 0,
        y: 0,
        transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
      },
      exit: (dir: number) => ({
        opacity: 1,
        x: dir >= 0 ? -10 : 10,
        y: dir >= 0 ? -10 : 10,
        transition: { duration: 0.18, ease: [0.4, 0, 0.6, 1] },
      }),
    }),
    [],
  );

  if (disableRouteAnimation) {
    return <div className="min-h-screen">{children}</div>;
  }

  return (
    <AnimatePresence mode="sync" initial={false}>
      <motion.div
        key={pathname}
        custom={direction}
        variants={variants}
        initial="initial"
        animate="animate"
        exit="exit"
        className="min-h-screen"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
