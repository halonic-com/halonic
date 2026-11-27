import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { inboxReachFits } from "./agent-messaging-reach.ts";
import { type InboxItem, type InboxReach, inboxItemFits } from "./index.ts";

const hire: InboxItem = {
  id: "acme:approval:1",
  source: "acme",
  from: { kind: "agent", agent: "acme:bo", name: "Bo" },
  question: "Hire an agent",
  options: [
    { id: "approve", label: "Approve" },
    { id: "reject", label: "Reject" },
  ],
  kind: "approval",
  risk: "risky",
  reach: {
    agent: "Ada",
    adapter: "process",
    env: [
      { name: "ACME_DEPLOY_TOKEN", bindsSecret: true },
      { name: "ACME_REGION", bindsSecret: false },
    ],
  },
  attachments: [],
  createdAt: "2026-11-27T10:00:00Z",
  state: { kind: "open" },
};

const reaching = (reach: InboxReach): InboxItem => ({ ...hire, reach });

verifies("ports.agent-messaging-reach", () => {
  it("holds a risky item's agent, adapter, secret and variables by name", () => {
    expect(inboxItemFits(hire)).toBe(true);
    const secret = { name: "Acme deploy token", settingPath: "env.ACME_DEPLOY_TOKEN" };
    expect(inboxItemFits(reaching({ agent: "Bo", secret }))).toBe(true);
  });

  it("holds a reach only on a risky item", () => {
    expect(inboxItemFits({ ...hire, risk: "normal" })).toBe(false);
    const { risk: _, ...noRisk } = hire;
    expect(inboxReachFits(noRisk)).toBe(false);
    const { reach: __, ...noReach } = hire;
    expect(inboxItemFits({ ...noReach, risk: "normal" })).toBe(true);
  });

  it("refuses a blank, overlong or multi-line name, and a variable named twice", () => {
    expect(inboxItemFits(reaching({ agent: " " }))).toBe(false);
    expect(inboxItemFits(reaching({ adapter: "a".repeat(201) }))).toBe(false);
    expect(inboxItemFits(reaching({ adapter: "a".repeat(200) }))).toBe(true);
    expect(inboxItemFits(reaching({ secret: { name: "Acme\ntoken" } }))).toBe(false);
    expect(inboxItemFits(reaching({ secret: { name: "Acme", settingPath: "env.\u0007" } }))).toBe(
      false,
    );
    const twice = { name: "ACME_REGION", bindsSecret: false };
    expect(inboxItemFits(reaching({ env: [twice, { ...twice, bindsSecret: true }] }))).toBe(false);
  });

  it("refuses a name with a format character or a lone surrogate", () => {
    expect(inboxItemFits(reaching({ agent: "Ada\u202Eevil" }))).toBe(false);
    expect(inboxItemFits(reaching({ agent: "Ada\u200B" }))).toBe(false);
    expect(inboxItemFits(reaching({ adapter: "process\uD83D" }))).toBe(false);
    expect(inboxItemFits(reaching({ agent: "Ada 🚀" }))).toBe(true);
  });

  it("takes a declining option only with declines set to true", () => {
    const declining = { id: "reject", label: "Reject", declines: true } as const;
    expect(inboxItemFits({ ...hire, options: [declining] })).toBe(true);
    const wrong = JSON.parse('{"id":"reject","label":"Reject","declines":false}');
    expect(inboxItemFits({ ...hire, options: [wrong] })).toBe(false);
  });

  it("names at most 100 variables, and counts any more as a whole number above 0", () => {
    const env = (count: number) =>
      Array.from({ length: count }, (_, index) => ({ name: `ACME_${index}`, bindsSecret: false }));
    expect(inboxItemFits(reaching({ env: env(100) }))).toBe(true);
    expect(inboxItemFits(reaching({ env: env(101) }))).toBe(false);
    expect(inboxItemFits(reaching({ env: env(100), envLeftOut: 3 }))).toBe(true);
    for (const envLeftOut of [0, -1, 1.5]) {
      expect(inboxItemFits(reaching({ env: env(1), envLeftOut }))).toBe(false);
    }
  });
});
