import { MODULE_ID } from "../constants";
import type { LoreNotePayload } from "../types";
import { esc, HTML_FORMAT, OWNERSHIP, PAGE_SORT_STEP, placeholder } from "./html";
import type { EntryData } from "./index";

// A lore note is one JournalEntry with a single page — it has no members and
// no read-aloud, so the multi-page shape a scene needs would just add a click.
//
// Flagged with `loreId` rather than `sceneId`: the two live in the same game
// folder and the sync run has to be able to tell "this is a lore entry the
// server no longer sends" from "this is a scene entry", without guessing from
// the title.
export function loreEntryData(
  note: LoreNotePayload,
  folderId: string | null,
  sort: number,
): EntryData {
  const body = note.body ? `<p>${esc(note.body)}</p>` : placeholder("rolecall-sync.Empty.Lore");

  return {
    name: note.title,
    folder: folderId,
    sort,
    pages: [
      {
        name: note.title,
        type: "text",
        sort: PAGE_SORT_STEP,
        // GM-only by choice, not by omission. A scene's read-aloud is written
        // to be spoken at the table; campaign lore has no such promise behind
        // it, so the closed default is the safe one until Role Call marks lore
        // player-safe on the wire. Don't "fix" this to OBSERVER.
        ownership: { default: OWNERSHIP.NONE },
        text: { content: body, format: HTML_FORMAT },
      },
    ],
    flags: {
      [MODULE_ID]: { loreId: note.id, syncedAt: new Date().toISOString() },
    },
  };
}
