import { secretVariableName } from "@halonicjs/adapter-env-secrets";
import { providerTypes } from "@halonicjs/adapter-workspace-models";
import { type MoneyAmountOptions, moneyAmount } from "@halonicjs/app";
import type { BusyRetries, RunFailure } from "@halonicjs/app/run-failure";
import type { ModelSkipReason } from "@halonicjs/events";
import { counted, listInWords, timesInWords } from "./counts.ts";
import { defineMessages, type Message } from "./define.ts";
import { errorMessages, issuesLink } from "./general.ts";
import { harnessNames } from "./harness-names.ts";
import { type Phrase, phrase } from "./phrase.ts";
import { proxyFixInWords, proxyProblemInWords } from "./proxy-failures.ts";
import { sandboxMessages } from "./sandbox.ts";
import { suggestedCommand } from "./suggested-command.ts";

/** The run that failed, as line 1 names it and line 2's commands need it. */
export interface FailedRun {
  /** The workflow's title, such as "Support reply". */
  readonly title: string;
  /** The step it failed in, named as in the live lines (cli-output 3.4). */
  readonly step: string;
  readonly runId: string;
  /** The user's own `--dir`, repeated in any `halonic` command line 2 suggests. */
  readonly dir?: string | undefined;
  /** `--debug` was given: the general lines' fix doesn't ask for it again (HAL-6613). */
  readonly debugging?: boolean;
}

/** A reason's sentence, given the run and that reason's own facts. */
type ByReason = {
  readonly [Reason in RunFailure["reason"]]: (
    run: FailedRun,
    failure: Extract<RunFailure, { readonly reason: Reason }>,
  ) => Phrase;
};

// A budget line puts the amount after "of" or "estimated", where "less than €0.001" reads better than "under" (HAL-12034).
const afterOf: MoneyAmountOptions = { tiny: "less than" };

/**
 * Line 1 by reason (cli-output 3.4, revisions 5 and 23): the Studio sentence
 * after "Support reply failed in the step Draft a reply:", without what line 2
 * already says. `budget` says "stopped", because the run kept to a limit the
 * user set; `error` and `internal` have a full stop after the step, because
 * "Halonic can't tell the cause yet" is the reason, or for an `error` whose
 * cause is known, the engine's message is.
 */
const lineOne = {
  "key-refused": (run, failure) =>
    failedIn(
      run,
      phrase`${failure.provider} didn't accept the key in the secret ${namedSecret(failure.secret)}, used by the model alias ${failure.alias}.`,
    ),
  "no-key": (run, failure) =>
    failedIn(
      run,
      phrase`there's no key in the secret ${namedSecret(failure.secret)}, used by the model alias ${failure.alias}.`,
    ),
  "signed-out": (run, failure) =>
    failedIn(run, phrase`${failure.service} (${failure.account}) is signed out. Nothing was sent.`),
  "out-of-credit": (run, failure) =>
    failedIn(
      run,
      phrase`${failure.provider} refused the call because the account has no credit left or reached its limit at ${failure.provider}.`,
    ),
  "provider-busy": (run, failure) => failedIn(run, busyInWords(failure.provider, failure.retried)),
  "model-unreachable": (run, failure) =>
    failedIn(
      run,
      phrase`Halonic couldn't reach ${failure.provider} at ${failure.address} for the model alias ${failure.alias}.`,
    ),
  "proxy-failed": (run, failure) => failedIn(run, proxyProblemInWords(failure)),
  "model-missing": (run, failure) =>
    failedIn(
      run,
      phrase`${failure.provider} is answering, but it doesn't have ${failure.model} yet.`,
    ),
  "model-timeout": (run, failure) =>
    failedIn(
      run,
      failure.localAddress === undefined
        ? phrase`${failure.provider} didn't start answering within ${minutesInWords(failure.withinMs)}.`
        : phrase`${failure.provider} didn't start answering at ${failure.localAddress} within ${minutesInWords(failure.withinMs)}. It may still be loading the model.`,
    ),
  budget: (run, failure) =>
    phrase`${run.title} stopped in the step ${run.step}: ${
      failure.per === "run"
        ? phrase`this run reached its budget of ${moneyAmount(failure.budget, failure.currency, afterOf)} (estimated ${moneyAmount(failure.spent, failure.currency, afterOf)} spent).`
        : phrase`this month's estimated spend reached its budget of ${moneyAmount(failure.budget, failure.currency, afterOf)}.`
    }`,
  "turn-limit": (run, failure) => {
    // "used all 1 turn" reads like a bug (HAL-2745).
    const usedUp =
      failure.turns === 1
        ? phrase`${failure.agent} used its only turn without finishing.`
        : phrase`${failure.agent} used all ${counted(failure.turns, "turn", "turns")} without finishing.`;
    // The second sentence only when the run log has the last calls, as in Studio's banner.
    return failedIn(
      run,
      failure.emptyCallsTo === undefined
        ? usedUp
        : phrase`${usedUp} Its last turns were calls to ${failure.emptyCallsTo} that returned nothing.`,
    );
  },
  "tool-timeout": (run, failure) =>
    failedIn(
      run,
      phrase`the tool ${failure.tool} in the ${failure.connector} connector didn't answer within ${secondsInWords(failure.withinMs)}.`,
    ),
  "local-only": (run, failure) =>
    failedIn(
      run,
      phrase`${failure.workspace} is local only, so Halonic sent nothing to ${failure.provider}.`,
    ),
  "site-blocked": (run, failure) =>
    failedIn(
      run,
      phrase`the sandbox stopped ${failure.agent} from reaching ${failure.site}, which isn't in its allowed sites. Nothing reached that site.`,
    ),
  // The same sentence as a run the check refused before it started (HAL-1709).
  "sandbox-not-ready": (run) => failedIn(run, sandboxMessages.cantStart().phrase),
  "unknown-provider-type": (run, failure) =>
    failedIn(
      run,
      phrase`provider ${failure.provider} has type ${failure.type}, which Halonic can't call.`,
    ),
  "unknown-model-alias": (run, failure) =>
    failedIn(run, phrase`hub ${failure.hub} has no model alias ${failure.alias}.`),
  // The same words as `halonic secret list` for the same file (HAL-12569).
  "secrets-file-readable": (run, failure) =>
    failedIn(run, phrase`the secrets file ${failure.file} can be read by other users.`),
  "model-no-tools": (run, failure) =>
    failedIn(
      run,
      phrase`${failure.model}, used by the model alias ${failure.alias}, can't use tools, and this step offers tools.`,
    ),
  "model-out-of-memory": (run, failure) =>
    failedIn(
      run,
      phrase`this computer doesn't have enough free memory for ${failure.provider} to load ${failure.model}.`,
    ),
  // A log from before the engine named the sandbox's reason ends where cli-output 3.4's "reason" would start.
  "sandbox-start-failed": (run, failure) =>
    failure.code === undefined
      ? failedIn(
          run,
          phrase`${failure.agent} didn't start, because the sandbox on this computer didn't start.`,
        )
      : failedIn(
          run,
          phrase`${failure.agent} didn't start, because the sandbox on this computer didn't start: ${sandboxMessages.reason(failure.code).phrase}`,
        ),
  "harness-start-failed": (run, failure) => {
    switch (failure.cause) {
      case "not-installed":
        return failedIn(
          run,
          phrase`${failure.agent} didn't start, because ${harnessName(failure.harness)} isn't installed on this computer.`,
        );
      case "signed-out":
        return failedIn(
          run,
          phrase`${failure.agent} didn't start, because ${harnessName(failure.harness)} isn't signed in on this computer.`,
        );
      default:
        return failedIn(
          run,
          phrase`${failure.agent} didn't start, because ${harnessName(failure.harness)} didn't start on this computer or didn't answer within ${secondsInWords(failure.withinMs)}.`,
        );
    }
  },
  error: (run, failure) => {
    // An empty message says no more than none at all.
    const message = failure.message?.trim() ?? "";
    if (message === "") {
      return cantTellCause(run);
    }
    // A known cause's message is the reason, so Halonic doesn't say it can't tell (HAL-13862).
    return failure.causeKnown === true
      ? phrase`${run.title} failed in the step ${run.step}. ${asSentence(message)}`
      : phrase`${cantTellCause(run, ":")} ${asSentence(message)}`;
  },
  // A bug's own text never shows without --debug (cli-output 1.3 rule 5).
  internal: (run) => cantTellCause(run),
} satisfies ByReason;

/**
 * Line 2 by reason: the one fix, as a command or a file to change. Halonic
 * 0.1 has no Studio, so no line sends the user there (HAL-6183).
 */
const lineTwo = {
  "key-refused": (_run, failure) =>
    saveKey(phrase`a key ${failure.provider} accepts`, failure.secret),
  "no-key": (_run, failure) => saveKey(phrase`your ${failure.provider} key`, failure.secret),
  // The CLI has no sign-in command, so it names the service only.
  // TODO: name the CLI's sign-in command here once there is one.
  "signed-out": (_run, failure) => phrase`Sign in to ${failure.service} again, then run again.`,
  "out-of-credit": (_run, failure) =>
    phrase`Add credit at ${failure.provider}, then run again. This isn't your Halonic budget.`,
  "provider-busy": () => tryLater(),
  "model-unreachable": (_run, failure) =>
    failure.local
      ? phrase`Start ${failure.provider}, then run again.`
      : phrase`Check your internet connection, then run again.`,
  "proxy-failed": (_run, failure) => proxyFixInWords(failure),
  "model-missing": (_run, failure) =>
    phrase`${
      failure.server === "ollama"
        ? phrase`Run ollama pull ${failure.model}`
        : phrase`Download ${failure.model} in ${failure.provider}`
    }, or point the model alias ${failure.alias} at another model in models.yaml.`,
  "model-timeout": () => tryLater(),
  // A per-run budget doesn't reset, so only a monthly one can be waited out.
  // Each names its own key in workspace.yaml (HAL-12007).
  budget: (_run, failure) =>
    failure.per === "run"
      ? phrase`Raise budget.perRun in workspace.yaml.`
      : phrase`Raise budget.monthly in workspace.yaml, or wait until it resets on ${dayAndMonth(failure.resetsOn)}.`,
  "turn-limit": (run, failure) =>
    phrase`See what ${failure.agent} did with ${suggestedCommand("runs show", run.dir, run.runId)}. Raise its turn limit in ${failure.agentFile} if it needs more turns.`,
  "tool-timeout": () => tryLater(),
  "local-only": (_run, failure) =>
    phrase`Point ${failure.agent}'s model alias ${failure.alias} at a local model in models.yaml, or set privacy.localOnly: false in workspace.yaml.`,
  "site-blocked": (_run, failure) =>
    phrase`Add ${failure.site} to ${failure.agent}'s allowed sites, if ${failure.agent} should reach it.`,
  "sandbox-not-ready": (_run, failure) => sandboxMessages.refusedFix(failure.code).phrase,
  // The types come from the list the engine builds providers from, so a new adapter is listed by itself.
  "unknown-provider-type": (_run, failure) =>
    phrase`Set type in providers/${failure.provider}.yaml to one of ${listInWords(providerTypes, "or")}, then run again.`,
  // A workspace made with plain `halonic init` has no models.yaml yet, so it also
  // says where a model that needs no key comes from (HAL-12377).
  "unknown-model-alias": (_run, failure) =>
    phrase`Add ${failure.alias} to models.yaml, or set a model on the agent. For a test model with no key, copy models.yaml and providers/mock.yaml from the Acme example.`,
  "secrets-file-readable": (_run, failure) =>
    phrase`Run chmod 600 ${failure.file}, then run again.`,
  // "In models.yaml" first, so it can't read as where the tools are.
  "model-no-tools": (_run, failure) =>
    phrase`In models.yaml, point the model alias ${failure.alias} at a model that can use tools.`,
  "model-out-of-memory": (_run, failure) =>
    phrase`Close other programs, or point the model alias ${failure.alias} at a smaller model in models.yaml, then run it again.`,
  "sandbox-start-failed": () =>
    phrase`Run it again. If it keeps happening, add --debug and report it: ${issuesLink}`,
  "harness-start-failed": (_run, failure) => {
    switch (failure.cause) {
      case "not-installed":
        return phrase`Install ${harnessName(failure.harness)}, then run it again.`;
      case "signed-out":
        return phrase`Sign in to ${harnessName(failure.harness)} in a terminal, then run it again.`;
      default:
        return phrase`Check that ${harnessName(failure.harness)} starts in a terminal and is signed in, then run it again.`;
    }
  },
  error: (run) => bugFix(run),
  internal: (run) => bugFix(run),
} satisfies ByReason;

/** Line 1 of a run that started and then failed, keyed `runFailed.<reason>`. */
export const runFailedMessages = defineMessages("runFailed", lineOne);
/** Line 2, the one fix, keyed `runFailedFix.<reason>`. */
export const runFailedFixMessages = defineMessages("runFailedFix", lineTwo);

/**
 * The two lines of a failed run: `message` and `fix`, as `--json` names them
 * too (cli-output 1.8). `fix` is `undefined` for a general failure whose
 * cause is known, where "report it" wouldn't help (HAL-6451).
 */
export function runFailedLines(
  run: FailedRun,
  failure: RunFailure,
): { readonly message: Message; readonly fix: Message | undefined } {
  // TypeScript can't pair a union with the table entry of its own reason; `satisfies ByReason` above does.
  type AnyReason = (run: FailedRun, failure: RunFailure) => Message;
  const message = runFailedMessages[failure.reason] as AnyReason;
  const fix = runFailedFixMessages[failure.reason] as AnyReason;
  const causeKnown = failure.reason === "error" && failure.causeKnown === true;
  return { message: message(run, failure), fix: causeKnown ? undefined : fix(run, failure) };
}

/** The general lines' fix: report it, asking for `--debug` only when it wasn't given. */
function bugFix(run: FailedRun): Phrase {
  return run.debugging === true
    ? errorMessages.reportWithDetails().phrase
    : errorMessages.internalFix().phrase;
}

function failedIn(run: FailedRun, reason: Phrase): Phrase {
  return phrase`${run.title} failed in the step ${run.step}: ${reason}`;
}

/** "Support reply failed in the step Draft a reply. Halonic can't tell the cause yet." */
function cantTellCause(run: FailedRun, end: "." | ":" = "."): Phrase {
  return phrase`${run.title} failed in the step ${run.step}. Halonic can't tell the cause yet${end}`;
}

/** The text as a sentence: it keeps its own ".", "?" or "!", and gets a full stop if it has none. */
function asSentence(text: string): string {
  return /[.?!]$/.test(text) ? text : `${text}.`;
}

/**
 * A key's fix names `halonic secret set` first, as the CLI's own way to save
 * one, and the variable as the other (HAL-12570).
 */
function saveKey(key: Phrase, secret: string): Phrase {
  return phrase`Save ${key} with halonic secret set ${secret}, or set ${secretVariableName(secret)}, then run again.`;
}

/** Every key error names the secret and the variable Halonic reads it from, the same as the reader does. */
function namedSecret(secret: string): string {
  return `${secret} (${secretVariableName(secret)})`;
}

/**
 * "Anthropic was busy and asked Halonic to slow down.", then the tries, which
 * are named only when they happened (cli-output 3.4, revision 39).
 */
function busyInWords(provider: string, retried: BusyRetries | undefined): Phrase {
  const busy = phrase`${provider} was busy and asked Halonic to slow down.`;
  if (retried === undefined) {
    return busy;
  }
  return phrase`${busy} Halonic tried ${timesInWords(retried.tries)} over ${minutesInWords(retried.overMs)}, then stopped.`;
}

/** A harness program by its name, such as "Claude Code", or else by its id. */
function harnessName(id: string): string {
  return harnessNames.get(id) ?? id;
}

/** A wait in whole seconds, such as "60 seconds". */
function secondsInWords(ms: number): string {
  return counted(Math.round(ms / 1000), "second", "seconds");
}

/** A wait in whole minutes, such as "5 minutes". */
function minutesInWords(ms: number): string {
  return counted(Math.round(ms / 60_000), "minute", "minutes");
}

/** An ISO date as the lines write it, such as "1 Dec". */
function dayAndMonth(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** `provider-busy`, `model-timeout` and `tool-timeout`: nothing the user set caused it. */
function tryLater(): Phrase {
  return phrase`Run it again in a few minutes.`;
}

/**
 * What `--debug` prints under a failed run's lines, from its run log
 * (HAL-6613, decided with Sofia): the engine's own error, the provider's
 * own text, and the model calls of the step it failed in. These are for an
 * engineer, so they quote the log as it is.
 */
export const runFailedDebugMessages = defineMessages("runFailedDebug", {
  /** The `error` of `run.failed`. */
  engineSaid: (text: string) => phrase`The engine said: ${text}`,
  /** The `providerText` of `run.failed` or `llm.fallback`, with its HTTP status when it has one. */
  providerSaid: (text: string, status?: number) =>
    status === undefined
      ? phrase`The provider said: ${text}`
      : phrase`The provider said (HTTP ${String(status)}): ${text}`,
  /** Above the model calls, one per line under it. */
  modelCalls: () => phrase`Model calls in this step:`,
  noModelCalls: () => phrase`No model calls in this step.`,
  /** An `llm.request`, with how many times in a row the same call was made. */
  called: (agent: string, model: string, provider: string, times: number) =>
    times === 1
      ? phrase`${agent} called ${model} at ${provider}`
      : phrase`${agent} called ${model} at ${provider} ${timesInWords(times)}`,
  /** An `llm.fallback`. */
  movedOn: (agent: string, from: string, to: string, error: string) =>
    phrase`${agent} moved from ${from} to ${to}: ${error}`,
  /** An `llm.skipped`, with the alias tried next when there was one. */
  skipped: (agent: string, alias: string, reason: ModelSkipReason, next?: string) => {
    const why = reason === "no-key" ? "its key isn't set" : "the workspace is local only";
    return next === undefined
      ? phrase`${agent} skipped ${alias}: ${why}`
      : phrase`${agent} skipped ${alias}: ${why}, then tried ${next}`;
  },
});
