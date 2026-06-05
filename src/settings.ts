import { MODULE_ID, SETTINGS } from "./constants";
import { runSync } from "./sync";

// World-scoped settings: the Role Call origin and the per-game `rc_…` token
// (generated on the game's Tokens page in Role Call — the token identifies
// which game's scenes get pulled). Also registers a "Sync now" menu button.
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
    scope: "world",
    config: true,
    type: String,
    default: "",
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
