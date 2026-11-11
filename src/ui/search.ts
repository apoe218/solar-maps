import { search, type SearchEntry, type SearchHit } from './fuzzy';

export interface SearchOptions {
  entries: readonly SearchEntry[];
  /** secondary text per result, e.g. "Planet" or "Moon of Mars" */
  describe: (id: string) => string;
  /** Enter / click on a result */
  onChoose: (id: string) => void;
  announce: (message: string) => void;
}

/**
 * Search box following the WAI-ARIA combobox pattern (input + listbox, aria-activedescendant).
 * Keys: ↓/↑ move, Enter flies to the highlighted (or first) result, Esc closes then clears, Tab leaves.
 * "/" anywhere focuses it.
 */
export function mountSearch(parent: HTMLElement, opts: SearchOptions): { focus(): void; input: HTMLInputElement } {
  const root = document.createElement('div');
  root.className = 'panel search';
  root.setAttribute('role', 'search');
  root.innerHTML = `
    <label class="visually-hidden" for="search-input">Search planets and moons</label>
    <svg class="search-icon" aria-hidden="true" viewBox="0 0 24 24" width="18" height="18"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.5 15.5L21 21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
    <input id="search-input" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false"
      aria-controls="search-results" aria-describedby="search-help" autocomplete="off" spellcheck="false"
      placeholder="Search planets and moons" />
    <kbd class="search-kbd" aria-hidden="true">/</kbd>
    <ul id="search-results" role="listbox" aria-label="Search results" hidden></ul>
    <p id="search-help" class="visually-hidden">Type to search, use the up and down arrows to choose, Enter to fly there.
      Elsewhere: press slash to search, arrow keys orbit, plus and minus zoom, Escape returns to the solar system view.</p>`;
  parent.appendChild(root);

  const input = root.querySelector<HTMLInputElement>('input')!;
  const list = root.querySelector<HTMLUListElement>('ul')!;
  let hits: SearchHit[] = [];
  let active = -1;

  function render(): void {
    list.replaceChildren(...hits.map((h, i) => {
      const li = document.createElement('li');
      li.id = `search-opt-${h.id}`;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(i === active));
      li.dataset.id = h.id;
      const name = opts.entries.find((e) => e.id === h.id)!.name;
      li.innerHTML = `<span class="opt-name"></span><span class="opt-meta"></span>`;
      li.querySelector('.opt-name')!.textContent = h.alias ? `${name} (${h.alias})` : name;
      li.querySelector('.opt-meta')!.textContent = opts.describe(h.id);
      return li;
    }));
    const open = hits.length > 0 && document.activeElement === input;
    list.hidden = !open;
    input.setAttribute('aria-expanded', String(open));
    if (active >= 0 && hits[active]) {
      input.setAttribute('aria-activedescendant', `search-opt-${hits[active]!.id}`);
      list.children[active]?.scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  }

  function update(): void {
    hits = search(opts.entries, input.value, input.value.trim() ? 8 : 20);
    active = input.value.trim() && hits.length ? 0 : -1;
    render();
    if (input.value.trim()) opts.announce(hits.length ? `${hits.length} result${hits.length > 1 ? 's' : ''}` : 'No results');
  }

  function choose(i: number): void {
    const hit = hits[i];
    if (!hit) return;
    opts.onChoose(hit.id);
    input.value = '';
    hits = [];
    active = -1;
    render();
    input.blur(); // hand the keyboard back to the map (arrows orbit, +/- zoom)
  }

  input.addEventListener('input', update);
  input.addEventListener('focus', update);
  input.addEventListener('blur', () => setTimeout(() => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); }, 120));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!hits.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length;
      render();
    } else if (e.key === 'Enter') {
      choose(active >= 0 ? active : 0);
    } else if (e.key === 'Escape') {
      if (!list.hidden) {
        hits = [];
        active = -1;
        render();
      } else if (input.value) input.value = '';
      else input.blur();
    } else return;
    e.preventDefault();
    e.stopPropagation();
  });
  list.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus in the input
  list.addEventListener('click', (e) => {
    const li = (e.target as HTMLElement).closest('li');
    if (li) choose(hits.findIndex((h) => h.id === li.dataset.id));
  });

  window.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement | null;
    if (e.key === '/' && !(t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) {
      e.preventDefault();
      input.focus();
    }
  });

  return { focus: () => input.focus(), input };
}
