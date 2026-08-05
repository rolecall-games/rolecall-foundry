// Mirrors the JSON contract served by Role Call's
// GET /api/v1/foundry/scenes (see app/views/foundry/scenes/index.json.jbuilder).

export interface NpcPayload {
  id: string;
  name: string;
  race: string | null;
  archetype: string | null;
  attitude: string | null;
  goals: string | null;
  quirks: string | null;
  lore_note: string | null;
  stats: Record<string, unknown> | null;
}

export interface EncounterPayload {
  id: string;
  name: string;
  encounter_type: string | null;
  notes: string | null;
  details: Record<string, unknown> | null;
}

export interface LootCachePayload {
  id: string;
  description: string | null;
  currency: string | null;
  notes: string | null;
}

export interface MagicItemPayload {
  id: string;
  name: string;
  rarity: string | null;
  item_type: string | null;
  attunement: boolean;
  description: string | null;
  notes: string | null;
}

export interface ScenePayload {
  id: string;
  name: string;
  position: number;
  read_aloud: string | null;
  gm_notes: string | null;
  chapter: { id: string; title: string } | null;
  location: { id: string; name: string; description: string | null } | null;
  npcs: NpcPayload[];
  encounters: EncounterPayload[];
  loot_caches: LootCachePayload[];
  magic_items: MagicItemPayload[];
}

// Campaign-level, not per-scene: lore belongs to the world rather than to any
// one night. Added in sync_version 3.
export interface LoreNotePayload {
  id: string;
  title: string;
  body: string | null;
  position: number;
}

export interface ScenesResponse {
  sync_version: number;
  game: { id: string; name: string };
  scenes: ScenePayload[];
  // Optional on the wire so a v3 client still parses a v2 server's response
  // rather than throwing on a missing key.
  lore_notes?: LoreNotePayload[];
}
