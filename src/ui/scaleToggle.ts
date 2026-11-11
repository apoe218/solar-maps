import type { ScaleMode } from '../bodies/scaleMode';

const LABEL: Record<ScaleMode, string> = { explorer: 'Explorer scale', true: 'True scale' };

/** Toggle between Explorer and True scale. */
export function mountScaleToggle(parent: HTMLElement, initial: ScaleMode, onChange: (m: ScaleMode) => void): void {
  let mode = initial;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'panel scale-toggle';
  const sync = () => {
    btn.textContent = LABEL[mode];
    btn.title = mode === 'explorer'
      ? 'Bodies have a minimum on-screen size. Click for true scale.'
      : 'Real sizes and distances. Click for Explorer scale.';
  };
  btn.addEventListener('click', () => {
    mode = mode === 'explorer' ? 'true' : 'explorer';
    sync();
    onChange(mode);
  });
  sync();
  parent.appendChild(btn);
}
