/** Label priority, fading and overlap culling. Pure: no DOM. */

const TYPE_RANK: Record<string, number> = { star: 0, planet: 1, 'dwarf-planet': 2, moon: 3 };

/** Lower sorts first: focus, then selection, then Sun > planets > dwarf planets > moons, bigger first. */
export function labelPriority(type: string, radiusKm: number, isFocus: boolean, isSelected: boolean): number {
  const rank = isFocus ? -2 : isSelected ? -1 : (TYPE_RANK[type] ?? 4);
  return rank * 1e9 - Math.min(radiusKm, 1e8);
}

/** Full opacity up to FADE_START × the view scale, gone by FADE_END ×, log-interpolated. */
export const FADE_START = 300;
export const FADE_END = 3000;

/**
 * Fade labels of bodies much farther away than the scale being looked at (the camera's altitude above
 * its focus): Jupiter's label shouldn't hover over Earth's limb when you're 20,000 km from Earth.
 */
export function distanceFade(distanceKm: number, viewScaleKm: number): number {
  const ratio = distanceKm / Math.max(viewScaleKm, 1e-9);
  if (ratio <= FADE_START) return 1;
  if (ratio >= FADE_END) return 0;
  return (Math.log(FADE_END) - Math.log(ratio)) / (Math.log(FADE_END) - Math.log(FADE_START));
}

export interface LabelBox {
  id: string;
  /** screen rectangle, CSS px */
  x: number;
  y: number;
  width: number;
  height: number;
  priority: number;
}

/** Greedy placement by priority: a label is shown only if it overlaps no higher-priority label already shown. */
export function cullOverlaps(boxes: readonly LabelBox[], padding = 3): Set<string> {
  const shown: LabelBox[] = [];
  for (const b of [...boxes].sort((a, c) => a.priority - c.priority)) {
    const hit = shown.some((s) =>
      b.x < s.x + s.width + padding && s.x < b.x + b.width + padding &&
      b.y < s.y + s.height + padding && s.y < b.y + b.height + padding);
    if (!hit) shown.push(b);
  }
  return new Set(shown.map((s) => s.id));
}
