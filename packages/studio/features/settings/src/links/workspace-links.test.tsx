// @vitest-environment jsdom
import type { SettingsSectionProps, WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import { settingsSections } from "../feature.ts";
import { click, control } from "../test-support/controls.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { openTrustCommand, TrustLinkSection } from "./workspace-links.tsx";

afterEach(unmountAll);

function setup(View: (props: SettingsSectionProps) => React.ReactNode, withCommands = true) {
  const calls: string[] = [];
  const runCommand = vi.fn((id: string) => {
    calls.push(`run ${id}`);
    return true;
  });
  const closeSettings = vi.fn(() => calls.push("close"));
  const context = (withCommands ? { runCommand } : {}) as unknown as WorkspaceContext;
  const view = render(
    <View context={context} closeSettings={closeSettings} place="app" surface="window" />,
  );
  return { calls, runCommand, view };
}

verifies("settings.workspace-links", () => {
  it("adds Trust to the workspace group; Models comes from the Models feature", () => {
    const links = settingsSections.filter((section) => section.scope === "workspace");
    expect(links.map(({ id, title }) => [id, title])).toEqual([["trust", "Trust"]]);
  });

  it("loads the views the sections name", async () => {
    for (const section of settingsSections.filter(({ scope }) => scope === "workspace")) {
      expect(await section.load()).toHaveProperty(section.view);
    }
  });

  describe("Trust", () => {
    it("shows Open Trust and no line of its own", () => {
      const { view } = setup(TrustLinkSection);
      expect(view.querySelectorAll("p")).toHaveLength(0);
      expect(control(view, "button").textContent).toBe("Open Trust");
    });

    it("closes Settings, then runs the command that opens Trust", async () => {
      const { calls, view } = setup(TrustLinkSection);
      await click(control(view, "button"));
      expect(calls).toEqual(["close", `run ${openTrustCommand}`]);
    });

    it("only closes Settings in a window without runCommand", async () => {
      const { calls, view } = setup(TrustLinkSection, false);
      await click(control(view, "button"));
      expect(calls).toEqual(["close"]);
    });
  });
});
