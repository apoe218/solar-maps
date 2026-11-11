import type { PerspectiveCamera, Scene } from 'three';
import { Vector3 } from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { Body } from '../bodies/Body';
import { cullOverlaps, distanceFade, labelPriority, type LabelBox } from './labelLayout';

interface Label {
  body: Body;
  object: CSS2DObject;
  el: HTMLDivElement;
  text: HTMLSpanElement;
  width: number;
  offset: number;
}

const LABEL_HEIGHT = 18;
const GAP_PX = 6;

/**
 * Body labels drawn with CSS2DRenderer. Each frame: decide which labels may show (moons only around the
 * focused parent; fade by distance; hide when the body fills the view), then cull overlaps by priority.
 * Labels are mouse/touch shortcuts (click selects, double-click flies); keyboard users have the search box,
 * so the layer is aria-hidden to avoid a second, unordered copy of every name.
 */
export class LabelLayer {
  readonly renderer = new CSS2DRenderer();
  private readonly labels: Label[] = [];
  private readonly v = new Vector3();

  constructor(container: HTMLElement, bodies: readonly Body[], handlers: { select(b: Body): void; fly(b: Body): void }) {
    const dom = this.renderer.domElement;
    dom.className = 'label-layer';
    dom.setAttribute('aria-hidden', 'true');
    dom.tabIndex = -1; // never a tab stop (Chrome makes overflowing containers focusable)
    container.appendChild(dom);
    for (const body of bodies) {
      const el = document.createElement('div');
      el.className = `label label-${body.record.type}`;
      const text = document.createElement('span');
      text.textContent = body.record.name;
      el.appendChild(text);
      el.addEventListener('click', (e) => { e.stopPropagation(); handlers.select(body); });
      el.addEventListener('dblclick', (e) => { e.stopPropagation(); handlers.fly(body); });
      const object = new CSS2DObject(el);
      object.center.set(0, 0.5); // anchor the label's left-middle at the body centre; we offset it right
      body.root.add(object);
      this.labels.push({ body, object, el, text, width: 0, offset: -1 });
    }
  }

  setSize(w: number, h: number): void {
    this.renderer.setSize(w, h);
  }

  /** Call after bodies are placed for the frame (root positions are camera-relative). */
  update(scene: Scene, camera: PerspectiveCamera, ctx: { focusId: string; selectedId: string | null; viewScaleKm: number; w: number; h: number }): void {
    const boxes: LabelBox[] = [];
    const opacity = new Map<string, number>();
    for (const l of this.labels) {
      const r = l.body.record;
      const isFocus = r.id === ctx.focusId, isSelected = r.id === ctx.selectedId;
      const distKm = l.body.root.position.length();
      let a = isFocus || isSelected || r.type === 'star' ? 1 : distanceFade(distKm, ctx.viewScaleKm);
      if (r.type === 'moon' && r.parent !== ctx.focusId && !isFocus && !isSelected) a = 0;
      if (l.body.screenRadiusPx > 0.25 * ctx.h) a = 0; // we're "at" it: the info panel names it
      const depth = this.v.copy(l.body.root.position).applyMatrix4(camera.matrixWorldInverse).z;
      if (depth >= 0) a = 0;
      if (l.width === 0 && l.el.offsetWidth > 0) l.width = l.el.offsetWidth;
      const offset = Math.round(l.body.screenRadiusPx + GAP_PX);
      if (offset !== l.offset) {
        l.text.style.transform = `translateX(${offset}px)`;
        l.offset = offset;
      }
      opacity.set(r.id, a);
      if (a < 0.05) continue;
      this.v.copy(l.body.root.position).project(camera);
      const x = ((this.v.x + 1) / 2) * ctx.w + offset;
      const y = ((1 - this.v.y) / 2) * ctx.h - LABEL_HEIGHT / 2;
      if (x > ctx.w || y > ctx.h || x + l.width < 0 || y + LABEL_HEIGHT < 0) continue;
      boxes.push({ id: r.id, x, y, width: l.width || 8 * r.name.length, height: LABEL_HEIGHT, priority: labelPriority(r.type, r.physical.meanRadiusKm, isFocus, isSelected) });
    }
    const shown = cullOverlaps(boxes);
    for (const l of this.labels) {
      const id = l.body.record.id;
      const on = shown.has(id);
      l.el.classList.toggle('culled', !on);
      l.el.classList.toggle('focus', id === ctx.focusId);
      l.el.classList.toggle('selected', id === ctx.selectedId);
      if (on) l.text.style.opacity = (opacity.get(id) ?? 0).toFixed(2);
    }
    this.renderer.render(scene, camera);
  }
}
