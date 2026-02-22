// ---------------------------------------------------------------------------
// Spring physics for the bling bling interactive mode
// ---------------------------------------------------------------------------

export interface PhysicsNode {
  ox: number;      // x offset from layout position
  oy: number;      // y offset from layout position
  vx: number;      // x velocity
  vy: number;      // y velocity
  pinned: boolean; // true while being dragged — physics skips this node
}

export function createPhysicsNode(): PhysicsNode {
  return { ox: 0, oy: 0, vx: 0, vy: 0, pinned: false };
}

const SPRING_K = 0.045;       // stiffness
const DAMPING = 0.80;         // velocity multiplier per frame (< 1 = damped)
const SLEEP_THRESHOLD = 0.1;  // below this magnitude, snap to rest

/**
 * Advance spring physics by one frame for all non-pinned nodes.
 * Returns true if any node is still in motion (caller should request next frame).
 */
export function tickAllPhysics(physics: Map<string, PhysicsNode>): boolean {
  let hasActivity = false;

  for (const s of physics.values()) {
    if (s.pinned) {
      hasActivity = true; // drag in progress
      continue;
    }

    // Spring force: F = −k·x
    s.vx = (s.vx + -SPRING_K * s.ox) * DAMPING;
    s.vy = (s.vy + -SPRING_K * s.oy) * DAMPING;
    s.ox += s.vx;
    s.oy += s.vy;

    const moving =
      Math.abs(s.vx) > SLEEP_THRESHOLD ||
      Math.abs(s.vy) > SLEEP_THRESHOLD ||
      Math.abs(s.ox) > SLEEP_THRESHOLD ||
      Math.abs(s.oy) > SLEEP_THRESHOLD;

    if (moving) {
      hasActivity = true;
    } else {
      // Snap to rest to avoid floating-point drift
      s.ox = 0; s.oy = 0; s.vx = 0; s.vy = 0;
    }
  }

  return hasActivity;
}

/**
 * When a node is dragged, propagate a diminishing pull to its ancestors.
 * Creates an organic "connected tissue" feel.
 */
export function propagateDragToAncestors(
  draggedId: string,
  ox: number,
  oy: number,
  parentMap: Map<string, string | null>,
  physics: Map<string, PhysicsNode>,
): void {
  const factors = [0.28, 0.09];
  let id: string | null = draggedId;
  for (const f of factors) {
    const pid: string | null = parentMap.get(id ?? '') ?? null;
    if (!pid) break;
    const s = physics.get(pid);
    if (s && !s.pinned) {
      s.ox = ox * f;
      s.oy = oy * f;
    }
    id = pid;
  }
}
