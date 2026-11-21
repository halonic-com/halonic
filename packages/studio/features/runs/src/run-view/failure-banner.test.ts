import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { ProviderKind } from "../api.ts";
import { summaryWith } from "../summary.test-helper.ts";
import {
  budgetPage,
  call,
  context,
  event,
  failed,
  failedEvent,
  kinds,
  lines,
} from "./failure-banner.test-helper.ts";
import { causeBanner } from "./failure-banner.ts";
import { runBanner } from "./run-page-model.ts";

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
        "Halonic couldn't reach elsewhere for the model m. This computer may be offline. Check your internet connection, then run again.",
      ]);
    });

    it("names the model alias when the log gives it, and offers Open Models after Run again for a local model", () => {
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
      expect(banner?.kind === "callout" ? banner.fixes : undefined).toBeUndefined();
      expect(banner?.kind === "callout" ? banner.links : undefined).toEqual([
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

    it("points to the address in Models, with no empty host, when the address has none", () => {
      const noHost = event({ type: "run.failed", state: "draft", error: "x", host: "" }, 3);
      const log = [call("ollama", "llama3.2"), noHost];
      const banner = causeBanner(failed("model-unreachable"), log, context, false);
      expect(lines(banner)).toEqual([
        "Halonic couldn't reach Ollama for the model llama3.2: its address has no host. Check Ollama's address in Models. It starts with http:// or https://, such as http://localhost:11434.",
      ]);
      expect(banner?.kind === "callout" ? banner.fixes : undefined).toEqual([
        { kind: "open-models" },
      ]);
      expect(lines(causeBanner(failed("model-unreachable"), log, context, true))?.[1]).toBe(
        "Fix this on your computer: Models",
      );
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
    const links = (banner: ReturnType<typeof causeBanner>) =>
      banner?.kind === "callout" ? banner.links : undefined;
    const alias = (provider: string, model: string, name: string) =>
      event(
        { type: "llm.request", agent: "reporter", provider, model, alias: name, messages: 1 },
        2,
      );

    it("tells Ollama's missing model, with the pull command to copy before Run again and Open Models after it", () => {
      const banner = causeBanner(
        failed("model-missing"),
        [call("ollama", "llama3.2"), failedEvent()],
        context,
        false,
      );
      expect(lines(banner)).toEqual([
        "Ollama is answering, but it doesn't have llama3.2 yet. Run ollama pull llama3.2 in a terminal, or pick another model in Models.",
      ]);
      expect(fixes(banner)).toEqual([{ kind: "copy-command", command: "ollama pull llama3.2" }]);
      expect(links(banner)).toEqual([{ kind: "open-models" }]);
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
        "LM Studio is answering, but it doesn't have qwen yet. Download it in LM Studio, or pick another model in Models.",
      ]);
      expect(fixes(banner)).toBeUndefined();
      expect(links(banner)).toEqual([{ kind: "open-models" }]);
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
      expect(links(banner)).toBeUndefined();
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

    it("names the alias for a model that can't use tools, and offers Open Models at its tab before Run again", () => {
      const banner = causeBanner(
        failed("model-no-tools"),
        [alias("ollama", "llama3.2", "fast"), failedEvent()],
        context,
        false,
      );
      expect(lines(banner)).toEqual([
        "llama3.2, used by the model alias fast, can't use tools, and the step Draft offers tools. Point the model alias fast at a model that can use tools.",
      ]);
      expect(fixes(banner)).toEqual([{ kind: "open-models", alias: "fast" }]);
    });

    it("reads a log without the alias, and points a phone to the computer", () => {
      const log = [call("ollama", "llama3.2"), failedEvent()];
      const banner = causeBanner(failed("model-no-tools"), log, context, false);
      expect(lines(banner)).toEqual([
        "llama3.2 can't use tools, and the step Draft offers tools. Pick a model that can in Models, then run again.",
      ]);
      expect(fixes(banner)).toEqual([{ kind: "open-models" }]);
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

  it("names the agent as its file does, and puts the engine's text in Copy details (F6)", () => {
    const log = [event({ type: "agent.started", state: "draft", agent: "rep-1", prompt: "" }, 1)];
    const named = {
      ...context,
      agentName: (id: string) => (id === "rep-1" ? "Reporter" : undefined),
    };
    const banner = causeBanner(failed("sandbox-start-failed"), log, named, false);
    const line = "Reporter didn't start: the sandbox on this computer didn't start. Nothing ran.";
    expect(lines(banner)).toEqual([line]);
    const details = banner?.kind === "callout" ? banner.details : undefined;
    expect(details?.split("\n")).toEqual([line, expect.stringMatching(/^Run /), "engine text"]);
  });

  describe("a secrets file other users can read", () => {
    // The same cause and fix as the CLI's `run-failures.ts` (HAL-12569).
    const file = "/profile/secrets/secrets.json";
    const readable = (detail: Record<string, string>) =>
      failed("error", { cause: { kind: "denied", code: "secrets.file-readable", detail } });

    it("names the file and says to chmod 600 it, with no button", () => {
      const banner = causeBanner(readable({ file }), undefined, context, false);
      expect(lines(banner)).toEqual([
        "Support reply stopped in the step Draft: the secrets file /profile/secrets/secrets.json can be read by other users. Run chmod 600 /profile/secrets/secrets.json, then run again.",
      ]);
      expect(banner).toMatchObject({ tone: "danger" });
      expect(banner?.kind === "callout" ? banner.fixes : undefined).toBeUndefined();
    });

    it("says to run it on the computer on a phone", () => {
      expect(lines(causeBanner(readable({ file }), undefined, context, true))).toEqual([
        "Support reply stopped in the step Draft: the secrets file /profile/secrets/secrets.json can be read by other users. Run chmod 600 /profile/secrets/secrets.json on your computer, then run again.",
      ]);
    });

    it("keeps the general banner for a cause that doesn't name the file", () => {
      expect(causeBanner(readable({}), undefined, context, false)).toBeUndefined();
    });
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

  describe("the provider's name (E6)", () => {
    const unreachable = (provider: string, named?: (providerId: string) => string | undefined) =>
      lines(
        causeBanner(
          failed("model-unreachable"),
          [call(provider, "gpt-4o"), failedEvent("api.example.net")],
          {
            ...context,
            providerKind: () => "cloud",
            ...(named === undefined ? {} : { providerName: named }),
          },
          false,
        ),
      )?.[0];

    it("names a provider by the name its file gives", () => {
      expect(unreachable("work", (id) => (id === "work" ? "Work GPT" : undefined))).toMatch(
        /^Halonic couldn't reach Work GPT at /,
      );
    });

    it("names a provider without a name, or one that is gone, by its known name, never its id with a capital", () => {
      expect(unreachable("openai", () => undefined)).toMatch(/^Halonic couldn't reach OpenAI at /);
      expect(unreachable("lmstudio", undefined)).toMatch(/^Halonic couldn't reach LM Studio at /);
    });

    it("names any other provider by its id as written", () => {
      expect(unreachable("my-server", undefined)).toMatch(/^Halonic couldn't reach my-server at /);
    });
  });
});

verifies("runs.run-view.trust-removed", () => {
  const cause = { kind: "denied", code: "workspace.trust-removed" } as const;

  it("says the trust was removed, during a step or before the first", () => {
    const during = failed("interrupted", { statesVisited: ["draft"], cause });
    expect(lines(causeBanner(during, undefined, context, false))).toEqual([
      "Support reply stopped because this workspace's trust was removed during the step Draft. Nothing after that step ran.",
    ]);
    const before = failed("interrupted", { statesVisited: [], state: null, cause });
    expect(lines(causeBanner(before, undefined, context, false))).toEqual([
      "Support reply stopped because this workspace's trust was removed before the first step. Nothing ran.",
    ]);
    expect(causeBanner(during, undefined, context, false)).toMatchObject({ tone: "danger" });
  });

  it("keeps the engine's sentence for an interrupted run with another cause or none", () => {
    const other = failed("interrupted", {
      statesVisited: ["draft"],
      cause: { kind: "unavailable", code: "something-else" },
    });
    expect(lines(causeBanner(other, undefined, context, false))).toEqual([
      "Support reply stopped because Halonic's engine stopped during the step Draft. Nothing after that step ran.",
    ]);
  });
});
