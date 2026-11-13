import { t, onChange } from './i18n.js?v=20261113q';

export function initTheme() {
  const root = document.documentElement;
  const button = document.getElementById('theme-toggle');
  const system = matchMedia('(prefers-color-scheme: dark)');
  const valid = value => value === 'light' || value === 'dark';
  let explicit;
  try { explicit = localStorage.getItem('azho.theme'); } catch (_) {}
  function refresh() {
    const dark = root.dataset.theme === 'dark';
    if (button) {
      const label = t(dark ? 'theme.light' : 'theme.dark');
      button.setAttribute('aria-pressed', String(dark));
      if (!label.startsWith('theme.')) {
        button.setAttribute('aria-label', label);
        button.title = label;
      }
    }
    // Explicit choices also colour browser chrome, regardless of OS preference.
    document.querySelectorAll('meta[name="theme-color"]').forEach(meta => {
      meta.content = dark ? '#1B1815' : '#F3E9D8';
    });
  }
  function apply(value) {
    root.dataset.theme = valid(value) ? value : system.matches ? 'dark' : 'light';
    refresh();
  }
  button?.addEventListener('click', () => {
    explicit = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('azho.theme', explicit); } catch (_) {}
    apply(explicit);
  });
  system.addEventListener('change', () => { if (!valid(explicit)) apply(null); });
  window.addEventListener('storage', event => {
    if (event.key !== 'azho.theme' && event.key !== null) return;
    if (event.storageArea && event.storageArea !== localStorage) return;
    explicit = event.newValue;
    apply(explicit);
  });
  onChange(refresh);
  apply(explicit);
  return refresh;
}
