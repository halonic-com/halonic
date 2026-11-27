// @vitest-environment jsdom

import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { Inbox } from "../inbox.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { InboxView } from "./inbox-page.tsx";

afterEach(unmountAll);

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function rows(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('[role="grid"] tr')];
}

async function click(target: HTMLElement | null | undefined) {
  if (target === null || target === undefined) throw new Error("nothing to click");
  await act(async () => target.click());
  await settled();
}

/** Chief asks twice in Website and once in Billing, with no task, so only the project parts them. */
async function chiefInTwoProjects() {
  const messaging = new FakeAgentMessaging({ now: () => new Date(2026, 10, 24, 10, 0) });
  const source = messaging.addSource({ label: "Paperclip · Acme" });
  const agent = messaging.addAgent(source.id, { name: "Chief" });
  const from = { kind: "agent" as const, agent: agent.id, name: "Chief" };
  const website = { id: "p-web", name: "Website" };
  messaging.addInboxItem(source.id, { question: "Ship the home page?", from, project: website });
  messaging.addInboxItem(source.id, {
    question: "Send the invoices?",
    from,
    project: { id: "p-billing", name: "Billing" },
  });
  messaging.addInboxItem(source.id, { question: "Fix the footer?", from, project: website });
  const root = render(
    <InboxView
      inbox={new Inbox(fakeRuns([]).runs)}
      now={() => new Date(2026, 10, 24, 13, 0)}
      agentMessaging={messaging}
    />,
  );
  await settled();
  return root;
}

verifies("inbox.project-filter", () => {
  it("never bundles two projects' cards, and with Website picked a bundle holds only Website cards", async () => {
    const root = await chiefInTwoProjects();
    expect(rows(root).map((row) => row.textContent)).toEqual([
      expect.stringContaining("2 cards from Chief"),
      expect.stringContaining("Send the invoices?"),
    ]);

    const chip = [
      ...root.querySelectorAll<HTMLElement>('fieldset[aria-label="Project"] > button'),
    ].find((button) => button.textContent?.includes("Website"));
    await click(chip);
    expect(rows(root).map((row) => row.textContent)).toEqual([
      expect.stringContaining("2 cards from Chief"),
    ]);

    await click(rows(root)[0]?.querySelector<HTMLElement>('[role="gridcell"]'));
    const cards = [...root.querySelectorAll("section h2")].map((title) => title.textContent);
    expect(cards).toEqual(["Ship the home page?", "Fix the footer?"]);
  });
});
