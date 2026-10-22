// HTML for the demo pages: one layout, escaped text everywhere, no scripts.

/** Escapes text before it goes into HTML. Customer text is data, never markup (INV-002). */
export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Cents to a price for people: 4500 → "$45.00". */
export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const NAV = [
  { href: "/", label: "Checkout" },
  { href: "/contact", label: "Contact us" },
  { href: "/support", label: "Support inbox" },
];

const STYLE = `
:root {
  color-scheme: light dark;
  --bg: #fafaf8; --surface: #ffffff; --text: #1d1d1b; --muted: #5c5c57; --line: #dcdcd5;
  --accent: #1f5f4a; --accent-text: #ffffff; --danger: #a3261b; --danger-bg: #fbeceb; --ok-bg: #e9f3ee;
  --focus: #1a56b8;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #161615; --surface: #1f1f1d; --text: #ecece6; --muted: #a9a9a1; --line: #3a3a36;
    --accent: #7fc8a9; --accent-text: #10241c; --danger: #f2a198; --danger-bg: #3a1d1a; --ok-bg: #1b2e26;
    --focus: #8ab4ff;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
a { color: var(--accent); }
:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
header { border-bottom: 1px solid var(--line); background: var(--surface); }
header nav { max-width: 960px; margin: 0 auto; padding: 0 16px; display: flex; gap: 4px; flex-wrap: wrap; }
header nav a { display: inline-block; padding: 12px; min-height: 44px; text-decoration: none; color: var(--muted); }
header nav a[aria-current="page"] { color: var(--text); font-weight: 600; box-shadow: inset 0 -2px 0 var(--accent); }
main { max-width: 640px; margin: 0 auto; padding: 32px 16px 64px; }
main.wide { max-width: 960px; }
h1 { font-size: 1.75rem; line-height: 1.2; margin: 0 0 8px; }
.lead { color: var(--muted); margin: 0 0 24px; }
.panel { background: var(--surface); border: 1px solid var(--line); border-radius: 6px; }
.lines { list-style: none; margin: 0; padding: 0; }
.lines li { display: flex; justify-content: space-between; gap: 16px; padding: 12px 16px; border-top: 1px solid var(--line); }
.lines li:first-child { border-top: 0; }
.lines .total { font-weight: 700; font-size: 1.125rem; }
.muted { color: var(--muted); }
form { margin-top: 24px; }
label { display: block; font-weight: 600; margin-bottom: 4px; }
.hint { color: var(--muted); font-size: 0.875rem; margin: 0 0 8px; }
input[type="text"], textarea { width: 100%; padding: 10px 12px; font: inherit; color: inherit; background: var(--surface); border: 1px solid var(--line); border-radius: 4px; }
textarea { min-height: 160px; resize: vertical; }
.row { display: flex; gap: 8px; align-items: flex-start; }
.row input { flex: 1; }
button { min-height: 44px; padding: 10px 20px; font: inherit; font-weight: 600; color: var(--accent-text); background: var(--accent); border: 0; border-radius: 4px; cursor: pointer; }
.actions { margin-top: 16px; }
.notice { margin: 16px 0 0; padding: 12px 16px; border-radius: 4px; }
.notice.error { background: var(--danger-bg); color: var(--danger); }
.notice.ok { background: var(--ok-bg); }
.filters { display: flex; flex-wrap: wrap; gap: 4px; margin: 0 0 16px; padding: 0; list-style: none; }
.filters a { display: inline-block; padding: 8px 12px; min-height: 44px; border: 1px solid var(--line); border-radius: 4px; text-decoration: none; color: var(--text); background: var(--surface); }
.filters a[aria-current="page"] { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); font-weight: 600; }
.feed { list-style: none; margin: 0; padding: 0; }
.feed li { padding: 16px; border-top: 1px solid var(--line); }
.feed li:first-child { border-top: 0; }
.feed .meta { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 4px; font-size: 0.875rem; }
.topic { font-weight: 600; }
.flag { font-weight: 600; color: var(--danger); }
.feed .text { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.empty { padding: 32px 16px; text-align: center; color: var(--muted); }
@media (max-width: 480px) { .row { flex-direction: column; align-items: stretch; } h1 { font-size: 1.5rem; } }
`;

export function page(input: { title: string; path: string; body: string; wide?: boolean }): string {
  const nav = NAV.map((n) => `<a href="${n.href}"${n.href === input.path ? ' aria-current="page"' : ""}>${n.label}</a>`).join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(input.title)} · Demo store</title>
<style>${STYLE}</style>
</head>
<body>
<header><nav aria-label="Main">${nav}</nav></header>
<main${input.wide ? ' class="wide"' : ""}>
${input.body}
</main>
</body>
</html>
`;
}
