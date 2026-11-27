// @vitest-environment jsdom

import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { Inbox } from "../inbox.ts";
import { waitingRun } from "../test-runs.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { InboxView } from "./inbox-page.tsx";

beforeEach(() => {
  HTMLElement.prototype.showPopover = () => undefined;
  HTMLElement.prototype.hidePopover = () => undefined;
});

afterEach(() => {
  unmountAll();
  Reflect.deleteProperty(HTMLElement.prototype, "showPopover");
  Reflect.deleteProperty(HTMLElement.prototype, "hidePopover");
});

// Local times, so the test reads the same in every time zone. Tue 24 Nov 2026.
const asked = new Date(2026, 10, 24, 10, 0);

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const website = { id: "p-web", name: "Website" };
const billing = { id: "p-billing", name: "Billing" };

/** A run of the workspace that waits, and agents' items of Website, Billing and no project. */
async function mixedInbox(projects = true) {
  const messaging = new FakeAgentMessaging({ now: () => asked });
  const source = messaging.addSource({ label: "Paperclip · Acme" });
  const add = (question: string, project?: typeof website) =>
    messaging.addInboxItem(source.id, projects && project ? { question, project } : { question });
  add("Ship the new home page?", website);
  add("Send the November invoices?", billing);
  add("Rename the company?");
  const run = waitingRun("run_mfx3k2a1_01jd8q", {
    lastWaitingAt: asked.toISOString(),
    waitingFor: { title: "Approve this reply?", body: "Dear Ana, your refund is on its way." },
  });
  const root = render(
    <InboxView
      inbox={new Inbox(fakeRuns([run]).runs)}
      now={() => new Date(2026, 10, 24, 13, 0)}
      agentMessaging={messaging}
    />,
  );
  await settled();
  return root;
}

function titles(root: HTMLElement): string[] {
  return [...root.querySelectorAll('[role="grid"] tr')]
    .map((row) => shownText(row.querySelector('[role="gridcell"]')))
    .map((text) => text.replace(/\?.*$/s, "?"))
    .sort();
}

/** The text a reader gets, without the decoration: a person's initials on their row's picture. */
function shownText(cell: Element | null): string {
  const copy = cell?.cloneNode(true);
  if (!(copy instanceof Element)) return "";
  for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
  return copy.textContent ?? "";
}

/** The chips on the filter's line, by name. */
function chips(root: HTMLElement): HTMLButtonElement[] {
  return [...root.querySelectorAll<HTMLButtonElement>('fieldset[aria-label="Project"] > button')];
}

function chipName(chip: HTMLElement): string {
  return chip.getAttribute("aria-label") ?? chip.textContent ?? "";
}

/** Picks a choice from the line, or else from its "+N" menu. */
async function pick(root: HTMLElement, label: string) {
  const chip = chips(root).find((each) => chipName(each).startsWith(label));
  const entry = [...root.querySelectorAll<HTMLElement>("[role=menuitemradio]")].find((each) =>
    each.textContent?.startsWith(label),
  );
  const target = chip ?? entry;
  if (target === undefined) throw new Error(`no choice "${label}"`);
  await act(async () => target.click());
  await settled();
}

verifies("inbox.project-filter", () => {
  it("filters a mixed list by one project with one click, and shows only that project's items", async () => {
    const root = await mixedInbox();
    expect(chips(root).map(chipName)).toEqual([
      "All projects, 4",
      "Billing",
      "Website",
      "No project",
    ]);
    expect(titles(root)).toHaveLength(4);
    await pick(root, "Website");
    expect(titles(root)).toEqual(["Ship the new home page?"]);
    await pick(root, "No project");
    expect(titles(root)).toEqual(["Approve this reply?", "Rename the company?"]);
    await pick(root, "All projects");
    expect(titles(root)).toHaveLength(4);
  });

  it("shows no project filter while no item that waits has a project", async () => {
    const root = await mixedInbox(false);
    expect(root.querySelector('fieldset[aria-label="Project"]')).toBeNull();
    expect(titles(root)).toHaveLength(4);
  });
});
