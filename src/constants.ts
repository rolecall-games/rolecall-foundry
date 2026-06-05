// The module id MUST match both module.json "id" and the folder name under
// {userData}/Data/modules/. Flags and settings are namespaced under it.
export const MODULE_ID = "rolecall-sync";

export const SETTINGS = {
  apiBaseUrl: "apiBaseUrl",
  apiToken: "apiToken",
} as const;

// The sync_version this client expects from GET /api/v1/foundry/scenes. The
// Rails endpoint stamps the same number; a mismatch means the contract moved.
export const EXPECTED_SYNC_VERSION = 1;
