// @vitest-environment jsdom
import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ChangesList } from "../changes-list.ts";
import { fakeSource, settle } from "../source.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ChangesView } from "./changes-page.tsx";

afterEach(unmountAll);

async function openPage(options: { remote: boolean }) {
  const fake = fakeSource({ kind: "ready", changes: [] });
  fake.setRemote(options.remote);
  const toasts = createToastStore();
  const list = new ChangesList(fake.source);
  const root = render(
    <ToastStoreProvider store={toasts}>
      <ChangesView list={list} />
    </ToastStoreProvider>,
  );
  await act(settle);
  return { fake, root, toasts };
}

const getUpdatesButton = () =>
  [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Get updates"));
const press = (button: HTMLElement | undefined) =>
  act(async () => {
    button?.click();
    await settle();
  });

verifies("source-control.get-updates", () => {
  describe("Get updates", () => {
    it("says how many versions it got", async () => {
      const { fake, toasts } = await openPage({ remote: true });
      fake.setUpdates({ kind: "got", count: 2 });
      await press(getUpdatesButton());
      expect(toasts.list().map((toast) => toast.title)).toEqual([
        "Got 2 versions from the shared copy",
      ]);
    });

    it("says one version in the singular", async () => {
      const { fake, toasts } = await openPage({ remote: true });
      fake.setUpdates({ kind: "got", count: 1 });
      await press(getUpdatesButton());
      expect(toasts.list()[0]?.title).toBe("Got 1 version from the shared copy");
    });

    it("says when there was nothing newer", async () => {
      const { toasts } = await openPage({ remote: true });
      await press(getUpdatesButton());
      expect(toasts.list()[0]?.title).toBe("Already up to date");
    });

    it("says nothing changed when the shared copy changed while getting updates, with Try again", async () => {
      const { fake, toasts } = await openPage({ remote: true });
      fake.setUpdates({ kind: "both-moved" });
      await press(getUpdatesButton());
      const [toast] = toasts.list();
      expect(toast?.title).toBe("Couldn't get versions");
      expect(toast?.text).toContain("The shared copy changed while getting updates. Try again.");
      expect(toast?.text).toContain("Nothing changed here.");
      expect(toast?.action?.label).toBe("Try again");
    });

    it("says why when the shared copy can't be reached, and Try again asks again", async () => {
      const { fake, toasts } = await openPage({ remote: true });
      fake.failUpdates(new Error("boom"));
      await press(getUpdatesButton());
      expect(toasts.list()[0]?.title).toBe("Couldn't get versions");
      fake.failUpdates(undefined);
      await act(async () => {
        toasts.list()[0]?.action?.onClick();
        await settle();
      });
      expect(fake.updatesAsked()).toBe(2);
    });

    it("reads the changes again after it got versions", async () => {
      const { fake, root } = await openPage({ remote: true });
      fake.setUpdates({ kind: "got", count: 1 });
      fake.answer({
        kind: "ready",
        changes: [{ path: "a.md", status: "modified", staged: false }],
      });
      fake.setTexts("a.md", { before: "a\n", after: "b\n" });
      await press(getUpdatesButton());
      expect(root.textContent).toContain("a.md");
    });

    it("has no Get updates for a folder with no remote", async () => {
      await openPage({ remote: false });
      expect(getUpdatesButton()).toBeUndefined();
    });
  });
});
