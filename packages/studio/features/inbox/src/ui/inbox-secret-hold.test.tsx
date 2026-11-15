// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { fakeSetups, setupEntry } from "../fake-setups.test-helper.ts";
import { Inbox, type SetupViewProps } from "../inbox.ts";
import { pendingApproval, waitingRun } from "../test-runs.test-helper.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { InboxView, type InboxViewProps } from "./inbox-page.tsx";

// The clock the test moves: an approval ignores a press that comes right as its card shows.
const clock = { now: new Date(2026, 10, 8, 10, 43) };

beforeEach(() => {
  fakeModal();
  clock.now = new Date(2026, 10, 8, 10, 43);
});
afterEach(() => {
  unmountAll();
  restoreModal();
});

const at = (hour: number, minute: number) => new Date(2026, 10, 8, hour, minute).toISOString();
const now = () => clock.now;
const later = (seconds: number) => {
  clock.now = new Date(clock.now.getTime() + seconds * 1000);
};
const notes = waitingRun("r1", {
  approvals: [pendingApproval("call-1", "notes-mcp__create_note", at(10, 42))],
});
// Invented, shaped like the real thing: a prefix and random-looking characters.
const note = `the secret is GOCSPX-${"aB3".repeat(8)}`;

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** A source's view that shows what the item was asked to reach. */
function GoogleSetupView({ focus }: SetupViewProps) {
  return <p>Setup opened for {focus ?? "nothing"}</p>;
}

async function openInbox(options: { accounts: boolean; openPlace?: InboxViewProps["openPlace"] }) {
  const inbox = new Inbox(fakeRuns([notes]).runs);
  if (options.accounts) {
    inbox.addSetupSource(
      fakeSetups("google", [setupEntry("acct-1", at(9, 0))], {
        view: { view: "GoogleSetupView", load: async () => ({ GoogleSetupView }) },
      }).source,
    );
  }
  await settled();
  const root = render(
    <InboxView
      inbox={inbox}
      now={now}
      {...(options.openPlace === undefined ? {} : { openPlace: options.openPlace })}
    />,
  );
  await settled();
  return root;
}

function rowWith(root: HTMLElement, text: string): HTMLElement {
  const cell = [...root.querySelectorAll<HTMLElement>('[role="gridcell"]')].find((each) =>
    each.textContent?.includes(text),
  );
  if (cell === undefined) throw new Error(`no row "${text}"`);
  return cell;
}

function buttonNamed(scope: ParentNode, name: string): HTMLButtonElement {
  const found = [...scope.querySelectorAll("button")].find((each) =>
    each.textContent?.startsWith(name),
  );
  if (found === undefined) throw new Error(`no button "${name}"`);
  return found;
}

async function press(target: HTMLElement) {
  await act(async () => {
    target.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    target.click();
  });
  await settled();
}

/** Opens the approval, holds a Google secret in Ask for changes and returns the dialog. */
async function holdSecret(root: HTMLElement): Promise<HTMLDialogElement> {
  await press(rowWith(root, "create_note"));
  later(61);
  await press(buttonNamed(root, "Ask for changes"));
  const dialog = document.querySelector("dialog") as HTMLDialogElement;
  await act(async () => {
    const field = dialog.querySelector("textarea") as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(field, note);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await press(buttonNamed(dialog, "Send note"));
  return dialog;
}

verifies("inbox.secret-hold", () => {
  it("goes to the setup item for the secret, and the note is back in the card on return", async () => {
    const root = await openInbox({ accounts: true });
    const dialog = await holdSecret(root);
    await press(buttonNamed(dialog, "Go to the secret field"));
    expect(root.textContent).toContain("Setup opened for secret");

    await press(rowWith(root, "create_note"));
    later(61);
    await press(buttonNamed(root, "Ask for changes"));
    const field = document.querySelector("dialog textarea") as HTMLTextAreaElement;
    expect(field.value).toBe(note);
  });

  it("opens the Library when there is no account to take the secret", async () => {
    const openPlace = vi.fn();
    const root = await openInbox({ accounts: false, openPlace });
    const dialog = await holdSecret(root);
    await press(buttonNamed(dialog, "Go to the secret field"));
    expect(openPlace).toHaveBeenCalledWith("library");
  });

  it("offers no Go to the secret field when there is nowhere to go", async () => {
    const root = await openInbox({ accounts: false });
    const dialog = await holdSecret(root);
    expect(dialog.textContent).toContain("Google client secret");
    const labels = [...dialog.querySelectorAll("button")].map((each) => each.textContent ?? "");
    expect(labels.some((label) => label.startsWith("Go to the secret field"))).toBe(false);
  });
});
