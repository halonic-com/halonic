// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  type CreatedTrust,
  type FolderState,
  NewWorkspaceDialog,
  type NewWorkspaceHost,
  NewWorkspaceRefusal,
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
    defaultParent?: NewWorkspaceHost["defaultParent"];
    announced?: string[];
  } = {},
): Promise<Seen> {
  const seen: Seen = { created: [], opened: [], trust: [] };
  const host: NewWorkspaceHost = {
    defaultParent: options.defaultParent ?? (async () => "~/Documents"),
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
        announce={(line) => options.announced?.push(line)}
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

  it("says a new folder starts with a Default hub and the built-in test model", async () => {
    await show();
    await type("Acme Support");
    expect(document.body.textContent).toContain(
      "Starts local only, with a Default hub and the built-in test model, which needs no key and sends nothing.",
    );
    expect(document.body.textContent).not.toContain("Ollama");
  });

  it("keeps Name where it is: the box sits at the top and the note reserves 3 lines", async () => {
    await show({ state: "not-empty" });
    await type("Quarterly Review of Escalations and Refunds");
    const dialog = document.querySelector("dialog");
    expect(dialog?.className).toContain("mt-[12vh]");
    expect(dialog?.className).not.toContain("m-auto");
    const note = [...document.querySelectorAll("p")].find((p) =>
      p.textContent?.startsWith("This folder isn't empty."),
    );
    expect(note?.className).toContain("min-h-15");
    const folder = [...document.querySelectorAll("span")].find((s) =>
      s.textContent?.endsWith("Quarterly Review of Escalations and Refunds"),
    );
    expect(folder?.className).toContain("break-all");
    expect(folder?.className).not.toContain("truncate");
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
        throw new NewWorkspaceRefusal("you don't have permission");
      },
    });
    await type("Acme");
    await click("Create");
    expect(document.body.textContent).toContain(
      "Can't write to this folder: you don't have permission.",
    );
    expect(seen.created).toEqual([]);
  });

  it("shows the generic sentence, not the system's text, for an error without a kind", async () => {
    await show({
      create: async () => {
        throw new Error("EACCES: permission denied, mkdir '/x'");
      },
    });
    await type("Acme");
    await click("Create");
    expect(document.body.textContent).toContain(
      "Can't write to this folder: Halonic ran into a problem it can't explain yet.",
    );
    expect(document.body.textContent).not.toContain("EACCES");
  });

  it("words a failed Open as Can't open, not as a write error", async () => {
    await show({
      state: "workspace",
      open: async () => {
        throw new NewWorkspaceRefusal("the folder isn't there any more", "folder", "not_found");
      },
    });
    await type("Acme");
    await click("Open it");
    expect(document.body.textContent).toContain(
      "Can't open Acme: the folder isn't there any more.",
    );
    expect(document.body.textContent).not.toContain("Can't write");
  });

  it("shows a name problem under Name, not under Folder", async () => {
    await show({
      create: async () => {
        throw new NewWorkspaceRefusal("that isn't a name a folder can have", "name");
      },
    });
    await type("A/B");
    await click("Create");
    expect(document.body.textContent).toContain("That isn't a name a folder can have.");
    expect(document.body.textContent).not.toContain("Can't write");
  });

  it("shows why there is no folder, and asks to choose one with Change… focused", async () => {
    const seen = await show({
      defaultParent: async () => {
        throw new KindedError(
          "not_found",
          "This computer has no Documents folder; choose a folder.",
        );
      },
    });
    expect(document.body.textContent).toContain("This computer has no Documents folder");
    await click("Create");
    expect(document.body.textContent).toContain("Give it a name.");
    await type("Acme");
    await click("Create");
    expect(document.body.textContent).toContain("Choose a folder.");
    expect(document.activeElement).toBe(button("Change…"));
    await click("Change…");
    await click("Create");
    expect(seen.created).toEqual(["~/Work/Acme"]);
  });

  it("words the toast, with the trust failure when the record wasn't saved", () => {
    expect(createdLine("Acme Support")).toBe("Created Acme Support");
    expect(createdLine("Acme Support", "the keychain is locked")).toBe(
      "Created Acme Support. Couldn't save trust: the keychain is locked.",
    );
  });

  it("moves focus to Name when the shell refuses the name", async () => {
    await show({
      create: async () => {
        throw new NewWorkspaceRefusal("that isn't a name a folder can have", "name");
      },
    });
    await type("Q3/Support");
    await click("Create");
    expect(document.activeElement).toBe(document.querySelector("input"));
  });

  it("keeps Name read-only, never disabled, while creating", async () => {
    let release: () => void = () => {};
    await show({
      create: () =>
        new Promise((resolve) => {
          release = () => resolve({ kind: "trusted" });
        }),
    });
    await type("Acme");
    await click("Create");
    const input = document.querySelector("input");
    expect(input?.disabled).toBe(false);
    expect(input?.readOnly).toBe(true);
    await act(async () => release());
  });

  it("describes Name by the folder line", async () => {
    await show();
    const description = () => {
      const id = document.querySelector("input")?.getAttribute("aria-describedby");
      return id === null || id === undefined ? undefined : document.getElementById(id)?.textContent;
    };
    expect(description()).toBe("Folder: ~/Documents");
    await type("Acme Support");
    expect(description()).toBe("Folder: ~/Documents/Acme Support");
  });

  it("announces the new mode once, with the button's name", async () => {
    const announced: string[] = [];
    await show({ state: "workspace", announced });
    await type("Acme");
    await type("Acme2");
    expect(announced).toEqual(["This folder is already a workspace. Open it."]);
    act(() => root?.unmount());
    container?.remove();
    const files: string[] = [];
    await show({ state: "not-empty", announced: files });
    await type("Acme");
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^This folder isn't empty\..* Create here\.$/);
  });
});
