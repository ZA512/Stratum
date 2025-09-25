"use client";

import React, { ReactNode, useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { motion, type TargetAndTransition } from 'framer-motion';
import { useRouter } from 'next/navigation';
import type { NodeBreadcrumbItem } from '@/features/boards/boards-api';

export interface FractalBreadcrumbProps {
  items: NodeBreadcrumbItem[];
  children: ReactNode;
  onSelect?: (id: string) => void;
  buildHref?: (item: NodeBreadcrumbItem, depth: number) => string;
  onPreNavigate?: (targetItem: NodeBreadcrumbItem, depth: number) => void; // hook pour prefetch
  offsetX?: number; // px
  offsetY?: number; // px
  labelWidth?: number; // px
  visibleTrailingCount?: number; // root + derniers N
  animated?: boolean;
  rightShrink?: number; // rétrécissement progressif des traits horizontaux à droite
  shrinkFactor?: number; // facteur de réduction de la colonne gauche pour profondeur (0-1)
  muted?: boolean; // palette sombre désaturée
  strokeAlpha?: number; // alpha des traits (0..1)
  verticalFactor?: number; // proportion de offsetY utilisée pour la hauteur visible du trait vertical (0..1)
  travelAnimation?: boolean;
  travelDuration?: number; // en secondes
  travelLateralFactor?: number; // proportion du déplacement horizontal par niveau (0..1)
  enableDescendAnimation?: boolean;
  /** Fournit une fonction pour lancer une descente: registerDescend(fn => fn(href)) */
  registerDescend?: (fn: (href: string) => void) => void;
}

const DEFAULT_OFFSET_X = 56;
const DEFAULT_OFFSET_Y = 40;
const DEFAULT_LABEL_WIDTH = 220;
const DEFAULT_TRAILING = 8;
const DEFAULT_RIGHT_SHRINK = 24;
const DEFAULT_SHRINK_FACTOR = 0.4; // réduction plus forte pour resserrer la colonne gauche
const DEFAULT_MUTED = true;
const DEFAULT_STROKE_ALPHA = 0.55;
// Facteur par défaut = 1: le trait vertical couvre toute la distance jusqu'à la strate suivante (offsetY)
const DEFAULT_VERTICAL_FACTOR = 1;

function generateColor(depth: number, muted: boolean, alpha: number) {
  // Palette sombre et progressive
  const hue = 210; // bleu froid
  const sat = muted ? Math.max(10, 22 - depth * 1.2) : Math.max(30, 60 - depth * 4);
  const light = muted ? Math.max(12, 20 - depth * 1.1) : Math.max(22, 50 - depth * 3);
  return `hsl(${hue} ${sat}% ${light}% / ${alpha})`;
}

export function FractalBreadcrumb({
  items,
  children,
  onSelect,
  offsetX = DEFAULT_OFFSET_X,
  offsetY = DEFAULT_OFFSET_Y,
  labelWidth = DEFAULT_LABEL_WIDTH,
  visibleTrailingCount = DEFAULT_TRAILING,
  animated = true,
  rightShrink = DEFAULT_RIGHT_SHRINK,
  shrinkFactor = DEFAULT_SHRINK_FACTOR,
  muted = DEFAULT_MUTED,
  strokeAlpha = DEFAULT_STROKE_ALPHA,
  verticalFactor = DEFAULT_VERTICAL_FACTOR,
  travelAnimation = true,
  travelDuration = 0.6,
  travelLateralFactor = 0.55,
  enableDescendAnimation = true,
  registerDescend,
  buildHref,
  onPreNavigate,
}: FractalBreadcrumbProps) {
  const router = useRouter();
  const [travelTargetDepth, setTravelTargetDepth] = useState<number | null>(null);
  const [isTraveling, setIsTraveling] = useState(false);
  const previousDepthRef = useRef<number>(items.length - 1);
  const [descendingBurst, setDescendingBurst] = useState(false);
  const [isPreDescending, setIsPreDescending] = useState(false);

  // Détection de descente (nouveau niveau plus profond chargé)
  useEffect(() => {
    const prev = previousDepthRef.current;
    const now = items.length - 1;
    if (now > prev) {
      // On vient de descendre : déclencher petite animation d'arrivée
      setDescendingBurst(true);
      setTimeout(() => setDescendingBurst(false), travelDuration * 1000);
    }
    previousDepthRef.current = now;
  }, [items, travelDuration]);

  // Expose descend trigger to parent if requested
  useEffect(() => {
    if (!registerDescend) return;
    registerDescend((href: string) => {
      if (!enableDescendAnimation) {
        router.push(href);
        return;
      }
      // Lancer animation avant navigation
      setIsPreDescending(true);
      setTimeout(() => {
        router.push(href);
        // petite marge pour éviter clignotement si le composant reste monté
        setTimeout(() => {
          setIsPreDescending(false);
        }, 120);
      }, travelDuration * 1000);
    });
  }, [registerDescend, enableDescendAnimation, router, travelDuration]);
  const visibleLabelIndexes = useMemo(() => {
    if (items.length <= visibleTrailingCount + 1) {
      return new Set(items.map((_, i) => i));
    }
    const set = new Set<number>();
    set.add(0); // root
    const start = Math.max(items.length - visibleTrailingCount, 1);
    for (let i = start; i < items.length; i++) set.add(i);
    return set;
  }, [items, visibleTrailingCount]);

  const currentDepth = items.length - 1;

  const handleNavigate = useCallback((item: NodeBreadcrumbItem, depth: number) => {
    if (depth === currentDepth) return;
    if (!travelAnimation) {
      if (buildHref) router.push(buildHref(item, depth));
      else onSelect?.(item.id);
      return;
    }
    const targetUrl = buildHref ? buildHref(item, depth) : undefined;
    if (onPreNavigate) {
      try { onPreNavigate(item, depth); } catch { /* ignore */ }
    }
    setTravelTargetDepth(depth);
    setIsTraveling(true);
    setTimeout(() => {
      if (targetUrl) router.push(targetUrl); else onSelect?.(item.id);
      // reset sera inutile si page replace; sécurité si même composant persiste
      setTimeout(() => {
        setIsTraveling(false);
        setTravelTargetDepth(null);
      }, 150);
    }, travelDuration * 1000);
  }, [buildHref, currentDepth, onSelect, router, travelAnimation, travelDuration, onPreNavigate]);

  const buildLayers = (index: number): ReactNode => {
    if (index >= items.length) {
      // Contenu terminal : c'est lui qu'on translate lors de la remontée
      const diff = travelTargetDepth !== null ? (currentDepth - travelTargetDepth) : 0;
      const effectiveLeftPad = Math.round(offsetX * shrinkFactor);
      const dxPerLevel = offsetX - effectiveLeftPad; // composante horizontale de la diagonale
      const yTarget = -(diff * offsetY + (diff > 0 ? offsetY * 0.6 : 0));
      const xTarget = -(diff * dxPerLevel * travelLateralFactor);
      // Animation descendante (apparition) : on part de la position inverse puis retombe à 0
      const effectiveLeftPad2 = Math.round(offsetX * shrinkFactor);
      const dxPerLevel2 = offsetX - effectiveLeftPad2;
      const enterX = dxPerLevel2 * travelLateralFactor * 0.8; // légère entrée depuis la droite
      const enterY = offsetY * 0.9; // vient légèrement du bas
      let animateProps: TargetAndTransition | undefined;
      if (isPreDescending) {
        // Pré-descente: on sort le contenu vers bas + droite (une "plonge" visuelle)
        const outX = dxPerLevel2 * travelLateralFactor * 0.9;
        const outY = offsetY * 1.05;
        animateProps = { x: [0, outX], y: [0, outY], opacity: [1, 0.6] } as TargetAndTransition;
      } else if (isTraveling && diff > 0) {
        // Remontée (ascenseur)
        animateProps = { y: yTarget, x: xTarget };
      } else if (descendingBurst) {
        // Arrivée d'une descente (nouvelle profondeur chargée)
        animateProps = { x: [enterX, 0], y: [enterY, 0], opacity: [0, 1] } as TargetAndTransition;
      } else {
        animateProps = { x: 0, y: 0, opacity: 1 };
      }
      return (
        <motion.div
          className="fractal-content relative"
          initial={descendingBurst ? { x: enterX, y: enterY, opacity: 0 } : false}
          animate={animateProps}
          transition={{ duration: travelDuration, ease: 'easeOut' }}
        >
          {children}
        </motion.div>
      );
    }
    const item = items[index];
    const depth = index + 1;
    const color = generateColor(index, muted, strokeAlpha);
    const showLabel = visibleLabelIndexes.has(index);
    const isCurrent = index === items.length - 1;

    const clampedVerticalFactor = Math.min(Math.max(verticalFactor, 0), 1);
    const verticalLineHeight = `${clampedVerticalFactor * 100}vh`;
    const horizontalWidth = rightShrink > 0 ? `calc(100% - ${rightShrink}px)` : '100%';

    // Calcul dynamique de la géométrie du raccord (angle) entre cette strate et la précédente
    const effectiveLeftPad = Math.round(offsetX * shrinkFactor);

    return (
      <motion.div
        key={item.id}
        data-depth={depth}
        initial={animated ? { opacity: 0, x: 6, y: 6 } : false}
        animate={animated ? { opacity: 1, x: 0, y: 0 } : undefined}
        transition={{ duration: 0.35, ease: 'easeOut', delay: index * 0.05 }}
        className="relative"
        style={{
          paddingTop: offsetY,
          paddingLeft: effectiveLeftPad,
          background: 'linear-gradient(135deg,rgba(255,255,255,0.015),rgba(255,255,255,0))',
        }}
      >
        {/* Lignes décoratives top + profondeur gauche + rétrécissement droite */}
        <div className="pointer-events-none absolute top-0 left-0 right-0" aria-hidden>
          {/* Trait horizontal supérieur (pleine longueur) */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              // Pleine largeur ajustable : possibilité de raccourcir légèrement la droite
              width: horizontalWidth,
              height: 0,
              borderTop: `2px solid ${color}`,
              borderTopRightRadius: 18,
            }}
          />
          {/* Trait vertical de profondeur (gauche) : descend jusqu'en bas de l'écran */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              height: verticalLineHeight,
              width: 0,
              borderLeft: `2px solid ${color}`,
              zIndex: 2,
            }}
          />
          {/* Diagonale reliant angle courant -> angle prochain (ou mini pour dernière) */}
          {(() => {
            // Diagonale avec longueur proportionnelle mais limitée
            const dx = Math.max(8, effectiveLeftPad);
            const dy = Math.max(10, offsetY);
            const baseLength = Math.sqrt(dx * dx + dy * dy);
            const maxLength = 45; // limite maximale
            const length = Math.min(baseLength, maxLength);
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
            return (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: length,
                  height: 0,
                  borderTop: `2px solid ${color}`,
                  transform: `rotate(${angle}deg)`,
                  transformOrigin: 'left top',
                  opacity: 0.75,
                  pointerEvents: 'none',
                }}
              />
            );
          })()}
        </div>
        {showLabel && (
          <div
            className="absolute z-10"
            style={{
              // Position optimisée : alignement parfait sans décalage progressif
              top: `${10}px`, // garde la bonne position verticale
              left: `${effectiveLeftPad + 25}px`, // suppression du décalage progressif (index * 8)
              maxWidth: labelWidth,
            }}
          >
            <button
              type="button"
              onClick={() => handleNavigate(item, index)}
              className="group cursor-pointer bg-transparent border-none p-0 m-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 rounded-sm text-white"
              style={{
                // Effet de perspective avec le même angle que la barre oblique
                transform: (() => {
                  const dx = Math.max(8, effectiveLeftPad);
                  const dy = Math.max(10, offsetY);
                  const diagonalAngle = Math.atan2(dy, dx) * 180 / Math.PI;
                  // On adoucit l'angle pour éviter une inclinaison trop prononcée.
                  const factor = 0.52; // ajustable si encore trop fort
                  const applied = diagonalAngle * factor;
                  return `skewX(${applied}deg) perspective(520px) rotateX(${diagonalAngle * 0.08}deg)`;
                })(),
                transformOrigin: 'left center',
              }}
              aria-current={isCurrent ? 'page' : undefined}
            >
              <span
                className="block text-lg font-medium tracking-wide leading-tight hover:text-white/90 transition-colors duration-200 whitespace-nowrap uppercase"
                style={{
                  display: 'inline-block',
                  maxWidth: labelWidth,
                  textShadow: `
                    0 2px 4px rgba(0,0,0,0.9),
                    0 0 12px ${color.replace(/\/.*/, '/0.4')},
                    2px 2px 0 rgba(0,0,0,0.8)
                  `,
                  filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.7))',
                }}
                title={item.title}
              >
                {item.title}
              </span>
            </button>
          </div>
        )}
        {buildLayers(index + 1)}
      </motion.div>
    );
  };

  return (
    <div className="fractal-root relative">
      <nav aria-label="Fil hiérarchique" className="sr-only">
        <ol>
          {items.map((i, idx) => (
            <li key={i.id} aria-current={idx === items.length - 1 ? 'page' : undefined}>{i.title}</li>
          ))}
        </ol>
      </nav>
      {buildLayers(0)}
    </div>
  );
}

export type { NodeBreadcrumbItem };

