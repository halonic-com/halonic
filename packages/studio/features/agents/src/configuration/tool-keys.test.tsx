// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import type { SecretText } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { AgentsHost, ConnectorKeys } from "../api.ts";
import { memoryAgentsHost } from "../memory-host.ts";
import { AgentScreen } from "../page/agent-page.tsx";
import {
  buttonNamed,
  installFakePopover,
  openDialogsInJsdom,
  show,
  typeInto,
  unmount,
} from "../test-support.tsx";

let restorePopover: () => void = () => undefined;
beforeEach(() => {
  restorePopover = installFakePopover();
  openDialogsInJsdom();
});
afterEach(() => {
  unmount();
  restorePopover();
});

const ref = { hubId: "support", id: "mail-triage" };
const oldKey = "acme-test-key-1";

/** A key store that keeps its keys in memory and can be told to refuse. */
function keyStore(stored: Record<string, string> = { "acme-mail-token": oldKey }) {
  const keys = { ...stored };
  let refusal: string | undefined;
  const store: ConnectorKeys = {
    stored: async (name) => name in keys,
    change: async (name: string, key: SecretText) => {
      if (refusal !== undefined) throw new KindedError("unavailable", refusal);
      keys[name] = key.reveal();
    },
  };
  return { store, keys, refuse: (reason: string) => (refusal = reason) };
}

function host(connectorKeys?: ConnectorKeys): AgentsHost {
  const memory = memoryAgentsHost({
    hubs: [{ id: "support", name: "Support" }],
    agents: [{ ...ref, name: "Mail triage", connectors: ["acme-mail"], skills: ["tone"] }],
    toolOptions: {
      skills: [{ id: "tone", name: "Friendly tone" }],
      connectors: [
        { id: "acme-mail", name: "Acme mail", toolsWithoutAsking: 0, secrets: ["acme-mail-token"] },
        { id: "acme-files", name: "Acme files", toolsWithoutAsking: 1 },
        { id: "acme-code", name: "Acme code", toolsWithoutAsking: 0, secrets: ["GITHUB_TOKEN"] },
      ],
    },
  });
  return connectorKeys === undefined ? memory : { ...memory, connectorKeys };
}

async function openTools(agents: AgentsHost) {
  const page = await show(<AgentScreen host={agents} hubId={ref.hubId} id={ref.id} />);
  await act(async () => buttonNamed(page, "Configuration")?.click());
  await act(async () =>
    [...page.querySelectorAll<HTMLElement>("[role=tab]")]
      .find((tab) => tab.textContent?.startsWith("Tools"))
      ?.click(),
  );
  return page;
}

const connectorsOf = (page: HTMLElement) =>
  [...page.querySelectorAll("section")].find(
    (section) => section.querySelector("h2")?.textContent === "Connectors",
  ) as HTMLElement;

/** The approval hand's first stroke, which no other icon draws. */
const handPath = 'path[d^="M8 14.5V6"]';

const question = () => document.querySelector("dialog[open]") as HTMLElement | null;

async function pressChangeKey(page: HTMLElement) {
  await act(async () => buttonNamed(connectorsOf(page), "Change key")?.click());
}

verifies("agents.configuration.tool-keys", () => {
  it("shows the connector's secret by its name, never its value", async () => {
    const { store } = keyStore();
    const page = await openTools(host(store));
    const connectors = connectorsOf(page);
    expect(connectors.textContent).toContain("Acme mail uses the key acme-mail-token. Change key");
    expect(page.textContent).not.toContain(oldKey);
    const button = buttonNamed(connectors, "Change key") as HTMLElement;
    const line = document.getElementById(button.getAttribute("aria-describedby") ?? "");
    expect(line?.textContent).toBe("Acme mail uses the key acme-mail-token.");
  });

  it("asks with flow 5.2's question before it stores the new key", async () => {
    const { store, keys } = keyStore();
    const page = await openTools(host(store));
    await pressChangeKey(page);

    const dialog = question() as HTMLElement;
    expect(dialog.textContent).toContain("Change acme-mail-token?");
    expect(dialog.textContent).toContain(
      "Every agent that uses it switches to the new key right away.",
    );
    expect(buttonNamed(dialog, "Cancel")).toBeDefined();
    expect(keys["acme-mail-token"]).toBe(oldKey);

    const field = dialog.querySelector<HTMLInputElement>('input[type="password"]');
    await typeInto(field as HTMLInputElement, "acme-test-key-2");
    expect(keys["acme-mail-token"]).toBe(oldKey);
    await act(async () => buttonNamed(dialog, "Change key")?.click());

    expect(keys["acme-mail-token"]).toBe("acme-test-key-2");
    expect(question()).toBeNull();
    expect(connectorsOf(page).querySelector("[role=status]")?.textContent).toBe(
      "Saved key for Acme mail",
    );
    expect(page.textContent).not.toContain("acme-test-key-2");
  });

  it("keeps the old key on Cancel, and asks for a key when the field is empty", async () => {
    const { store, keys } = keyStore();
    const page = await openTools(host(store));
    await pressChangeKey(page);
    await act(async () => buttonNamed(question() as HTMLElement, "Change key")?.click());
    expect(question()?.textContent).toContain("Paste the key first.");

    await act(async () => buttonNamed(question() as HTMLElement, "Cancel")?.click());
    expect(question()).toBeNull();
    expect(keys["acme-mail-token"]).toBe(oldKey);
  });

  it("keeps the question open when the store refuses, without the key in the reason", async () => {
    const { store, keys, refuse } = keyStore();
    refuse("The keychain is locked for acme-test-key-2.");
    const page = await openTools(host(store));
    await pressChangeKey(page);
    const dialog = question() as HTMLElement;
    await typeInto(
      dialog.querySelector<HTMLInputElement>('input[type="password"]') as HTMLInputElement,
      "acme-test-key-2",
    );
    await act(async () => buttonNamed(dialog, "Change key")?.click());
    // The refusal settles first; the Dialog's alert slot then fills a frame later.
    await act(async () => {});
    await act(async () => new Promise(requestAnimationFrame));

    expect(question()?.textContent).toContain(
      "Couldn't save the key: The keychain is locked for . Your old key is still in use.",
    );
    expect(keys["acme-mail-token"]).toBe(oldKey);
  });

  it("names each connector's Change key by its key, starting with the words it shows", async () => {
    const { store } = keyStore({ "acme-mail-token": oldKey, GITHUB_TOKEN: "acme-test-key-3" });
    const memory = host(store);
    await memory.update(ref, { connectors: ["acme-mail", "acme-code"] });
    const page = await openTools(memory);
    // Each button by its role and its name, as a screen reader's list of buttons has them.
    const buttons = [
      ...connectorsOf(page).querySelectorAll<HTMLElement>("button, [role=button]"),
    ].filter((each) => each.getAttribute("aria-label")?.startsWith("Change key"));
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Change key: acme-mail-token",
      "Change key: GITHUB_TOKEN",
    ]);
    const button = buttons.find(
      (each) => each.getAttribute("aria-label") === "Change key: GITHUB_TOKEN",
    ) as HTMLElement;
    expect(button.textContent).toBe("Change key");
    const line = document.getElementById(button.getAttribute("aria-describedby") ?? "");
    expect(line?.textContent).toBe("Acme code uses the key GITHUB_TOKEN.");
  });

  it("has no Change key when no key is stored, or keys can't be changed here", async () => {
    const empty = await openTools(host(keyStore({}).store));
    expect(connectorsOf(empty).textContent).toContain("Acme mail uses the key acme-mail-token.");
    expect(buttonNamed(connectorsOf(empty), "Change key")).toBeUndefined();
    unmount();

    const without = await openTools(host());
    expect(connectorsOf(without).textContent).toContain("Acme mail uses the key acme-mail-token.");
    expect(buttonNamed(connectorsOf(without), "Change key")).toBeUndefined();
  });
});

verifies("agents.configuration.tool-asks-first", () => {
  it("shows the approval hand on a connector whose tools ask first", async () => {
    const page = await openTools(host());
    const chip = connectorsOf(page).querySelector("li") as HTMLElement;
    expect(chip.textContent).toBe("Acme mailEvery tool asks first");
    expect(chip.querySelector(handPath)).not.toBeNull();
    expect(chip.querySelector('[aria-label="Remove Acme mail"]')).not.toBeNull();
  });

  it("names the read-only tools that don't ask, and shows no hand on a skill", async () => {
    const memory = host();
    await memory.update(ref, { connectors: ["acme-files"] });
    const page = await openTools(memory);
    expect(connectorsOf(page).querySelector("li")?.textContent).toBe(
      "Acme filesAsks first, except 1 read-only tool",
    );
    const skills = [...page.querySelectorAll("section")].find(
      (section) => section.querySelector("h2")?.textContent === "Skills",
    );
    expect(skills?.querySelector(handPath)).toBeNull();
    expect(skills?.querySelector("li")?.textContent).toBe("Friendly tone");
  });
});
