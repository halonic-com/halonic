// @vitest-environment jsdom
import { KindedError } from "@halonicjs/std";
import { createToastStore, PresentationProvider, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ShareChoice, Version } from "../api.ts";
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

const boxName = "Share with your team right away";

const earlier: Version = { id: "a1", name: "Earlier", notes: "", author: "Ana", at: 0, files: [] };

/** A remembered choice that keeps every write, as the app's window storage would. */
function rememberedChoice(start: boolean): ShareChoice & { readonly writes: boolean[] } {
  const writes: boolean[] = [];
  let current = start;
  return {
    writes,
    read: () => current,
    write: (shareRightAway) => {
      writes.push(shareRightAway);
      current = shareRightAway;
    },
  };
}

/** The page with one changed file, opened on Create version. */
async function openDialog({
  remote = true,
  phone = false,
  shareChoice,
}: {
  readonly remote?: boolean;
  readonly phone?: boolean;
  readonly shareChoice?: ShareChoice;
} = {}) {
  const fake = fakeSource({
    kind: "ready",
    changes: [{ path: "README.md", status: "modified", staged: false }],
  });
  fake.setTexts("README.md", { before: "a\n", after: "b\n" });
  fake.setHistory([earlier]);
  fake.setRemote(remote);
  fake.setUnshared(1);
  const toasts = createToastStore();
  const list = new ChangesList(fake.source);
  const view = (
    <ToastStoreProvider store={toasts}>
      <ChangesView list={list} shareChoice={shareChoice} />
    </ToastStoreProvider>
  );
  render(phone ? <PresentationProvider presentation="phone">{view}</PresentationProvider> : view);
  await act(settle);
  await act(async () =>
    [...document.querySelectorAll("button")]
      .find((element) => element.textContent?.trim() === "Create version")
      ?.click(),
  );
  return { fake, toasts };
}

/** The dialog's "Share with your team right away" box, if it has one. */
function shareBox(): HTMLInputElement | undefined {
  const labels = [...(document.querySelector("dialog")?.querySelectorAll("label") ?? [])];
  return (
    labels
      .find((label) => label.textContent?.includes(boxName))
      ?.querySelector<HTMLInputElement>("input[type=checkbox]") ?? undefined
  );
}

async function create() {
  // The button also holds its busy words, hidden until it is pressed.
  const confirm = [...(document.querySelector("dialog")?.querySelectorAll("button") ?? [])].find(
    (element) => element.textContent?.trim().startsWith("Create version"),
  );
  await act(async () => {
    confirm?.click();
    await settle();
  });
}

verifies("source-control.create-version-share", () => {
  describe("Share with your team right away", () => {
    it("is offered, off at first, with its caption, when a share address is set", async () => {
      await openDialog();
      expect(shareBox()?.checked).toBe(false);
      expect(document.querySelector("dialog")?.textContent).toContain(
        "Your team can get it straight away. Sharing can't be taken back, but you can share a newer version.",
      );
    });

    it("isn't offered without a share address", async () => {
      await openDialog({ remote: false });
      expect(shareBox()).toBeUndefined();
    });

    it("isn't offered on a phone, which leaves sharing to the computer", async () => {
      await openDialog({ phone: true });
      expect(shareBox()).toBeUndefined();
    });

    it("starts as the person last left it, and remembers a change", async () => {
      const choice = rememberedChoice(true);
      await openDialog({ shareChoice: choice });
      expect(shareBox()?.checked).toBe(true);
      await act(async () => shareBox()?.click());
      expect(shareBox()?.checked).toBe(false);
      expect(choice.writes).toEqual([false]);
    });

    it("creates the version, shares it and says so in one toast", async () => {
      const { fake, toasts } = await openDialog({ shareChoice: rememberedChoice(true) });
      await create();
      expect(fake.versions).toHaveLength(1);
      expect(fake.shareCalls()).toBe(1);
      expect(toasts.list().map((toast) => toast.title)).toEqual([
        'Created and shared version "Changes to README.md"',
      ]);
    });

    it("only creates the version when the box is off", async () => {
      const { fake, toasts } = await openDialog();
      await create();
      expect(fake.shareCalls()).toBe(0);
      expect(toasts.list().map((toast) => toast.title)).toEqual([
        'Created version "Changes to README.md"',
      ]);
    });

    it("says the version is saved here when sharing fails, until closed, with Try again", async () => {
      const { fake, toasts } = await openDialog({ shareChoice: rememberedChoice(true) });
      fake.failShare(new KindedError("unavailable", "You can't reach the shared copy right now."));
      await create();
      expect(fake.versions).toHaveLength(1);
      const [toast] = toasts.list();
      expect(toast?.tone).toBe("danger");
      expect(toast?.title).toBe("Couldn't share");
      expect(toast?.text).toBe(
        "You can't reach the shared copy right now. Your version is saved here.",
      );
      expect(toast?.sticky).toBe(true);
      expect(toast?.action?.label).toBe("Try again");

      fake.failShare(undefined);
      await act(async () => {
        toast?.action?.onClick();
        await settle();
      });
      expect(fake.shareCalls()).toBe(2);
      expect(toasts.list().at(-1)?.title).toBe("Shared 1 version");
    });
  });
});
