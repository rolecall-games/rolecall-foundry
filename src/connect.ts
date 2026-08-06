import { CONNECT_PROTOCOL_VERSION, MODULE_ID, SETTINGS } from "./constants";
import { getApiBaseUrl } from "./settings";

// Device-code activation (rolecall-meta/contracts/plugin-connect.md). Instead
// of generating a token on the website and pasting it here, the module asks
// the server for a code pair, opens the browser on the approval page — where
// the GM can sign in OR create an account and a campaign — and polls until
// the request resolves. On approval it stores the freshly minted `rc_` token
// in the client-scoped setting, exactly as if it had been pasted.
//
// The waiting UI is a raw-DOM overlay on purpose: this module supports both
// the v13 and v14 ApplicationV2 eras, whose Dialog APIs keep shifting, and a
// plain positioned <div> behaves identically on both (the sidebar button
// already sets the precedent for direct DOM). If the overlay somehow fails,
// the flow still works — the browser tab is already open and notifications
// carry every outcome.

export class RoleCallConnectError extends Error {}

interface ConnectStart {
  protocol_version: number;
  user_code: string;
  device_code: string;
  connect_url: string;
  poll_interval_seconds: number;
  expires_in_seconds: number;
}

type ConnectPoll =
  | { status: "pending" | "denied" | "expired" | "consumed" }
  | { status: "approved"; token: string; game: { id: string; name: string; url: string } };

async function startConnect(baseUrl: string): Promise<ConnectStart> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/v1/plugin_connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        protocol_version: CONNECT_PROTOCOL_VERSION,
        plugin: "foundry",
        client_version: String(game.modules?.get(MODULE_ID)?.version ?? ""),
        name_hint: String(game.world?.title ?? "").slice(0, 80) || undefined,
      }),
    });
  } catch {
    throw new RoleCallConnectError(`Couldn't reach Role Call at ${baseUrl}.`);
  }

  if (res.status === 429) {
    throw new RoleCallConnectError("Too many connect attempts — wait a few minutes and retry.");
  }
  if (res.status === 409) {
    throw new RoleCallConnectError("This module version is out of date — update Role Call Sync.");
  }
  if (!res.ok) {
    throw new RoleCallConnectError(`Role Call returned HTTP ${res.status}.`);
  }

  return (await res.json()) as ConnectStart;
}

async function pollOnce(baseUrl: string, deviceCode: string): Promise<ConnectPoll | "slow_down"> {
  const res = await fetch(
    `${baseUrl}/api/v1/plugin_connect/${encodeURIComponent(deviceCode)}`,
    { method: "GET", headers: { Accept: "application/json" } },
  );

  if (res.status === 429) return "slow_down";
  if (res.status === 404) return { status: "expired" };
  if (!res.ok) throw new RoleCallConnectError(`HTTP ${res.status}`);

  return (await res.json()) as ConnectPoll;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface Overlay {
  element: HTMLElement;
  setStatus(text: string): void;
  close(): void;
}

// state.cancelled flips when the GM dismisses the overlay — the poll loop
// checks it after every sleep so a cancel never leaves a timer running.
function openOverlay(start: ConnectStart, popupOpened: boolean, state: { cancelled: boolean }): Overlay | null {
  try {
    const overlay = document.createElement("div");
    overlay.className = `${MODULE_ID}-connect-overlay`;

    const lead = popupOpened
      ? "Finish connecting in the browser tab that just opened."
      : "Your browser blocked the popup — open the link below to continue.";

    overlay.innerHTML = `
      <div class="${MODULE_ID}-connect-card">
        <h2>Connect to Role Call</h2>
        <p>${lead}</p>
        <p class="${MODULE_ID}-connect-code">${start.user_code}</p>
        <p>
          <a href="${start.connect_url}" target="_blank" rel="noopener">${start.connect_url}</a><br>
          If the code shown there doesn't match the one above, stop.
        </p>
        <p class="${MODULE_ID}-connect-status">Waiting for approval…</p>
        <button type="button" class="${MODULE_ID}-connect-cancel">Cancel</button>
      </div>
    `;

    overlay
      .querySelector(`.${MODULE_ID}-connect-cancel`)
      ?.addEventListener("click", () => {
        state.cancelled = true;
        overlay.remove();
      });

    document.body.append(overlay);

    return {
      element: overlay,
      setStatus(text: string) {
        const status = overlay.querySelector(`.${MODULE_ID}-connect-status`);
        if (status) status.textContent = text;
      },
      close() {
        overlay.remove();
      },
    };
  } catch (err) {
    console.warn("Role Call Sync: connect overlay failed to render", err);
    return null;
  }
}

// Kick off the whole handshake. `onConnected` fires after the token is stored
// (the caller decides whether that means "run the first sync now").
export async function runConnect(opts: { onConnected?: () => void } = {}): Promise<void> {
  if (!game.user?.isGM) {
    ui.notifications?.warn("Role Call: only a GM can connect this world.");
    return;
  }

  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    ui.notifications?.error("Role Call: set the API base URL in module settings first.");
    return;
  }

  let start: ConnectStart;
  try {
    start = await startConnect(baseUrl);
  } catch (err) {
    const message =
      err instanceof RoleCallConnectError ? err.message : "Connect failed — see the console.";
    console.error("Role Call Sync:", err);
    ui.notifications?.error(`Role Call: ${message}`);
    return;
  }

  const popup = window.open(start.connect_url, "_blank");
  const state = { cancelled: false };
  const overlay = openOverlay(start, !!popup, state);
  if (!popup && !overlay) {
    // Popup blocked AND no overlay: the URL would be unreachable. Surface it.
    ui.notifications?.warn(`Role Call: open ${start.connect_url} to approve the connection.`);
  }

  const deadline = Date.now() + start.expires_in_seconds * 1000;
  let interval = Math.max(2, start.poll_interval_seconds) * 1000;

  try {
    while (!state.cancelled && Date.now() < deadline) {
      await sleep(interval);
      if (state.cancelled) return;

      let poll: ConnectPoll | "slow_down";
      try {
        poll = await pollOnce(baseUrl, start.device_code);
      } catch {
        continue; // transient network hiccup — the deadline still bounds us
      }

      if (poll === "slow_down") {
        interval += 2_000;
        continue;
      }

      switch (poll.status) {
        case "pending":
          continue;

        case "approved":
          await game.settings.set(MODULE_ID, SETTINGS.apiToken, poll.token);
          overlay?.close();
          ui.notifications?.info(`Role Call: connected to “${poll.game.name}”.`);
          opts.onConnected?.();
          return;

        case "denied":
          overlay?.close();
          ui.notifications?.warn("Role Call: the connect request was denied on the website.");
          return;

        case "consumed":
          overlay?.close();
          ui.notifications?.warn("Role Call: that connect request was already used — start again.");
          return;

        case "expired":
          overlay?.close();
          ui.notifications?.warn("Role Call: the connect request expired — click Connect again.");
          return;
      }
    }

    if (!state.cancelled) {
      overlay?.close();
      ui.notifications?.warn("Role Call: the connect request expired — click Connect again.");
    }
  } finally {
    // Whatever path exits the loop, never leave a dead overlay behind.
    if (!state.cancelled) overlay?.close();
  }
}
