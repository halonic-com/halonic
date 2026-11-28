// @vitest-environment jsdom

import type { InboxQuestion } from "@halonicjs/ports";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import { AgentItemCard } from "./agent-item-card.tsx";
import { failedText } from "./card-parts.tsx";

afterEach(unmountAll);

const now = new Date(2026, 10, 28, 10, 0);

/** The click test's item verdicts card (`verdictsCard`): a verdict on each of two posts. */
const verdicts: readonly InboxQuestion[] = ["Teaser post", "Recap post"].map((post) => ({
  id: post,
  prompt: post,
  selection: "single",
  required: true,
  options: [
    { id: "approve", label: "Approve" },
    { id: "reject", label: "Reject" },
    { id: "defer", label: "Defer" },
  ],
}));

/** "Review the Acme launch posts", whose answer fails to send, with both verdicts picked and sent. */
async function failedVerdictsCard(): Promise<HTMLElement> {
  const messaging = new FakeAgentMessaging({ now: () => now });
  const source = messaging.addSource({ label: "Paperclip · Acme", provider: "paperclip" });
  const item = messaging.addInboxItem(source.id, {
    question: "Review the Acme launch posts",
    options: [],
    questions: verdicts,
  });
  const [read] = await messaging.listSources();
  const root = render(
    <AgentItemCard
      item={item}
      source={read}
      now={() => now}
      answer={() => Promise.reject(new Error("The source didn't answer."))}
      readAttachment={(attachment) => messaging.readAttachment(attachment)}
    />,
  );
  for (const fieldset of root.querySelectorAll("fieldset")) {
    await act(async () => fieldset.querySelector<HTMLInputElement>("input")?.click());
  }
  await act(async () => submitOf(root).click());
  return root;
}

function submitOf(root: HTMLElement): HTMLButtonElement {
  const found = [...root.querySelectorAll("button")].find((each) => each.textContent === "Submit");
  if (found === undefined) throw new Error("no Submit");
  return found;
}

/** The elements in the card that scroll on their own, in a window taller than 576px. */
function scrollAreas(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>("section, section *")].filter((each) =>
    each.className.split(" ").includes("overflow-y-auto"),
  );
}

/** The foot: the card's part that holds Submit, under its one scroll area. */
function footOf(root: HTMLElement): HTMLElement {
  const foot = submitOf(root).closest<HTMLElement>(".border-t");
  if (foot === null) throw new Error("no foot");
  return foot;
}

// jsdom lays nothing out, so these hold the structure and classes that do it (HAL-19399 G8).
verifies("inbox.card-bar-reach", () => {
  it("keeps Submit and the failure line in the foot, outside the one scroll area, at either end", async () => {
    const root = await failedVerdictsCard();
    const [body, ...others] = scrollAreas(root);
    expect(others).toEqual([]);
    expect(body?.querySelectorAll("fieldset")).toHaveLength(2);

    const foot = footOf(root);
    for (const scrolled of ["top", "bottom"]) {
      if (body === undefined) throw new Error("no scroll area");
      body.scrollTop = scrolled === "top" ? 0 : body.scrollHeight;
      expect(body.contains(foot)).toBe(false);
      expect(foot.contains(submitOf(root))).toBe(true);
      expect(foot.textContent).toContain(failedText);
    }
    expect(foot.className.split(" ")).toEqual(expect.arrayContaining(["shrink-0"]));
    expect(foot.className).not.toContain("max-h-");
    expect(foot.querySelector("fieldset")).toBeNull();
  });

  it("puts the failure line directly above Submit, in a short window too", async () => {
    const root = await failedVerdictsCard();
    const foot = footOf(root);
    const submitRow = foot.lastElementChild;
    expect(submitRow?.contains(submitOf(root))).toBe(true);
    expect(submitRow?.previousElementSibling?.getAttribute("role")).toBe("alert");
    expect(submitRow?.previousElementSibling?.textContent).toContain(failedText);
    // In a short window nothing in the card scrolls on its own: the item pane scrolls it whole.
    for (const area of scrollAreas(root)) {
      expect(area.className.split(" ")).toContain("short:overflow-visible");
    }
  });
});
