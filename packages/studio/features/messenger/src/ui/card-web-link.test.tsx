// @vitest-environment jsdom
import type { InboxItem } from "@halonicjs/ports";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { openChat, openMessenger } from "../test-support/page.tsx";
import { unmountAll } from "../test-support/render.tsx";

afterEach(unmountAll);

const page = "https://paperclip.acme.test/ACME/issues/ACME-7";

/** Chief's chat in Acme with one open card "Merge #12?", with `fields` added. */
async function chatWithCard(fields: Partial<InboxItem>) {
  const messaging = new FakeAgentMessaging();
  const acme = messaging.addSource({ label: "Paperclip · Acme" });
  const chief = messaging.addAgent(acme.id, { name: "Chief" });
  messaging.addConversation(chief.id);
  messaging.addInboxItem(acme.id, {
    question: "Merge **#12**?",
    from: { kind: "agent", agent: chief.id, name: "Chief" },
    options: [
      { id: "approve", label: "Approve" },
      { id: "reject", label: "Reject" },
    ],
    ...fields,
  });
  const shown = await openMessenger(messaging);
  await openChat(shown, "Chief");
  return shown;
}

/** The chat's card and its links whose text starts "Open in". */
function cardOf(shown: HTMLElement) {
  const card = shown.querySelector("main ol [data-chat-card] article");
  const links = [...(card?.querySelectorAll("a") ?? [])].filter((link) =>
    (link.textContent ?? "").startsWith("Open in"),
  );
  return { card, links };
}

verifies("messenger.card-web-link", () => {
  it("shows one Open in Paperclip link to the card's page, on a lifted card", async () => {
    const { card, links } = cardOf(
      await chatWithCard({ webLink: { link: page, site: "Paperclip" } }),
    );

    expect(card?.className).toContain("shadow-1");
    expect(links).toHaveLength(1);
    expect(links[0]?.textContent).toContain("Open in Paperclip");
    expect(links[0]?.getAttribute("href")).toBe(page);
  });

  it("links to the place to answer when the card has both links", async () => {
    const answerPage = "https://paperclip.acme.test/ACME/issues/ACME-7#card-1";
    const { links } = cardOf(
      await chatWithCard({
        webLink: { link: page, site: "Paperclip" },
        answerElsewhere: { link: answerPage },
      }),
    );

    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute("href")).toBe(answerPage);
  });

  it("shows no Open in link for a card without a page", async () => {
    const { card, links } = cardOf(await chatWithCard({}));

    expect(card).not.toBeNull();
    expect(links).toHaveLength(0);
  });

  it("lifts a card that asks several questions and gives it the link too", async () => {
    const { card, links } = cardOf(
      await chatWithCard({
        options: [],
        questions: [
          {
            id: "look",
            prompt: "Which looks?",
            selection: "multiple",
            required: true,
            options: [
              { id: "dark", label: "Dark" },
              { id: "wide", label: "Wide" },
            ],
          },
        ],
        webLink: { link: page, site: "Paperclip" },
      }),
    );

    expect(card?.className).toContain("shadow-1");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([page]);
  });
});
