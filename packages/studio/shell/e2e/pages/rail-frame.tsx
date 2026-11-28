import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { defineFeature } from "../../src/feature.ts";
import type { PlaceSlotProps } from "../../src/points/frame.ts";
import { createShell } from "../../src/shell.ts";
import { MapTarget } from "../../src/test-support/map-target.ts";
import type { PlaceListPageProps } from "../../src/window/studio-page.tsx";
import { StudioWindow } from "../../src/window/studio-window.tsx";
import { StudioWorkspace } from "../../src/window/studio-workspace.ts";

/**
 * The real Studio window with a few rail entries besides the shell's Home and Settings, so the
 * rail's spacing and the title bar's mark can be measured against the approved mockup (v26 on
 * HAL-20617, HAL-20946). jsdom draws nothing, so a real browser measures the boxes.
 * `?place=changes` opens on a place with its own list column (HAL-21050).
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
    studio.places.add({
      id: "changes",
      view: "ChangesPage",
      load: async () => ({ ChangesPage }),
      listColumn: { view: "ChangesList", load: async () => ({ ChangesList }) },
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

/** The place's own list: a few changes, one row each. */
function ChangesList({ setOpen }: PlaceSlotProps) {
  return (
    <nav aria-label="Changes list" data-changes-list="">
      {["Instructions", "Sorting skill", "Support reply"].map((name) => (
        <button key={name} type="button" onClick={() => setOpen(name)}>
          {name}
        </button>
      ))}
    </nav>
  );
}

/** The place's page: the open change, and its own list only while the window doesn't draw it. */
function ChangesPage(props: PlaceListPageProps) {
  return (
    <div className="flex min-w-0 flex-1">
      {props.listInFrame ? null : <ChangesList {...props} />}
      <h1>{props.open ?? "Changes"}</h1>
    </div>
  );
}

const shell = createShell({ features: [placesFeature] });
const services = new MapTarget();
shell.services.instantiate(services);
const workspace = new StudioWorkspace({ toasts: shell.toasts, services, name: "Acme" });
if (new URLSearchParams(location.search).get("place") === "changes") {
  workspace.tabs.openHere({ key: "changes", title: "Changes" });
}

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
