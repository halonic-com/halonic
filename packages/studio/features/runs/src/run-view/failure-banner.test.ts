import type { RunEvent, RunSummary } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { ProviderKind } from "../api.ts";
import { mondayMorning, summaryWith } from "../summary.test-helper.ts";
import { causeBanner } from "./failure-banner.ts";
import { type RunPageContext, runBanner } from "./run-page-model.ts";

const kinds: Record<string, ProviderKind> = { ollama: "local", claude: "cloud" };
const context: RunPageContext = {
  workflow: { name: "Support reply", stepDescription: () => undefined },
  workflowOfRun: () => undefined,
  providerKind: (id) => kinds[id],
  currency: "EUR",
  now: mondayMorning,
};

function event(rest: Record<string, unknown>, seq: number): RunEvent {
  return { runId: "run_a", seq, at: "2026-11-16T08:00:00Z", ...rest } as RunEvent;
}

const call = (provider: string, model: string) =>
  event({ type: "llm.request", agent: "reporter", provider, model, messages: 1 }, 2);
const failedEvent = (host?: string) =>
  event({ type: "run.failed", state: "draft", error: "x", ...(host ? { host } : {}) }, 3);

function failed(reason: RunSummary["reason"], changes: Partial<RunSummary> = {}) {
  return summaryWith({
    status: "failed",
    reason,
    error: "engine text",
    state: "draft",
    ...changes,
  });
}

const lines = (banner: ReturnType<typeof causeBanner>) =>
  banner?.kind === "callout" ? banner.lines : undefined;

const budgetPage = (changes: Partial<RunSummary>) =>
  runBanner({ summary: failed("budget", changes) }, context);

verifies("runs.run-view.failure-banners", () => {
  describe("a model that can't be reached", () => {
    it("tells a cloud provider's from the internet, with the host", () => {
      const log = [call("claude", "claude-sonnet"), failedEvent("api.anthropic.com")];
      expect(lines(causeBanner(failed("model-unreachable"), log, context, false))).toEqual([
        "Halonic couldn't reach Claude at api.anthropic.com for the model claude-sonnet. This computer may be offline. Check your internet connection, then run again.",
      ]);
    });

    it("tells a local provider's from the program that isn't running", () => {
      const log = [call("ollama", "llama3.2"), failedEvent("localhost:11434")];
      expect(lines(causeBanner(failed("model-unreachable"), log, context, false))).toEqual([
        "Halonic couldn't reach Ollama at localhost:11434 for the model llama3.2. Ollama may not be running on this computer. Start Ollama, then run again.",
      ]);
    });

    it("picks by the provider's kind, not by the host, and leaves out a host it wasn't given", () => {
      const log = [call("ollama", "llama3.2"), failedEvent("api.example.net")];
      expect(lines(causeBanner(failed("model-unreachable"), log, context, false))?.[0]).toContain(
        "may not be running on this computer",
      );
      const gone = [call("elsewhere", "m"), failedEvent()];
      expect(lines(causeBanner(failed("model-unreachable"), gone, context, false))).toEqual([
        "Halonic couldn't reach Elsewhere for the model m. This computer may be offline. Check your internet connection, then run again.",
      ]);
    });

    it("names the model alias when the log gives it, and offers Open Models for a local model", () => {
      const log = [
        event(
          {
            type: "llm.request",
            agent: "reporter",
            provider: "ollama",
            model: "llama3.2",
            alias: "fast",
            messages: 1,
          },
          2,
        ),
        failedEvent("localhost:11434"),
      ];
      const banner = causeBanner(failed("model-unreachable"), log, context, false);
      expect(lines(banner)).toEqual([
        "Halonic couldn't reach Ollama at localhost:11434 for the model alias fast. Ollama may not be running on this computer. Start Ollama, then run again.",
      ]);
      expect(banner?.kind === "callout" ? banner.fixes : undefined).toEqual([
        { kind: "open-models" },
      ]);
    });

    it("says the program is on the computer, and where to fix it, on a phone", () => {
      const log = [call("ollama", "llama3.2"), failedEvent("localhost:11434")];
      const banner = causeBanner(failed("model-unreachable"), log, context, true);
      expect(lines(banner)).toEqual([
        "Halonic couldn't reach Ollama on your computer (localhost:11434) for the model llama3.2. Start Ollama there, then run again.",
        "Fix this on your computer: Models",
      ]);
      expect(banner?.kind === "callout" ? banner.fixes : undefined).toBeUndefined();
    });

    it("waits for the log, and for a model call in it", () => {
      expect(causeBanner(failed("model-unreachable"), undefined, context, false)).toBeUndefined();
      expect(
        causeBanner(failed("model-unreachable"), [failedEvent()], context, false),
      ).toBeUndefined();
    });
  });

  describe("a local model that is missing, slow or can't use tools", () => {
    const fixes = (banner: ReturnType<typeof causeBanner>) =>
      banner?.kind === "callout" ? banner.fixes : undefined;
    const alias = (provider: string, model: string, name: string) =>
      event(
        { type: "llm.request", agent: "reporter", provider, model, alias: name, messages: 1 },
        2,
      );

    it("tells Ollama's missing model, with the pull command to copy and Open Models", () => {
      const banner = causeBanner(
        failed("model-missing"),
        [call("ollama", "llama3.2"), failedEvent()],
        context,
        false,
      );
      expect(lines(banner)).toEqual([
        "Ollama is answering, but it doesn't have llama3.2 yet. Run ollama pull llama3.2 in a terminal, or pick another model in Models.",
      ]);
      expect(fixes(banner)).toEqual([
        { kind: "copy-command", command: "ollama pull llama3.2" },
        { kind: "open-models" },
      ]);
    });

    it("sends another local provider to download the model there, with no command", () => {
      const kindsWithStudio: Record<string, ProviderKind> = { ...kinds, lmstudio: "local" };
      const banner = causeBanner(
        failed("model-missing"),
        [call("lmstudio", "qwen"), failedEvent()],
        { ...context, providerKind: (id) => kindsWithStudio[id] },
        false,
      );
      expect(lines(banner)).toEqual([
        "Lmstudio is answering, but it doesn't have qwen yet. Download it in Lmstudio, or pick another model in Models.",
      ]);
      expect(fixes(banner)).toEqual([{ kind: "open-models" }]);
    });

    it("keeps the general banner for a cloud provider's missing model, and waits for the log", () => {
      const log = [call("claude", "claude-sonnet"), failedEvent()];
      expect(causeBanner(failed("model-missing"), log, context, false)).toBeUndefined();
    });

    it("keeps the general banner for a provider that is no longer in the workspace", () => {
      const log = [call("gone", "llama3.2"), failedEvent()];
      expect(causeBanner(failed("model-missing"), log, context, false)).toBeUndefined();
      expect(causeBanner(failed("model-missing"), undefined, context, false)).toBeUndefined();
    });

    it("says to fix a missing model on the computer, with no buttons, on a phone", () => {
      const banner = causeBanner(
        failed("model-missing"),
        [call("ollama", "llama3.2"), failedEvent()],
        context,
        true,
      );
      expect(lines(banner)).toEqual([
        "Ollama on your computer doesn't have llama3.2 yet. Run ollama pull llama3.2 in a terminal there, or pick another model in Models.",
        "Fix this on your computer: Models",
      ]);
      expect(fixes(banner)).toBeUndefined();
    });

    it("tells a local timeout by its address and a cloud one by the step", () => {
      const local = [call("ollama", "llama3.2"), failedEvent("localhost:11434")];
      expect(lines(causeBanner(failed("model-timeout"), local, context, false))).toEqual([
        "Ollama didn't start answering at localhost:11434 within 5 minutes. It may still be loading the model.",
      ]);
      const cloud = [call("claude", "claude-sonnet"), failedEvent("api.anthropic.com")];
      expect(lines(causeBanner(failed("model-timeout"), cloud, context, false))).toEqual([
        "Claude didn't start answering within 5 minutes, so the step Draft stopped. Nothing you set caused this.",
      ]);
      expect(fixes(causeBanner(failed("model-timeout"), local, context, false))).toBeUndefined();
    });

    it("says the local provider is on the computer, on a phone", () => {
      const local = [call("ollama", "llama3.2"), failedEvent("localhost:11434")];
      expect(lines(causeBanner(failed("model-timeout"), local, context, true))).toEqual([
        "Ollama on your computer didn't start answering within 5 minutes. It may still be loading the model.",
      ]);
    });

    it("names the alias for a model that can't use tools, and offers Open Models", () => {
      const banner = causeBanner(
        failed("model-no-tools"),
        [alias("ollama", "llama3.2", "fast"), failedEvent()],
        context,
        false,
      );
      expect(lines(banner)).toEqual([
        "llama3.2, used by the model alias fast, can't use tools, and the step Draft offers tools. Point the model alias fast at a model that can use tools.",
      ]);
      expect(fixes(banner)).toEqual([{ kind: "open-models" }]);
    });

    it("reads a log without the alias, and points a phone to the computer", () => {
      const log = [call("ollama", "llama3.2"), failedEvent()];
      expect(lines(causeBanner(failed("model-no-tools"), log, context, false))).toEqual([
        "llama3.2 can't use tools, and the step Draft offers tools. Pick a model that can in Models, then run again.",
      ]);
      const phone = causeBanner(failed("model-no-tools"), log, context, true);
      expect(lines(phone)?.at(-1)).toBe("Fix this on your computer: Models");
      expect(fixes(phone)).toBeUndefined();
    });
  });

  describe("a model that doesn't fit in memory", () => {
    const log = [call("ollama", "llama3.1:70b")];

    it("says what to do on a computer", () => {
      expect(lines(causeBanner(failed("model-out-of-memory"), log, context, false))).toEqual([
        "Ollama couldn't load llama3.1:70b: this computer doesn't have enough free memory for it.",
        "Close other programs, or pick a smaller model in Models.",
      ]);
    });

    it("offers Open Models on a computer, and not on a phone", () => {
      const open = (phone: boolean) => {
        const banner = causeBanner(failed("model-out-of-memory"), log, context, phone);
        return banner?.kind === "callout" ? banner.fixes : undefined;
      };
      expect(open(false)).toEqual([{ kind: "open-models" }]);
      expect(open(true)).toBeUndefined();
    });

    it("says to fix it on the computer, on a phone", () => {
      expect(lines(causeBanner(failed("model-out-of-memory"), log, context, true))).toEqual([
        "Ollama couldn't load llama3.1:70b: this computer doesn't have enough free memory for it.",
        "Close other programs, or pick a smaller model.",
        "Fix this on your computer: Models",
      ]);
    });
  });

  it("names the agent whose sandbox didn't start, never the engine's text", () => {
    const log = [
      event({ type: "agent.started", state: "draft", agent: "reporter", prompt: "" }, 1),
    ];
    expect(lines(causeBanner(failed("sandbox-start-failed"), log, context, false))).toEqual([
      "Reporter didn't start: the sandbox on this computer didn't start. Nothing ran.",
    ]);
    expect(lines(causeBanner(failed("sandbox-start-failed"), undefined, context, false))).toEqual([
      "The agent didn't start: the sandbox on this computer didn't start. Nothing ran.",
    ]);
  });

  it("says the disk is full, in the step it stopped in", () => {
    expect(lines(causeBanner(failed("disk-full"), undefined, context, false))).toEqual([
      "Support reply stopped in the step Draft: the disk is full, so Halonic couldn't write the run log. Free some space, then run again.",
    ]);
  });

  it("says the engine stopped, during a step or before the first", () => {
    const during = failed("interrupted", { statesVisited: ["draft"] });
    expect(lines(causeBanner(during, undefined, context, false))).toEqual([
      "Support reply stopped because Halonic's engine stopped during the step Draft. Nothing after that step ran.",
    ]);
    const before = failed("interrupted", { statesVisited: [], state: null });
    expect(lines(causeBanner(before, undefined, context, false))).toEqual([
      "Support reply stopped because Halonic's engine stopped before the first step. Nothing ran.",
    ]);
  });

  it("leaves every other run to the page's other banners", () => {
    expect(causeBanner(failed("error"), [], context, false)).toBeUndefined();
    expect(causeBanner(failed(null), [], context, false)).toBeUndefined();
    expect(
      causeBanner(summaryWith({ status: "running", reason: "disk-full" }), [], context, false),
    ).toBeUndefined();
  });

  describe("a budget stop with the engine's cause", () => {
    // The same examples as the CLI's `run-failures.test.ts` (requirement `cli.run-failure`).
    const stopped = (code: string, detail: Record<string, string>, endedAt?: string) =>
      budgetPage({
        error: "Run budget reached: 5.08 of 5.00 EUR spent.",
        cause: { kind: "limit_reached", code, detail },
        ...(endedAt === undefined ? {} : { endedAt }),
      });
    const linesOf = (banner: ReturnType<typeof stopped>) =>
      banner?.kind === "callout" ? banner.lines : undefined;
    const checks =
      "Halonic checks the budget before each step. A step can make several model calls, so a run can go over.";

    it("says the CLI's first line and Studio's second for a run's budget", () => {
      const banner = stopped("budget.run", { limit: "5", spent: "5.08", currency: "EUR" });
      expect(linesOf(banner)).toEqual([
        "Support reply stopped in the step Draft: this run reached its budget of €5.00 (estimated €5.08 spent).",
        "Change the budget, then run again.",
        checks,
      ]);
      expect(banner).toMatchObject({
        tone: "attention",
        title: "Stopped at its estimated budget",
        fixes: [{ kind: "change-budget" }],
      });
    });

    it("says a tiny budget as less than, never as under", () => {
      const banner = stopped("budget.run", { limit: "0.0003", spent: "0.0004", currency: "EUR" });
      expect(linesOf(banner)?.[0]).toBe(
        "Support reply stopped in the step Draft: this run reached its budget of less than €0.001 (estimated less than €0.001 spent).",
      );
    });

    it("says the CLI's first line and Studio's second for the month's budget, with when it resets, in the budget's currency", () => {
      const banner = stopped(
        "budget.month",
        { limit: "50", spent: "50.1", currency: "USD" },
        "2026-12-31T23:30:00Z",
      );
      expect(linesOf(banner)).toEqual([
        "Support reply stopped in the step Draft: this month's estimated spend reached its budget of $50.00.",
        "Change the budget, or wait until it resets on 1 January (UTC).",
        checks,
      ]);
    });

    it("keeps the general budget words for a cause that is missing a figure", () => {
      expect(linesOf(stopped("budget.run", { limit: "5", currency: "EUR" }))).toEqual([
        "Support reply stopped in the step Draft.",
        checks,
      ]);
    });
  });

  it("keeps the general budget words for a budget stop without a cause", () => {
    const banner = runBanner(
      { summary: failed("budget", { error: "Run budget reached: 5.08 of 5.00 EUR spent." }) },
      context,
    );
    expect(banner?.kind === "callout" && banner.lines[0]).toBe(
      "Support reply stopped in the step Draft.",
    );
  });
});
