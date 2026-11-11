/** Small chip naming the selected body, with a "Fly to" button (discoverable on touch, where double-tap is hidden). */
export function mountSelectionLabel(parent: HTMLElement, onFly: () => void): { show(name: string | null, isFocus: boolean): void } {
  const el = document.createElement('div');
  el.className = 'panel selection-label';
  el.hidden = true;
  el.setAttribute('role', 'status');
  el.innerHTML = `<span class="name"></span><button type="button">Fly to</button>`;
  const name = el.querySelector<HTMLElement>('.name')!;
  const btn = el.querySelector<HTMLButtonElement>('button')!;
  btn.addEventListener('click', onFly);
  parent.appendChild(el);
  return {
    show(n, isFocus) {
      el.hidden = n === null;
      if (n === null) return;
      name.textContent = n;
      btn.hidden = isFocus;
      btn.title = 'Fly to (double-click the body, or press Enter)';
    },
  };
}
