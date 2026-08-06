import type { ScenePayload } from "../types";

// One page of a synced entry. `ownership` is per-page on purpose: a scene entry
// mixes read-aloud the GM means to show the table with GM notes, NPC lore and
// encounter details that must never be seen, and the moment the GM raises the
// entry to Observer — which is the entire point of read-aloud — page ownership
// is the only thing still holding the two apart.
export interface PageData {
  name: string;
  type: "text";
  sort: number;
  ownership: { default: number };
  text: { content: string; format: number };
  // Stamped by the orchestrator, not the mappers: it marks a page as this
  // module's to replace or remove. A page without it belongs to the GM.
  flags?: Record<string, unknown>;
}

export interface EntryData {
  name: string;
  folder: string | null;
  sort: number;
  pages: PageData[];
  flags: Record<string, unknown>;
}

// A mapper turns one RoleCall scene into the data for Foundry document(s)
// inside the given folder. This is the seam that keeps the future open: today
// only the journal mapper is registered; a mapper that builds real map Scenes
// can be added here and selected by a setting without touching the sync
// orchestrator.
//
// That second mapper is genuinely planned (ADR 0002) but is NOT stubbed out in
// code. A registered class whose buildEntryData() only throws is unreachable
// dead weight that ships in the bundle and invites "what is this?" from package
// reviewers — the interface below is the durable commitment, not a placeholder
// file.
export interface SceneMapper {
  readonly key: string;
  // Pure: builds the document data for one scene. No I/O, no document
  // creation — the orchestrator owns create-vs-update, so it can reconcile an
  // entry in place rather than deleting and recreating it (and losing every
  // link pointing at it). `folderId` is the target Folder's id (or null);
  // `sort` is the sibling ordering the orchestrator assigns from the server's
  // canonical order. The orchestrator also handles fetching and folder setup.
  buildEntryData(scene: ScenePayload, folderId: string | null, sort: number): EntryData;
}

import { JournalMapper } from "./journal";

const REGISTRY: Record<string, SceneMapper> = {
  [JournalMapper.key]: new JournalMapper(),
};

// The mapper used by a sync run. Hard-wired to "journal" for now; later this can
// read a module setting (e.g. "journal" | "canvas" | "both").
export function activeMapper(): SceneMapper {
  return REGISTRY[JournalMapper.key]!;
}
