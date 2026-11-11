/** Polite live region for screen readers ("Mars selected", "Arrived at Mars", "Link copied"). */
export function mountAnnouncer(parent: HTMLElement): (message: string) => void {
  const el = document.createElement('div');
  el.className = 'visually-hidden';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  parent.appendChild(el);
  let timer = 0;
  return (message) => {
    // Clear first so repeating the same message is announced again.
    el.textContent = '';
    clearTimeout(timer);
    timer = window.setTimeout(() => (el.textContent = message), 50);
  };
}
