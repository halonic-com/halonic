import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { paintFor } from "../output/paint.ts";
import { listInWords, timesInWords } from "./counts.ts";
import { money } from "./money.ts";
import { plainText, renderPhrase } from "./phrase.ts";
import { type FailedRun, type RunFailure, runFailedLines } from "./run-failures.ts";

const draftReply: FailedRun = { title: "Support reply", step: "Draft reply", runId: "01JD8Q" };

/** Line 1 and line 2 of a failed run as plain words, with the run in the step `step`. */
function lines(failure: RunFailure, step = "Draft reply", dir?: string): [string, string] {
  const { message, fix } = runFailedLines({ ...draftReply, step, dir }, failure);
  return [plainText(message.phrase), plainText(fix.phrase)];
}

verifies("cli.messages", () => {
  it("has a failed run's two lines word for word, from cli-output 3.4", () => {
    const failure: RunFailure = {
      reason: "key-refused",
      provider: "OpenAI",
      secret: "openai-key",
      alias: "smart",
    };
    const { message, fix } = runFailedLines(draftReply, failure);
    expect(message.key).toBe("runFailed.key-refused");
    expect(fix.key).toBe("runFailedFix.key-refused");
    expect(lines(failure)).toEqual([
      "Support reply failed in the step Draft reply: OpenAI didn't accept the key in the secret openai-key (HALONIC_SECRET_OPENAI_KEY), used by the model alias smart.",
      "Replace the key in Studio (Settings › Models › OpenAI), or set HALONIC_SECRET_OPENAI_KEY, then run again.",
    ]);
  });

  it("says a run budget stopped the run, and only a monthly one resets (revision 23)", () => {
    expect(lines({ reason: "budget", per: "run", budget: 5, spent: 5.08 })).toEqual([
      "Support reply stopped in the step Draft reply: this run reached its budget of €5.00 (estimated €5.08 spent).",
      "Raise the budget in models.yaml.",
    ]);
    expect(lines({ reason: "budget", per: "month", budget: 50, resetsOn: "1 Dec" })).toEqual([
      "Support reply stopped in the step Draft reply: this month's estimated spend reached its budget of €50.00.",
      "Raise the budget in models.yaml, or wait until it resets on 1 Dec.",
    ]);
  });
});

describe("a failed run's lines, from cli-output 3.4 revision 23", () => {
  it("names the secret's variable as the environment reader does", () => {
    const failure: RunFailure = {
      reason: "no-key",
      provider: "OpenAI",
      secret: "openai-key",
      alias: "smart",
    };
    expect(lines(failure)).toEqual([
      "Support reply failed in the step Draft reply: there's no key in the secret openai-key (HALONIC_SECRET_OPENAI_KEY), used by the model alias smart.",
      "Add the key in Studio (Settings › Models › OpenAI), or set HALONIC_SECRET_OPENAI_KEY, then run again.",
    ]);
  });

  it("has a signed-out account and a provider without credit", () => {
    expect(
      lines({ reason: "signed-out", service: "Gmail", account: "fin@acme.example" }, "Read mail"),
    ).toEqual([
      "Support reply failed in the step Read mail: Gmail (fin@acme.example) is signed out. Nothing was sent.",
      "Sign in again in Studio (Library › Gmail), then run again.",
    ]);
    expect(lines({ reason: "out-of-credit", provider: "OpenAI" })).toEqual([
      "Support reply failed in the step Draft reply: OpenAI refused the call because the account has no credit left or reached its limit at OpenAI.",
      "Add credit at OpenAI, then run again. This isn't your Halonic budget.",
    ]);
  });

  it("asks to try later for a busy provider, a slow model and a slow tool", () => {
    expect(
      lines({ reason: "provider-busy", provider: "Anthropic", tries: 3, over: "2 minutes" }),
    ).toEqual([
      "Support reply failed in the step Draft reply: Anthropic was busy and asked Halonic to slow down. Halonic tried 3 times over 2 minutes, then stopped.",
      "Run it again in a few minutes.",
    ]);
    expect(
      lines({ reason: "provider-busy", provider: "Anthropic", tries: 1, over: "1 minute" })[0],
    ).toBe(
      "Support reply failed in the step Draft reply: Anthropic was busy and asked Halonic to slow down. Halonic tried once over 1 minute, then stopped.",
    );
    expect(lines({ reason: "model-timeout", provider: "Anthropic", within: "5 minutes" })).toEqual([
      "Support reply failed in the step Draft reply: Anthropic didn't start answering within 5 minutes.",
      "Run it again in a few minutes.",
    ]);
    expect(
      lines({
        reason: "model-timeout",
        provider: "Ollama",
        within: "5 minutes",
        localAddress: "localhost:11434",
      })[0],
    ).toBe(
      "Support reply failed in the step Draft reply: Ollama didn't start answering at localhost:11434 within 5 minutes. It may still be loading the model.",
    );
    expect(
      lines(
        {
          reason: "tool-timeout",
          tool: "search_pages",
          connector: "Notion",
          within: "60 seconds",
        },
        "Find the page",
      ),
    ).toEqual([
      "Support reply failed in the step Find the page: the tool search_pages in the Notion connector didn't answer within 60 seconds.",
      "Run it again in a few minutes.",
    ]);
  });

  it("tells a local model from a cloud one when it can't be reached", () => {
    const local: RunFailure = {
      reason: "model-unreachable",
      provider: "Ollama",
      address: "localhost:11434",
      alias: "fast",
      local: true,
    };
    expect(lines(local, "Classify")).toEqual([
      "Support reply failed in the step Classify: Halonic couldn't reach Ollama at localhost:11434 for the model alias fast.",
      "Start Ollama, then run again.",
    ]);
    const cloud: RunFailure = {
      reason: "model-unreachable",
      provider: "Anthropic",
      address: "api.anthropic.com",
      alias: "smart",
      local: false,
    };
    expect(lines(cloud)).toEqual([
      "Support reply failed in the step Draft reply: Halonic couldn't reach Anthropic at api.anthropic.com for the model alias smart.",
      "Check your internet connection, then run again.",
    ]);
  });

  it("has a model that isn't there yet, with ollama pull only for Ollama (revision 25)", () => {
    const missing: RunFailure = {
      reason: "model-missing",
      provider: "Ollama",
      model: "llama3.2",
      alias: "fast",
      server: "ollama",
    };
    expect(lines(missing, "Classify")).toEqual([
      "Support reply failed in the step Classify: Ollama is answering, but it doesn't have llama3.2 yet.",
      "Run ollama pull llama3.2, or point the model alias fast at another model in models.yaml.",
    ]);
    expect(lines({ ...missing, provider: "LM Studio", server: "other" }, "Classify")).toEqual([
      "Support reply failed in the step Classify: LM Studio is answering, but it doesn't have llama3.2 yet.",
      "Download llama3.2 in LM Studio, or point the model alias fast at another model in models.yaml.",
    ]);
  });

  it("adds the turn limit's last calls only when the run log has them, with the user's --dir", () => {
    const failure: RunFailure = {
      reason: "turn-limit",
      agent: "Sorter",
      turns: 6,
      agentFile: "sorter.agent.yaml",
    };
    expect(lines(failure, "Classify", "./acme")).toEqual([
      "Support reply failed in the step Classify: Sorter used all 6 turns without finishing.",
      "See what Sorter did with halonic runs show --dir ./acme 01JD8Q. Raise its turn limit in sorter.agent.yaml if it needs more turns.",
    ]);
    expect(lines({ ...failure, emptyCallsTo: "search_docs" }, "Classify")[0]).toBe(
      "Support reply failed in the step Classify: Sorter used all 6 turns without finishing. Its last turns were calls to search_docs that returned nothing.",
    );
    expect(lines({ ...failure, turns: 1 }, "Classify")[0]).toBe(
      "Support reply failed in the step Classify: Sorter used its only turn without finishing.",
    );
  });

  it("points the alias at another model when its model can't use tools (HAL-2745)", () => {
    expect(
      lines({ reason: "model-no-tools", model: "llama3.2", alias: "fast" }, "Classify"),
    ).toEqual([
      "Support reply failed in the step Classify: llama3.2, used by the model alias fast, can't use tools, and this step offers tools.",
      "In models.yaml, point the model alias fast at a model that can use tools.",
    ]);
  });

  it("keeps the fail-closed promise for a local-only workspace and a blocked site", () => {
    const localOnly: RunFailure = {
      reason: "local-only",
      workspace: "Acme",
      provider: "OpenAI",
      agent: "Sorter",
      alias: "smart",
    };
    expect(lines(localOnly, "Classify")).toEqual([
      "Support reply failed in the step Classify: Acme is local only, so Halonic sent nothing to OpenAI.",
      "Point Sorter's model alias smart at a local model in models.yaml.",
    ]);
    expect(
      lines({ reason: "site-blocked", agent: "Reporter", site: "api.example.net" }, "Build report"),
    ).toEqual([
      "Support reply failed in the step Build report: the sandbox stopped Reporter from reaching api.example.net, which isn't in its allowed sites. Nothing reached that site.",
      "Add api.example.net to Reporter's allowed sites, if Reporter should reach it.",
    ]);
  });

  it("puts a full stop after the step when Halonic can't tell the cause, and never shows a bug's text", () => {
    const report =
      "Run it again with --debug to see the details, and report it: https://github.com/halonic-com/halonic/issues";
    expect(lines({ reason: "error", message: "The reply template is empty." })).toEqual([
      "Support reply failed in the step Draft reply. Halonic can't tell the cause yet: The reply template is empty.",
      report,
    ]);
    expect(lines({ reason: "error" })).toEqual([
      "Support reply failed in the step Draft reply. Halonic can't tell the cause yet.",
      report,
    ]);
    expect(lines({ reason: "error", message: "  " })[0]).toBe(
      "Support reply failed in the step Draft reply. Halonic can't tell the cause yet.",
    );
    expect(lines({ reason: "error", message: "The template has no body" })[0]).toBe(
      "Support reply failed in the step Draft reply. Halonic can't tell the cause yet: The template has no body.",
    );
    expect(lines({ reason: "error", message: "Is the template empty?" })[0]).toBe(
      "Support reply failed in the step Draft reply. Halonic can't tell the cause yet: Is the template empty?",
    );
    expect(lines({ reason: "error", message: "The template is empty!" })[0]).toBe(
      "Support reply failed in the step Draft reply. Halonic can't tell the cause yet: The template is empty!",
    );
    expect(lines({ reason: "internal" })).toEqual([
      "Support reply failed in the step Draft reply. Halonic can't tell the cause yet.",
      report,
    ]);
  });

  it("writes a Studio place with > where the output isn't UTF-8", () => {
    const oldConsole = paintFor({ colour: false, live: false, unicode: false });
    const { fix } = runFailedLines(draftReply, {
      reason: "signed-out",
      service: "Gmail",
      account: "fin@acme.example",
    });
    expect(renderPhrase(fix.phrase, oldConsole)).toBe(
      "Sign in again in Studio (Library > Gmail), then run again.",
    );
  });
});

describe("money", () => {
  it("writes two decimals, or three below a cent", () => {
    expect([money(0.004), money(0.03), money(5), money(5.08), money(0)]).toEqual([
      "€0.004",
      "€0.03",
      "€5.00",
      "€5.08",
      "€0.00",
    ]);
  });

  it("says under €0.001 rather than €0.000 for a tiny spend (revision 25)", () => {
    expect([money(0.0004), money(0.00001), money(0.0005), money(0.001)]).toEqual([
      "under €0.001",
      "under €0.001",
      "€0.001",
      "€0.001",
    ]);
  });

  it("throws for an amount no spend or budget can have", () => {
    for (const amount of [-0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => money(amount)).toThrow(RangeError);
    }
  });
});

describe("counts in words", () => {
  it("says once, twice, then digits", () => {
    expect([timesInWords(1), timesInWords(2), timesInWords(3), timesInWords(12)]).toEqual([
      "once",
      "twice",
      "3 times",
      "12 times",
    ]);
  });

  it("reads an empty list as nothing, so a sentence has no gap", () => {
    expect([listInWords([]), listInWords(["Read mail"]), listInWords(["a", "b", "c"])]).toEqual([
      "nothing",
      "Read mail",
      "a, b and c",
    ]);
  });
});
