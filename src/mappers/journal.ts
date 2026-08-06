import { MODULE_ID } from "../constants";
import type {
  EncounterPayload,
  LootCachePayload,
  MagicItemPayload,
  NpcPayload,
  ScenePayload,
} from "../types";
import {
  esc,
  heading,
  HTML_FORMAT,
  metaRow,
  OWNERSHIP,
  PAGE_SORT_STEP,
  placeholder,
  section,
} from "./html";
import type { EntryData, PageData, SceneMapper } from "./index";

// Every page builder returns its own ownership and leaves `sort` to buildPages,
// which knows the position each page ends up in.
type UnsortedPage = Omit<PageData, "sort">;

function textPage(name: string, content: string, ownership: number): UnsortedPage {
  return {
    name,
    type: "text",
    ownership: { default: ownership },
    text: { content, format: HTML_FORMAT },
  };
}

function npcPage(npc: NpcPayload): UnsortedPage {
  const stats = npc.stats && Object.keys(npc.stats).length
    ? heading("rolecall-sync.Field.Stats") + `<pre>${esc(JSON.stringify(npc.stats, null, 2))}</pre>`
    : "";
  const content =
    metaRow("rolecall-sync.Field.Race", npc.race) +
    metaRow("rolecall-sync.Field.Archetype", npc.archetype) +
    metaRow("rolecall-sync.Field.Attitude", npc.attitude) +
    section("rolecall-sync.Field.Goals", npc.goals) +
    section("rolecall-sync.Field.Quirks", npc.quirks) +
    section("rolecall-sync.Field.Lore", npc.lore_note) +
    stats;
  return textPage(
    game.i18n.format("rolecall-sync.Page.Npc", { name: npc.name }),
    content || placeholder("rolecall-sync.Empty.Details"),
    OWNERSHIP.NONE,
  );
}

function encounterPage(enc: EncounterPayload): UnsortedPage {
  const content =
    metaRow("rolecall-sync.Field.EncounterType", enc.encounter_type) +
    section("rolecall-sync.Field.Notes", enc.notes);
  return textPage(
    game.i18n.format("rolecall-sync.Page.Encounter", { name: enc.name }),
    content || placeholder("rolecall-sync.Empty.Details"),
    OWNERSHIP.NONE,
  );
}

function lootPage(loot: LootCachePayload, index: number): UnsortedPage {
  const content = metaRow("rolecall-sync.Field.Currency", loot.currency) +
    section("rolecall-sync.Field.Notes", loot.notes) +
    (loot.description ? `<p>${esc(loot.description)}</p>` : "");
  const title = loot.description
    ? loot.description.slice(0, 40)
    : game.i18n.format("rolecall-sync.Page.LootUntitled", { number: index + 1 });
  return textPage(
    game.i18n.format("rolecall-sync.Page.Loot", { name: title }),
    content || placeholder("rolecall-sync.Empty.Details"),
    OWNERSHIP.NONE,
  );
}

function magicItemPage(item: MagicItemPayload): UnsortedPage {
  const attunement = game.i18n.localize(
    item.attunement ? "rolecall-sync.Value.Required" : "rolecall-sync.Value.None",
  );
  const content =
    metaRow("rolecall-sync.Field.Rarity", item.rarity) +
    metaRow("rolecall-sync.Field.ItemType", item.item_type) +
    metaRow("rolecall-sync.Field.Attunement", attunement) +
    section("rolecall-sync.Field.Description", item.description) +
    section("rolecall-sync.Field.Notes", item.notes);
  return textPage(
    game.i18n.format("rolecall-sync.Page.Item", { name: item.name }),
    content || placeholder("rolecall-sync.Empty.Details"),
    OWNERSHIP.NONE,
  );
}

// Overview and read-aloud are the two pages meant for the table; everything
// after them is prep the players must not read. Nothing here relies on the
// entry staying GM-only, because it will not stay GM-only — showing read-aloud
// means raising the entry, and only these levels survive that.
function buildPages(scene: ScenePayload): PageData[] {
  const pages: PageData[] = [];
  const push = (page: UnsortedPage) =>
    pages.push({ ...page, sort: (pages.length + 1) * PAGE_SORT_STEP });

  const overview =
    metaRow("rolecall-sync.Field.Location", scene.location?.name) +
    metaRow("rolecall-sync.Field.Chapter", scene.chapter?.title);
  if (overview) {
    push(textPage(game.i18n.localize("rolecall-sync.Page.Overview"), overview, OWNERSHIP.OBSERVER));
  }
  if (scene.read_aloud) {
    push(textPage(
      game.i18n.localize("rolecall-sync.Page.ReadAloud"),
      `<blockquote>${esc(scene.read_aloud)}</blockquote>`,
      OWNERSHIP.OBSERVER,
    ));
  }
  if (scene.gm_notes) {
    push(textPage(
      game.i18n.localize("rolecall-sync.Page.GmNotes"),
      `<p>${esc(scene.gm_notes)}</p>`,
      OWNERSHIP.NONE,
    ));
  }

  scene.npcs.forEach((npc) => push(npcPage(npc)));
  scene.encounters.forEach((enc) => push(encounterPage(enc)));
  scene.loot_caches.forEach((loot, i) => push(lootPage(loot, i)));
  scene.magic_items.forEach((item) => push(magicItemPage(item)));

  if (!pages.length) {
    push(textPage(
      game.i18n.localize("rolecall-sync.Page.Overview"),
      placeholder("rolecall-sync.Empty.Scene"),
      OWNERSHIP.OBSERVER,
    ));
  }
  return pages;
}

// Maps a Role Call scene to a single Foundry JournalEntry, one page per
// read-aloud / GM-notes block and one per member. Flagged with the source
// sceneId so the sync orchestrator can find & reconcile it on the next run.
export class JournalMapper implements SceneMapper {
  static readonly key = "journal";
  readonly key = JournalMapper.key;

  // No entry-level `ownership`: a new entry defaults to GM-only, and that is
  // the floor this design wants. Setting it here would decide for the GM when
  // their table gets to see the scene at all.
  buildEntryData(scene: ScenePayload, folderId: string | null, sort: number): EntryData {
    return {
      name: scene.name,
      folder: folderId,
      sort,
      pages: buildPages(scene),
      flags: {
        [MODULE_ID]: { sceneId: scene.id, syncedAt: new Date().toISOString() },
      },
    };
  }
}
