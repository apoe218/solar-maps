/** "Copy link" button: copies the current URL (which always reflects the view). */
export function mountCopyLink(parent: HTMLElement, announce: (m: string) => void, beforeCopy: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'copy-link';
  btn.innerHTML = `<svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16"><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span>Copy link</span>`;
  btn.setAttribute('aria-label', 'Copy link to this view');
  const label = btn.querySelector('span')!;
  let timer = 0;
  btn.addEventListener('click', async () => {
    beforeCopy(); // make sure the URL is current, not up to 0.5 s stale
    const url = location.href;
    let ok = false;
    try {
      await navigator.clipboard.writeText(url);
      ok = true;
    } catch {
      // Fallback for non-secure contexts / denied permission.
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      ok = document.execCommand('copy');
      ta.remove();
    }
    if (!ok) window.prompt('Copy this link:', url);
    label.textContent = ok ? 'Copied' : 'Copy link';
    announce(ok ? 'Link copied to the clipboard' : 'Copy the link from the dialog');
    clearTimeout(timer);
    timer = window.setTimeout(() => (label.textContent = 'Copy link'), 1800);
  });
  parent.appendChild(btn);
  return btn;
}
