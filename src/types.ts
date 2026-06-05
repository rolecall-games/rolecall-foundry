// Mirrors the JSON contract served by Role Call's
// GET /api/v1/foundry/scenes (see app/views/foundry/scenes/index.json.jbuilder).

export interface NpcPayload {
  id: number;
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
  id: number;
  name: string;
  encounter_type: string | null;
  notes: string | null;
  details: Record<string, unknown> | null;
}

export interface LootCachePayload {
  id: number;
  description: string | null;
  currency: string | null;
  notes: string | null;
}

export interface MagicItemPayload {
  id: number;
  name: string;
  rarity: string | null;
  item_type: string | null;
  attunement: boolean;
  description: string | null;
  notes: string | null;
}

export interface ScenePayload {
  id: number;
  name: string;
  position: number;
  read_aloud: string | null;
  gm_notes: string | null;
  chapter: { id: number; title: string } | null;
  location: { id: number; name: string; description: string | null } | null;
  npcs: NpcPayload[];
  encounters: EncounterPayload[];
  loot_caches: LootCachePayload[];
  magic_items: MagicItemPayload[];
}

export interface ScenesResponse {
  sync_version: number;
  game: { id: number; name: string };
  scenes: ScenePayload[];
}
