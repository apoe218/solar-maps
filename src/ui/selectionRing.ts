import { Vector3, type PerspectiveCamera } from 'three';
import type { Body } from '../bodies/Body';

/**
 * Ring around the selected body, as a DOM element: a crisp constant-width line at any size, and no
 * dependence on the GPU's point-sprite size limit. Hidden when the body is behind the camera or fills the view.
 */
export class SelectionRing {
  private body: Body | null = null;
  private readonly el: HTMLDivElement;
  private readonly v = new Vector3();

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'selection-ring';
    this.el.hidden = true;
    parent.appendChild(this.el);
  }

  get selected(): Body | null {
    return this.body;
  }

  select(body: Body | null): void {
    this.body = body;
    if (!body) this.el.hidden = true;
  }

  /** Call after the bodies have been placed for this frame. */
  update(camera: PerspectiveCamera, canvas: HTMLElement): void {
    const b = this.body;
    if (!b) return;
    const depth = this.v.copy(b.root.position).applyMatrix4(camera.matrixWorldInverse).z;
    this.v.copy(b.root.position).project(camera);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const r = b.screenRadiusPx + 7;
    const visible = depth < 0 && b.root.visible && 2 * r < Math.max(w, h) &&
      Math.abs(this.v.x) < 1 + (2 * r) / w && Math.abs(this.v.y) < 1 + (2 * r) / h;
    this.el.hidden = !visible;
    if (!visible) return;
    const x = ((this.v.x + 1) / 2) * w, y = ((1 - this.v.y) / 2) * h;
    const d = Math.max(22, 2 * r);
    this.el.style.transform = `translate(${(x - d / 2).toFixed(1)}px, ${(y - d / 2).toFixed(1)}px)`;
    this.el.style.width = this.el.style.height = `${d.toFixed(1)}px`;
  }
}
