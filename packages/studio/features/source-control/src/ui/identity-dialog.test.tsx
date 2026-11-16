// @vitest-environment jsdom
import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
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

async function openPage(identity: { name: string; email: string }) {
  const fake = fakeSource({
    kind: "ready",
    changes: [{ path: "README.md", status: "modified", staged: false }],
  });
  fake.setTexts("README.md", { before: "a\n", after: "b\n" });
  fake.setIdentity(identity);
  const list = new ChangesList(fake.source);
  const root = render(
    <ToastStoreProvider store={createToastStore()}>
      <ChangesView list={list} />
    </ToastStoreProvider>,
  );
  await act(settle);
  return { fake, root };
}

const dialog = () => document.querySelector("dialog[open]");
const title = () => dialog()?.querySelector("h2")?.textContent;
const button = (label: string) =>
  [...(dialog() ?? document).querySelectorAll("button")].find((b) =>
    b.textContent?.trim().startsWith(label),
  );
const press = (target: HTMLElement | undefined) =>
  act(async () => {
    target?.click();
    await settle();
  });
const fields = () => [...(dialog()?.querySelectorAll("input") ?? [])];

async function type(field: HTMLInputElement | undefined, text: string) {
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    set?.call(field, text);
    field?.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const nobody = { name: "", email: "" };

verifies("source-control.identity", () => {
  describe("Who should versions be from?", () => {
    it("opens before Create version when no name and email are set, with the words", async () => {
      await openPage(nobody);
      await press(button("Create version"));
      expect(title()).toBe("Who should versions be from?");
      const text = dialog()?.textContent ?? "";
      expect(text).toContain(
        "Your name shows next to each version you create, for you and your team.",
      );
      expect(text).toContain("Shown in the history. Use a no-reply address if you prefer.");
      expect(button("Cancel")).toBeDefined();
      expect(button("Save and continue")).toBeDefined();
    });

    it("opens Create version at once when both are set", async () => {
      await openPage({ name: "Sam", email: "sam@acme.example" });
      await press(button("Create version"));
      expect(title()).toBe("Create version");
    });

    it("asks again when only one part is set", async () => {
      await openPage({ name: "Sam", email: "" });
      await press(button("Create version"));
      expect(title()).toBe("Who should versions be from?");
      expect(fields()[0]?.value).toBe("Sam");
    });

    it("says what is missing under the fields, focuses the first, and saves nothing", async () => {
      const { fake } = await openPage(nobody);
      await press(button("Create version"));
      await press(button("Save and continue"));
      expect(dialog()?.textContent).toContain("Enter your name.");
      expect(dialog()?.textContent).toContain("Enter an email address, like sam@acme.example.");
      expect(document.activeElement).toBe(fields()[0]);
      await type(fields()[0], "Sam");
      await type(fields()[1], "sam");
      await press(button("Save and continue"));
      expect(dialog()?.textContent).not.toContain("Enter your name.");
      expect(dialog()?.textContent).toContain("Enter an email address");
      expect(document.activeElement).toBe(fields()[1]);
      expect(fake.identities).toEqual([]);
    });

    it("saves the pair, then opens Create version", async () => {
      const { fake } = await openPage(nobody);
      await press(button("Create version"));
      await type(fields()[0], "Sam Smith");
      await type(fields()[1], "sam@acme.example");
      await press(button("Save and continue"));
      expect(fake.identities).toEqual([{ name: "Sam Smith", email: "sam@acme.example" }]);
      expect(title()).toBe("Create version");
    });

    it("stays open with the reason when git refuses, and keeps what was typed", async () => {
      const { fake } = await openPage(nobody);
      fake.failIdentity(new Error("Git can't change this workspace's history."));
      await press(button("Create version"));
      await type(fields()[0], "Sam");
      await type(fields()[1], "sam@acme.example");
      await press(button("Save and continue"));
      // The dialog reads a failure a frame after the request ends.
      await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
      expect(title()).toBe("Who should versions be from?");
      expect(dialog()?.textContent).toContain("Couldn't save this.");
      expect(fields()[0]?.value).toBe("Sam");
    });

    it("closes Create version too on Cancel, saving nothing", async () => {
      const { fake } = await openPage(nobody);
      await press(button("Create version"));
      await press(button("Cancel"));
      expect(dialog()).toBeNull();
      expect(fake.identities).toEqual([]);
    });
  });
});
