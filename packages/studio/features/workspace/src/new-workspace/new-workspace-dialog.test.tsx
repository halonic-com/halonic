// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  type CreatedTrust,
  type FolderState,
  NewWorkspaceDialog,
  type NewWorkspaceHost,
} from "./new-workspace-dialog.tsx";
import { createdLine } from "./new-workspace-text.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let container: HTMLElement | undefined;
const proto = HTMLDialogElement.prototype;

beforeEach(() => {
  // jsdom has `<dialog>` but no `showModal()`; opening it is all these tests need.
  Object.assign(proto, {
    showModal(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
    close(this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
  Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

interface Seen {
  created: string[];
  opened: string[];
  trust: CreatedTrust[];
}

async function show(
  options: {
    state?: FolderState;
    create?: NewWorkspaceHost["create"];
    open?: NewWorkspaceHost["open"];
  } = {},
): Promise<Seen> {
  const seen: Seen = { created: [], opened: [], trust: [] };
  const host: NewWorkspaceHost = {
    defaultParent: async () => "~/Documents",
    pickParent: async () => "~/Work",
    folderOf: (parent, name) => `${parent}/${name}`,
    probe: async () => options.state ?? "new",
    create: options.create ?? (async () => ({ kind: "trusted" })),
    ...(options.open === undefined ? {} : { open: options.open }),
  };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root?.render(
      <NewWorkspaceDialog
        host={host}
        onCreated={(folder, _name, trust) => {
          seen.created.push(folder);
          seen.trust.push(trust);
        }}
        onOpen={(folder) => seen.opened.push(folder)}
        onCancel={() => {}}
      />,
    ),
  );
  return seen;
}

function button(name: string): HTMLButtonElement {
  const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
    b.textContent?.startsWith(name),
  );
  if (found === undefined) throw new Error(`No button ${name}`);
  return found;
}

async function type(text: string) {
  const input = document.querySelector<HTMLInputElement>("input");
  if (input === null) throw new Error("No input");
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    set?.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const click = (name: string) => act(async () => button(name).click());

verifies("workspace.new-workspace-dialog", () => {
  it("asks for a name when Create is pressed with Name empty", async () => {
    const seen = await show();
    await click("Create");
    expect(document.body.textContent).toContain("Give it a name.");
    expect(seen.created).toEqual([]);
  });

  it("creates in <parent>/<name> and tells the window", async () => {
    const seen = await show();
    await type("Acme Support");
    expect(document.body.textContent).toContain("~/Documents/Acme Support");
    await click("Create");
    expect(seen.created).toEqual(["~/Documents/Acme Support"]);
  });

  it("reads Create here for a folder with files and Open it for a workspace", async () => {
    const seen = await show({ state: "not-empty" });
    await type("Acme");
    expect(document.body.textContent).toContain("This folder isn't empty.");
    expect(button("Create here")).toBeDefined();
    act(() => root?.unmount());
    container?.remove();
    const second = await show({ state: "workspace" });
    await type("Acme");
    expect(document.body.textContent).toContain("This folder is already a workspace.");
    await click("Open it");
    expect(second.opened).toEqual(["~/Documents/Acme"]);
    expect(seen.created).toEqual([]);
  });

  it("opens the location the shell answers, and stays open when the person says no", async () => {
    const yes = await show({ state: "workspace", open: async (folder) => `${folder}!` });
    await type("Acme");
    await click("Open it");
    expect(yes.opened).toEqual(["~/Documents/Acme!"]);
    act(() => root?.unmount());
    container?.remove();
    const no = await show({ state: "workspace", open: async () => undefined });
    await type("Acme");
    await click("Open it");
    expect(no.opened).toEqual([]);
    expect(button("Open it").disabled).toBe(false);
  });

  it("stays open and writes nothing when the person says no to Create here", async () => {
    const seen = await show({
      state: "not-empty",
      create: async () => ({ kind: "cancelled" }),
    });
    await type("Acme");
    await click("Create here");
    expect(seen.created).toEqual([]);
    expect(button("Create here").disabled).toBe(false);
  });

  it("shows why a write failed under the folder and stays open", async () => {
    const seen = await show({
      create: async () => {
        throw new Error("you don't have permission");
      },
    });
    await type("Acme");
    await click("Create");
    expect(document.body.textContent).toContain(
      "Can't write to this folder: you don't have permission.",
    );
    expect(seen.created).toEqual([]);
  });

  it("words the toast, with the trust failure when the record wasn't saved", () => {
    expect(createdLine("Acme Support")).toBe("Created Acme Support");
    expect(createdLine("Acme Support", "the keychain is locked")).toBe(
      "Created Acme Support. Couldn't save trust: the keychain is locked.",
    );
  });
});
