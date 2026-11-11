import { SPEEDS, SimClock, formatUtc } from './clock';

/** Bottom bar: date, reverse, play/pause, speed, "now". Call the returned function every frame. */
export function mountTimeControls(parent: HTMLElement, clock: SimClock): () => void {
  const bar = document.createElement('div');
  bar.className = 'panel time-controls';
  bar.innerHTML = `
    <span class="date" aria-live="off"></span>
    <button type="button" data-action="reverse" title="Reverse time">⇄</button>
    <button type="button" data-action="play" title="Play / pause"></button>
    <span class="speeds" role="group" aria-label="Speed">
      ${SPEEDS.map((s) => `<button type="button" data-speed="${s.id}">${s.label}</button>`).join('')}
    </span>
    <button type="button" data-action="now" title="Jump to the current time">Now</button>`;
  parent.appendChild(bar);

  const dateEl = bar.querySelector<HTMLElement>('.date')!;
  const playBtn = bar.querySelector<HTMLButtonElement>('[data-action="play"]')!;
  const revBtn = bar.querySelector<HTMLButtonElement>('[data-action="reverse"]')!;
  const speedBtns = [...bar.querySelectorAll<HTMLButtonElement>('[data-speed]')];

  bar.addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement).closest('button');
    if (!btn) return;
    if (btn.dataset.speed) clock.setSpeed(btn.dataset.speed);
    else if (btn.dataset.action === 'play') clock.togglePlay();
    else if (btn.dataset.action === 'reverse') clock.reverse();
    else if (btn.dataset.action === 'now') clock.setNow();
    syncButtons();
  });

  function syncButtons(): void {
    playBtn.textContent = clock.playing ? '❚❚' : '▶';
    playBtn.setAttribute('aria-label', clock.playing ? 'Pause' : 'Play');
    revBtn.classList.toggle('active', clock.direction === -1);
    revBtn.setAttribute('aria-pressed', String(clock.direction === -1));
    for (const b of speedBtns) {
      const on = b.dataset.speed === clock.speed.id;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    }
  }
  syncButtons();

  let lastText = '';
  return () => {
    const text = formatUtc(clock.date);
    if (text !== lastText) {
      dateEl.textContent = text;
      lastText = text;
    }
    const accurate = clock.isAccurate;
    dateEl.classList.toggle('inaccurate', !accurate);
    dateEl.title = accurate ? '' : 'Outside 1800–2050: planet positions are less accurate';
  };
}
