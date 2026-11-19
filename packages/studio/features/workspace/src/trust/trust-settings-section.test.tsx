// @vitest-environment jsdom

import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { WorkspacePageService } from "../api.ts";
import { TrustSettingsSection } from "./trust-settings-section.tsx";
import { trustSummary } from "./trust-summary.ts";
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

  it("says there is nothing to trust, as the workspace page does, and offers no Open Trust", () => {
    const { element } = show({ ...control("not-trusted"), needsNoTrust: true });
    expect(element.textContent).toContain("Nothing to trust here.");
    expect(element.textContent).not.toContain("Not trusted yet");
    expect(element.querySelector("button")).toBeNull();
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

  it("gives the phone's row a line for each answer", () => {
    const line = (trust: Partial<WorkspaceTrustControl> | undefined) =>
      trustSummary({
        services: { get: () => ({ name: "Acme", trust }) },
      } as unknown as WorkspaceContext);
    expect(line({ ...control("not-trusted"), needsNoTrust: true })).toBe("Nothing to trust here");
    expect(line(control("trusted", "2026-11-03T12:00:00.000Z"))).toBe("Trusted");
    expect(line(control("not-trusted"))).toBe("Not trusted yet");
    expect(line(control("changed"))).toBe("Changed since you trusted it");
    expect(line(control("failed"))).toBe("Couldn't load workspace settings");
    expect(line(undefined)).toBeUndefined();
  });

  it("waits for the first answer before giving the phone's row a line", async () => {
    let listener = () => {};
    const trust = {
      status: "unknown",
      failure: undefined,
      subscribe: (next: () => void) => {
        listener = next;
        return () => undefined;
      },
    } as { status: WorkspaceTrustControl["status"] } & Partial<WorkspaceTrustControl>;
    const answer = trustSummary({
      services: { get: () => ({ name: "Acme", trust }) },
    } as unknown as WorkspaceContext);
    trust.status = "trusted";
    listener();
    await expect(answer).resolves.toBe("Trusted");
  });
});
