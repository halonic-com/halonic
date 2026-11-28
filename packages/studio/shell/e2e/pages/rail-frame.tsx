import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { defineFeature } from "../../src/feature.ts";
import { createShell } from "../../src/shell.ts";
import { MapTarget } from "../../src/test-support/map-target.ts";
import { StudioWindow } from "../../src/window/studio-window.tsx";
import { StudioWorkspace } from "../../src/window/studio-workspace.ts";

/**
 * The real Studio window with a few rail entries besides the shell's Home and Settings, so the
 * rail's spacing and the title bar's mark can be measured against the approved mockup (v26 on
 * HAL-20617, HAL-20946). jsdom draws nothing, so a real browser measures the boxes.
 */
const placesFeature = defineFeature({
  id: "acme-places",
  title: "Acme places",
  register(studio) {
    studio.rail.add({
      id: "library",
      label: "Library",
      icon: "library",
      order: 10,
      holds: ["library"],
      opens: "library",
      shows: () => true,
    });
    studio.rail.add({
      id: "inbox",
      label: "Inbox",
      icon: "inbox",
      order: 20,
      holds: ["inbox"],
      opens: "inbox",
      shows: () => true,
    });
  },
});

const shell = createShell({ features: [placesFeature] });
const services = new MapTarget();
shell.services.instantiate(services);
const workspace = new StudioWorkspace({ toasts: shell.toasts, services, name: "Acme" });

const root = document.getElementById("root");
if (root === null) {
  throw new Error("The page needs its #root element (rail-frame.html).");
}
createRoot(root).render(
  <StrictMode>
    <StudioWindow
      shell={shell}
      workspace={workspace}
      host="desktop-app"
      platform="windows"
      language="en"
    />
  </StrictMode>,
);
