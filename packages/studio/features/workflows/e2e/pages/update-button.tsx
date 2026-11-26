import {
  loadUpdateButton,
  type UpdaterHost,
  type UpdateState,
  type UpdateStatus,
} from "@halonicjs/studio-feature-settings/api";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

/*
 * The title bar's **Update** button over a made-up updater (HAL-19575), for the design check:
 * `?state=available` (a newer version found), `?state=signature` (its signature was refused) and
 * `?state=failed` (its download failed). The spec presses the button to open the dialog. The strip
 * stands in for the title bar's right end; the button is the feature's own.
 */

const available: UpdateState = {
  kind: "available",
  version: "0.2.0",
  notesUrl: "https://example.test/releases/0.2.0",
  notes: "- The title bar has an Update button.\n- Faster start.",
};

const states: Record<string, UpdateState> = {
  available,
  signature: { kind: "signature-mismatch", version: "0.2.0", attempts: 2 },
  failed: { kind: "download-failed", version: "0.2.0", reason: "offline" },
};

const picked = new URLSearchParams(window.location.search).get("state") ?? "available";
const state = states[picked] ?? available;

const status: UpdateStatus = {
  current: "0.1.1",
  automatic: false,
  checking: false,
  lastChecked: Date.now(),
  justUpdated: null,
  managed: null,
  state,
};

/** An updater that only reports {@link status}: no press reaches a real one. */
const host: UpdaterHost = {
  status: async () => status,
  subscribe: (listener) => {
    listener(status);
    return () => undefined;
  },
  check: async () => status,
  download: async () => status,
  cancel: async () => status,
  restart: async () => undefined,
  setAutomatic: async () => status,
  setTrack: async () => status,
};

const root = document.getElementById("root");
if (root === null) {
  throw new Error("The update button page needs its #root element (update-button.html).");
}
void loadUpdateButton().then(({ UpdateButtonView }) => {
  createRoot(root).render(
    <StrictMode>
      <div id="shot" className="flex h-10 w-full items-center justify-end bg-surface px-2 text-fg">
        <UpdateButtonView host={host} announce={() => undefined} onRestart={() => undefined} />
      </div>
    </StrictMode>,
  );
});
