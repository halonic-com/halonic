// @vitest-environment jsdom
import { type ItemViewProps, limitedLookup } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConnectorSecrets } from "../connector-secrets-host.ts";
import { ConnectorSecretsService } from "../connector-secrets-host.ts";
import { type ConnectorStatusHost, ConnectorStatusHostService } from "../connector-status-host.ts";
import { libraryFeature } from "../feature.ts";
import {
  type ListedToolsHost,
  ListedToolsHostService,
  type ListedToolsSnapshot,
  WorkspaceNotTrusted,
} from "../listed-tools-host.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ConnectorPage } from "./connector-page.tsx";

afterEach(unmountAll);

// Not a real secret: an invented value the page must never show.
const typedValue = "acme-typed-value-2";

/** The connector Notes, whose program needs NOTES_TOKEN. */
const statusHost: ConnectorStatusHost = {
  list: async () => [
    {
      id: "notes",
      name: "Notes",
      state: "connected",
      connection: { kind: "stdio", command: "npx -y @acme/notes-mcp", secrets: ["NOTES_TOKEN"] },
    },
  ],
  refusals: async () => [],
  waiting: async () => [],
  subscribe: () => () => {},
};

/** One tool, read_note, waiting for approval. */
function snapshot(): ListedToolsSnapshot {
  const readNote = {
    name: "read_note",
    fingerprint: "htl1:read_note-1",
    description: "Reads a note.",
    arguments: [],
    state: "not_approved" as const,
    differences: [],
    serverChanged: false,
    leftOutArguments: [],
    asksBeforeUse: true,
  };
  return {
    sourceName: "Notes",
    workspaceName: "Acme",
    toReview: [readNote],
    keepsChanging: [],
    refused: [],
    approved: [],
    approvedWithoutAsking: [],
    listingRefused: null,
    unreadable: null,
    hasApprovals: false,
  };
}

/** A workspace that isn't trusted until the trust check gives `answer`. */
function untrustedTools(answer: "trusted" | "declined") {
  let trusted = false;
  const review = vi.fn<ListedToolsHost["review"]>(async () => {
    if (!trusted) throw new WorkspaceNotTrusted();
    return snapshot();
  });
  const askTrust = vi.fn(async () => {
    trusted = answer === "trusted";
    return answer;
  });
  const host: ListedToolsHost = {
    review,
    approve: async () => ({ approved: [], changed: [] }),
    removeApproval: async () => {},
    subscribe: () => () => {},
    askTrust,
  };
  return { host, review, askTrust };
}

/** A keychain in memory. */
function keychain(): ConnectorSecrets & { readonly values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    set: async (name, value) => {
      values.set(name, value);
    },
    remove: async (name) => {
      values.delete(name);
    },
    has: async (name) => values.has(name),
  };
}

function page(provided: {
  readonly tools?: ListedToolsHost;
  readonly secrets?: ConnectorSecrets;
}): ItemViewProps {
  const services = new Map<unknown, unknown>([[ConnectorStatusHostService, statusHost]]);
  if (provided.tools !== undefined) services.set(ListedToolsHostService, provided.tools);
  if (provided.secrets !== undefined) services.set(ConnectorSecretsService, provided.secrets);
  return {
    item: { kind: "connector", hub: "local", id: "notes" },
    context: {
      services: limitedLookup(libraryFeature, {
        get: (key: unknown) => services.get(key),
        find: (key: unknown) => services.get(key),
      }),
      announcer: { announceState: vi.fn() },
    },
    Sections: () => null,
  } as unknown as ItemViewProps;
}

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function button(root: HTMLElement, label: string): HTMLButtonElement | undefined {
  return [...root.querySelectorAll("button")].find((candidate) => candidate.textContent === label);
}

function entry(root: HTMLElement): HTMLInputElement {
  const input = root.querySelector<HTMLInputElement>('input[type="password"]');
  if (input === null) throw new Error("No secret entry on the page");
  return input;
}

function type(input: HTMLInputElement, text: string): void {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    input.focus();
    setValue?.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** A key pressed in `input`, then, for Tab, focus leaving it, as the browser moves it on. */
async function pressKey(input: HTMLInputElement, key: string, shiftKey = false): Promise<void> {
  act(() => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true }));
  });
  if (key === "Tab") act(() => input.blur());
  await settled();
}

describe("a connector's page with only the keyboard", () => {
  verifies("library.connector-page-keyboard", () => {
    it("trusts the workspace from Review over the page and puts focus on the tools line", async () => {
      const { host, review, askTrust } = untrustedTools("trusted");
      const root = render(<ConnectorPage {...page({ tools: host })} />);
      await settled();
      expect(root.textContent).toContain("this workspace isn't trusted yet");

      act(() => button(root, "Review")?.click());
      await settled();

      expect(askTrust).toHaveBeenCalledOnce();
      expect(review).toHaveBeenCalledTimes(2);
      expect(root.textContent).toContain("1 tool is waiting for your approval");
      expect(document.activeElement?.textContent).toBe("1 tool is waiting for your approval");
    });

    it("leaves the line as it was on Not now", async () => {
      const { host, review } = untrustedTools("declined");
      const root = render(<ConnectorPage {...page({ tools: host })} />);
      await settled();

      act(() => button(root, "Review")?.click());
      await settled();

      expect(review).toHaveBeenCalledOnce();
      expect(root.textContent).toContain("this workspace isn't trusted yet");
    });

    it("saves on Enter and keeps focus in the entry", async () => {
      const store = keychain();
      const root = render(<ConnectorPage {...page({ secrets: store })} />);
      await settled();

      type(entry(root), typedValue);
      await pressKey(entry(root), "Enter");

      expect(store.values.get("NOTES_TOKEN")).toBe(typedValue);
      expect(root.textContent).toContain("Set");
      expect(document.activeElement).toBe(entry(root));
    });

    it("puts focus on Remove after Tab saves a secret that wasn't set", async () => {
      const store = keychain();
      const root = render(<ConnectorPage {...page({ secrets: store })} />);
      await settled();

      type(entry(root), typedValue);
      await pressKey(entry(root), "Tab");

      expect(store.values.get("NOTES_TOKEN")).toBe(typedValue);
      expect(document.activeElement).toBe(button(root, "Remove"));
    });

    it("leaves focus where Shift+Tab sent it", async () => {
      const store = keychain();
      const root = render(<ConnectorPage {...page({ secrets: store })} />);
      await settled();

      type(entry(root), typedValue);
      await pressKey(entry(root), "Tab", true);

      expect(store.values.get("NOTES_TOKEN")).toBe(typedValue);
      expect(document.activeElement).not.toBe(button(root, "Remove"));
    });
  });
});
