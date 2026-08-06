// The module id MUST match both module.json "id" and the folder name under
// {userData}/Data/modules/. Flags and settings are namespaced under it.
export const MODULE_ID = "rolecall-sync";

export const SETTINGS = {
  apiBaseUrl: "apiBaseUrl",
  apiToken: "apiToken",
} as const;

// The sync_version this client is written against, for GET /api/v1/foundry/scenes.
// It is NOT an equality check any more: the response carries `min_sync_version`,
// the oldest client the server's shape still reads, and `assertSyncVersion`
// aborts only below that floor. So this number says "what we were built for",
// and the server says "what still works" — a RoleCall deploy no longer strands
// installed modules that haven't updated.
// See rolecall-meta/contracts/foundry-scenes.md — four things move together.
export const EXPECTED_SYNC_VERSION = 3;

// The device-code activation handshake's own version canary — independent of
// the scenes feed's sync_version. See rolecall-meta/contracts/plugin-connect.md.
export const CONNECT_PROTOCOL_VERSION = 1;

// The single top-level Journal folder everything this module creates lives
// under, with one child folder per synced game. Nesting stops there on
// purpose: Foundry's FOLDER_MAX_DEPTH is 3, and a folder created past the
// limit is created but never rendered — a silent failure worth staying well
// clear of.
export const ROOT_FOLDER_NAME = "RoleCall";
