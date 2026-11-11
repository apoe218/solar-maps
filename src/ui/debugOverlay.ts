import { AU_KM } from '../ephemeris';
import { KM_PER_SCENE_UNIT, float32Step } from '../scene/units';

export interface DebugInfo {
  fps: number;
  focusName: string;
  focusAltitudeKm: number;
  focusAppearance: string;
  nearestName: string;
  nearestAltitudeKm: number;
  cameraWorldKm: number;
  /** |scene position| of the focus body's centre: what its vertices are offset by on the GPU */
  focusSceneCoord: number;
  maxSceneCoord: number;
}

/** Human-friendly distance: m below 1 km, km below 0.01 AU, AU above. */
export function formatDistance(km: number): string {
  const a = Math.abs(km);
  if (a < 1) return `${(km * 1000).toFixed(a < 0.01 ? 2 : 0)} m`;
  if (a < 0.01 * AU_KM) return `${km.toLocaleString('en-US', { maximumFractionDigits: a < 100 ? 2 : 0 })} km`;
  return `${(km / AU_KM).toFixed(4)} AU`;
}

/** Overlay toggled with the backtick key. Call `update` every frame; it only writes to the DOM when visible. */
export function mountDebugOverlay(parent: HTMLElement, initiallyVisible = false): { update(info: DebugInfo): void } {
  const el = document.createElement('pre');
  el.className = 'panel debug-overlay';
  el.hidden = !initiallyVisible;
  el.setAttribute('role', 'region');
  el.setAttribute('aria-label', 'Debug overlay');
  parent.appendChild(el);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Backquote' && !(e.target instanceof HTMLInputElement)) el.hidden = !el.hidden;
  });
  let lastWrite = 0;
  return {
    update(info) {
      if (el.hidden) return;
      const now = performance.now();
      if (now - lastWrite < 100) return; // 10 Hz is plenty to read
      lastWrite = now;
      el.textContent = [
        `fps            ${info.fps.toFixed(0)}`,
        `focus          ${info.focusName}  (${info.focusAppearance})`,
        `  altitude     ${formatDistance(info.focusAltitudeKm)}`,
        `nearest        ${info.nearestName}`,
        `  altitude     ${formatDistance(info.nearestAltitudeKm)}`,
        `camera world   ${formatDistance(info.cameraWorldKm)} from Sun (float64, CPU)`,
        `focus in scene |p| ${info.focusSceneCoord.toExponential(2)} units → f32 step ${formatDistance(float32Step(info.focusSceneCoord) * KM_PER_SCENE_UNIT)}`,
        `farthest       |x| ${info.maxSceneCoord.toExponential(2)} units → f32 step ${formatDistance(float32Step(info.maxSceneCoord) * KM_PER_SCENE_UNIT)}`,
        `               (1 unit = ${KM_PER_SCENE_UNIT} km; error is relative to distance, so far = fine)`,
        `camera scene   (0, 0, 0)  — floating origin`,
      ].join('\n');
    },
  };
}
