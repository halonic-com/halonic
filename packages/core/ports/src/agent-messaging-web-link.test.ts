import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { answerFitsItem, type InboxItem, inboxItemFits } from "./index.ts";

const linked: InboxItem = {
  id: "acme:item:7",
  source: "acme",
  from: { kind: "agent", agent: "acme:ada", name: "Ada" },
  question: "Pick the launch date",
  options: [],
  webLink: { link: "https://acme.example/ACME/issues/ACME-7", site: "Paperclip" },
  attachments: [],
  createdAt: "2026-11-25T10:00:00Z",
  state: { kind: "open" },
};

const withLink = (link: string, site = "Paperclip"): InboxItem => ({
  ...linked,
  webLink: { link, site },
});

verifies("ports.agent-messaging-web-link", () => {
  it("holds an https page and still takes an answer", () => {
    expect(inboxItemFits(linked)).toBe(true);
    expect(answerFitsItem(linked, { kind: "reply", text: "Tomorrow" })).toBe(true);
  });

  it("holds only an https link, checked as an answerElsewhere link is", () => {
    expect(inboxItemFits(withLink("http://acme.example/ACME/issues/ACME-7"))).toBe(false);
    expect(inboxItemFits(withLink("javascript:alert(1)"))).toBe(false);
    expect(inboxItemFits(withLink("/ACME/issues/ACME-7"))).toBe(false);
    expect(inboxItemFits(withLink("https://board@acme.example/ACME-7"))).toBe(false);
    expect(inboxItemFits(withLink(`https://acme.example/${"a".repeat(2000)}`))).toBe(false);
  });

  it("names its site in 1 to 80 characters", () => {
    const page = "https://acme.example/ACME/issues/ACME-7";

    expect(inboxItemFits(withLink(page, " "))).toBe(false);
    expect(inboxItemFits(withLink(page, "a".repeat(81)))).toBe(false);
    expect(inboxItemFits(withLink(page, "a".repeat(80)))).toBe(true);
  });
});
