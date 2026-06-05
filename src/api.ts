import { EXPECTED_SYNC_VERSION } from "./constants";
import { getApiBaseUrl, getApiToken } from "./settings";
import type { ScenesResponse } from "./types";

export class RoleCallApiError extends Error {}

// Fetches the configured game's scenes from Role Call. Foundry runs in a
// browser/Electron context, so we use the native fetch with a Bearer token —
// the same `rc_…` token the Obsidian plugin uses. The token identifies the
// game, so there's no game id to pass.
export async function fetchScenes(): Promise<ScenesResponse> {
  const baseUrl = getApiBaseUrl();
  const token = getApiToken();

  if (!baseUrl) throw new RoleCallApiError("Set the Role Call API base URL in module settings.");
  if (!token) throw new RoleCallApiError("Paste a Role Call API token in module settings.");

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/v1/foundry/scenes`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
  } catch (err) {
    throw new RoleCallApiError(`Couldn't reach Role Call at ${baseUrl}.`);
  }

  if (res.status === 401 || res.status === 403) {
    throw new RoleCallApiError("Invalid or revoked token — check module settings.");
  }
  if (!res.ok) {
    throw new RoleCallApiError(`Role Call returned HTTP ${res.status}.`);
  }

  const data = (await res.json()) as ScenesResponse;

  if (typeof data?.sync_version === "number" && data.sync_version !== EXPECTED_SYNC_VERSION) {
    console.warn(
      `Role Call Sync: server sync_version ${data.sync_version} != expected ${EXPECTED_SYNC_VERSION}. Update the module.`,
    );
  }

  return data;
}
