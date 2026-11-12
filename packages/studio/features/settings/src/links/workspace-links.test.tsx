// @vitest-environment jsdom
import type { SettingsSectionProps, WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import { settingsSections } from "../feature.ts";
import { click, control } from "../test-support/controls.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import {
  ModelsLinkSection,
  openModelsCommand,
  openTrustCommand,
  TrustLinkSection,
} from "./workspace-links.tsx";

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
  it("adds Models and Trust to the workspace group, Models first", () => {
    const links = settingsSections.filter((section) => section.scope === "workspace");
    expect(links.map(({ id, title }) => [id, title])).toEqual([
      ["models", "Models"],
      ["trust", "Trust"],
    ]);
    expect(links[0]?.order).toBeLessThan(links[1]?.order ?? 0);
  });

  it("loads the views the sections name", async () => {
    for (const section of settingsSections.filter(({ scope }) => scope === "workspace")) {
      expect(await section.load()).toHaveProperty(section.view);
    }
  });

  describe("Models", () => {
    it("shows one line and Open Models, with no summary or chip", () => {
      const { view } = setup(ModelsLinkSection);
      expect(view.querySelectorAll("p")).toHaveLength(1);
      expect(view.querySelectorAll("button")).toHaveLength(1);
      expect(control(view, "button").textContent).toBe("Open Models");
    });

    it("closes Settings, then runs the command that opens Models", async () => {
      const { calls, view } = setup(ModelsLinkSection);
      await click(control(view, "button"));
      expect(calls).toEqual(["close", `run ${openModelsCommand}`]);
    });
  });

  describe("Trust", () => {
    it("shows one line and Open Trust", () => {
      const { view } = setup(TrustLinkSection);
      expect(view.querySelectorAll("p")).toHaveLength(1);
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
