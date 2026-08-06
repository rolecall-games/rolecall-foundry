# Changelog

All notable changes to the RoleCall Sync module for Foundry VTT.

## [0.1.0] — unreleased

First release.

- **Connect to RoleCall** — device-code activation: click Connect (module
  settings, or just hit Sync with no token set), approve in the browser —
  signing up and creating the campaign right there if you don't have one —
  and the token is stored for you. Pasting a token from the Tokens page
  remains as the manual fallback.

- Pull a RoleCall campaign's **prep scenes** into Foundry as Journal Entries —
  one entry per scene, with pages for the read-aloud text, GM notes, and every
  member (NPCs, encounters, loot caches, magic items).
- Pull the campaign's **lore notes** in alongside them.
- File everything under a single top-level **RoleCall** folder, with one child
  folder per campaign, in the order RoleCall has them rather than alphabetical.
- Sync from the Journal sidebar button, the module settings pane, or a macro
  (`game.modules.get("rolecall-sync").api.sync()`). GM only.
- Compatible with Foundry v13 and v14.

**This module does not import maps.** A RoleCall scene is a narrative prep
bundle, not a battlemap — see the README.
