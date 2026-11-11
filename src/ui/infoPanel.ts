import type { Body } from '../bodies/Body';
import { orbitalPeriodDays, solarDayDays } from '../ephemeris';
import { formatDays, formatDistance, formatKm, typeLabel } from './format';

export interface InfoContext {
  /** for "Moon of Mars" and the moon's heliocentric orbit */
  get(id: string): Body | undefined;
  earth: Body;
  sun: Body;
  isFocus(b: Body): boolean;
  onFly(b: Body): void;
}

/**
 * Collapsible info panel (right). Shows the selected body, or the focus when nothing is selected.
 * Distances update a few times a second; they are not a live region, so screen readers aren't flooded.
 */
export function mountInfoPanel(parent: HTMLElement, ctx: InfoContext, collapsed: boolean): { show(b: Body): void; tick(): void } {
  const aside = document.createElement('aside');
  aside.className = 'panel info-panel';
  aside.setAttribute('aria-labelledby', 'info-title');
  aside.innerHTML = `
    <div class="info-header">
      <h2 id="info-title"></h2>
      <button type="button" class="info-toggle" aria-controls="info-body"></button>
    </div>
    <div id="info-body" class="info-body">
      <p class="info-type"></p>
      <dl class="info-facts"></dl>
      <p class="info-desc"></p>
      <button type="button" class="info-fly"></button>
    </div>`;
  parent.appendChild(aside);
  const title = aside.querySelector<HTMLElement>('#info-title')!;
  const toggle = aside.querySelector<HTMLButtonElement>('.info-toggle')!;
  const bodyEl = aside.querySelector<HTMLElement>('.info-body')!;
  const typeEl = aside.querySelector<HTMLElement>('.info-type')!;
  const facts = aside.querySelector<HTMLDListElement>('.info-facts')!;
  const desc = aside.querySelector<HTMLElement>('.info-desc')!;
  const fly = aside.querySelector<HTMLButtonElement>('.info-fly')!;

  let open = !collapsed;
  const syncToggle = () => {
    bodyEl.hidden = !open;
    aside.classList.toggle('collapsed', !open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Collapse information panel' : 'Expand information panel');
    toggle.textContent = open ? '▾' : '▸';
  };
  toggle.addEventListener('click', () => { open = !open; syncToggle(); });
  syncToggle();

  let current: Body | null = null;
  const live: { sun?: HTMLElement; earth?: HTMLElement } = {};
  fly.addEventListener('click', () => current && ctx.onFly(current));

  function row(label: string, value: string): HTMLElement {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    facts.append(dt, dd);
    return dd;
  }

  function show(b: Body): void {
    current = b;
    const r = b.record;
    const parent = r.parent ? ctx.get(r.parent) : undefined;
    title.textContent = r.name;
    typeEl.textContent = typeLabel(r.type, r.type === 'moon' ? parent?.record.name ?? null : null);
    facts.replaceChildren();
    row('Radius', `${formatKm(r.physical.meanRadiusKm)}${r.id !== 'earth' ? ` (${(r.physical.meanRadiusKm / 6371).toPrecision(3)} × Earth)` : ''}`);
    live.sun = r.type === 'star' ? undefined : row('From the Sun', '');
    live.earth = r.id === 'earth' ? undefined : row('From Earth', '');
    if (r.orbit) {
      const period = orbitalPeriodDays(r.orbit);
      row('Orbital period', r.type === 'moon' && parent ? `${formatDays(period)} around ${parent.record.name}` : formatDays(period));
    }
    const rotDays = r.physical.siderealRotationHours / 24;
    const retro = rotDays < 0 ? ' (retrograde)' : '';
    // Heliocentric period: the body's own orbit, or its planet's for a moon.
    let helio: Body | undefined = b;
    while (helio?.record.parent && helio.record.parent !== ctx.sun.record.id) helio = ctx.get(helio.record.parent);
    if (helio?.record.orbit && r.type !== 'star') {
      const solar = formatDays(solarDayDays(rotDays, orbitalPeriodDays(helio.record.orbit)));
      const rotation = formatDays(rotDays);
      row('Day length', `${solar} (sunrise to sunrise)`);
      // Show the sidereal rotation too when it reads differently (Earth 23.9 h, Venus 243 days backwards).
      if (rotation !== solar || retro) row('Rotation', `${rotation}${retro}`);
    } else {
      row('Rotation', `${formatDays(rotDays)}${retro}`);
    }
    if (r.knownMoons) row('Moons', `${r.knownMoons.count.toLocaleString('en-US')} known (as of ${r.knownMoons.asOf})`);
    desc.textContent = r.description;
    tick();
  }

  function tick(): void {
    if (!current) return;
    if (live.sun) live.sun.textContent = formatDistance(current.world.distanceTo(ctx.sun.world));
    if (live.earth) live.earth.textContent = formatDistance(current.world.distanceTo(ctx.earth.world));
    const atIt = ctx.isFocus(current);
    fly.hidden = atIt;
    fly.textContent = `Fly to ${current.record.name}`;
  }

  return { show, tick };
}
