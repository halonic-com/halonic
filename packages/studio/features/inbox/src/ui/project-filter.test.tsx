// @vitest-environment jsdom

import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { Inbox } from "../inbox.ts";
import { waitingRun } from "../test-runs.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { InboxView } from "./inbox-page.tsx";

afterEach(unmountAll);

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

function chips(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('[role="radiogroup"] label')];
}

async function pick(root: HTMLElement, label: string) {
  const chip = chips(root).find((each) => each.textContent?.endsWith(label));
  if (chip === undefined) throw new Error(`no chip "${label}"`);
  await act(async () => chip.querySelector("input")?.click());
  await settled();
}

verifies("inbox.project-filter", () => {
  it("filters a mixed list by one project with one click, and shows only that project's items", async () => {
    const root = await mixedInbox();
    expect(chips(root).map((chip) => chip.textContent)).toEqual([
      "All projects",
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
    expect(root.querySelector('[role="radiogroup"]')).toBeNull();
    expect(titles(root)).toHaveLength(4);
  });
});
