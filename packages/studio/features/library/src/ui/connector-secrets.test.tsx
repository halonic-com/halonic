// @vitest-environment jsdom
import { workspaceSecretWriter } from "@halonicjs/ports";
import { type ItemViewProps, limitedLookup } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConnectorSecrets } from "../connector-secrets-host.ts";
import { ConnectorSecretsService } from "../connector-secrets-host.ts";
import { type ConnectorStatusHost, ConnectorStatusHostService } from "../connector-status-host.ts";
import { libraryFeature } from "../feature.ts";
import {
  ConnectorCouldntList,
  type ListedToolsHost,
  ListedToolsHostService,
  type ListedToolsSnapshot,
} from "../listed-tools-host.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ConnectorPage } from "./connector-page.tsx";
import { ConnectorSecretsSection } from "./connector-secrets-section.tsx";

afterEach(unmountAll);

// Not a real secret: an invented value the page must never show.
const typedValue = "acme-typed-value-1";

/** A locked keychain, kinded as the shell's `KeychainError` is, so its reason shows. */
function lockedKeychain(): Error {
  return Object.assign(new Error("The keychain is locked."), { kind: "unavailable" });
}

/** The connector Notes, whose program needs the secrets it is given. */
function statusHost(secrets: readonly string[]): ConnectorStatusHost {
  return {
    list: async () => [
      {
        id: "notes",
        name: "Notes",
        state: "connected",
        connection: { kind: "stdio", command: "npx -y @acme/notes-mcp", secrets },
      },
    ],
    refusals: async () => [],
    waiting: async () => [],
    subscribe: () => () => {},
  };
}

/** A keychain in memory, whose calls can be made to fail. */
function keychain(): ConnectorSecrets & {
  readonly values: Map<string, string>;
  failWith?: Error;
} {
  const values = new Map<string, string>();
  const store: ConnectorSecrets & { readonly values: Map<string, string>; failWith?: Error } = {
    values,
    set: async (name, value) => {
      if (store.failWith !== undefined) throw store.failWith;
      values.set(name, value);
    },
    remove: async (name) => {
      if (store.failWith !== undefined) throw store.failWith;
      values.delete(name);
    },
    has: async (name) => values.has(name),
  };
  return store;
}

/** The agent host's connector: it lists one tool once NOTES_TOKEN is in the keychain. */
function toolsReading(store: ConnectorSecrets & { readonly values: Map<string, string> }) {
  const review = vi.fn<ListedToolsHost["review"]>(async () => {
    if (!store.values.has("NOTES_TOKEN")) {
      throw new ConnectorCouldntList({ reason: "secret-missing", secret: "NOTES_TOKEN" });
    }
    return snapshot();
  });
  const host: ListedToolsHost = {
    review,
    approve: async () => ({ approved: [], changed: [] }),
    removeApproval: async () => {},
    subscribe: () => () => {},
  };
  return host;
}

function snapshot(): ListedToolsSnapshot {
  return {
    sourceName: "Notes",
    workspaceName: "Acme",
    toReview: [
      {
        name: "read_note",
        fingerprint: "htl1:read_note-1",
        description: "Reads a note.",
        arguments: [],
        state: "not_approved",
        differences: [],
        serverChanged: false,
        leftOutArguments: [],
        asksBeforeUse: true,
      },
    ],
    keepsChanging: [],
    refused: [],
    approved: [],
    approvedWithoutAsking: [],
    listingRefused: null,
    unreadable: null,
    hasApprovals: false,
  };
}

function page(
  provided: {
    readonly secrets?: ConnectorSecrets;
    readonly tools?: ListedToolsHost;
    readonly names?: readonly string[];
  },
  host?: "phone",
): ItemViewProps {
  const services = new Map<unknown, unknown>([
    [ConnectorStatusHostService, statusHost(provided.names ?? ["NOTES_TOKEN"])],
  ]);
  if (provided.secrets !== undefined) services.set(ConnectorSecretsService, provided.secrets);
  if (provided.tools !== undefined) services.set(ListedToolsHostService, provided.tools);
  return {
    item: { kind: "connector", hub: "local", id: "notes" },
    context: {
      services: limitedLookup(libraryFeature, {
        get: (key: unknown) => services.get(key),
        find: (key: unknown) => services.get(key),
      }),
      announcer: { announceState: vi.fn() },
      host,
    },
    Sections: () => null,
  } as unknown as ItemViewProps;
}

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function entry(root: HTMLElement): HTMLInputElement {
  const input = root.querySelector<HTMLInputElement>('input[type="password"]');
  if (input === null) throw new Error("No secret entry on the page");
  return input;
}

async function typeAndLeave(input: HTMLInputElement, text: string): Promise<void> {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    input.focus();
    setValue?.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => {
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
  await settled();
}

async function press(root: HTMLElement, label: string): Promise<void> {
  const button = [...root.querySelectorAll("button")].find((b) => b.textContent === label);
  if (button === undefined) throw new Error(`No button ${label}`);
  act(() => {
    button.focus();
    button.click();
  });
  await settled();
}

/** A promise the test settles, for a keychain or a listing that answers only when told. */
function answerLater<T>(): {
  readonly promise: Promise<T>;
  readonly answer: (value: T) => void;
  readonly fail: (error: Error) => void;
} {
  let answer: (value: T) => void = () => {};
  let fail: (error: Error) => void = () => {};
  const promise = new Promise<T>((resolve, reject) => {
    answer = resolve;
    fail = reject;
  });
  return { promise, answer, fail };
}

/** The page's text and every entry's value, so a value that leaks anywhere is found. */
function everythingShown(root: HTMLElement): string {
  const values = [...root.querySelectorAll("input")].map((input) => input.value);
  return [root.textContent ?? "", ...values].join("\n");
}

describe("a connector's secrets on its page", () => {
  verifies("library.connector-secrets", () => {
    it("goes from a missing secret to set to listed, with no restart", async () => {
      const store = keychain();
      const tools = toolsReading(store);
      const root = render(<ConnectorPage {...page({ secrets: store, tools })} />);
      await settled();
      expect(root.textContent).toContain(
        "Couldn't list the tools: Notes needs the secret NOTES_TOKEN, which isn't set for Studio. Set it under Secrets, then try again.",
      );
      expect(root.textContent).toContain("Not set");

      await typeAndLeave(entry(root), typedValue);
      expect(store.values.get("NOTES_TOKEN")).toBe(typedValue);
      expect(entry(root).value).toBe("");
      expect(root.textContent).toContain("Set");
      expect(entry(root).placeholder).toBe("Type a new value to replace it");

      await press(root, "Try again");
      expect(root.textContent).toContain("1 tool is off until you review it");
      expect(everythingShown(root)).not.toContain(typedValue);
    });

    it("shows Set for a stored secret without reading its value, and removes it", async () => {
      const store = keychain();
      store.values.set("NOTES_TOKEN", typedValue);
      // A keychain that could also read values: the page must only ask `has`.
      const get = vi.fn();
      const readable = Object.assign(store, { get });
      const root = render(<ConnectorPage {...page({ secrets: readable })} />);
      await settled();
      expect(root.textContent).toContain(
        "Kept in your system keychain, never in files. Notes gives it to the program it starts. Studio uses this one; halonic secret set keeps a separate one for the command line.",
      );
      expect(root.textContent).not.toContain("Not set");
      expect(get).not.toHaveBeenCalled();

      await press(root, "Remove");
      expect(store.values.has("NOTES_TOKEN")).toBe(false);
      expect(root.textContent).toContain("Not set");
    });

    it("keeps Set when you save while a later check is still out (HAL-15130)", async () => {
      const store = keychain();
      // A slow keychain: `has` reads when asked, but answers only once the test lets it.
      const pending: (() => void)[] = [];
      const slow: ConnectorSecrets = {
        ...store,
        has: (name) => {
          const stored = store.values.has(name);
          return new Promise((resolve) => pending.push(() => resolve(stored)));
        },
      };
      // The section shows once the first check has answered; a new keychain for the same names
      // reads them again while it stays on screen.
      const container = document.createElement("div");
      document.body.append(container);
      const root = createRoot(container);
      const section = (secrets: ConnectorSecrets) => (
        <ConnectorSecretsSection
          secrets={secrets}
          names={["NOTES_TOKEN"]}
          sourceName="Notes"
          kind="stdio"
        />
      );
      try {
        act(() => root.render(section(store)));
        await settled();
        act(() => root.render(section(slow)));
        await settled();

        await typeAndLeave(entry(container), typedValue);
        expect(store.values.get("NOTES_TOKEN")).toBe(typedValue);
        expect(pending).toHaveLength(1);
        for (const answer of pending) answer();
        await settled();

        expect(container.textContent).not.toContain("Not set");
        expect(entry(container).placeholder).toBe("Type a new value to replace it");
      } finally {
        act(() => root.unmount());
        container.remove();
      }
    });

    it("says why a save failed, keeps the one saved before, and lets go of the value", async () => {
      const store = keychain();
      store.values.set("NOTES_TOKEN", "acme-earlier-value");
      store.failWith = lockedKeychain();
      const root = render(<ConnectorPage {...page({ secrets: store })} />);
      await settled();

      await typeAndLeave(entry(root), typedValue);
      expect(root.textContent).toContain(
        "Couldn't save the secret: the keychain is locked. The one you saved before is still in use.",
      );
      // Not even masked in the entry (C552 finding 6).
      expect(everythingShown(root)).not.toContain(typedValue);
      expect(store.values.get("NOTES_TOKEN")).toBe("acme-earlier-value");
    });

    it("lists the secret once, in the Secrets section, not again under How it connects", async () => {
      const root = render(<ConnectorPage {...page({ secrets: keychain() })} />);
      await settled();
      const rows = [...root.querySelectorAll("dl dt")].map((label) => label.textContent);
      expect(rows).not.toContain("Secrets");
      expect(root.querySelectorAll('input[type="password"]')).toHaveLength(1);
    });

    it("says why a remove failed, after a colon", async () => {
      const store = keychain();
      store.values.set("NOTES_TOKEN", "acme-earlier-value");
      const root = render(<ConnectorPage {...page({ secrets: store })} />);
      await settled();
      store.failWith = lockedKeychain();

      await press(root, "Remove");
      expect(root.textContent).toContain("Couldn't remove the secret: the keychain is locked.");
      expect(store.values.get("NOTES_TOKEN")).toBe("acme-earlier-value");
    });

    it.each([
      ["serve-password", "Halonic"],
      ["plugin__weather__key", "a plugin"],
    ])(
      "refuses %s, says whose it is and to rename it in the file, and empties the entry",
      async (name, owner) => {
        const store = keychain();
        const set = vi.spyOn(store, "set");
        const root = render(
          <ConnectorPage {...page({ secrets: workspaceSecretWriter(store), names: [name] })} />,
        );
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        await settled();
        error.mockRestore();

        await typeAndLeave(entry(root), typedValue);
        expect(root.textContent).toContain(
          `Couldn't save the secret: a workspace can't pick a secret that belongs to ${owner}. Give it another name in the connector's file.`,
        );
        expect(set).not.toHaveBeenCalled();
        expect(everythingShown(root)).not.toContain(typedValue);
      },
    );

    it("says Can't check when the keychain can't say", async () => {
      const store = keychain();
      const root = render(
        <ConnectorPage
          {...page({
            secrets: {
              ...store,
              has: async () => {
                throw lockedKeychain();
              },
            },
          })}
        />,
      );
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      await settled();
      expect(root.textContent).toContain("Can't check");
      error.mockRestore();
    });

    it("asks to set the right one under Secrets when the server refused one of several", async () => {
      const store = keychain();
      const tools: ListedToolsHost = {
        ...toolsReading(store),
        review: async () => {
          throw new ConnectorCouldntList({
            reason: "secret-refused",
            secrets: ["NOTES_TOKEN", "NOTES_SPACE"],
          });
        },
      };
      const root = render(
        <ConnectorPage
          {...page({ secrets: store, tools, names: ["NOTES_TOKEN", "NOTES_SPACE"] })}
        />,
      );
      await settled();
      expect(root.textContent).toContain(
        "didn't accept one of its secrets, NOTES_TOKEN or NOTES_SPACE. Set the right one under Secrets, then try again.",
      );
      expect(root.querySelectorAll('input[type="password"]')).toHaveLength(2);
    });

    it("has no Secrets section without a store, and keeps the line that says so", async () => {
      const tools = toolsReading(keychain());
      const root = render(<ConnectorPage {...page({ tools })} />);
      await settled();
      const headings = [...root.querySelectorAll("h2")].map((heading) => heading.textContent);
      expect(headings).not.toContain("Secrets");
      expect(root.querySelector('input[type="password"]')).toBeNull();
      expect(root.textContent).toContain("Studio can't set a connector's secrets yet.");
    });

    it("has no Secrets section on a phone", async () => {
      const store = keychain();
      const root = render(<ConnectorPage {...page({ secrets: store }, "phone")} />);
      await settled();
      expect(root.querySelector('input[type="password"]')).toBeNull();
    });
  });
});

describe("a connector's secrets keep focus and wait for the keychain", () => {
  verifies("library.connector-secrets-focus", () => {
    it("shows nothing until a slow keychain answers, then Set, never Not set first", async () => {
      const store = keychain();
      store.values.set("NOTES_TOKEN", typedValue);
      const has = answerLater<boolean>();
      const root = render(
        <ConnectorPage {...page({ secrets: { ...store, has: () => has.promise } })} />,
      );
      await settled();
      expect(root.querySelector('input[type="password"]')).toBeNull();
      expect(root.textContent).not.toContain("Not set");

      has.answer(true);
      await settled();
      expect(entry(root).placeholder).toBe("Type a new value to replace it");
      expect(root.textContent).toContain("Set");
      expect(root.textContent).not.toContain("Not set");
    });

    it("moves focus to the entry after Remove, and keeps it on Remove when it fails", async () => {
      const store = keychain();
      store.values.set("NOTES_TOKEN", typedValue);
      const root = render(<ConnectorPage {...page({ secrets: store })} />);
      await settled();

      store.failWith = lockedKeychain();
      await press(root, "Remove");
      expect(document.activeElement?.textContent).toBe("Remove");
      expect(root.textContent).toContain("Couldn't remove the secret: the keychain is locked.");

      delete store.failWith;
      await press(root, "Remove");
      expect(store.values.has("NOTES_TOKEN")).toBe(false);
      expect(document.activeElement).toBe(entry(root));
      expect(root.textContent).toContain("Not set");
    });

    it("keeps Try again busy while it lists, then focuses the line that replaced it", async () => {
      const store = keychain();
      const listing = answerLater<ListedToolsSnapshot>();
      const review = vi
        .fn<ListedToolsHost["review"]>()
        .mockRejectedValueOnce(
          new ConnectorCouldntList({ reason: "secret-missing", secret: "NOTES_TOKEN" }),
        )
        .mockReturnValueOnce(listing.promise);
      const tools = { ...toolsReading(store), review };
      const root = render(<ConnectorPage {...page({ secrets: store, tools })} />);
      await settled();
      await typeAndLeave(entry(root), typedValue);

      await press(root, "Try again");
      const tryAgain = document.activeElement;
      expect(tryAgain?.textContent).toBe("Try again");
      expect(tryAgain?.getAttribute("aria-busy")).toBe("true");

      listing.answer(snapshot());
      await settled();
      expect(document.activeElement?.tagName).toBe("P");
      expect(document.activeElement?.textContent).toBe("1 tool is off until you review it");
    });

    it("focuses the new failure line when Try again fails again", async () => {
      const store = keychain();
      const tools = toolsReading(store);
      const root = render(<ConnectorPage {...page({ secrets: store, tools })} />);
      await settled();

      await press(root, "Try again");
      expect(document.activeElement?.tagName).toBe("P");
      expect(document.activeElement?.textContent).toContain("Couldn't list the tools");
    });
  });
});
