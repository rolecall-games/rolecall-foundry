# Role Call Sync (Foundry VTT)

A Foundry VTT module (**v13 & v14**) that pulls your [Role Call](https://rolecall.games) campaign
**prep scenes** into your world as **journal entries**. Each scene becomes a Journal Entry with pages
for the read-aloud text, your GM notes, and every member (NPCs, encounters, loot caches, magic items).

> **Compatibility:** `minimum 13, verified 14`. Built against v14; uses only document/settings APIs
> that are unchanged in v13, and native-DOM sidebar injection (the v13 ApplicationV2 sidebar dropped
> jQuery). No v14-only APIs — the v14 breaking changes (Measured Templates, Region attachments) aren't
> used here.

> Role Call scenes are narrative prep bundles, not battlemaps — so they sync to journals today. Map
> canvases are on the roadmap; the code already has a `canvas` mapper seam (`src/mappers/canvas.ts`)
> for when Role Call scenes carry map art.

## What it does

- Adds a **Sync from Role Call** button to the Journal sidebar (GM only) and a settings-pane button.
- Pulls `GET /api/v1/foundry/scenes` for the game your token belongs to.
- Creates a `Role Call — <Game>` folder and one Journal Entry per scene.
- Re-syncing **replaces** the module's entries (Role Call is the source of truth) — no duplicates.
- Macro-callable: `game.modules.get("rolecall-sync").api.sync()`.

## What it does *not* do (yet)

- No map/canvas Scenes (no scene art in Role Call yet — see the `canvas` mapper stub).
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

## Configure

In **Game Settings → Configure Settings → Role Call Sync**:

| Setting       | What goes here                                                                  |
| ------------- | ------------------------------------------------------------------------------- |
| API base URL  | `https://rolecall.games` (default). Change only if you self-host.               |
| API token     | A token from your game's **Tokens** page in Role Call. It identifies the game.  |

### Generate a token

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
  types.ts           the JSON contract (mirrors the Rails jbuilder view)
  sync.ts            orchestrator: fetch → folder → clear → map each scene
  mappers/
    index.ts         SceneMapper interface + registry + activeMapper()
    journal.ts       ACTIVE: scene → JournalEntry with member pages
    canvas.ts        FUTURE: scene → map Scene (stub)
```

The Rails side lives in `FriendsAndFables`:
`app/controllers/foundry/scenes_controller.rb` + `app/views/foundry/scenes/index.json.jbuilder`,
authed by `PluginTokenAuthenticatable` (the same `rc_…` bearer tokens the Obsidian plugin uses).
