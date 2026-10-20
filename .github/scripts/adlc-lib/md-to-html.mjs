// Minimal Markdown -> HTML converter (design doc §4.1/§9.1), used when writing
// descriptions/comments to ADO (HTML-only fields). Not implemented until Phase 3 write
// methods land, but built now so adlc-lib is complete per the Phase 1 file layout.
//
// Security (§11): the input is model-written markdown, but must never let raw HTML slip
// through unescaped — every `<`/`>`/`&` in plain text is escaped first, so a literal
// `<script>`, `onClick=`, or similar in the source becomes inert text, and the only real
// HTML tags in the output are the ones this module generates itself. Links are restricted to
// http(s)/mailto/relative — `javascript:` and other schemes are rewritten to `#`.
function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const SAFE_LINK_RE = /^(https?:|mailto:|#|\/)/i;

function renderInline(text) {
  let result = escapeHtml(text);
  result = result.replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`);
  result = result.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
    const safeUrl = SAFE_LINK_RE.test(url) ? url : '#';
    return `<a href="${escapeHtml(safeUrl)}">${label}</a>`;
  });
  result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  return result;
}

/** Converts markdown (model-written descriptions/comments) into the HTML ADO stores.
 * Supports paragraphs, single-level bullet/numbered lists, fenced code blocks, and inline
 * bold/italic/code/links. Returns '' for empty/nullish input. */
export function markdownToHtml(markdown) {
  if (!markdown) return '';
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let paragraph = [];
  let listItems = null; // { tag: 'ul'|'ol', items: [] }
  let codeBlock = null;

  const flushParagraph = () => {
    if (paragraph.length) {
      html.push(`<p>${renderInline(paragraph.join(' '))}</p>`);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (listItems) {
      const items = listItems.items.map((item) => `<li>${renderInline(item)}</li>`).join('');
      html.push(`<${listItems.tag}>${items}</${listItems.tag}>`);
      listItems = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (codeBlock) {
      if (/^```\s*$/.test(line)) {
        html.push(`<pre><code>${escapeHtml(codeBlock.join('\n'))}</code></pre>`);
        codeBlock = null;
      } else {
        codeBlock.push(rawLine);
      }
      continue;
    }
    if (/^```/.test(line)) {
      flushParagraph();
      flushList();
      codeBlock = [];
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    const numbered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (bullet || numbered) {
      flushParagraph();
      const tag = numbered ? 'ol' : 'ul';
      if (!listItems || listItems.tag !== tag) {
        flushList();
        listItems = { tag, items: [] };
      }
      listItems.items.push((bullet ?? numbered)[1]);
      continue;
    }
    flushList();

    if (!line.trim()) {
      flushParagraph();
      continue;
    }
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();
  if (codeBlock) html.push(`<pre><code>${escapeHtml(codeBlock.join('\n'))}</code></pre>`); // unterminated fence

  return html.join('');
}
