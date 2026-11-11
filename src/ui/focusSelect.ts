/** Dropdown listing every body; choosing one flies there. `set` reflects the current focus. */
export function mountFocusSelect(
  parent: HTMLElement,
  bodies: readonly { id: string; name: string }[],
  initial: string,
  onChange: (id: string) => void,
): { set(id: string): void } {
  const label = document.createElement('label');
  label.className = 'panel focus-select';
  label.textContent = 'Fly to ';
  const select = document.createElement('select');
  for (const b of bodies) select.add(new Option(b.name, b.id, b.id === initial, b.id === initial));
  select.addEventListener('change', () => {
    onChange(select.value);
    select.blur(); // give arrow keys back to the camera
  });
  label.appendChild(select);
  parent.appendChild(label);
  return { set: (id) => (select.value = id) };
}
