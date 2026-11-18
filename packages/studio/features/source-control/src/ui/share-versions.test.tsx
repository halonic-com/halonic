// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ChangesList } from "../changes-list.ts";
import { fakeSource, settle } from "../source.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ChangesView } from "./changes-page.tsx";

afterEach(unmountAll);

async function openPage(unshared: number) {
  const fake = fakeSource({ kind: "ready", changes: [] });
  fake.setRemote(true);
  fake.setUnshared(unshared);
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

const shareButton = () =>
  [...document.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Share "));
const press = (button: HTMLElement | undefined) =>
  act(async () => {
    button?.click();
    await settle();
  });

verifies("source-control.share-versions", () => {
  describe("the not-shared strip and Share", () => {
    it("says how many versions aren't shared, with the matching button", async () => {
      const { root } = await openPage(2);
      expect(root.textContent).toContain("2 versions aren't shared yet");
      expect(shareButton()?.textContent).toBe("Share 2 versions");
    });

    it("says one version in the singular", async () => {
      const { root } = await openPage(1);
      expect(root.textContent).toContain("1 version isn't shared yet");
      expect(shareButton()?.textContent).toBe("Share 1 version");
    });

    it("has no strip when every version is shared", async () => {
      const { root } = await openPage(0);
      expect(root.textContent).not.toContain("shared yet");
      expect(shareButton()).toBeUndefined();
    });

    it("shares, says how many were sent and removes the strip", async () => {
      const { fake, root, toasts } = await openPage(2);
      await press(shareButton());
      expect(fake.shareCalls()).toBe(1);
      expect(toasts.list().map((toast) => toast.title)).toEqual(["Shared 2 versions"]);
      expect(root.textContent).not.toContain("shared yet");
    });

    it("says Sharing… with no action while it runs", async () => {
      const { fake, root } = await openPage(2);
      let finish: () => void = () => undefined;
      const wait = new Promise<void>((resolve) => {
        finish = resolve;
      });
      fake.holdShare(wait);
      await act(async () => {
        shareButton()?.click();
        await settle();
      });
      expect(root.textContent).toContain("Sharing…");
      expect(shareButton()).toBeUndefined();
      await act(async () => {
        finish();
        await settle();
      });
      expect(root.textContent).not.toContain("Sharing…");
    });

    it("keeps the strip and says nothing was sent when sharing fails", async () => {
      const { fake, root, toasts } = await openPage(2);
      fake.failShare(new KindedError("unavailable", "You can't reach the shared copy right now."));
      await press(shareButton());
      const [toast] = toasts.list();
      expect(toast?.title).toBe("Couldn't share");
      expect(toast?.text).toBe("You can't reach the shared copy right now. Nothing was sent.");
      expect(toast?.action?.label).toBe("Try again");
      expect(root.textContent).toContain("2 versions aren't shared yet");
    });

    it("shows no strip while a merge of the shared copy's versions is open", async () => {
      const fake = fakeSource({ kind: "ready", changes: [] });
      fake.setRemote(true);
      fake.setUnshared(2);
      fake.setMerge({ items: [], versions: 1, people: ["Sam"] });
      const list = new ChangesList(fake.source);
      const root = render(<ChangesView list={list} />);
      await act(settle);
      expect(root.textContent).not.toContain("shared yet");
    });
  });
});
