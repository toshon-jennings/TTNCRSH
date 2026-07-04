import aboutMarkdown from '../about.md?raw';

const EXTERNAL_LINK_RE = /^https?:\/\//i;

export function initAboutPage() {
  const openButton = document.getElementById('about-open');
  const closeButton = document.getElementById('about-close');
  const overlay = document.getElementById('about-overlay');
  const content = document.getElementById('about-content');

  if (!openButton || !closeButton || !overlay || !content) return;

  content.innerHTML = renderMarkdown(aboutMarkdown);

  const setOpen = (open: boolean) => {
    if (!open && document.activeElement instanceof HTMLElement && overlay.contains(document.activeElement)) {
      (openButton as HTMLElement).focus();
    }
    overlay.classList.toggle('is-open', open);
    overlay.setAttribute('aria-hidden', String(!open));
    document.body.classList.toggle('about-open', open);
    if (open) closeButton.focus();
  };

  openButton.addEventListener('click', () => setOpen(true));
  closeButton.addEventListener('click', () => setOpen(false));
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) setOpen(false);
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && overlay.classList.contains('is-open')) {
      setOpen(false);
    }
  });
}

function renderMarkdown(markdown: string) {
  const blocks = markdown.replace(/\r\n/g, '\n').trim().split(/\n{2,}/);

  return blocks.map((block) => {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    const first = lines[0] ?? '';

    if (first.startsWith('# ')) {
      return `<h1>${renderInline(first.slice(2))}</h1>`;
    }
    if (first.startsWith('## ')) {
      return `<h2>${renderInline(first.slice(3))}</h2>`;
    }
    if (first.startsWith('### ')) {
      return `<h3>${renderInline(first.slice(4))}</h3>`;
    }
    if (lines.every((line) => line.startsWith('- '))) {
      return `<ul>${lines.map((line) => `<li>${renderInline(line.slice(2))}</li>`).join('')}</ul>`;
    }

    return `<p>${renderInline(lines.join(' '))}</p>`;
  }).join('');
}

function renderInline(value: string) {
  return escapeHtml(value)
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      (_match, text: string, href: string) => {
        const safeHref = href.replace(/&amp;/g, '&');
        const targetAttrs = EXTERNAL_LINK_RE.test(safeHref)
          ? ' target="_blank" rel="noreferrer"'
          : '';
        return `<a href="${safeHref}"${targetAttrs}>${text}</a>`;
      },
    )
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/_([^_]+)_/g, '<em>$1</em>');
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char] ?? char));
}
