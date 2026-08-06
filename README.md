# RoleCall Sync (Foundry VTT)

The prep you already wrote on [RoleCall](https://rolecall.games), waiting in Foundry when you sit
down to run. Every scene arrives as a Journal Entry — read-aloud text, your GM notes, and a page for
each NPC, encounter, loot cache and magic item you hung on it. Your campaign lore notes come across
too. Foundry **v13 & v14**.

**Your table sees the read-aloud. They do not see the rest.** Each entry is split into player-safe
pages and GM-only ones, so handing the party a scene mid-session shows them the boxed text and
nothing behind it — not the NPC's real motive, not the encounter, not what's in the chest. Share the
entry, keep the twist.

**It does not import maps.** A RoleCall scene is a prep bundle — read-aloud, notes, a location, and
the people and things in it — not a battlemap, and it carries no map art to bring over. If you came
looking for scene backgrounds, this is not that module.

Everything lands under a single top-level **RoleCall** folder, with one child folder per campaign:

```
📁 RoleCall
   └── 📁 Hushvale                 ← your game
       ├── 📄 The Tavern           ← scenes, in your RoleCall order
       ├── 📄 The Sunken Road
       └── 📄 The Sunken Compact   ← lore notes, after the scenes
```

> **Compatibility:** `minimum 13, verified 14`, with no `maximum` — the module uses only document
> CRUD, `game.settings` and one render hook, none of which is version-specific, so capping it would
> just block installation the week the next Foundry ships. Built against v14; uses native-DOM sidebar
> injection (the v13 ApplicationV2 sidebar dropped jQuery) and no v14-only APIs — the v14 breaking
> changes (Measured Templates, Region attachments) aren't used here.
>
> Your API token is stored **per browser**, not in the world, so your players can never read it out
> of the console. Entering it on a second computer is expected.

> RoleCall scenes are narrative prep bundles, not battlemaps — so they sync to journals today. Map
> canvases are on the roadmap; the `SceneMapper` interface (`src/mappers/index.ts`) is the seam a
> map-Scene mapper drops into for when RoleCall scenes carry map art.

## What it does

- Adds a **Sync from RoleCall** button to the Journal sidebar (GM only) and a settings-pane button.
- Pulls `GET /api/v1/foundry/scenes` for the game your token belongs to.
- Files everything under **RoleCall / &lt;Game&gt;**, one Journal Entry per scene and per lore note,
  in the order RoleCall has them (not alphabetical).
- Re-syncing **updates entries in place**. Documents keep their ids, so every `@UUID[JournalEntry.…]`
  link you wrote, every map Note pin and every macro reference still resolves after a sync. Entries
  are matched by the RoleCall record they came from, wherever you filed them — move one out of the
  folder and it is updated, not duplicated. An entry is deleted only when its scene or lore note is
  gone from RoleCall. Entries and pages you created yourself are never touched.
- Macro-callable: `game.modules.get("rolecall-sync").api.sync()` — GM only.

If you synced with an older build, the existing `RoleCall — <Game>` folder is **adopted and moved**
under the new root rather than abandoned, so nothing is lost or duplicated.

## Showing a scene to your table

Scene entries arrive GM-only, like any new journal entry. When you want the table to see the
read-aloud, raise **that entry** to Observer — the secrets do not go with it:

| Page | Who can see it |
| --- | --- |
| Overview, Read-aloud | Your players, once you raise the entry to Observer |
| GM Notes, and every NPC / Encounter / Loot / Item page | You only, always |

The per-page permissions are set on every sync, so this holds for entries synced before you
changed anything. Lore entries are GM-only throughout — campaign lore is not assumed to be
player-safe, so nothing in them is exposed by raising the entry.

The one thing to know: page permissions are *floors within an entry a reader can already open*.
Leaving the entry GM-only keeps everything hidden regardless — raising it is what the table sees.

## What it does *not* do (yet)

- No map/canvas Scenes (no scene art in RoleCall yet — see the `SceneMapper` seam).
- No NPC → Actor conversion (needs per-system sheets: D&D 5e, Daggerheart).
- No automatic/background sync — you click to pull.
- Pull-only; it never writes back to RoleCall.

## Install (local dev)

The folder name under `modules/` **must** equal the module id (`rolecall-sync`).

```bash
npm install
npm run build          # → dist/module.js   (npm run dev to watch)

# Symlink into Foundry's data dir (macOS default shown):
ln -s "$(pwd)" "$HOME/Library/Application Support/FoundryVTT/Data/modules/rolecall-sync"
```

Then launch Foundry (v13 or v14), enable **RoleCall Sync** in your world's module settings.

## Connect

The fast path — no RoleCall account needed up front:

1. Click **Sync from RoleCall** in the Journal sidebar (or **Connect to RoleCall** in the
   module settings). With no token set, the connect flow starts automatically.
2. A browser tab opens on rolecall.games showing the same code as the Foundry overlay. Sign in —
   or create a free account right there.
3. Pick the campaign to sync with (or create one — the name is prefilled from your world title)
   and click **Approve**.
4. Switch back to Foundry: the token is picked up automatically and the first sync runs.

The token is stored **in this browser only** (client scope — your players can never read it), so
repeat the connect on each machine you GM from.

### Manual fallback: paste a token

In **Game Settings → Configure Settings → RoleCall Sync**:

| Setting       | What goes here                                                                  |
| ------------- | ------------------------------------------------------------------------------- |
| API base URL  | `https://rolecall.games` (default). Change only if you self-host.               |
| API token     | A token from your game's **Tokens** page in RoleCall. It identifies the game.  |

1. Sign in to RoleCall and open the game whose scenes you want in Foundry.
2. Go to the game's **Tokens** (Plugin access) page.
3. Click **Generate token**, name it `Foundry`, and copy it immediately — it's shown once.
4. Paste it into the module's **API token** setting.

## Sync

Click **Sync from RoleCall** in the Journal sidebar, or run the macro
`game.modules.get("rolecall-sync").api.sync()`. You'll get notifications for progress, the synced
count, and any error (bad token, server, network).

## Architecture

```
src/
  module.ts          entry — hooks, exposes api.sync(), injects the sidebar button
  settings.ts        registers apiBaseUrl + apiToken + a "Sync now" menu
  api.ts             fetchScenes() — Bearer auth to /api/v1/foundry/scenes
  types.ts           the JSON contract (mirrors FoundryScenesJSON in rolecall-ex)
  sync.ts            orchestrator: fetch → folders → reconcile (update/create/delete)
                     the only module that writes documents
  mappers/
    index.ts         SceneMapper interface + EntryData/PageData + activeMapper()
                     (a map-Scene mapper drops in here — see ADR 0002)
    journal.ts       scene → entry data, one page per member, page ownership
    lore.ts          lore note → single-page entry data
    html.ts          shared escaping/formatting/constants used by both mappers
lang/en.json         every user-facing string (namespaced under the module id)
```

Mappers are **pure**: they build document data and never touch the database. That split is what
makes reconciling in place possible — `sync.ts` can diff what the server sent against what the
world already has, because building the data no longer implies writing it.

The server side lives in `rolecall-ex` (the Phoenix app):
`lib/rolecall_ex_web/controllers/api/foundry_scenes_controller.ex` + `foundry_scenes_json.ex`,
authed by the plugin-token pipeline (the same `rc_…` bearer tokens the Obsidian plugin uses).
The wire format is specified in `rolecall-meta/contracts/foundry-scenes.md`.

## Naming — the one thing not to "tidy up"

Two names are in play and they are deliberately different:

| Where | Value | Why |
| --- | --- | --- |
| `module.json` → `id` | **`rolecall-sync`** | **The canonical, permanent identifier.** Foundry module ids are immutable once registered; this is the folder name under `Data/modules/` forever, and every setting key, document flag, i18n key and CSS class is namespaced under it. |
| GitHub repo, npm `name`, workspace folder | `rolecall-foundry` | The polyrepo convention is `rolecall-<surface>`. Appears only in the `module.json` URL fields and the build banner. |

The id cannot follow the repo name: changing it after release orphans every
existing install (Foundry keys the module by id, so a renamed module reads as a
different module and the GM's synced entries lose their flags). Leave it be.

## License

MIT © Framework and Fable LLC — see [LICENSE](LICENSE).
