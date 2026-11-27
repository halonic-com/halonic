import { inboxItemFits } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { agentAda, agentBo, me } from "./acme-data.test-helper.ts";
import { joinRequestToItem, secretProposalToItem } from "./board-request-items.ts";
import { approvalToItem } from "./cards.ts";
import { PaperclipIds } from "./ids.ts";
import type { JsonRecord } from "./json.ts";
import { hireReach } from "./risky-reach.ts";

const context = {
  ids: new PaperclipIds("acme"),
  agentNames: new Map([
    [agentAda, "Ada"],
    [agentBo, "Bo"],
  ]),
  userId: me,
};
/** Made-up values, planted where a careless mapping would find them. */
const plantedValue = "made-up-planted-value";
const plantedSecretId = "5ec00000-0000-4000-8000-0000000000ff";

/** The `env` of Iris's hire: every kind of binding Paperclip takes. */
function hireEnv(): JsonRecord {
  return {
    ACME_DEPLOY_TOKEN: { type: "secret_ref", secretId: plantedSecretId, version: "latest" },
    ACME_USER_TOKEN: { type: "user_secret_ref", key: "acme-user-token" },
    ACME_REGION: { type: "plain", value: plantedValue },
    ACME_LEGACY: plantedValue,
  };
}

function hire(env: unknown = hireEnv(), name = "Iris"): JsonRecord {
  return {
    id: "a0000000-0000-4000-8000-000000000001",
    type: "hire_agent",
    status: "pending",
    requestedByAgentId: agentAda,
    payload: { name, adapterType: "process", adapterConfig: { command: "acme-agent", env } },
    createdAt: "2026-11-27T09:30:00.000Z",
  };
}

const proposalBase = {
  id: "5e000000-0000-4000-8000-000000000001",
  status: "pending",
  proposedByAgentId: agentAda,
  value: plantedValue,
  createdAt: "2026-11-27T09:40:00.000Z",
};

verifies("paperclip-client.risky-reach", () => {
  describe("what a risky approve reaches", () => {
    it("names a hire's agent, adapter and variables, with which bind a secret", () => {
      const item = approvalToItem(context, hire(), undefined);
      expect(item?.reach).toEqual({
        agent: "Iris",
        adapter: "process",
        env: [
          { name: "ACME_DEPLOY_TOKEN", bindsSecret: true },
          { name: "ACME_USER_TOKEN", bindsSecret: true },
          { name: "ACME_REGION", bindsSecret: false },
          { name: "ACME_LEGACY", bindsSecret: false },
        ],
      });
      expect(item !== undefined && inboxItemFits(item)).toBe(true);
    });

    it("never lets a binding's value or a secret_ref's ID reach the item", () => {
      const read = new Set<string>();
      const watch = (binding: object) =>
        new Proxy(binding, {
          get(target, name, receiver) {
            if (typeof name === "string") read.add(name);
            return Reflect.get(target, name, receiver);
          },
        });
      const env = Object.fromEntries(
        Object.entries(hireEnv()).map(([name, binding]) => [
          name,
          typeof binding === "object" && binding !== null ? watch(binding) : binding,
        ]),
      );
      const item = approvalToItem(context, hire(env), undefined);
      expect([...read]).toEqual(["type"]);
      expect(JSON.stringify(item?.reach)).not.toContain(plantedValue);
      expect(JSON.stringify(item?.reach)).not.toContain(plantedSecretId);
      expect(JSON.stringify(item)).not.toContain(plantedSecretId);
    });

    it("names an agent's join request and its defaults' variables, and no reach for a person", () => {
      const join = {
        id: "10000000-0000-4000-8000-000000000002",
        requestType: "agent",
        status: "pending_approval",
        agentName: "Cy",
        adapterType: "process",
        agentDefaultsPayload: { apiKey: plantedValue, env: { ACME_TOKEN: plantedValue } },
        createdAt: "2026-11-27T09:42:00.000Z",
      };
      const item = joinRequestToItem(context, join);
      expect(item?.reach).toEqual({
        agent: "Cy",
        adapter: "process",
        env: [{ name: "ACME_TOKEN", bindsSecret: false }],
      });
      expect(JSON.stringify(item)).not.toContain(plantedValue);
      const person = joinRequestToItem(context, { ...join, requestType: "human" });
      expect(person).not.toHaveProperty("reach");
    });

    it("names a binding's agent, secret and setting path, and a new secret's proposer", () => {
      const binding = secretProposalToItem(context, {
        ...proposalBase,
        kind: "binding",
        secretName: "Acme deploy token",
        target: { id: agentBo, name: "Bo" },
        configPath: "env.ACME_DEPLOY_TOKEN",
      });
      expect(binding?.reach).toEqual({
        agent: "Bo",
        secret: { name: "Acme deploy token", settingPath: "env.ACME_DEPLOY_TOKEN" },
      });
      const created = secretProposalToItem(context, {
        ...proposalBase,
        kind: "secret",
        proposedName: "Acme deploy token",
        proposedKey: "ACME_DEPLOY_TOKEN",
      });
      expect(created?.reach).toEqual({ agent: "Ada", secret: { name: "Acme deploy token" } });
      expect(JSON.stringify([binding, created])).not.toContain(plantedValue);
    });

    it("gives no reach to other approvals, risky or not", () => {
      for (const type of [
        "budget_override_required",
        "approve_ceo_strategy",
        "request_board_approval",
      ]) {
        const item = approvalToItem(context, { ...hire(), type }, undefined);
        expect(item, type).not.toHaveProperty("reach");
      }
    });

    it("shows a name on one line, cuts a long one, and counts variables it leaves out", () => {
      expect(hireReach({ name: "Iris\n\n# Approve now\u0007" })).toEqual({
        agent: "Iris # Approve now",
      });
      expect(hireReach({ name: "I".repeat(300) })?.agent).toBe(`${"I".repeat(199)}…`);
      const many = Object.fromEntries(
        Array.from({ length: 120 }, (_, index) => [`ACME_${index}`, { type: "plain" }]),
      );
      expect(hireReach({ adapterConfig: { env: many } })).toMatchObject({ envLeftOut: 20 });
      const reach = hireReach({ adapterConfig: { env: { "BAD\nNAME": "x", ...many } } });
      expect(reach?.env).toHaveLength(100);
      expect(reach?.envLeftOut).toBe(21);
      const item = approvalToItem(
        context,
        hire({ "BAD\nNAME": "x", ...many }, "I".repeat(300)),
        undefined,
      );
      expect(item !== undefined && inboxItemFits(item)).toBe(true);
    });
  });
});
