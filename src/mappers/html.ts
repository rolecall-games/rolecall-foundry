// Shared HTML helpers for the mappers. Role Call fields are plain text, so
// every one of them is escaped before it reaches journal HTML.

export const HTML_FORMAT = CONST?.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1;

// Escapes user-authored text, then converts newlines to <br> so prose written
// in Role Call keeps its shape in a journal page.
export function esc(value: string | null | undefined): string {
  if (!value) return "";
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML.replace(/\n/g, "<br>");
}

export function metaRow(label: string, value: string | null | undefined): string {
  return value ? `<p><strong>${label}:</strong> ${esc(value)}</p>` : "";
}

export function section(label: string, value: string | null | undefined): string {
  return value ? `<h3>${label}</h3><p>${esc(value)}</p>` : "";
}
