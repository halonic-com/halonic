import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { approvalId } from "./acme-data.test-helper.ts";
import { connect, FakePaperclip, sourceId as source } from "./fake-paperclip.test-helper.ts";
import { PaperclipWebLinks } from "./web-links.ts";

/** Acme: cards on the plain task ACME-7 and one pending approval, linked to that task. */
const acme = (): FakePaperclip => new FakePaperclip().serveAcme();

verifies("paperclip-client.web-link", () => {
  it("links every card to its task's page and every approval to its own", async () => {
    const items = await connect(acme(), { offline: false }).listInboxItems();

    const cards = items.filter((item) => item.id.startsWith(`${source}:card:`));
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.webLink).toEqual({
        link: "https://paperclip.acme.test/ACME/issues/ACME-7",
        site: "Paperclip",
      });
    }
    const approval = items.find((item) => item.id === `${source}:approval:${approvalId}`);
    expect(approval?.webLink).toEqual({
      link: `https://paperclip.acme.test/ACME/approvals/${approvalId}`,
      site: "Paperclip",
    });
  });

  it("gives no link on a plain http connection", async () => {
    const paperclip = acme();
    paperclip.address = "http://localhost:3100";

    const items = await connect(paperclip, { offline: false }).listInboxItems();

    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.webLink === undefined)).toBe(true);
  });

  it("encodes every part, so no ID changes where the link goes", () => {
    const links = new PaperclipWebLinks("https://paperclip.acme.test");

    expect(links.approval("ACME", "p/1?x#y")?.link).toBe(
      "https://paperclip.acme.test/ACME/approvals/p%2F1%3Fx%23y",
    );
    expect(links.task("ACME-7/../admin?x")).toBeUndefined();
    expect(links.task("ACME-7")?.link).toBe("https://paperclip.acme.test/ACME/issues/ACME-7");
    expect(links.approval(undefined, "p-1")).toBeUndefined();
  });
});
