// @vitest-environment jsdom
import type { ItemViewProps } from "@halonicjs/studio-shell";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requestConnectorTitleFocus } from "../connector-focus-request.ts";
import { type ConnectorStatusHost, ConnectorStatusHostService } from "../connector-status-host.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ConnectorPage } from "./connector-page.tsx";

afterEach(unmountAll);

const hostList = vi.fn<ConnectorStatusHost["list"]>(async () => [
  { id: "notes", name: "Notes", state: "connected" },
]);
const host: ConnectorStatusHost = {
  list: hostList,
  refusals: async () => [],
  waiting: async () => [],
  subscribe: () => () => {},
};

function props(id: string, openPlace = vi.fn()): ItemViewProps {
  return {
    item: { kind: "connector", hub: "local", id },
    context: {
      services: {
        get: (key: unknown) => (key === ConnectorStatusHostService ? host : undefined),
        find: () => undefined,
      },
      announcer: { announceState: vi.fn() },
      openPlace,
    },
    Sections: () => <p>A section from another feature</p>,
  } as unknown as ItemViewProps;
}

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("ConnectorPage", () => {
  it("shows how the connector connects between its name and its status", async () => {
    hostList.mockResolvedValueOnce([
      {
        id: "notes",
        name: "Notes",
        state: "connected",
        connection: { kind: "http", url: "https://notes.acme.example/mcp", secrets: [] },
      },
    ]);
    const root = render(<ConnectorPage {...props("notes")} />);
    await settled();
    const headings = [...root.querySelectorAll("h2")].map((h) => h.textContent);
    expect(headings).toEqual(["How it connects", "Recent refusals"]);
  });

  it("shows the connector's name as the h1, then its status section", async () => {
    const root = render(<ConnectorPage {...props("notes")} />);
    await settled();
    expect(root.querySelector("h1")?.textContent).toBe("Notes");
    expect(root.querySelector("h2")?.textContent).toBe("Recent refusals");
  });

  it("focuses the title of a connector just made in New connector, and only once", async () => {
    requestConnectorTitleFocus({ hub: "local", id: "notes" });
    const root = render(<ConnectorPage {...props("notes")} />);
    await settled();
    expect(document.activeElement).toBe(root.querySelector("h1"));
  });

  it("draws the sections other features add under the status section", async () => {
    const root = render(<ConnectorPage {...props("notes")} />);
    await settled();
    expect(root.lastElementChild?.lastElementChild?.textContent).toBe(
      "A section from another feature",
    );
  });

  it("says the connector isn't in the workspace when the host doesn't list it", async () => {
    const openPlace = vi.fn();
    const root = render(<ConnectorPage {...props("gone", openPlace)} />);
    await settled();
    expect(root.textContent).toContain("connector");
    expect(root.textContent).not.toContain("Recent refusals");
  });
});
