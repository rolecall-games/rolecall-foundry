import { MODULE_ID } from "../constants";
import type {
  EncounterPayload,
  LootCachePayload,
  MagicItemPayload,
  NpcPayload,
  ScenePayload,
} from "../types";
import { esc, HTML_FORMAT, metaRow, section } from "./html";
import type { SceneMapper } from "./index";

interface PageData {
  name: string;
  type: "text";
  title?: { show: boolean; level: number };
  text: { content: string; format: number };
}

function textPage(name: string, content: string): PageData {
  return { name, type: "text", text: { content, format: HTML_FORMAT } };
}

function npcPage(npc: NpcPayload): PageData {
  const stats = npc.stats && Object.keys(npc.stats).length
    ? `<h3>Stats</h3><pre>${esc(JSON.stringify(npc.stats, null, 2))}</pre>`
    : "";
  const content =
    metaRow("Race", npc.race) +
    metaRow("Archetype", npc.archetype) +
    metaRow("Attitude", npc.attitude) +
    section("Goals", npc.goals) +
    section("Quirks", npc.quirks) +
    section("Lore", npc.lore_note) +
    stats;
  return textPage(`NPC: ${npc.name}`, content || "<p><em>No details.</em></p>");
}

function encounterPage(enc: EncounterPayload): PageData {
  const content = metaRow("Type", enc.encounter_type) + section("Notes", enc.notes);
  return textPage(`Encounter: ${enc.name}`, content || "<p><em>No details.</em></p>");
}

function lootPage(loot: LootCachePayload, index: number): PageData {
  const content = metaRow("Currency", loot.currency) + section("Notes", loot.notes) +
    (loot.description ? `<p>${esc(loot.description)}</p>` : "");
  const title = loot.description ? loot.description.slice(0, 40) : `Loot #${index + 1}`;
  return textPage(`Loot: ${title}`, content || "<p><em>No details.</em></p>");
}

function magicItemPage(item: MagicItemPayload): PageData {
  const content =
    metaRow("Rarity", item.rarity) +
    metaRow("Type", item.item_type) +
    metaRow("Attunement", item.attunement ? "Required" : "None") +
    section("Description", item.description) +
    section("Notes", item.notes);
  return textPage(`Item: ${item.name}`, content || "<p><em>No details.</em></p>");
}

function buildPages(scene: ScenePayload): PageData[] {
  const pages: PageData[] = [];
  const overview =
    (scene.location ? metaRow("Location", scene.location.name) : "") +
    (scene.chapter ? metaRow("Chapter", scene.chapter.title) : "");
  if (overview) pages.push(textPage("Overview", overview));
  if (scene.read_aloud) pages.push(textPage("Read-aloud", `<blockquote>${esc(scene.read_aloud)}</blockquote>`));
  if (scene.gm_notes) pages.push(textPage("GM Notes", `<p>${esc(scene.gm_notes)}</p>`));

  scene.npcs.forEach((npc) => pages.push(npcPage(npc)));
  scene.encounters.forEach((enc) => pages.push(encounterPage(enc)));
  scene.loot_caches.forEach((loot, i) => pages.push(lootPage(loot, i)));
  scene.magic_items.forEach((item) => pages.push(magicItemPage(item)));

  if (!pages.length) pages.push(textPage("Overview", "<p><em>Empty scene.</em></p>"));
  return pages;
}

// Maps a Role Call scene to a single Foundry JournalEntry, one page per
// read-aloud / GM-notes block and one per member. Flagged with the source
// sceneId so the sync orchestrator can find & replace it on the next run.
export class JournalMapper implements SceneMapper {
  static readonly key = "journal";
  readonly key = JournalMapper.key;

  async apply(scene: ScenePayload, folder: unknown, sort: number): Promise<void> {
    await JournalEntry.create({
      name: scene.name,
      folder: (folder as { id?: string } | null)?.id ?? null,
      sort,
      pages: buildPages(scene),
      flags: {
        [MODULE_ID]: { sceneId: scene.id, syncedAt: new Date().toISOString() },
      },
    });
  }
}
