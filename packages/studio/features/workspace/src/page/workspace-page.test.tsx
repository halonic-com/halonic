// @vitest-environment jsdom

import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import type { WorkspacePage as Facts } from "../api.ts";
import type { WorkspaceTrustControl } from "../trust/workspace-trust-control.ts";
import { WorkspacePage } from "./workspace-page.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let element: HTMLElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  element?.remove();
});

const trust = {
  badge: "none",
  status: "trusted",
  trustedAt: "2026-11-03T10:00:00Z",
  review: () => undefined,
  grant: async () => ({ ok: true }),
  remove: async () => ({ ok: true }),
  subscribe: () => () => undefined,
} satisfies WorkspaceTrustControl;

function show(facts: Facts): HTMLElement {
  element = document.createElement("div");
  document.body.append(element);
  const context = { services: { get: () => facts } } as unknown as WorkspaceContext;
  root = createRoot(element);
  act(() =>
    root?.render(
      <ToastStoreProvider store={createToastStore()}>
        <WorkspacePage
          item={{ kind: "workspace", hub: "local", id: "settings" }}
          context={context}
        />
      </ToastStoreProvider>,
    ),
  );
  return element;
}

verifies("workspace.workspace-page", () => {
  it("is titled Workspace settings and shows the Trust section for a folder", () => {
    const page = show({ name: "Acme", trust });

    expect(page.querySelector("h1")?.textContent).toBe("Workspace settings");
    expect(page.textContent).toContain("Trust");
    expect(page.textContent).toContain("Remove trust");
  });

  it("shows no Trust section without a folder to trust", () => {
    const page = show({ name: "Acme" });

    expect(page.querySelector("h1")?.textContent).toBe("Workspace settings");
    expect(page.textContent).not.toContain("Trust");
  });
});
