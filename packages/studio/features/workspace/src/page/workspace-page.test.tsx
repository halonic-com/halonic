// @vitest-environment jsdom

import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import type { WorkspacePage as Facts } from "../api.ts";
import type { WorkspaceTrustControl } from "../trust/workspace-trust-control.ts";
import { WorkspacePage } from "./workspace-page.tsx";
import { requestWorkspaceTarget } from "./workspace-page-target.ts";

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
  failure: undefined,
  retry: async () => {},
  review: () => undefined,
  grant: async () => ({ ok: true }),
  remove: async () => ({ ok: true }),
  subscribe: () => () => undefined,
} satisfies WorkspaceTrustControl;

function ModelsStub() {
  return (
    <section data-workspace-section="models">
      <h2>Models</h2>
    </section>
  );
}

function show(
  facts: Facts,
  Sections: () => React.ReactNode = () => <p className="added-section">Models</p>,
): HTMLElement {
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
          Sections={Sections}
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

  it("places the sections other features add after Trust", () => {
    const page = show({ name: "Acme", trust });

    const text = page.textContent ?? "";
    expect(text.indexOf("Remove trust")).toBeLessThan(text.indexOf("Models"));
    expect(page.querySelector(".added-section")).not.toBeNull();
  });

  it("shows no Trust section without a folder to trust", () => {
    const page = show({ name: "Acme" });

    expect(page.querySelector("h1")?.textContent).toBe("Workspace settings");
    expect(page.textContent).not.toContain("Trust");
  });

  it("focuses the Models heading when asked to open at Models", () => {
    requestWorkspaceTarget("models");
    const page = show({ name: "Acme", trust }, ModelsStub);

    expect(document.activeElement).toBe(
      page.querySelector("section[data-workspace-section=models] h2"),
    );
  });

  it("waits for a section that loads late, then focuses its heading", async () => {
    requestWorkspaceTarget("models");
    let reveal: () => void = () => undefined;
    function Late() {
      const [ready, setReady] = useState(false);
      reveal = () => setReady(true);
      return ready ? <ModelsStub /> : null;
    }
    const page = show({ name: "Acme", trust }, Late);
    expect(document.activeElement).not.toBe(page.querySelector("h2"));

    await act(async () => {
      reveal();
    });

    expect(document.activeElement?.textContent).toBe("Models");
  });

  it("moves focus again when the page is already open", () => {
    const page = show({ name: "Acme", trust }, ModelsStub);
    expect(document.activeElement).toBe(document.body);

    act(() => requestWorkspaceTarget("models"));

    expect(document.activeElement).toBe(
      page.querySelector("section[data-workspace-section=models] h2"),
    );
  });

  it("moves focus to the Trust heading when asked to open at Trust", () => {
    requestWorkspaceTarget("trust");
    const page = show({ name: "Acme", trust }, ModelsStub);

    expect(document.activeElement).toBe(
      page.querySelector("section[data-workspace-section=trust] h2"),
    );
  });
});
