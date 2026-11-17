// @vitest-environment jsdom
import { type ItemViewProps, limitedLookup } from "@halonicjs/studio-shell";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requestConnectorTitleFocus } from "../connector-focus-request.ts";
import { type ConnectorStatusHost, ConnectorStatusHostService } from "../connector-status-host.ts";
import { libraryFeature } from "../feature.ts";
import { asksFirstWords, connectorToolsWords } from "../new-connector-words.ts";
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
      services: limitedLookup(libraryFeature, {
        get: (key: unknown) => (key === ConnectorStatusHostService ? host : undefined),
        find: () => undefined,
      }),
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

  it.each([
    [
      "an MCP server over HTTP",
      { kind: "http", url: "https://notes.acme.example/mcp", secrets: [] },
      "every-tool",
    ],
    [
      "a local program",
      { kind: "stdio", command: "npx -y @acme/files-mcp", secrets: [] },
      "every-tool",
    ],
    ["Gmail and Google Drive", { kind: "google", account: "fin@acme.example" }, "changes"],
  ] as const)("says what asks first for %s", async (_way, connection, asks) => {
    hostList.mockResolvedValueOnce([
      { id: "notes", name: "Notes", state: "connected", connection, asks },
    ]);
    const root = render(<ConnectorPage {...props("notes")} />);
    await settled();
    expect(root.textContent).toContain(
      asks === "every-tool" ? connectorToolsWords.line : asksFirstWords[asks],
    );
  });

  it("offers a quiet link to the file under the tools line of an every-tool connector (11.4)", async () => {
    hostList.mockResolvedValueOnce([
      {
        id: "notes",
        name: "Notes",
        state: "connected",
        connection: { kind: "http", url: "https://notes.acme.example/mcp", secrets: [] },
        asks: "every-tool",
      },
    ]);
    const openItem = vi.fn();
    const page = props("notes");
    const root = render(
      <ConnectorPage {...page} context={{ ...page.context, openItem } as typeof page.context} />,
    );
    await settled();
    const link = [...root.querySelectorAll("button")].find(
      (each) => each.textContent === connectorToolsWords.changeInFile,
    );
    await act(async () => link?.click());
    expect(openItem).toHaveBeenCalledWith({
      kind: "file",
      hub: "workspace",
      id: expect.stringContaining("notes"),
    });
  });

  it("says nothing about asking first when the file doesn't say it", async () => {
    const root = render(<ConnectorPage {...props("notes")} />);
    await settled();
    expect(root.textContent).not.toContain("ask a person first");
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
