import { MODULE_ID } from "./constants";
import { fetchScenes, RoleCallApiError } from "./api";
import { activeMapper } from "./mappers";

// Find (or create) the per-game folder that holds this module's journal
// entries. Flagged with the Role Call game id so re-syncs reuse the same folder.
async function findOrCreateGameFolder(gameId: number, gameName: string): Promise<unknown> {
  const existing = game.folders?.find(
    (f: any) => f.type === "JournalEntry" && f.getFlag(MODULE_ID, "gameId") === gameId,
  );
  if (existing) return existing;

  return Folder.create({
    name: `Role Call — ${gameName}`,
    type: "JournalEntry",
    flags: { [MODULE_ID]: { gameId } },
  });
}

// Remove the journal entries this module previously created for the game, so a
// re-sync replaces rather than duplicates. Role Call is the source of truth;
// local edits to these entries are intentionally discarded.
async function clearManagedEntries(folder: any): Promise<void> {
  const ids: string[] = (game.journal?.contents ?? game.journal ?? [])
    .filter((e: any) => e.folder?.id === folder.id && e.getFlag(MODULE_ID, "sceneId") != null)
    .map((e: any) => e.id);
  if (ids.length) await JournalEntry.deleteDocuments(ids);
}

// Orchestrates one sync: fetch the game's scenes from Role Call, set up the
// folder, clear prior entries, then map each scene with the active mapper.
export async function runSync(): Promise<void> {
  ui.notifications?.info("Role Call: syncing scenes…");

  let payload;
  try {
    payload = await fetchScenes();
  } catch (err) {
    const message = err instanceof RoleCallApiError ? err.message : "Sync failed — see the console.";
    console.error("Role Call Sync:", err);
    ui.notifications?.error(`Role Call: ${message}`);
    return;
  }

  const folder = await findOrCreateGameFolder(payload.game.id, payload.game.name);
  await clearManagedEntries(folder);

  const mapper = activeMapper();
  let synced = 0;
  for (const scene of payload.scenes) {
    try {
      await mapper.apply(scene, folder);
      synced++;
    } catch (err) {
      console.error(`Role Call Sync: failed to map scene "${scene.name}"`, err);
    }
  }

  ui.notifications?.info(`Role Call: synced ${synced} scene${synced === 1 ? "" : "s"}.`);
}
