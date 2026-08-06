import { MODULE_ID, ROOT_FOLDER_NAME } from "./constants";
import { fetchScenes, RoleCallApiError } from "./api";
import { runConnect } from "./connect";
import { getApiToken } from "./settings";
import { activeMapper } from "./mappers";
import type { EntryData, PageData } from "./mappers";
import { loreEntryData } from "./mappers/lore";
import type { ScenesResponse } from "./types";

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

// ---------------------------------------------------------------------------
// Reconcile
// ---------------------------------------------------------------------------

// One entry the sync wants to exist, already mapped to document data.
interface Desired {
  kind: "scene" | "lore";
  key: string;
  // Console-only — the failures it labels are developer-facing.
  label: string;
  hash: string;
  data: EntryData;
}

// An existing entry this module owns for the game being synced, plus whether
// the run has the standing to delete it once its source id stops arriving.
interface Managed {
  entry: any;
  inFolder: boolean;
  deletable: boolean;
}

interface PendingUpdate {
  item: Desired;
  entry: any;
  change: Record<string, unknown>;
}

interface Counts {
  scenes: number;
  lore: number;
}

// The stable identity of a managed entry: the Role Call record it was built
// from. Scenes carry `sceneId`, lore notes carry `loreId`.
function sourceKey(entry: any): string | null {
  const sceneId = entry.getFlag(MODULE_ID, "sceneId");
  if (sceneId != null) return `scene:${String(sceneId)}`;

  const loreId = entry.getFlag(MODULE_ID, "loreId");
  if (loreId != null) return `lore:${String(loreId)}`;

  return null;
}

// A cheap content fingerprint, stored on the entry so an unchanged one is
// skipped entirely. Without it nothing is ever "unchanged": the mappers stamp
// a fresh `syncedAt` into flags, so every entry differs from itself on every
// run and the reconcile degenerates into rewriting the whole game — N writes,
// N sidebar re-renders, and a modified-timestamp that means nothing. Flags are
// excluded from the hash for exactly that reason.
function fingerprint(data: EntryData): string {
  const source = JSON.stringify({ name: data.name, sort: data.sort, pages: data.pages });

  // djb2. Not a checksum — just a marker for "did the text we last wrote
  // change?". Web Crypto's digest is async and far more than this needs. The
  // length prefix is free and kills the easy collisions.
  let h = 5381;
  for (let i = 0; i < source.length; i++) h = ((h << 5) + h + source.charCodeAt(i)) | 0;
  return `${source.length.toString(36)}.${(h >>> 0).toString(36)}`;
}

// Stamp the module's own bookkeeping onto whatever flags the mapper built:
// `gameId` so a later run can attribute the entry without relying on where it
// is filed, `hash` so a later run can tell it is already current, and `managed`
// on every page so a later run can tell its own pages from the GM's.
//
// Pages are stamped HERE rather than in the reconcile, so a page carries the
// mark from the moment it is created. Stamping only on update leaves every
// created page unowned, and an unowned page can never be cleaned up — content
// pulled from Role Call would outlive its deletion there, including read-aloud
// the GM had already shown the table.
//
// The fingerprint is taken before the stamp on purpose: the flag is bookkeeping
// this module added, not content that changed, and hashing it would rewrite
// every entry in the world once for nothing.
function planEntry(
  kind: "scene" | "lore",
  id: string,
  label: string,
  data: EntryData,
  gameId: string,
): Desired {
  const hash = fingerprint(data);
  const own = (data.flags[MODULE_ID] ?? {}) as Record<string, unknown>;

  return {
    kind,
    key: `${kind}:${id}`,
    label,
    hash,
    data: {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        flags: { ...page.flags, [MODULE_ID]: { managed: true } },
      })),
      flags: { ...data.flags, [MODULE_ID]: { ...own, gameId, hash } },
    },
  };
}

// Every entry this module owns for THIS game, keyed by source id and searched
// world-wide rather than inside the game folder. Folder-scoped lookup is what
// made a GM who filed an entry somewhere of their own get a *duplicate* of it
// on the next sync — the entry existed, we just weren't looking where it was.
//
// `gameId` is the fence around "world-wide". A world can be connected to two
// Role Call games in turn, and an entry stamped for a different game is never
// adopted: source ids are only globally unique from TypeID onward, and the
// per-game integers that preceded them collide across games happily.
//
// Entries with no stamp predate it. They are still adopted on an id match —
// that match is the only evidence there is — but they are only *deletable*
// while they sit in this game's folder, so an entry we cannot attribute is
// left alone rather than destroyed on a guess. The first sync stamps them,
// after which they stay attributable wherever the GM files them.
function indexManagedEntries(gameId: string, folderId: string | null): Map<string, Managed> {
  const index = new Map<string, Managed>();

  for (const entry of journalEntries()) {
    const key = sourceKey(entry);
    if (!key) continue;

    const stamp = entry.getFlag(MODULE_ID, "gameId");
    if (stamp != null && String(stamp) !== String(gameId)) continue;

    const inFolder = folderId != null && entry.folder?.id === folderId;

    // Two entries can share a source id — a GM duplicating a journal entry
    // copies its flags, and older builds could duplicate on their own. Prefer
    // the copy still filed in the game folder and leave the other one be: its
    // id has not left the payload, so deleting it is not this run's call.
    const existing = index.get(key);
    if (existing && !(inFolder && !existing.inFolder)) continue;
    index.set(key, { entry, inFolder, deletable: stamp != null || inFolder });
  }

  return index;
}

// Bring one entry's pages in line with the payload.
//
// Pages go through the embedded-document API rather than riding along in a
// `pages: [...]` array on the parent update. An embedded collection handed to
// a parent update is merged *by each element's `_id`*: elements without one
// are created rather than replacing the set, and elements left out are kept.
// Push a freshly built page array at it and the entry grows a second copy of
// every page, every sync. create/update/deleteEmbeddedDocuments have no such
// ambiguity on any version this module supports.
//
// Old pages are matched to new ones by name so their `_id` — and any
// page-level @UUID link pointing at it — survives. Repeated names (two NPCs
// both called "Guard") draw from the pool in order.
//
// Every page this module writes is flagged, and only flagged pages are ever
// deleted. A GM who adds their own page to a synced entry — battle notes on
// the scene they are about to run — keeps it: the module does not own that
// page and reconciling is not a licence to clear the entry out.
//
// `adoptAll` is the migration case. An entry this module owns but that carries
// no `hash` flag was built by the delete-and-recreate that preceded this, which
// owned every page in it outright — so its unflagged pages are ours, and taking
// them means a renamed page is replaced rather than orphaned forever. Nothing
// is lost that the old build would have kept: it deleted the whole entry, GM
// additions included, on every single sync.
async function reconcilePages(entry: any, pages: PageData[], adoptAll: boolean): Promise<void> {
  const existing: any[] = [...(entry.pages ?? [])];
  const ours = (page: any) => adoptAll || page.getFlag?.(MODULE_ID, "managed") === true;

  // Only this module's own pages go in the reuse pool. "Overview", "GM Notes"
  // and "Read-aloud" are not exotic things for a GM to name a page, and drawing
  // one from the pool would overwrite their writing with server text and then
  // stamp it as ours — losing it for good on the sync after. A name collision
  // gets a second page beside theirs instead, which is merely untidy.
  const pool = new Map<string, string[]>();
  for (const page of existing) {
    if (!ours(page)) continue;
    const queue = pool.get(page.name) ?? [];
    queue.push(page.id);
    pool.set(page.name, queue);
  }

  const reused = new Set<string>();
  const creates: PageData[] = [];
  const updates: Record<string, unknown>[] = [];

  for (const page of pages) {
    const id = pool.get(page.name)?.shift();
    if (id) {
      reused.add(id);
      updates.push({ ...page, _id: id });
    } else {
      creates.push(page);
    }
  }

  const stale = existing
    .filter((page) => !reused.has(page.id) && ours(page))
    .map((page) => page.id);

  if (stale.length) await entry.deleteEmbeddedDocuments("JournalEntryPage", stale);
  if (updates.length) await entry.updateEmbeddedDocuments("JournalEntryPage", updates);
  if (creates.length) await entry.createEmbeddedDocuments("JournalEntryPage", creates);
}

// One round trip and one sidebar re-render for the whole set — but keeping the
// blast radius of the per-scene loop this replaced. A rejected batch retries a
// document at a time, so one malformed scene costs that scene and nothing
// else. Returns the items that landed.
async function inBatch<T>(
  items: T[],
  write: (batch: T[]) => Promise<unknown>,
  describe: (item: T) => string,
): Promise<T[]> {
  if (!items.length) return [];

  try {
    await write(items);
    return items;
  } catch (err) {
    console.error("Role Call Sync: batch write rejected — retrying one at a time", err);
  }

  const landed: T[] = [];
  for (const item of items) {
    try {
      await write([item]);
      landed.push(item);
    } catch (err) {
      console.error(`Role Call Sync: failed to write ${describe(item)}`, err);
    }
  }
  return landed;
}

// Creates need their own retry rather than inBatch's. A rejected batch may
// still have written some of its documents, and retrying those blind mints a
// second copy of each — the exact duplication this reconcile exists to end. So
// re-read the world first and skip whatever already landed.
async function createEntries(
  items: Desired[],
  gameId: string,
  folderId: string | null,
): Promise<Desired[]> {
  if (!items.length) return [];

  try {
    await JournalEntry.createDocuments(items.map((item) => item.data));
    return items;
  } catch (err) {
    console.error("Role Call Sync: batch create rejected — retrying one at a time", err);
  }

  const present = indexManagedEntries(gameId, folderId);
  const landed: Desired[] = [];

  for (const item of items) {
    if (present.has(item.key)) {
      landed.push(item);
      continue;
    }
    try {
      await JournalEntry.createDocuments([item.data]);
      landed.push(item);
    } catch (err) {
      console.error(`Role Call Sync: failed to create ${item.label}`, err);
    }
  }

  return landed;
}

// Bring the game's journal entries in line with the payload: update what is
// already there IN PLACE, create only what is new, delete only what the server
// stopped sending.
//
// Nothing here re-creates a matched entry. Its `_id` is what every
// @UUID[JournalEntry.…] the GM wrote resolves against, and what map Note pins,
// macros and bookmarks hold — the delete-then-recreate this replaced broke all
// of them on every single sync, and no later fix can restore a link already
// destroyed.
async function reconcileEntries(payload: ScenesResponse, folder: any): Promise<Counts> {
  const gameId = payload.game.id;
  const folderId: string | null = folder.id ?? null;
  const mapper = activeMapper();
  const desired: Desired[] = [];

  // Explicit sort values, assigned from array order rather than from each
  // scene's `position`: positions can collide, and the order the server sent
  // is already canonical. Without this Foundry alphabetises, and "The Tavern"
  // lands above "Act I opener".
  // A mapping failure must not read as a deletion. The item is missing from
  // `desired` either way, and the deletion pass cannot tell "the server stopped
  // sending this" from "this run could not build it" — so the failures are
  // named here and exempted below. Without that, one malformed scene destroys
  // the GM's entry for it, which is the opposite of what catching per item is
  // for.
  const failed = new Set<string>();

  for (const [index, scene] of payload.scenes.entries()) {
    try {
      const data = mapper.buildEntryData(scene, folderId, (index + 1) * SORT_STEP);
      desired.push(planEntry("scene", scene.id, `scene "${scene.name}"`, data, gameId));
    } catch (err) {
      failed.add(`scene:${scene.id}`);
      console.error(`Role Call Sync: failed to map scene "${scene.name}"`, err);
    }
  }

  // Lore sorts after every scene — same folder, but it reads as a section.
  const loreSortBase = (payload.scenes.length + 1) * SORT_STEP;
  for (const [index, note] of (payload.lore_notes ?? []).entries()) {
    try {
      const data = loreEntryData(note, folderId, loreSortBase + (index + 1) * SORT_STEP);
      desired.push(planEntry("lore", note.id, `lore note "${note.title}"`, data, gameId));
    } catch (err) {
      failed.add(`lore:${note.id}`);
      console.error(`Role Call Sync: failed to map lore note "${note.title}"`, err);
    }
  }

  // Which kinds this payload is allowed to speak for. `lore_notes` is optional
  // on the wire so a v3 client still parses a v2 server (types.ts), which makes
  // an absent key "this server has no concept of lore" — NOT "this game's lore
  // is now empty". Deleting on that silence wipes every lore entry in the world
  // the first time a GM points the module at an older server.
  const authoritative = new Set(["scene"]);
  if (Array.isArray(payload.lore_notes)) authoritative.add("lore");

  const index = indexManagedEntries(gameId, folderId);
  const counts: Counts = { scenes: 0, lore: 0 };
  const count = (item: Desired) => {
    if (item.kind === "scene") counts.scenes++;
    else counts.lore++;
  };

  const creates: Desired[] = [];
  const updates: PendingUpdate[] = [];

  for (const item of desired) {
    const managed = index.get(item.key);
    if (!managed) {
      creates.push(item);
      continue;
    }

    if (String(managed.entry.getFlag(MODULE_ID, "hash")) === item.hash) {
      count(item);
      continue;
    }

    // `folder` is deliberately absent from the change. Where an entry lives is
    // the GM's call: dragging one out of the Role Call folder is a decision
    // the module does not get to quietly undo once a sync.
    updates.push({
      item,
      entry: managed.entry,
      change: {
        _id: managed.entry.id,
        name: item.data.name,
        sort: item.data.sort,
        flags: item.data.flags,
      },
    });
  }

  // Pages first, entry fields second — the order matters. The fingerprint
  // rides in with the entry fields and *is* the claim "this entry is current";
  // writing it before the pages land would make a failed page write permanent,
  // because the next sync would skip the entry as unchanged.
  const repaged: PendingUpdate[] = [];
  for (const pending of updates) {
    try {
      const migrating = pending.entry.getFlag(MODULE_ID, "hash") == null;
      await reconcilePages(pending.entry, pending.item.data.pages, migrating);
      repaged.push(pending);
    } catch (err) {
      console.error(`Role Call Sync: failed to update the pages of ${pending.item.label}`, err);
    }
  }

  const updated = await inBatch(
    repaged,
    (batch) => JournalEntry.updateDocuments(batch.map((pending) => pending.change)),
    (pending) => pending.item.label,
  );
  for (const pending of updated) count(pending.item);

  for (const item of await createEntries(creates, gameId, folderId)) count(item);

  // The honest answer to "what happens when a GM deletes a scene in Role
  // Call?" — the entry goes too, but only when this run can prove the entry
  // was its own AND that the payload actually spoke to it. Absence is only
  // evidence of deletion when the server was in a position to say so.
  const wanted = new Set(desired.map((item) => item.key));
  const stale = [...index.entries()]
    .filter(([key, managed]) => {
      if (!managed.deletable || wanted.has(key)) return false;
      if (failed.has(key)) return false;
      return authoritative.has(key.slice(0, key.indexOf(":")));
    })
    .map(([, managed]) => managed.entry.id as string);

  await inBatch(
    stale,
    (ids) => JournalEntry.deleteDocuments(ids),
    (id) => `deletion of entry ${id}`,
  );

  return counts;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

function countLabel(n: number, singular: string, plural: string): string {
  return game.i18n.format(n === 1 ? singular : plural, { count: n });
}

// Orchestrates one sync: fetch the game's scenes and lore from Role Call, set
// up the folders, then reconcile the journal against what arrived.
export async function runSync(): Promise<void> {
  if (!game.user?.isGM) {
    ui.notifications?.warn(game.i18n.localize("rolecall-sync.Notify.GmOnly"));
    return;
  }

  // First run: no token yet. Offer the connect flow instead of a dead-end
  // "paste a token" error, and let its success trigger the sync it was
  // asked for.
  if (!getApiToken()) {
    await runConnect({ onConnected: () => void runSync() });
    return;
  }

  ui.notifications?.info(game.i18n.localize("rolecall-sync.Notify.Fetching"));

  let payload: ScenesResponse;
  try {
    payload = await fetchScenes();
  } catch (err) {
    const message =
      err instanceof RoleCallApiError
        ? err.message
        : game.i18n.localize("rolecall-sync.Error.Unknown");
    console.error("Role Call Sync:", err);
    ui.notifications?.error(game.i18n.format("rolecall-sync.Notify.Failed", { message }));
    return;
  }

  const folderPath = `${ROOT_FOLDER_NAME} / ${payload.game.name}`;

  let folder: any;
  try {
    const root = await findOrCreateRootFolder();
    if (!root) throw new Error("could not create the Role Call journal folder");

    folder = await findOrCreateGameFolder(payload.game.id, payload.game.name, root.id ?? null);
    if (!folder) throw new Error(`could not create the "${payload.game.name}" journal folder`);
  } catch (err) {
    // Folder.create returns undefined when refused — a preCreateFolder hook
    // cancelling, or a permissions edge. Without this the next line reads
    // .id off undefined and the "syncing…" toast never resolves, leaving no
    // error anywhere the GM can see.
    console.error("Role Call Sync: could not prepare the journal folders", err);
    ui.notifications?.error(game.i18n.localize("rolecall-sync.Notify.FolderFailed"));
    return;
  }

  const counts = await reconcileEntries(payload, folder);

  // "Nothing landed" and "there was nothing to land" look identical from the
  // counts, and telling a GM their campaign is empty when in fact every write
  // failed sends them to look in the wrong place — Role Call, where their
  // scenes plainly are — with the real errors sitting in a console they have
  // no reason to open.
  if (counts.scenes === 0 && counts.lore === 0) {
    const sent = payload.scenes.length + (payload.lore_notes?.length ?? 0);
    ui.notifications?.warn(
      sent === 0
        ? game.i18n.format("rolecall-sync.Notify.NothingToSync", { name: payload.game.name })
        : game.i18n.localize("rolecall-sync.Notify.NothingLanded"),
    );
    return;
  }

  // Say what landed AND where it landed. The first question a GM has after a
  // successful sync is "…so where did that go?", and Journal Entries are not
  // where a Foundry user looks for something called a "scene".
  const scenes = countLabel(
    counts.scenes,
    "rolecall-sync.Count.Scene",
    "rolecall-sync.Count.Scenes",
  );

  if (counts.lore > 0) {
    const lore = countLabel(
      counts.lore,
      "rolecall-sync.Count.LoreNote",
      "rolecall-sync.Count.LoreNotes",
    );
    ui.notifications?.info(
      game.i18n.format("rolecall-sync.Notify.SyncedWithLore", { scenes, lore, folder: folderPath }),
    );
    return;
  }

  ui.notifications?.info(
    game.i18n.format("rolecall-sync.Notify.Synced", { scenes, folder: folderPath }),
  );
}
