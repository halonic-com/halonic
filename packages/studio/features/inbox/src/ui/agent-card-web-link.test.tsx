// @vitest-environment jsdom

import type { InboxItem } from "@halonicjs/ports";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import { AgentItemCard } from "./agent-item-card.tsx";

afterEach(unmountAll);

const asked = new Date(2026, 10, 24, 10, 0);
const page = "https://paperclip.acme.test/ACME/issues/ACME-7";

/** The card of an Acme approval with `fields` added. */
async function cardWith(fields: Partial<InboxItem>) {
  const messaging = new FakeAgentMessaging({ now: () => asked });
  const source = messaging.addSource({ label: "Paperclip · Acme", provider: "paperclip" });
  const item = messaging.addInboxItem(source.id, {
    question: "Hire Iris as a designer?",
    ...fields,
  });
  const [read] = await messaging.listSources();
  return render(
    <AgentItemCard
      item={item}
      source={read}
      now={() => asked}
      answer={(answer) => messaging.answer(item.id, answer)}
      readAttachment={(attachment) => messaging.readAttachment(attachment)}
    />,
  );
}

/** The card's links whose text starts "Open in". */
function openLinks(root: HTMLElement): HTMLAnchorElement[] {
  return [...root.querySelectorAll("a")].filter((link) =>
    (link.textContent ?? "").startsWith("Open in"),
  );
}

verifies("inbox.agent-card-web-link", () => {
  it("shows one Open in Paperclip link to the item's page, on a lifted card", async () => {
    const root = await cardWith({ webLink: { link: page, site: "Paperclip" } });

    const links = openLinks(root);
    expect(links).toHaveLength(1);
    expect(links[0]?.textContent).toContain("Open in Paperclip");
    expect(links[0]?.getAttribute("href")).toBe(page);
    expect(root.querySelector("section")?.className).toContain("shadow-1");
  });

  it("links to the place to answer when the item has both links", async () => {
    const answerPage = "https://paperclip.acme.test/ACME/issues/ACME-7#card-1";
    const root = await cardWith({
      webLink: { link: page, site: "Paperclip" },
      answerElsewhere: { link: answerPage },
    });

    const links = openLinks(root);
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute("href")).toBe(answerPage);
  });

  it("shows no Open in link for an item without a page", async () => {
    const root = await cardWith({});

    expect(openLinks(root)).toHaveLength(0);
  });
});
