import {
  SandboxChoiceFlow,
  type SandboxChoiceScreen,
  sandboxChoiceView,
} from "@halonicjs/studio-feature-settings/api";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

type Status = Parameters<typeof sandboxChoiceView>[0]["backends"][number];

const backend = (id: Status["id"], over: Partial<Status> = {}): Status => ({
  id,
  offered: true,
  state: "available",
  reason: null,
  setup: null,
  missing: [],
  limits: [],
  residuals: [],
  ...over,
});

/** What the engine reports on a Windows PC before anything is chosen. */
const view = sandboxChoiceView(
  {
    active: null,
    setting: null,
    backends: [
      backend("srt-wsl"),
      backend("srt"),
      backend("docker-sbx", { state: "not-available", reason: "virtualisation-off" }),
      backend("cloud"),
    ],
  },
  "win32",
);

const screens: readonly SandboxChoiceScreen[] = ["choose", "more-info", "options", "confirm-none"];
const asked = new URLSearchParams(location.search).get("screen") ?? "choose";
const screen = screens.find((one) => one === asked);
if (screen === undefined) {
  throw new Error(`The sandbox choice page has no screen "${asked}".`);
}

const root = document.getElementById("root");
if (root === null) {
  throw new Error("The sandbox choice page needs its #root element (sandbox-choice.html).");
}
createRoot(root).render(
  <StrictMode>
    <div className="flex h-screen bg-canvas text-fg">
      <SandboxChoiceFlow
        view={view}
        platform="win32"
        initialScreen={screen}
        onSetUp={() => undefined}
        onContinueWithout={() => undefined}
      />
    </div>
  </StrictMode>,
);
