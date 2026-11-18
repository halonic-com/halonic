import type { WorkspaceModels } from "@halonicjs/app/run-failure";
import type { RunEvent, RunSummary } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { ProviderKind } from "../api.ts";
import { mondayMorning, summaryWith } from "../summary.test-helper.ts";
import { billingPageOf } from "./billing-pages.ts";
import { causeBanner } from "./failure-banner.ts";
import type { RunPageContext } from "./run-page-model.ts";

type Provider = NonNullable<ReturnType<WorkspaceModels["providers"]["get"]>>;

const anthropic: Provider = {
  version: 1,
  id: "anthropic",
  name: "Anthropic",
  type: "anthropic",
  secret: "anthropic-key",
  local: false,
  options: {},
};
const openai: Provider = {
  version: 1,
  id: "openai",
  name: "OpenAI",
  type: "openai-compatible",
  baseUrl: "https://api.openai.com/v1",
  secret: "openai-key",
  local: false,
  options: {},
};

const models: WorkspaceModels = {
  name: "Acme",
  aliases: new Map([
    ["default", { provider: "anthropic", model: "claude-sonnet", params: {}, fallback: [] }],
    ["smart", { provider: "openai", model: "gpt-4o", params: {}, fallback: [] }],
    ["next", { provider: "openai", model: "gpt-9", params: {}, fallback: [] }],
  ]),
  providers: new Map([anthropic, openai].map((provider) => [provider.id, provider])),
  addresses: new Map(),
};

const kinds: Record<string, ProviderKind> = { anthropic: "cloud", openai: "cloud" };
const context: RunPageContext = {
  workflow: { name: "Support reply", stepDescription: () => undefined },
  workflowOfRun: () => undefined,
  providerKind: (id) => kinds[id],
  providerName: (id) => models.providers.get(id)?.name,
  agentName: (id) => (id === "sorter" ? "Sorter" : undefined),
  models,
  currency: "EUR",
  now: mondayMorning,
};

function event(rest: Record<string, unknown>, seq: number): RunEvent {
  return { runId: "run_a", seq, at: "2026-11-16T08:00:00Z", ...rest } as RunEvent;
}

const call = (provider: string, model: string) =>
  event({ type: "llm.request", agent: "sorter", provider, model, messages: 1 }, 2);
const skipped = (alias: string, provider: string, model: string, reason: string) =>
  event({ type: "llm.skipped", agent: "sorter", alias, provider, model, reason }, 2);
const failedWith = (reason: string) =>
  event({ type: "run.failed", state: "draft", error: "HTTP 401 from the provider", reason }, 3);

function failed(reason: RunSummary["reason"]) {
  return summaryWith({ status: "failed", reason, error: "engine text", state: "draft" });
}

function bannerOf(reason: NonNullable<RunSummary["reason"]>, log: RunEvent[], phone = false) {
  return causeBanner(failed(reason), [...log, failedWith(reason)], context, phone);
}

const linesOf = (banner: ReturnType<typeof causeBanner>) =>
  banner?.kind === "callout" ? banner.lines : undefined;
const fixesOf = (banner: ReturnType<typeof causeBanner>) =>
  banner?.kind === "callout" ? banner.fixes : undefined;

verifies("runs.run-view.account-banners", () => {
  describe("a key", () => {
    it("says there's no key when none was sent, with Add key", () => {
      const banner = bannerOf("key-refused", [
        skipped("default", "anthropic", "claude-sonnet", "no-key"),
      ]);
      expect(linesOf(banner)).toEqual([
        "Anthropic has no API key on this computer, and the model alias default needs one.",
      ]);
      expect(fixesOf(banner)).toEqual([{ kind: "open-models", label: "Add key" }]);
    });

    it("names the secret of a key the provider turned away, with Replace key", () => {
      const banner = bannerOf("key-refused", [call("openai", "gpt-4o")]);
      expect(linesOf(banner)).toEqual([
        "OpenAI didn't accept the key in the secret openai-key, used by the model alias smart. It may be mistyped, revoked, or for another account.",
      ]);
      expect(fixesOf(banner)).toEqual([{ kind: "open-models", label: "Replace key" }]);
    });

    it("says to fix it on the computer on a phone", () => {
      const banner = bannerOf("key-refused", [call("openai", "gpt-4o")], true);
      expect(linesOf(banner)?.[1]).toBe("Fix this on your computer: Models");
      expect(fixesOf(banner)).toBeUndefined();
    });

    // The shared facts name a provider without a `name` by its id ("openai"); the banner keeps the
    // run page's one rule (R8) and says "OpenAI", as the other banners do.
    it("names a provider whose file has no name by its known name, not its id", () => {
      const { name: _name, ...unnamed } = openai;
      const unnamedModels: WorkspaceModels = {
        ...models,
        providers: new Map([[openai.id, unnamed]]),
      };
      const banner = causeBanner(
        failed("key-refused"),
        [call("openai", "gpt-4o"), failedWith("key-refused")],
        { ...context, models: unnamedModels, providerName: () => undefined },
        false,
      );
      expect(linesOf(banner)?.[0]).toMatch(/^OpenAI didn't accept the key/);
    });
  });

  it("says a busy provider stopped the step, and that nothing the person set caused it", () => {
    expect(linesOf(bannerOf("provider-busy", [call("anthropic", "claude-sonnet")]))).toEqual([
      "Anthropic was busy and asked Halonic to slow down, so the step Draft stopped. Nothing you set caused this.",
    ]);
  });

  describe("no credit", () => {
    it("says it isn't the Halonic budget, with the provider's billing page", () => {
      const banner = bannerOf("out-of-credit", [call("openai", "gpt-4o")]);
      expect(linesOf(banner)).toEqual([
        "OpenAI refused the call because the account has no credit left or reached its limit at OpenAI. This isn't your Halonic budget.",
      ]);
      expect(fixesOf(banner)).toEqual([
        {
          kind: "open-external",
          label: "Open OpenAI billing",
          address: "https://platform.openai.com/settings/organization/billing/overview",
          opens: "Opens OpenAI",
        },
      ]);
    });

    it("knows the billing pages of Anthropic, OpenAI and Gemini only", () => {
      expect(billingPageOf(anthropic)).toBe("https://console.anthropic.com/settings/billing");
      expect(
        billingPageOf({
          ...openai,
          baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
        }),
      ).toBe("https://ai.google.dev/gemini-api/docs/billing");
      expect(billingPageOf({ ...openai, baseUrl: "https://gateway.acme.example/v1" })).toBe(
        undefined,
      );
      expect(billingPageOf({ ...openai, baseUrl: "not an address" })).toBeUndefined();
      expect(billingPageOf({ ...openai, type: "lmstudio", baseUrl: undefined })).toBeUndefined();
    });
  });

  it("names the model a cloud provider doesn't have and its alias, with Open Models", () => {
    const banner = bannerOf("model-missing", [call("openai", "gpt-9")]);
    expect(linesOf(banner)).toEqual([
      "OpenAI doesn't have the model gpt-9, used by the model alias next. Pick another model for next in Models.",
    ]);
    expect(fixesOf(banner)).toEqual([{ kind: "open-models" }]);
    expect(linesOf(bannerOf("model-missing", [call("openai", "o5")]))).toEqual([
      "OpenAI doesn't have the model o5. Pick another model in Models.",
    ]);
  });

  describe("local only", () => {
    const log = [skipped("smart", "openai", "gpt-4o", "local-only")];

    it("names the workspace, the provider and the agent's alias, without Run again", () => {
      const banner = bannerOf("local-only", log);
      expect(linesOf(banner)).toEqual([
        "Acme is local only, so Halonic sent nothing to OpenAI. Sorter's model alias smart points to a cloud model.",
      ]);
      expect(fixesOf(banner)).toEqual([
        { kind: "open-models", label: "Choose a local model for Sorter" },
      ]);
      expect(banner).toMatchObject({ noRunAgain: true });
    });

    it("says to fix it on the computer on a phone, still without Run again", () => {
      const banner = bannerOf("local-only", log, true);
      expect(linesOf(banner)?.[1]).toBe("Fix this on your computer: Models");
      expect(banner).toMatchObject({ noRunAgain: true });
    });
  });

  describe("without the facts", () => {
    it("keeps the general banner until the log and the workspace's models are read", () => {
      expect(causeBanner(failed("key-refused"), undefined, context, false)).toBeUndefined();
      const { models: _, ...unread } = context;
      const log = [call("openai", "gpt-4o"), failedWith("key-refused")];
      expect(causeBanner(failed("key-refused"), log, unread, false)).toBeUndefined();
    });

    it("keeps it for a run that called no model, or a provider without a secret", () => {
      expect(bannerOf("out-of-credit", [])).toBeUndefined();
      const keyless = { ...context, models: { ...models, providers: new Map() } };
      const log = [call("openai", "gpt-4o"), failedWith("key-refused")];
      expect(causeBanner(failed("key-refused"), log, keyless, false)).toBeUndefined();
    });

    it("never shows the engine's or the provider's own text", () => {
      const banner = bannerOf("key-refused", [call("openai", "gpt-4o")]);
      expect(linesOf(banner)?.join(" ")).not.toContain("HTTP 401");
    });
  });
});
