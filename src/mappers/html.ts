// Shared page-building helpers for the mappers. Role Call fields are plain
// text, so every one of them is escaped before it reaches journal HTML.

export const HTML_FORMAT = CONST?.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1;

// Read off CONST for the same reason HTML_FORMAT is — the enum is the contract
// and the numbers are only a fallback for a client that has not populated CONST
// by the time this module is evaluated.
export const OWNERSHIP: { NONE: number; OBSERVER: number } = {
  NONE: CONST?.DOCUMENT_OWNERSHIP_LEVELS?.NONE ?? 0,
  OBSERVER: CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? 2,
};

// Pages are spaced the same way the orchestrator spaces entries: a GM who drags
// a page to a new slot lands between two neighbours instead of forcing a
// renumber of everything after it.
export const PAGE_SORT_STEP = 100_000;

// Escapes user-authored text, then converts newlines to <br> so prose written
// in Role Call keeps its shape in a journal page.
export function esc(value: string | null | undefined): string {
  if (!value) return "";
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML.replace(/\n/g, "<br>");
}

// Labels arrive as i18n keys rather than text: they are baked into documents
// that live in the GM's world forever, so they have to be translatable, and
// localizing inside the helper keeps the literal key at the call site where it
// can be grepped against lang/en.json. Localized text is escaped like any other
// data — a translation should not be able to inject markup into a page.
export function heading(labelKey: string): string {
  return `<h3>${esc(game.i18n.localize(labelKey))}</h3>`;
}

export function metaRow(labelKey: string, value: string | null | undefined): string {
  return value ? `<p><strong>${esc(game.i18n.localize(labelKey))}:</strong> ${esc(value)}</p>` : "";
}

export function section(labelKey: string, value: string | null | undefined): string {
  return value ? `${heading(labelKey)}<p>${esc(value)}</p>` : "";
}

// The italic stand-in for a record the GM left blank.
export function placeholder(labelKey: string): string {
  return `<p><em>${esc(game.i18n.localize(labelKey))}</em></p>`;
}
