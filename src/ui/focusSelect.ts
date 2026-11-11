/**
 * Temporary stand-in for search / fly-to: a dropdown that centres the camera on a body and follows it.
 */
export function mountFocusSelect(
  parent: HTMLElement,
  bodies: readonly { id: string; name: string }[],
  initial: string,
  onChange: (id: string) => void,
): void {
  const label = document.createElement('label');
  label.className = 'panel focus-select';
  label.textContent = 'Focus ';
  const select = document.createElement('select');
  for (const b of bodies) select.add(new Option(b.name, b.id, b.id === initial, b.id === initial));
  select.addEventListener('change', () => onChange(select.value));
  label.appendChild(select);
  parent.appendChild(label);
}
