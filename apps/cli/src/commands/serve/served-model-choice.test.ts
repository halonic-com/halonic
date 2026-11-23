import { MemoryDefinitionStore, MemoryVcs } from "@halonicjs/adapter-memory";
import { choiceKey } from "@halonicjs/app";
import type { TrustGate, TrustState } from "@halonicjs/host-server";
import type { SecretStore } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { webCryptoDigest } from "../../workspace-runs.ts";
import { choiceCommitMessage } from "./choice-files.ts";
import {
  maxChoiceSessions,
  readOnlyTrust,
  servedChoiceKeys,
  servedModelChoice,
} from "./served-model-choice.ts";

/** An invented key in Anthropic's shape. */
const acmeKey = "sk-ant-acme-not-real-7f3a";

const anthropicReply = {
  id: "msg_acme",
  type: "message",
  role: "assistant",
  model: "claude-haiku-4-5",
  content: [{ type: "text", text: "refund" }],
  stop_reason: "end_turn",
  usage: { input_tokens: 1, output_tokens: 1 },
};

const acmeModels = "aliases:\n  default:\n    provider: mock\n    model: echo\n";

class FakeKeys implements Pick<SecretStore, "get" | "set" | "remove"> {
  readonly values = new Map<string, string>();
  async get(name: string) {
    return this.values.get(name) ?? null;
  }
  async set(name: string, value: string) {
    this.values.set(name, value);
  }
  async remove(name: string) {
    this.values.delete(name);
  }
}

async function setup(files: Readonly<Record<string, string>> = {}) {
  const store = new MemoryDefinitionStore({
    "workspace.yaml": "# Acme is an invented company.\nid: acme\nname: Acme\n",
    "models.yaml": acmeModels,
    "providers/mock.yaml": "id: mock\nname: Test model\ntype: mock\nlocal: true\n",
    ...files,
  });
  const vcs = new MemoryVcs(store);
  await vcs.init();
  await vcs.commitVersion({ message: "Start", exclude: [] });
  const keys = new FakeKeys();
  const calls: { url: string; key: string | null }[] = [];
  const gate = { state: "trusted" as TrustState, checks: 0 };
  const trust: TrustGate = {
    check: async () => {
      gate.checks += 1;
      return { state: gate.state, message: "" };
    },
  };
  const port = servedModelChoice({
    files: { store, root: "/acme", openHistory: async () => ({ vcs, close: async () => {} }) },
    keys,
    secrets: keys,
    trust,
    http: {
      fetch: async (url, init) => {
        calls.push({ url, key: new Headers(init?.headers).get("x-api-key") });
        return Response.json(anthropicReply);
      },
    },
    digest: webCryptoDigest,
  });
  return { port, store, vcs, keys, calls, gate };
}

const anthropic = { kind: "key", provider: "anthropic" } as const;

describe("the model choice `halonic serve` gives a served window", () => {
  verifies("cli.commands.serve.model-choice", () => {
    it("tests the key at the provider's own address, saves it and says whether trust still holds", async () => {
      const { port, keys, calls, gate } = await setup();
      const service = port.forSession("session-a");

      const tested = await service.test(anthropic, choiceKey(acmeKey));
      if (tested.kind !== "tested" || tested.outcome !== "ok") throw new Error("not passed");
      // The choice adds a provider, so the workspace needs trust again on this computer.
      gate.state = "changed";
      const saved = await service.continue(tested.testId, undefined);

      expect(calls).toEqual([{ url: "https://api.anthropic.com/v1/messages", key: acmeKey }]);
      expect(keys.values.get("anthropic-api-key")).toBe(acmeKey);
      expect(saved).toMatchObject({ ok: true, trusted: false });
      expect(await service.keySaved("anthropic")).toBe(true);
    });

    it("never offers a fingerprint to trust, and refuses every grant", async () => {
      const { port, gate } = await setup();
      const service = port.forSession("session-a");
      const tested = await service.test(anthropic, choiceKey(acmeKey));
      if (tested.kind !== "tested" || tested.outcome !== "ok") throw new Error("not passed");

      expect((await service.preview(tested.testId))?.fingerprint).toBeUndefined();
      const trust = readOnlyTrust({ check: async () => ({ state: "trusted", message: "" }) });
      expect(await trust.grant("sha256:acme")).toMatchObject({ ok: false });
      expect(gate.checks).toBeGreaterThan(0);
    });

    it.each(["token-key", "serve-password", "plugin__weather__acme-key"])(
      "never saves a key under %s, a name Halonic or a plugin owns",
      async (name) => {
        const { port, keys } = await setup({
          "providers/anthropic.yaml": `id: anthropic\nname: Anthropic\ntype: anthropic\nsecret: ${name}\n`,
        });
        keys.values.set(name, "acme-server-value");
        const service = port.forSession("session-a");
        const tested = await service.test(anthropic, choiceKey(acmeKey));
        // The test call already refuses such a name, so Continue has no passed test to save.
        const testId =
          tested.kind === "tested" && tested.outcome === "ok" ? tested.testId : "no-passed-test";

        expect(await service.continue(testId, undefined)).toMatchObject({
          ok: false,
          keySaved: false,
        });
        expect(keys.values.get(name)).toBe("acme-server-value");
      },
    );

    it.each(["token-key", "serve-password", "plugin__weather__acme-key"])(
      "refuses %s where Continue saves the key, before the secrets file is asked",
      async (name) => {
        const keys = new FakeKeys();
        keys.values.set(name, "acme-server-value");
        const save = servedChoiceKeys({ keys, secrets: keys });

        await expect(save.remove(name)).rejects.toThrow(RangeError);
        await expect(save.save(name, choiceKey(acmeKey))).rejects.toThrow(RangeError);
        expect(keys.values.get(name)).toBe("acme-server-value");
        await save.save("anthropic-api-key", choiceKey(acmeKey));
        expect(keys.values.get("anthropic-api-key")).toBe(acmeKey);
      },
    );

    it("keeps one service per session, and forgets the one used longest ago", async () => {
      const { port } = await setup();
      const first = port.forSession("session-0");
      expect(port.forSession("session-0")).toBe(first);
      for (let index = 1; index <= maxChoiceSessions; index += 1)
        port.forSession(`session-${index}`);

      expect(port.forSession("session-0")).not.toBe(first);
      expect(port.forSession(`session-${maxChoiceSessions}`)).toBe(
        port.forSession(`session-${maxChoiceSessions}`),
      );
    });

    it("saves a session's choice from its own test, not another's", async () => {
      const { port, vcs } = await setup();
      const a = port.forSession("session-a");
      const b = port.forSession("session-b");
      const testedA = await a.test(anthropic, choiceKey(acmeKey));
      await b.test({ kind: "key", provider: "openai" }, choiceKey("sk-acme-0123456789abcdef"));
      if (testedA.kind !== "tested" || testedA.outcome !== "ok") throw new Error("not passed");

      expect(await a.continue(testedA.testId, undefined)).toMatchObject({ ok: true });
      const [last] = await vcs.log(1);
      expect(last?.message).toBe(choiceCommitMessage);
      expect(await vcs.readAt(last?.hash ?? "", "providers/openai.yaml")).toBeNull();
      expect(await vcs.readAt(last?.hash ?? "", "providers/anthropic.yaml")).not.toBeNull();
    });
  });

  verifies("cli.commands.serve.choice-commit", () => {
    it("refuses Continue with the approved line when models.yaml has changes of its own", async () => {
      const { port, store } = await setup();
      const service = port.forSession("session-a");
      const tested = await service.test(anthropic, choiceKey(acmeKey));
      if (tested.kind !== "tested" || tested.outcome !== "ok") throw new Error("not passed");
      await store.write("models.yaml", `# An edit of its own\n${acmeModels}`);

      expect(await service.continue(tested.testId, undefined)).toEqual({
        ok: false,
        failed: "not-committed",
        keySaved: true,
        files: ["models.yaml"],
        reason:
          "Couldn't save: models.yaml has changes that aren't committed. Commit or undo them, then try again.",
      });
      expect(await store.read("providers/anthropic.yaml")).toBeNull();
    });
  });
});
