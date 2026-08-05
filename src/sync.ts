import { MODULE_ID, ROOT_FOLDER_NAME } from "./constants";
import { fetchScenes, RoleCallApiError } from "./api";
import { activeMapper } from "./mappers";
import { loreEntryData } from "./mappers/lore";

// Foundry sorts siblings by `sort` when the folder is in manual mode. Spacing
// the values leaves room to drag things around without a full renumber.
const SORT_STEP = 100_000;

function folders(): any[] {
  return (game.folders?.contents ?? game.folders ?? []) as any[];
}

function journalEntries(): any[] {
  return (game.journal?.contents ?? game.journal ?? []) as any[];
}

// The single "Role Call" folder every synced game lives under. Flagged rather
// than matched by name so a GM can rename it without the module orphaning
// everything and building a second one beside it.
async function findOrCreateRootFolder(): Promise<any> {
  const existing = folders().find(
    (f: any) => f.type === "JournalEntry" && f.getFlag(MODULE_ID, "root") === true,
  );
  if (existing) return existing;

  return Folder.create({
    name: ROOT_FOLDER_NAME,
    type: "JournalEntry",
    sorting: "m",
    flags: { [MODULE_ID]: { root: true } },
  });
}

// The per-game folder, nested under the Role Call root.
//
// Both sides of the flag comparison are String()-coerced: a folder created by
// a pre-TypeID build carries a *number* gameId, and `1 === "game_01j…"` is
// false forever — the module would silently create a second folder and split
// the GM's entries across the two.
async function findOrCreateGameFolder(
  gameId: string,
  gameName: string,
  parentId: string | null,
): Promise<any> {
  const existing = folders().find(
    (f: any) =>
      f.type === "JournalEntry" && String(f.getFlag(MODULE_ID, "gameId")) === String(gameId),
  );

  // Adopt a folder from before nesting existed: it is the right folder, it is
  // just sitting at the root under the old flat name ("Role Call — Hushvale").
  // Re-parent AND rename, so a GM who synced under an older build keeps their
  // entries and their links instead of ending up with "Role Call / Role Call —
  // Hushvale". Only touch what is actually wrong — a GM who renamed the folder
  // themselves to something other than the old default keeps their name.
  if (existing) {
    const changes: Record<string, unknown> = {};
    if (parentId && existing.folder?.id !== parentId) changes.folder = parentId;
    if (existing.name === `${ROOT_FOLDER_NAME} — ${gameName}`) changes.name = gameName;
    if (Object.keys(changes).length) await existing.update(changes);
    return existing;
  }

  return Folder.create({
    name: gameName,
    type: "JournalEntry",
    folder: parentId,
    sorting: "m",
    flags: { [MODULE_ID]: { gameId } },
  });
}

// Remove the journal entries this module previously created for the game, so a
// re-sync replaces rather than duplicates. Role Call is the source of truth;
// local edits to these entries are intentionally discarded.
//
// Matches on either flag: scenes carry `sceneId`, lore notes carry `loreId`.
async function clearManagedEntries(folder: any): Promise<void> {
  const ids: string[] = journalEntries()
    .filter(
      (e: any) =>
        e.folder?.id === folder.id &&
        (e.getFlag(MODULE_ID, "sceneId") != null || e.getFlag(MODULE_ID, "loreId") != null),
    )
    .map((e: any) => e.id);
  if (ids.length) await JournalEntry.deleteDocuments(ids);
}

function countLabel(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

// Orchestrates one sync: fetch the game's scenes and lore from Role Call, set
// up the folders, clear prior entries, then map everything in.
export async function runSync(): Promise<void> {
  if (!game.user?.isGM) {
    ui.notifications?.warn("Role Call: only a GM can sync this world.");
    return;
  }

  ui.notifications?.info("Role Call: fetching your campaign prep…");

  let payload;
  try {
    payload = await fetchScenes();
  } catch (err) {
    const message = err instanceof RoleCallApiError ? err.message : "Sync failed — see the console.";
    console.error("Role Call Sync:", err);
    ui.notifications?.error(`Role Call: ${message}`);
    return;
  }

  const loreNotes = payload.lore_notes ?? [];
  const folderPath = `${ROOT_FOLDER_NAME} / ${payload.game.name}`;

  let folder: any;
  try {
    const root = await findOrCreateRootFolder();
    if (!root) throw new Error("could not create the Role Call journal folder");

    folder = await findOrCreateGameFolder(payload.game.id, payload.game.name, root.id ?? null);
    if (!folder) throw new Error(`could not create the "${payload.game.name}" journal folder`);

    await clearManagedEntries(folder);
  } catch (err) {
    // Folder.create returns undefined when refused — a preCreateFolder hook
    // cancelling, or a permissions edge. Without this the next line reads
    // .id off undefined and the "syncing…" toast never resolves, leaving no
    // error anywhere the GM can see.
    console.error("Role Call Sync: could not prepare the journal folders", err);
    ui.notifications?.error("Role Call: couldn't create the journal folders — see the console.");
    return;
  }

  const mapper = activeMapper();
  let syncedScenes = 0;
  let syncedLore = 0;

  // Explicit sort values, assigned from array order rather than from each
  // scene's `position`: positions can collide, and the order the server sent
  // is already canonical. Without this Foundry alphabetises, and "The Tavern"
  // lands above "Act I opener".
  for (const [index, scene] of payload.scenes.entries()) {
    try {
      await mapper.apply(scene, folder, (index + 1) * SORT_STEP);
      syncedScenes++;
    } catch (err) {
      console.error(`Role Call Sync: failed to map scene "${scene.name}"`, err);
    }
  }

  // Lore sorts after every scene — same folder, but it reads as a section.
  const loreSortBase = (payload.scenes.length + 1) * SORT_STEP;
  for (const [index, note] of loreNotes.entries()) {
    try {
      await JournalEntry.create(
        loreEntryData(note, folder.id ?? null, loreSortBase + (index + 1) * SORT_STEP),
      );
      syncedLore++;
    } catch (err) {
      console.error(`Role Call Sync: failed to map lore note "${note.title}"`, err);
    }
  }

  if (syncedScenes === 0 && syncedLore === 0) {
    ui.notifications?.warn(
      `Role Call: nothing to sync — no scenes or lore notes in "${payload.game.name}" yet.`,
    );
    return;
  }

  // Say what landed AND where it landed. The first question a GM has after a
  // successful sync is "…so where did that go?", and Journal Entries are not
  // where a Foundry user looks for something called a "scene".
  const parts = [countLabel(syncedScenes, "scene", "scenes")];
  if (syncedLore > 0) parts.push(countLabel(syncedLore, "lore note", "lore notes"));

  ui.notifications?.info(
    `Role Call: synced ${parts.join(" and ")} to Journal Entries → "${folderPath}"`,
  );
}
