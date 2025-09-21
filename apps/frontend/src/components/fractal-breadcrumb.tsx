"use client";

import React, { ReactNode, useMemo } from 'react';
import { motion } from 'framer-motion';
import type { NodeBreadcrumbItem } from '@/features/boards/boards-api';

export interface FractalBreadcrumbProps {
  items: NodeBreadcrumbItem[];
  children: ReactNode;
  onSelect?: (id: string) => void;
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

function getNodeIcon(type?: string) {
  switch (type) {
    case 'SIMPLE': return 'S';
    case 'MEDIUM': return 'M';
    case 'COMPLEX': return 'K';
    default: return 'N';
  }
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
}: FractalBreadcrumbProps) {
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

  const buildLayers = (index: number): ReactNode => {
    if (index >= items.length) {
      return <div className="fractal-content relative">{children}</div>;
    }
    const item = items[index];
    const depth = index + 1;
  const color = generateColor(index, muted, strokeAlpha);
    const showLabel = visibleLabelIndexes.has(index);
    const isCurrent = index === items.length - 1;

    // Calcul dynamique de la géométrie du raccord (angle) entre cette strate et la précédente
    const effectiveLeftPad = Math.round(offsetX * shrinkFactor);
    const deltaX = offsetX - effectiveLeftPad; // réduction latérale
    const deltaY = offsetY; // profondeur verticale
    const diagonalLength = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  const angleDeg = Math.atan2(deltaY, deltaX) * (180 / Math.PI); // angle (positif) utilisé directement

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
              // Pleine largeur : on ne raccourcit plus selon l'index
              width: '100%',
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
              height: '100vh', // va jusqu'en bas de l'écran
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
            }}
          >
            <button
              type="button"
              onClick={() => onSelect?.(item.id)}
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

