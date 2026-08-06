# Role Call Sync (Foundry VTT)

A Foundry VTT module (**v13 & v14**) that pulls your [Role Call](https://rolecall.games) campaign
prep into your world as **journal entries**. Each scene becomes a Journal Entry with pages for the
read-aloud text, your GM notes, and every member (NPCs, encounters, loot caches, magic items); each
of your campaign **lore notes** becomes an entry alongside them.

Everything lands under a single top-level **Role Call** folder, with one child folder per campaign:

```
📁 Role Call
   └── 📁 Hushvale                 ← your game
       ├── 📄 The Tavern           ← scenes, in your Role Call order
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

> Role Call scenes are narrative prep bundles, not battlemaps — so they sync to journals today. Map
> canvases are on the roadmap; the `SceneMapper` interface (`src/mappers/index.ts`) is the seam a
> map-Scene mapper drops into for when Role Call scenes carry map art.

## What it does

- Adds a **Sync from Role Call** button to the Journal sidebar (GM only) and a settings-pane button.
- Pulls `GET /api/v1/foundry/scenes` for the game your token belongs to.
- Files everything under **Role Call / &lt;Game&gt;**, one Journal Entry per scene and per lore note,
  in the order Role Call has them (not alphabetical).
- Re-syncing **replaces** the module's entries (Role Call is the source of truth) — no duplicates.
  Entries you created yourself in that folder are left alone.
- Macro-callable: `game.modules.get("rolecall-sync").api.sync()` — GM only.

If you synced with an older build, the existing `Role Call — <Game>` folder is **adopted and moved**
under the new root rather than abandoned, so nothing is lost or duplicated.

## What it does *not* do (yet)

- No map/canvas Scenes (no scene art in Role Call yet — see the `SceneMapper` seam).
- No NPC → Actor conversion (needs per-system sheets: D&D 5e, Daggerheart).
- No automatic/background sync — you click to pull.
- Pull-only; it never writes back to Role Call.

## Install (local dev)

The folder name under `modules/` **must** equal the module id (`rolecall-sync`).

```bash
npm install
npm run build          # → dist/module.js   (npm run dev to watch)

# Symlink into Foundry's data dir (macOS default shown):
ln -s "$(pwd)" "$HOME/Library/Application Support/FoundryVTT/Data/modules/rolecall-sync"
```

Then launch Foundry (v13 or v14), enable **Role Call Sync** in your world's module settings.

## Connect

The fast path — no Role Call account needed up front:

1. Click **Sync from Role Call** in the Journal sidebar (or **Connect to Role Call** in the
   module settings). With no token set, the connect flow starts automatically.
2. A browser tab opens on rolecall.games showing the same code as the Foundry overlay. Sign in —
   or create a free account right there.
3. Pick the campaign to sync with (or create one — the name is prefilled from your world title)
   and click **Approve**.
4. Switch back to Foundry: the token is picked up automatically and the first sync runs.

The token is stored **in this browser only** (client scope — your players can never read it), so
repeat the connect on each machine you GM from.

### Manual fallback: paste a token

In **Game Settings → Configure Settings → Role Call Sync**:

| Setting       | What goes here                                                                  |
| ------------- | ------------------------------------------------------------------------------- |
| API base URL  | `https://rolecall.games` (default). Change only if you self-host.               |
| API token     | A token from your game's **Tokens** page in Role Call. It identifies the game.  |

1. Sign in to Role Call and open the game whose scenes you want in Foundry.
2. Go to the game's **Tokens** (Plugin access) page.
3. Click **Generate token**, name it `Foundry`, and copy it immediately — it's shown once.
4. Paste it into the module's **API token** setting.

## Sync

Click **Sync from Role Call** in the Journal sidebar, or run the macro
`game.modules.get("rolecall-sync").api.sync()`. You'll get notifications for progress, the synced
count, and any error (bad token, server, network).

## Architecture

```
src/
  module.ts          entry — hooks, exposes api.sync(), injects the sidebar button
  settings.ts        registers apiBaseUrl + apiToken + a "Sync now" menu
  api.ts             fetchScenes() — Bearer auth to /api/v1/foundry/scenes
  types.ts           the JSON contract (mirrors FoundryScenesJSON in rolecall-ex)
  sync.ts            orchestrator: fetch → folders → clear → map scenes + lore
  mappers/
    index.ts         SceneMapper interface + registry + activeMapper()
                     (a map-Scene mapper drops in here — see ADR 0002)
    journal.ts       scene → JournalEntry with one page per member
    lore.ts          lore note → single-page JournalEntry
    html.ts          shared escaping/formatting used by both mappers
```

The server side lives in `rolecall-ex` (the Phoenix app):
`lib/rolecall_ex_web/controllers/api/foundry_scenes_controller.ex` + `foundry_scenes_json.ex`,
authed by the plugin-token pipeline (the same `rc_…` bearer tokens the Obsidian plugin uses).
The wire format is specified in `rolecall-meta/contracts/foundry-scenes.md`.

## Naming — the one thing not to "tidy up"

Three similar names are in play and they are deliberately different:

| Where | Value | Why |
| --- | --- | --- |
| `module.json` → `id` | **`rolecall-sync`** | **The canonical, permanent identifier.** Foundry module ids are immutable once registered; this is the folder name under `Data/modules/` forever, and every setting key, document flag and CSS class is namespaced under it. |
| GitHub repo | `rolecall-foundry-sync` | Distinguishes it from `rolecall-obsidian-sync`. Only appears in the `url`/`manifest`/`download` fields. |
| Workspace folder | `rolecall-foundry` | The polyrepo convention is `rolecall-<surface>`. |

Aligning them after release would break every existing install. Leave them be.

## License

MIT © Framework and Fable LLC — see [LICENSE](LICENSE).
