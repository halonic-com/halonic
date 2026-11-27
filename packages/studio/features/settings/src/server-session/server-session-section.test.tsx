// @vitest-environment jsdom
import { HostSettings } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { settingsSectionsFor } from "../feature.ts";
import { typeAndLeave } from "../test-support/controls.ts";
import { MemoryHostSettingsStore } from "../test-support/memory-host-settings-store.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ServerSessionView } from "./server-session-section.tsx";

afterEach(unmountAll);

async function setup() {
  const store = new MemoryHostSettingsStore();
  const settings = new HostSettings(store);
  await settings.load();
  const view = render(<ServerSessionView settings={settings} />);
  return { store, view };
}

function box(view: HTMLElement, placeholder: string): HTMLInputElement {
  const found = view.querySelector<HTMLInputElement>(`input[placeholder="${placeholder}"]`);
  if (found === null) throw new Error(`no field with placeholder ${placeholder}`);
  return found;
}

verifies("settings.server-session", () => {
  describe("Settings › Your server", () => {
    it("saves the trimmed server, user and port as host settings", async () => {
      const { store, view } = await setup();
      await typeAndLeave(box(view, "build.example.com"), " build.acme.example ");
      await typeAndLeave(box(view, "ops"), "ops");
      await typeAndLeave(box(view, "22"), "2222");
      expect(Object.fromEntries(store.stored)).toEqual({
        "server-session.host": "build.acme.example",
        "server-session.user": "ops",
        "server-session.port": 2222,
      });
    });

    it("says the user name goes in lower case", async () => {
      const { view } = await setup();
      expect(view.textContent).toContain("Your user name on the server, in lower case.");
    });

    it("removes a field's saved value when it is emptied", async () => {
      const { store, view } = await setup();
      await typeAndLeave(box(view, "ops"), "ops");
      await typeAndLeave(box(view, "ops"), "  ");
      expect(store.stored.has("server-session.user")).toBe(false);
    });

    it("refuses a port outside 1 to 65535 and saves nothing", async () => {
      const { store, view } = await setup();
      await typeAndLeave(box(view, "22"), "70000");
      expect(view.textContent).toContain(
        "Enter a whole number from 1 to 65535, or leave it empty.",
      );
      await typeAndLeave(box(view, "22"), "2a");
      expect(store.stored.size).toBe(0);
    });

    it("shows now that the Inbox offers Run with Claude, unfinished sections hidden or not", () => {
      const ids = (showUnfinished: boolean) =>
        settingsSectionsFor(showUnfinished).map((section) => section.id);
      expect(ids(false)).toContain("server-session");
      expect(ids(true)).toContain("server-session");
    });
  });
});
