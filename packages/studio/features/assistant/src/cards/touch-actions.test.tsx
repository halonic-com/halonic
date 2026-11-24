// @vitest-environment jsdom
import type { FileReview, ReviewOutcome } from "@halonicjs/app";
import { createToastStore, PresentationProvider, ToastStoreProvider } from "@halonicjs/studio-kit";
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeAll, expect, it } from "vitest";
import type { AssistantChange } from "../api.ts";
import {
  buttonNamed,
  chatOf,
  fakeHost,
  openDialogsInJsdom,
  show,
  unmount,
} from "../test-support.tsx";
import { ProposalCard } from "./proposal-card.tsx";

beforeAll(openDialogsInJsdom);
afterEach(unmount);

const path = "hubs/sales/workflows/triage.workflow.yaml";

const review: FileReview = {
  path,
  card: { chatId: "c1", cardId: "call-1" },
  baseline: "id: triage\n",
  seen: "absent",
  deleted: false,
  parts: [{ beforeStart: 0, beforeEnd: 1, afterStart: 0, removed: ["old\n"], added: ["new\n"] }],
};

/** A card on a phone whose file has one change to review, which Accept all decides. */
function phoneCard({ engineAnswering = true } = {}) {
  const fake = fakeHost([chatOf("c1", [{ role: "user", content: "Page on-call" }])]);
  let open: FileReview | null = review;
  const listeners = new Set<(change: AssistantChange) => void>();
  const step = { files: [{ path, record: { before: null, after: null } }] };
  Object.assign(fake.host, {
    changesForCard: async () => (open === null ? [] : [open]),
    accept: async (): Promise<ReviewOutcome> => {
      open = null;
      for (const listener of listeners) listener({ kind: "review", paths: [path] });
      return { status: "done", step, held: [] };
    },
    onDidChange: (each: (change: AssistantChange) => void) => {
      listeners.add(each);
      return () => listeners.delete(each);
    },
    engineAnswering: () => engineAnswering,
  });
  const context = { services: { get: () => fake.host } } as unknown as WorkspaceContext;
  const proposal = { chatId: "c1", callId: "call-1", path, content: "id: triage\n" };
  return show(
    <PresentationProvider presentation="phone">
      <ToastStoreProvider store={createToastStore()}>
        <ProposalCard proposal={proposal} why="Pages on-call" context={context} />
      </ToastStoreProvider>
    </PresentationProvider>,
  );
}

const namesIn = (root: Element | null) =>
  [...(root?.querySelectorAll("button") ?? [])].map(
    (button) => button.getAttribute("aria-label") ?? button.textContent?.trim(),
  );

verifies("assistant.build.phone-review", () => {
  it("shows Accept all on its own row, then See what changes and Reject all, with no inline diff", async () => {
    const page = await phoneCard();
    expect(namesIn(page.querySelector("article"))).toEqual([
      "Accept all",
      "See what changes",
      "Reject all",
    ]);
    expect(page.querySelector("details")).toBeNull();
  });

  it("opens What changes with the diff and both decisions, and a decision there ends on the state line", async () => {
    const page = await phoneCard();
    await act(async () => buttonNamed(page, "See what changes")?.click());
    const sheet = page.querySelector("dialog");
    expect(sheet?.querySelector("h2")?.textContent).toBe("What changes");
    expect(sheet?.textContent).toContain(path);
    expect(sheet?.querySelector("del")?.textContent).toBe("− old");
    expect(sheet?.querySelector("ins")?.textContent).toBe("+ new");
    expect(namesIn(sheet)).toEqual(["Back", "Accept all", "Reject all"]);

    await act(async () => buttonNamed(sheet as HTMLElement, "Accept all")?.click());
    expect(page.querySelector("dialog")).toBeNull();
    expect(document.activeElement?.textContent).toMatch(/^Accepted ?Now a change in triage\./);
  });

  it("makes the decisions wait while Halonic on the computer isn't answering, and says so", async () => {
    const page = await phoneCard({ engineAnswering: false });
    const line = [...page.querySelectorAll("p")].find(
      (each) => each.textContent === "Waiting for Halonic on your computer.",
    );
    expect(line).toBeDefined();
    for (const name of ["Accept all", "Reject all"]) {
      const button = buttonNamed(page, name);
      expect(button?.getAttribute("aria-disabled")).toBe("true");
      expect(button?.getAttribute("aria-describedby")).toContain(line?.id);
    }
    await act(async () => buttonNamed(page, "See what changes")?.click());
    const sheet = page.querySelector("dialog") as HTMLElement;
    expect(sheet.textContent).toContain("Waiting for Halonic on your computer.");
    expect(buttonNamed(sheet, "Accept all")?.getAttribute("aria-disabled")).toBe("true");
  });
});
