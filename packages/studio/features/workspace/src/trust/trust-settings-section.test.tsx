// @vitest-environment jsdom

import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { WorkspacePageService } from "../api.ts";
import { TrustSettingsSection } from "./trust-settings-section.tsx";
import type { WorkspaceTrustControl } from "./workspace-trust-control.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let element: HTMLElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  element?.remove();
});

function show(trust: Partial<WorkspaceTrustControl> | undefined, withCommands = true) {
  const calls: string[] = [];
  const context = {
    services: {
      get: (key: unknown) => (key === WorkspacePageService ? { name: "Acme", trust } : undefined),
    },
    ...(withCommands ? { runCommand: (id: string) => calls.push(`run ${id}`) > 0 } : {}),
  } as unknown as WorkspaceContext;
  element = document.createElement("div");
  document.body.append(element);
  root = createRoot(element);
  act(() =>
    root?.render(
      createElement(TrustSettingsSection, {
        context,
        closeSettings: vi.fn(() => calls.push("close")),
        place: "app",
        surface: "window",
      }),
    ),
  );
  return { calls, element };
}

const control = (status: WorkspaceTrustControl["status"], trustedAt?: string) =>
  ({
    status,
    trustedAt,
    failure: undefined,
    subscribe: () => () => undefined,
  }) as unknown as Partial<WorkspaceTrustControl>;

verifies("workspace.settings-trust", () => {
  it("says the workspace isn't trusted yet, next to Open Trust", () => {
    const { element } = show(control("not-trusted"));
    expect(element.textContent).toContain("Not trusted yet.");
    expect(element.textContent).toContain("Open Trust");
    expect(element.textContent).not.toContain("Changes");
  });

  it("says when the workspace was trusted", () => {
    const { element } = show(control("trusted", "2026-11-03T12:00:00.000Z"));
    expect(element.textContent).toContain("Trusted on 3 Nov 2026");
  });

  it("shows only the button without a folder to trust", () => {
    const { element } = show(undefined);
    expect(element.querySelectorAll("p")).toHaveLength(0);
    expect(element.querySelector("button")?.textContent).toBe("Open Trust");
  });

  it("closes Settings, then runs the command that opens Trust", () => {
    const { calls, element } = show(control("not-trusted"));
    act(() => element.querySelector("button")?.click());
    expect(calls).toEqual(["close", "run workspace.open-trust"]);
  });

  it("only closes Settings in a window without runCommand", () => {
    const { calls, element } = show(control("not-trusted"), false);
    act(() => element.querySelector("button")?.click());
    expect(calls).toEqual(["close"]);
  });
});
