import { MODULE_ID } from "../constants";
import type { LoreNotePayload } from "../types";
import { esc, HTML_FORMAT } from "./html";

// A lore note is one JournalEntry with a single page — it has no members and
// no read-aloud, so the multi-page shape a scene needs would just add a click.
//
// Flagged with `loreId` rather than `sceneId`: the two live in the same game
// folder and the sync run has to be able to tell "this is a lore entry the
// server no longer sends" from "this is a scene entry", without guessing from
// the title.
export function loreEntryData(note: LoreNotePayload, folderId: string | null, sort: number) {
  const body = note.body ? `<p>${esc(note.body)}</p>` : "<p><em>No lore written yet.</em></p>";

  return {
    name: note.title,
    folder: folderId,
    sort,
    pages: [
      {
        name: note.title,
        type: "text" as const,
        text: { content: body, format: HTML_FORMAT },
      },
    ],
    flags: {
      [MODULE_ID]: { loreId: note.id, syncedAt: new Date().toISOString() },
    },
  };
}
