// @vitest-environment jsdom
import { PresentationProvider } from "@halonicjs/studio-kit";
import { EngineNotAnswering, type ItemViewProps, limitedLookup } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ConnectorStatusHost, ConnectorStatusHostService } from "../connector-status-host.ts";
import { libraryFeature } from "../feature.ts";
import {
  ConnectorCouldntList,
  type ListedToolRow,
  type ListedToolsHost,
  ListedToolsHostService,
  type ListedToolsSnapshot,
  WorkspaceNotTrusted,
} from "../listed-tools-host.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ConnectorPage } from "./connector-page.tsx";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
  statusList.mockReset();
  statusList.mockResolvedValue([{ id: "notes", name: "Notes", state: "connected" }]);
});

const statusList = vi.fn<ConnectorStatusHost["list"]>(async () => [
  { id: "notes", name: "Notes", state: "connected" },
]);
const statusHost: ConnectorStatusHost = {
  list: statusList,
  refusals: async () => [],
  waiting: async () => [],
  subscribe: () => () => {},
};

/** The connector `notes-mcp`, an MCP server over HTTP. */
function httpServer(): void {
  statusList.mockResolvedValue([
    {
      id: "notes-mcp",
      name: "Notes",
      state: "connected",
      connection: { kind: "http", url: "https://notes.acme.example/mcp", secrets: [] },
    },
  ]);
}

function tool(name: string): ListedToolRow {
  return {
    name,
    fingerprint: `htl1:${name}-1`,
    description: `Does ${name}.`,
    arguments: [],
    state: "not_approved",
    differences: [],
    serverChanged: false,
    leftOutArguments: [],
    asksBeforeUse: true,
  };
}

function snapshot(waiting: readonly string[]): ListedToolsSnapshot {
  return {
    sourceName: "Notes",
    workspaceName: "Acme",
    toReview: waiting.map(tool),
    keepsChanging: [],
    refused: [],
    approved: [],
    approvedWithoutAsking: [],
    listingRefused: null,
    unreadable: null,
    hasApprovals: false,
  };
}

function toolsHost(read: ListedToolsHost["review"]): ListedToolsHost {
  return {
    review: read,
    approve: async () => ({ approved: [], changed: [] }),
    removeApproval: async () => {},
    subscribe: () => () => {},
  };
}

function page(
  tools: ListedToolsHost | undefined,
  options: {
    readonly id?: string;
    readonly host?: "phone";
    readonly runCommand?: (id: string) => boolean;
  } = {},
): ItemViewProps {
  const { id = "notes", host, runCommand } = options;
  const provided = new Map<unknown, unknown>([[ConnectorStatusHostService, statusHost]]);
  if (tools !== undefined) provided.set(ListedToolsHostService, tools);
  return {
    item: { kind: "connector", hub: "local", id },
    context: {
      services: limitedLookup(libraryFeature, {
        get: (key: unknown) => provided.get(key),
        find: (key: unknown) => provided.get(key),
      }),
      announcer: { announceState: vi.fn() },
      host,
      ...(runCommand === undefined ? {} : { runCommand }),
    },
    Sections: () => null,
  } as unknown as ItemViewProps;
}

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function reviewButton(root: HTMLElement): HTMLButtonElement | undefined {
  return [...root.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === "Review tools",
  );
}

describe("the connector page's listed tools", () => {
  verifies("library.listed-tools-waiting", () => {
    it("says how many tools wait and opens the review from Review tools", async () => {
      const root = render(
        <ConnectorPage {...page(toolsHost(async () => snapshot(["read_note", "write_note"])))} />,
      );
      await settled();
      expect(root.textContent).toContain("2 tools are waiting for your approval");
      expect(root.querySelector("dialog[open]")).toBeNull();

      act(() => reviewButton(root)?.click());
      await settled();
      expect(root.querySelector("dialog[open]")?.textContent).toContain(
        "Review the tools from Notes",
      );
    });

    it("says approving is for the computer, with no button, on a phone", async () => {
      const root = render(
        <ConnectorPage
          {...page(
            toolsHost(async () => snapshot(["read_note"])),
            { host: "phone" },
          )}
        />,
      );
      await settled();
      expect(root.textContent).toContain("1 tool is waiting for your approval");
      expect(root.textContent).toContain(
        "View only here. Review the tools on the computer running Halonic.",
      );
      expect(reviewButton(root)).toBeUndefined();
    });

    it("shows no line and no button when no tool waits", async () => {
      const root = render(<ConnectorPage {...page(toolsHost(async () => snapshot([])))} />);
      await settled();
      expect(root.textContent).not.toContain("waiting for your approval");
      expect(reviewButton(root)).toBeUndefined();
    });

    it("says the tools couldn't be read and offers Try again", async () => {
      let fail = true;
      const root = render(
        <ConnectorPage
          {...page(
            toolsHost(async () => {
              if (fail) throw new Error("server down");
              return snapshot(["read_note"]);
            }),
          )}
        />,
      );
      await settled();
      expect(root.textContent).toContain("Couldn't list the tools");
      expect(reviewButton(root)).toBeUndefined();

      fail = false;
      const retry = [...root.querySelectorAll("button")].find((b) => b.textContent === "Try again");
      act(() => retry?.click());
      await settled();
      expect(root.textContent).toContain("1 tool is waiting for your approval");
    });

    it("offers Review, which opens the trust check, when the workspace isn't trusted", async () => {
      const runCommand = vi.fn(() => true);
      const root = render(
        <ConnectorPage
          {...page(
            toolsHost(async () => {
              throw new WorkspaceNotTrusted();
            }),
            { runCommand },
          )}
        />,
      );
      await settled();
      expect(root.textContent).toContain(
        "Couldn't list the tools: this workspace isn't trusted yet, so nothing was started.",
      );
      const buttons = [...root.querySelectorAll("button")].map((b) => b.textContent);
      expect(buttons).not.toContain("Try again");

      const review = [...root.querySelectorAll("button")].find((b) => b.textContent === "Review");
      act(() => review?.click());
      expect(runCommand).toHaveBeenCalledWith("workspace.open-trust");
    });

    it("says which secret isn't set, with the command that sets it and Try again", async () => {
      const root = render(
        <ConnectorPage
          {...page(
            toolsHost(async () => {
              throw new ConnectorCouldntList({ reason: "secret-missing", secret: "NOTES_TOKEN" });
            }),
          )}
        />,
      );
      await settled();
      expect(root.textContent).toContain(
        "Couldn't list the tools: Notes needs the secret NOTES_TOKEN, which isn't set on this computer. Set it in a terminal, then try again:",
      );
      expect(root.textContent).toContain("halonic secret set NOTES_TOKEN");
      const buttons = [...root.querySelectorAll("button")].map((b) => b.textContent);
      expect(buttons).toContain("Try again");
      expect(buttons).not.toContain("Copy details");
    });

    it("says the program stopped, with Try again and Copy details", async () => {
      const root = render(
        <ConnectorPage
          {...page(
            toolsHost(async () => {
              throw new ConnectorCouldntList({ reason: "stopped" });
            }),
          )}
        />,
      );
      await settled();
      expect(root.textContent).toContain(
        "Couldn't list the tools: Notes stopped before it answered.",
      );
      const buttons = [...root.querySelectorAll("button")].map((b) => b.textContent);
      expect(buttons).toEqual(expect.arrayContaining(["Try again", "Copy details"]));
    });

    it("says the engine isn't answering when the agent host isn't running", async () => {
      const root = render(
        <ConnectorPage
          {...page(
            toolsHost(async () => {
              throw new EngineNotAnswering();
            }),
          )}
        />,
      );
      await settled();
      expect(root.textContent).toContain(
        "Couldn't list the tools: the engine isn't answering. It may still be starting.",
      );
      const buttons = [...root.querySelectorAll("button")].map((b) => b.textContent);
      expect(buttons).toContain("Try again");
    });

    it("says a refused list or an unreadable approval has no rows, with Review tools", async () => {
      const refused: ListedToolsSnapshot = { ...snapshot([]), listingRefused: "too many tools" };
      const unreadable: ListedToolsSnapshot = { ...snapshot([]), unreadable: {} };
      for (const [read, text] of [
        [refused, "Couldn't use this server's tool list"],
        [unreadable, "Couldn't read an approval"],
      ] as const) {
        const root = render(<ConnectorPage {...page(toolsHost(async () => read))} />);
        await settled();
        expect(root.textContent).toContain(text);
        act(() => reviewButton(root)?.click());
        await settled();
        expect(root.querySelector("dialog[open]")).not.toBeNull();
        unmountAll();
      }
    });

    it("gives the command for an MCP server over HTTP, without reading its tools", async () => {
      httpServer();
      const review = vi.fn<ListedToolsHost["review"]>(async () => snapshot(["read_note"]));
      const root = render(<ConnectorPage {...page(toolsHost(review), { id: "notes-mcp" })} />);
      await settled();
      expect(root.textContent).toContain(
        "Studio can't list this server's tools yet. To review them, run this in a terminal:",
      );
      expect(root.textContent).toContain("halonic tools review notes-mcp");
      expect(root.textContent).not.toContain("Couldn't list the tools");
      expect(root.querySelector('button[aria-label="Copy command"]')).not.toBeNull();
      const labels = [...root.querySelectorAll("button")].map((b) => b.textContent);
      expect(labels).not.toContain("Try again");
      expect(reviewButton(root)).toBeUndefined();
      expect(review).not.toHaveBeenCalled();
    });

    it("says on your computer on a phone", async () => {
      httpServer();
      const root = render(
        <PresentationProvider presentation="phone">
          <ConnectorPage
            {...page(
              toolsHost(async () => snapshot([])),
              { id: "notes-mcp", host: "phone" },
            )}
          />
        </PresentationProvider>,
      );
      await settled();
      expect(root.textContent).toContain(
        "Studio can't list this server's tools yet. To review them, run this on your computer:",
      );
      expect(root.textContent).toContain("halonic tools review notes-mcp");
    });

    it("shows neither without a listed-tools service", async () => {
      const root = render(<ConnectorPage {...page(undefined)} />);
      await settled();
      expect(root.textContent).not.toContain("waiting for your approval");
      expect(reviewButton(root)).toBeUndefined();
    });
  });
});
