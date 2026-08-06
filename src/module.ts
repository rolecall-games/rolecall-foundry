import { MODULE_ID } from "./constants";
import { registerSettings } from "./settings";
import { runSync } from "./sync";

// Entry point. Foundry loads this as an ES module (see module.json esmodules).
Hooks.once("init", () => {
  registerSettings();
  console.log(`${MODULE_ID} | initialized`);
});

// Expose a small API so the sync is macro-callable:
//   game.modules.get("rolecall-sync").api.sync()
Hooks.once("ready", () => {
  const mod = game.modules.get(MODULE_ID);
  if (mod) mod.api = { sync: runSync };
});

// Add a "Sync from Role Call" button to the Journal sidebar. Works across the
// v13/v14 ApplicationV2 sidebar (native HTMLElement) and the legacy v12 jQuery
// one. The V2 directory template doesn't guarantee a `.directory-header`, so we
// try a few known anchors and fall back to the tab root — the button always
// renders and never throws on a missing selector.
Hooks.on("renderJournalDirectory", (_app: unknown, html: unknown) => {
  if (!game.user?.isGM) return;

  const root: HTMLElement | null =
    html instanceof HTMLElement ? html : (html as { [0]?: HTMLElement } | undefined)?.[0] ?? null;
  if (!root) return;
  if (root.querySelector(`.${MODULE_ID}-sync-btn`)) return; // already injected

  const anchor =
    root.querySelector(".directory-header") ??
    root.querySelector(".header-search") ??
    root.querySelector("header") ??
    root.querySelector(".directory-footer") ??
    root;

  const button = document.createElement("button");
  button.type = "button";
  button.className = `${MODULE_ID}-sync-btn`;
  button.innerHTML = `<i class="fas fa-cloud-arrow-down"></i> ${game.i18n.localize(
    "rolecall-sync.Sidebar.SyncButton",
  )}`;
  button.addEventListener("click", () => {
    void runSync();
  });

  // Footer-anchored button goes at the end; otherwise lead the header/search.
  if (anchor.classList.contains("directory-footer")) anchor.append(button);
  else anchor.prepend(button);
});
