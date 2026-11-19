// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act, StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChangesList } from "../changes-list.ts";
import { fakeSource, settle } from "../source.test-helper.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ChangesView } from "./changes-page.tsx";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

async function openPage(options: { remote: boolean; strict?: boolean }) {
  const fake = fakeSource({ kind: "ready", changes: [] });
  fake.setRemote(options.remote);
  const list = new ChangesList(fake.source);
  const view = <ChangesView list={list} />;
  const root = render(options.strict === true ? <StrictMode>{view}</StrictMode> : view);
  await act(settle);
  return { fake, root };
}

/** A button of the page, or of the dialog while it is open. */
const button = (label: string) =>
  [...(document.querySelector("dialog[open]") ?? document).querySelectorAll("button")].find((b) =>
    b.textContent?.trim().startsWith(label),
  );
const press = (target: HTMLElement | undefined) =>
  act(async () => {
    target?.click();
    await settle();
  });
const dialog = () => document.querySelector("dialog[open]");

/** Types into the Git address field the way a person does. */
async function type(text: string) {
  const input = document.querySelector<HTMLInputElement>("input");
  if (input === null) throw new Error("no field");
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    set?.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

verifies("source-control.share-address", () => {
  describe("the sharing strip and Add where to share", () => {
    it("says Only on this computer with Add where to share, and has no Get updates", async () => {
      const { root } = await openPage({ remote: false });
      expect(root.textContent).toContain("Only on this computer");
      expect(button("Add where to share")).toBeDefined();
      expect(button("Get updates")).toBeUndefined();
    });

    it("has no strip when there is a remote", async () => {
      const { root } = await openPage({ remote: true });
      expect(root.textContent).not.toContain("Only on this computer");
    });

    it("has no strip for a folder without history", async () => {
      const fake = fakeSource({ kind: "not-a-repository" });
      const list = new ChangesList(fake.source);
      const root = render(<ChangesView list={list} />);
      await act(settle);
      expect(root.textContent).not.toContain("Only on this computer");
    });

    it("opens a dialog with the sentence, the field and its hint", async () => {
      await openPage({ remote: false });
      await press(button("Add where to share"));
      const text = document.body.textContent ?? "";
      expect(text).toContain(
        "Your team gets your versions from this git address, and you get theirs.",
      );
      expect(text).toContain("Git address");
      expect(text).toContain(
        "Copy it from the Clone button on GitHub, GitLab or your own git server.",
      );
      expect(button("Cancel")).toBeDefined();
    });

    it("says what an address looks like when Add is pressed with nothing typed", async () => {
      const { fake } = await openPage({ remote: false });
      await press(button("Add where to share"));
      await press(button("Add"));
      expect(document.body.textContent).toContain("Enter a git address, like https://github.com/");
      expect(fake.remotes).toEqual([]);
    });

    it("says it for an address that isn't one of the three forms", async () => {
      const { fake } = await openPage({ remote: false });
      await press(button("Add where to share"));
      await type("/srv/agents.git");
      await press(button("Add"));
      expect(document.body.textContent).toContain("Enter a git address, like https://github.com/");
      expect(fake.remotes).toEqual([]);
    });

    it("adds a valid address, closes, and shows Get updates instead of the strip", async () => {
      const { fake, root } = await openPage({ remote: false });
      await press(button("Add where to share"));
      await type("  git@github.com:acme/agents.git ");
      await press(button("Add"));
      expect(fake.remotes).toEqual(["git@github.com:acme/agents.git"]);
      expect(dialog()).toBeNull();
      expect(root.textContent).not.toContain("Only on this computer");
      expect(button("Get updates")).toBeDefined();
    });

    it("stays open with git's reason and the address when git refuses it", async () => {
      const { fake } = await openPage({ remote: false });
      fake.failRemote(new Error("boom"));
      await press(button("Add where to share"));
      await type("https://github.com/acme/agents.git");
      await press(button("Add"));
      // The dialog reads a failure a frame after the request ends.
      await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
      expect(document.body.textContent).toContain("Couldn't add this address.");
      expect(document.querySelector<HTMLInputElement>("input")?.value).toBe(
        "https://github.com/acme/agents.git",
      );
      fake.failRemote(undefined);
      await press(button("Try again"));
      expect(fake.remotes).toEqual(["https://github.com/acme/agents.git"]);
      expect(dialog()).toBeNull();
    });

    it("answers Add under StrictMode, as in the dev server, and doesn't stay on Adding", async () => {
      const { fake } = await openPage({ remote: false, strict: true });
      await press(button("Add where to share"));
      await press(button("Add"));
      expect(document.body.textContent).toContain("Enter a git address, like https://github.com/");
      await type("git@github.com:acme/agents.git");
      await press(button("Add"));
      expect(fake.remotes).toEqual(["git@github.com:acme/agents.git"]);
      expect(dialog()).toBeNull();
    });

    it("changes nothing on Cancel", async () => {
      const { fake } = await openPage({ remote: false });
      await press(button("Add where to share"));
      await press(button("Cancel"));
      expect(dialog()).toBeNull();
      expect(fake.remotes).toEqual([]);
      expect(button("Add where to share")).toBeDefined();
    });
  });
});
