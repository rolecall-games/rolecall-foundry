import type { ScenePayload } from "../types";

// A mapper turns one Role Call scene into Foundry document(s) inside the given
// folder. This is the seam that keeps the future open: today only the journal
// mapper is registered; a `canvas` mapper (real map Scenes) can be added later
// and selected by a setting without touching the sync orchestrator.
export interface SceneMapper {
  readonly key: string;
  // Create the Foundry document(s) for this scene. `folder` is a Foundry Folder
  // document (or null). Implementations are responsible for their own document
  // type. The orchestrator handles fetching, folder setup, and idempotency.
  apply(scene: ScenePayload, folder: unknown): Promise<void>;
}

import { JournalMapper } from "./journal";
import { CanvasMapper } from "./canvas";

const REGISTRY: Record<string, SceneMapper> = {
  [JournalMapper.key]: new JournalMapper(),
  [CanvasMapper.key]: new CanvasMapper(),
};

// The mapper used by a sync run. Hard-wired to "journal" for now; later this can
// read a module setting (e.g. "journal" | "canvas" | "both").
export function activeMapper(): SceneMapper {
  return REGISTRY[JournalMapper.key]!;
}
