import { EXPECTED_SYNC_VERSION } from "./constants";
import { getApiBaseUrl, getApiToken } from "./settings";
import type { ScenesResponse } from "./types";

export class RoleCallApiError extends Error {}

// The endpoint is token-gated, but a base URL pointed at something that isn't
// Role Call — a reverse proxy's login page, a captive portal, a self-host typo
// — still answers 200 with perfectly valid JSON. Check the two fields every
// mapper dereferences so that lands here as a sentence the GM can act on,
// rather than as a TypeError three files deep with no context.
function looksLikeScenesResponse(body: unknown): body is ScenesResponse {
  if (typeof body !== "object" || body === null) return false;
  const data = body as Record<string, unknown>;

  return (
    typeof data.game === "object" &&
    data.game !== null &&
    Array.isArray(data.scenes) &&
    (data.lore_notes == null || Array.isArray(data.lore_notes))
  );
}

// The sync_version canary, which is worthless if it only reaches the console.
//
// The server sends the shape version it is producing (`sync_version`) and, as
// of the compatibility window, the oldest client that can still read that shape
// (`min_sync_version`). That second number is what makes an exact compare
// wrong: a server on v4 whose change was additive still declares min 2, and
// refusing to sync against it would strand every installed module until its
// user clicked update — a flag day the server went out of its way to avoid.
// So the rule is a floor, not an equality:
//
//   client < min_sync_version — the shape moved past what this build can read.
//     Whatever it managed to parse would be written into the GM's world as
//     journal entries, so failing closed beats "best effort".
//   client >= min_sync_version, versions differ — readable, just not the exact
//     build we were written against. Warn and carry on.
//
// `min_sync_version` absent means an older Role Call from before the window
// existed. Fall back to the exact compare it was deployed alongside: that
// server has made no promise about older clients, so the old conservative
// reading is the only safe one.
//
// The abort throws because runSync already renders a RoleCallApiError into an
// error toast; the proceed case has nothing to throw, so it notifies here.
function assertSyncVersion(version: number, minVersion: number | undefined): void {
  if (version === EXPECTED_SYNC_VERSION) return;
  const versions = { server: version, expected: EXPECTED_SYNC_VERSION };
  // No declared floor: treat the server's own version as the floor, which
  // reduces the check below to exactly the pre-window exact compare.
  const floor = minVersion ?? version;

  console.warn(
    `Role Call Sync: server sync_version ${version} (min ${floor}) != expected ${EXPECTED_SYNC_VERSION}.`,
  );

  if (EXPECTED_SYNC_VERSION < floor) {
    throw new RoleCallApiError(game.i18n.format("rolecall-sync.Api.VersionTooNew", versions));
  }

  ui.notifications?.warn(game.i18n.format("rolecall-sync.Api.VersionTooOld", versions));
}

// Fetches the configured game's scenes from Role Call. Foundry runs in a
// browser/Electron context, so we use the native fetch with a Bearer token —
// the same `rc_…` token the Obsidian plugin uses. The token identifies the
// game, so there's no game id to pass.
export async function fetchScenes(): Promise<ScenesResponse> {
  const baseUrl = getApiBaseUrl();
  const token = getApiToken();

  if (!baseUrl) throw new RoleCallApiError(game.i18n.localize("rolecall-sync.Api.NoBaseUrl"));
  if (!token) throw new RoleCallApiError(game.i18n.localize("rolecall-sync.Api.NoToken"));

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
    throw new RoleCallApiError(
      game.i18n.format("rolecall-sync.Api.Unreachable", { url: baseUrl }),
    );
  }

  if (res.status === 401 || res.status === 403) {
    throw new RoleCallApiError(game.i18n.localize("rolecall-sync.Api.Unauthorized"));
  }
  if (!res.ok) {
    throw new RoleCallApiError(
      game.i18n.format("rolecall-sync.Api.HttpError", { status: res.status }),
    );
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch (err) {
    console.error("Role Call Sync: response body was not JSON", err);
    throw new RoleCallApiError(game.i18n.localize("rolecall-sync.Api.MalformedResponse"));
  }

  // Version before shape, deliberately: a newer contract is *allowed* to look
  // unrecognisable, and "update the module" is the actionable message there.
  // Checking shape first would report the wrong problem.
  const envelope = body as { sync_version?: unknown; min_sync_version?: unknown } | null;
  const version = envelope?.sync_version;
  const minVersion = envelope?.min_sync_version;

  if (typeof version === "number") {
    assertSyncVersion(version, typeof minVersion === "number" ? minVersion : undefined);
  }

  if (!looksLikeScenesResponse(body)) {
    throw new RoleCallApiError(game.i18n.localize("rolecall-sync.Api.MalformedResponse"));
  }

  return body;
}
