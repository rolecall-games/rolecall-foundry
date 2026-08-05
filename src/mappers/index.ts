import type { ScenePayload } from "../types";

// A mapper turns one Role Call scene into Foundry document(s) inside the given
// folder. This is the seam that keeps the future open: today only the journal
// mapper is registered; a mapper that builds real map Scenes can be added here
// and selected by a setting without touching the sync orchestrator.
//
// That second mapper is genuinely planned (ADR 0002) but is NOT stubbed out in
// code. A registered class whose apply() only throws is unreachable dead weight
// that ships in the bundle and invites "what is this?" from package reviewers —
// the interface below is the durable commitment, not a placeholder file.
export interface SceneMapper {
  readonly key: string;
  // Create the Foundry document(s) for this scene. `folder` is a Foundry Folder
  // document (or null); `sort` is the sibling ordering the orchestrator assigns
  // from the server's canonical order. Implementations are responsible for
  // their own document type. The orchestrator handles fetching, folder setup,
  // and idempotency.
  apply(scene: ScenePayload, folder: unknown, sort: number): Promise<void>;
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
