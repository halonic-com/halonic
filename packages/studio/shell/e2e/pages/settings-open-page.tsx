import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { defineFeature } from "../../src/feature.ts";
import type { SettingsSectionProps } from "../../src/settings/settings-dialog.tsx";
import { createShell } from "../../src/shell.ts";
import { MapTarget } from "../../src/test-support/map-target.ts";
import type { ItemViewProps } from "../../src/window/item-view.tsx";
import { StudioWindow } from "../../src/window/studio-window.tsx";
import { StudioWorkspace } from "../../src/window/studio-workspace.ts";

/**
 * The real Studio window with Settings › Plugins, whose Weather row closes Settings and opens the
 * plugin's page, as the plugins feature's section does (C383 SP1). Weather's view takes a moment to
 * load, as a place's view does the first time it shows, so its `h1` is drawn after Settings has
 * closed and given its focus back. Only a real browser shows where the focus lands: jsdom ignores
 * `inert` and a modal dialog's own focus return.
 */
function PluginView({ item }: ItemViewProps) {
  return <h1 tabIndex={-1}>{`Plugin ${item.id}`}</h1>;
}

function PluginsSection({ context, closeSettings }: SettingsSectionProps) {
  return (
    <button
      type="button"
      onClick={() => {
        closeSettings();
        context.openItem?.({ kind: "plugin", hub: "plugins", id: "Weather" });
      }}
    >
      Weather
    </button>
  );
}

const pluginsFeature = defineFeature({
  id: "plugins",
  title: "Plugins",
  register(studio) {
    studio.settings.add({
      id: "plugins",
      title: "Plugins",
      scope: "workspace",
      order: 10,
      view: "PluginsSection",
      load: async () => ({ PluginsSection }),
    });
    studio.itemKinds.add({
      kind: "plugin",
      label: "Plugin",
      icon: "plugin",
      open: {
        view: "PluginView",
        load: () => new Promise((resolve) => setTimeout(() => resolve({ PluginView }), 300)),
      },
    });
  },
});

const shell = createShell({ features: [pluginsFeature] });
const services = new MapTarget();
shell.services.instantiate(services);
const workspace = new StudioWorkspace({ toasts: shell.toasts, services, name: "Acme" });

const root = document.getElementById("root");
if (root === null) {
  throw new Error("The page needs its #root element (settings-open-page.html).");
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
