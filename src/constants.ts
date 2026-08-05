// The module id MUST match both module.json "id" and the folder name under
// {userData}/Data/modules/. Flags and settings are namespaced under it.
export const MODULE_ID = "rolecall-sync";

export const SETTINGS = {
  apiBaseUrl: "apiBaseUrl",
  apiToken: "apiToken",
} as const;

// The sync_version this client expects from GET /api/v1/foundry/scenes. The
// Phoenix endpoint stamps the same number; a mismatch means the contract moved.
// See rolecall-meta/contracts/foundry-scenes.md — four things move together.
export const EXPECTED_SYNC_VERSION = 3;

// The single top-level Journal folder everything this module creates lives
// under, with one child folder per synced game. Nesting stops there on
// purpose: Foundry's FOLDER_MAX_DEPTH is 3, and a folder created past the
// limit is created but never rendered — a silent failure worth staying well
// clear of.
export const ROOT_FOLDER_NAME = "Role Call";
