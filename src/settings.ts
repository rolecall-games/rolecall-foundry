import { MODULE_ID, SETTINGS } from "./constants";
import { runConnect } from "./connect";
import { runSync } from "./sync";

// Two settings with deliberately different scopes: the Role Call origin is
// world-scoped (not a secret, and sharing it across clients is useful), and
// the per-game `rc_…` token is CLIENT-scoped.
//
// The token must never be world-scoped. Foundry replicates world settings to
// every connected client, so any player at the table could read the GM's
// bearer out of the console — and that token grants GET /api/v1/foundry/scenes,
// which returns gm_notes, NPC lore/stats and encounter details. The server
// ships those secrets *on the assumption* that only a game's GMs hold the
// token (see foundry_scenes_controller.ex). World scope voids that premise.
//
// Client scope costs the GM re-entering the token once per browser. That is
// the whole trade, and sync is already a manual GM-gated action either way.
export function registerSettings(): void {
  game.settings.register(MODULE_ID, SETTINGS.apiBaseUrl, {
    name: "RC.Settings.ApiBaseUrl.Name",
    hint: "RC.Settings.ApiBaseUrl.Hint",
    scope: "world",
    config: true,
    type: String,
    default: "https://rolecall.games",
  });

  game.settings.register(MODULE_ID, SETTINGS.apiToken, {
    name: "RC.Settings.ApiToken.Name",
    hint: "RC.Settings.ApiToken.Hint",
    scope: "client",
    config: true,
    type: String,
    default: "",
  });

  // The primary activation path: the device-code connect flow — sign in (or
  // sign up) in the browser, pick or create a campaign, and the token lands
  // here by itself. Pasting a token stays available as the manual fallback.
  game.settings.registerMenu(MODULE_ID, "connect", {
    name: "RC.Settings.Connect.Name",
    label: "RC.Settings.Connect.Label",
    hint: "RC.Settings.Connect.Hint",
    icon: "fas fa-plug",
    type: ConnectMenu,
    restricted: true,
  });

  // A button in the module settings pane that triggers a sync immediately.
  game.settings.registerMenu(MODULE_ID, "syncNow", {
    name: "RC.Settings.SyncNow.Name",
    label: "RC.Settings.SyncNow.Label",
    hint: "RC.Settings.SyncNow.Hint",
    icon: "fas fa-cloud-arrow-down",
    type: SyncNowMenu,
    restricted: true,
  });
}

export function getApiBaseUrl(): string {
  return String(game.settings.get(MODULE_ID, SETTINGS.apiBaseUrl) ?? "").trim().replace(/\/+$/, "");
}

export function getApiToken(): string {
  return String(game.settings.get(MODULE_ID, SETTINGS.apiToken) ?? "").trim();
}

// A FormApplication is the type a settings menu expects; we don't render a form,
// we just kick off the sync and close. Extends the v13+ ApplicationV2-era base
// when present, falling back to the legacy FormApplication.
const FormApplicationBase =
  foundry?.applications?.api?.ApplicationV2 ?? (globalThis as any).FormApplication;

class SyncNowMenu extends FormApplicationBase {
  async render(...args: unknown[]): Promise<unknown> {
    void args;
    await runSync();
    return this;
  }
}

// Same render-hijack shape as SyncNowMenu: the settings pane wants an
// application class, but the connect flow draws its own overlay.
class ConnectMenu extends FormApplicationBase {
  async render(...args: unknown[]): Promise<unknown> {
    void args;
    await runConnect({ onConnected: () => void runSync() });
    return this;
  }
}
