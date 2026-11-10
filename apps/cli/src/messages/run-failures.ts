import { secretVariableName } from "@halonicjs/adapter-env-secrets";
import { counted, timesInWords } from "./counts.ts";
import { defineMessages, type Message } from "./define.ts";
import { errorMessages } from "./general.ts";
import { money } from "./money.ts";
import { markPart, type Phrase, phrase } from "./phrase.ts";
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
}

/** What both key errors name: the provider, the secret that holds its key, and the alias that uses it. */
interface KeyFacts {
  readonly provider: string;
  /** The secret's name in the provider file, such as `openai-key`. */
  readonly secret: string;
  readonly alias: string;
}

/** How often Halonic asked a busy provider again, and for how long. */
export interface BusyRetries {
  readonly tries: number;
  /** How long it kept trying, as the output writes it, such as "2 minutes". */
  readonly over: string;
}

/**
 * Why a run failed, by microcopy 15.3's reasons, with the names each
 * reason's two lines need. Only the reasons whose terminal words are settled
 * are here. The engine's other reasons (`RunFailureReason`) are elsewhere or
 * still wait for words:
 *
 * - the newer ones of HAL-2264 (sandbox-start-failed, harness-start-failed,
 *   model-out-of-memory, disk-full, interrupted) wait for the board;
 * - a run the sandbox check refused before it started is `sandboxMessages`;
 *   one that started and then found the sandbox can't start is `sandbox-not-ready`,
 *   in the same words by its code;
 * - `cancelled` isn't a failure: Ctrl C or SIGTERM prints "Stopped." with
 *   `runMessages.cancelledAfter` (cli-output 1.5), and `runs show` says
 *   `runsMessages.showCancelled` for a run cancelled somewhere else.
 */
export type RunFailure =
  | ({ readonly reason: "key-refused" } & KeyFacts)
  | ({ readonly reason: "no-key" } & KeyFacts)
  | { readonly reason: "signed-out"; readonly service: string; readonly account: string }
  | { readonly reason: "out-of-credit"; readonly provider: string }
  | {
      readonly reason: "provider-busy";
      readonly provider: string;
      /**
       * How often Halonic asked and for how long, only once the engine retries
       * a busy provider. Left out, the line names no tries (revision 39).
       */
      readonly retried?: BusyRetries;
    }
  | {
      readonly reason: "model-unreachable";
      readonly provider: string;
      readonly address: string;
      readonly alias: string;
      /** A model on this computer, such as Ollama, rather than a cloud provider. */
      readonly local: boolean;
    }
  | {
      readonly reason: "model-missing";
      readonly provider: string;
      readonly model: string;
      readonly alias: string;
      /** Only Ollama has a command that downloads a model; another local server, such as LM Studio, downloads it in its own window. */
      readonly server: "ollama" | "other";
    }
  | {
      readonly reason: "model-timeout";
      readonly provider: string;
      /** Such as "5 minutes". */
      readonly within: string;
      /** Only for a model on this computer, which may still be loading. */
      readonly localAddress?: string;
    }
  | {
      readonly reason: "budget";
      readonly per: "run";
      /** In euros, as are all amounts here. */
      readonly budget: number;
      readonly spent: number;
    }
  | {
      readonly reason: "budget";
      readonly per: "month";
      readonly budget: number;
      /** When the monthly budget starts again, such as "1 Dec". */
      readonly resetsOn: string;
    }
  | {
      readonly reason: "turn-limit";
      readonly agent: string;
      readonly turns: number;
      readonly agentFile: string;
      /** The tool its last turns called without getting anything back, when the run log has them. */
      readonly emptyCallsTo?: string;
    }
  | {
      readonly reason: "tool-timeout";
      readonly tool: string;
      readonly connector: string;
      /** Such as "60 seconds". */
      readonly within: string;
    }
  | {
      readonly reason: "local-only";
      readonly workspace: string;
      readonly provider: string;
      readonly agent: string;
      readonly alias: string;
    }
  | { readonly reason: "site-blocked"; readonly agent: string; readonly site: string }
  | {
      readonly reason: "sandbox-not-ready";
      /** The `Sandbox` port's reason code from the run log, such as `bubblewrap-missing`. */
      readonly code: string;
    }
  | {
      readonly reason: "model-no-tools";
      /** The model the alias points at, such as "llama3.2". */
      readonly model: string;
      readonly alias: string;
    }
  | { readonly reason: "error"; readonly message?: string }
  | { readonly reason: "internal" };

/** A reason's sentence, given the run and that reason's own facts. */
type ByReason = {
  readonly [Reason in RunFailure["reason"]]: (
    run: FailedRun,
    failure: Extract<RunFailure, { readonly reason: Reason }>,
  ) => Phrase;
};

/**
 * Line 1 by reason (cli-output 3.4, revisions 5 and 23): the Studio sentence
 * after "Support reply failed in the step Draft a reply:", without what line 2
 * already says. `budget` says "stopped", because the run kept to a limit the
 * user set; `error` and `internal` have a full stop after the step, because
 * "Halonic can't tell the cause yet" is the reason.
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
  "model-missing": (run, failure) =>
    failedIn(
      run,
      phrase`${failure.provider} is answering, but it doesn't have ${failure.model} yet.`,
    ),
  "model-timeout": (run, failure) =>
    failedIn(
      run,
      failure.localAddress === undefined
        ? phrase`${failure.provider} didn't start answering within ${failure.within}.`
        : phrase`${failure.provider} didn't start answering at ${failure.localAddress} within ${failure.within}. It may still be loading the model.`,
    ),
  budget: (run, failure) =>
    phrase`${run.title} stopped in the step ${run.step}: ${
      failure.per === "run"
        ? phrase`this run reached its budget of ${money(failure.budget)} (estimated ${money(failure.spent)} spent).`
        : phrase`this month's estimated spend reached its budget of ${money(failure.budget)}.`
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
      phrase`the tool ${failure.tool} in the ${failure.connector} connector didn't answer within ${failure.within}.`,
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
  "model-no-tools": (run, failure) =>
    failedIn(
      run,
      phrase`${failure.model}, used by the model alias ${failure.alias}, can't use tools, and this step offers tools.`,
    ),
  error: (run, failure) => {
    // An empty message says no more than none at all.
    const message = failure.message?.trim() ?? "";
    return message === ""
      ? cantTellCause(run)
      : phrase`${cantTellCause(run, ":")} ${asSentence(message)}`;
  },
  // A bug's own text never shows without --debug (cli-output 1.3 rule 5).
  internal: (run) => cantTellCause(run),
} satisfies ByReason;

/** Line 2 by reason: the Studio button, written as a command or a Studio place. */
const lineTwo = {
  "key-refused": (_run, failure) =>
    phrase`Replace the key in Studio (${studioPlace("Settings", "Models", failure.provider)}), or set ${secretVariableName(failure.secret)}, then run again.`,
  "no-key": (_run, failure) =>
    phrase`Add the key in Studio (${studioPlace("Settings", "Models", failure.provider)}), or set ${secretVariableName(failure.secret)}, then run again.`,
  "signed-out": (_run, failure) =>
    phrase`Sign in again in Studio (${studioPlace("Library", failure.service)}), then run again.`,
  "out-of-credit": (_run, failure) =>
    phrase`Add credit at ${failure.provider}, then run again. This isn't your Halonic budget.`,
  "provider-busy": () => tryLater(),
  "model-unreachable": (_run, failure) =>
    failure.local
      ? phrase`Start ${failure.provider}, then run again.`
      : phrase`Check your internet connection, then run again.`,
  "model-missing": (_run, failure) =>
    phrase`${
      failure.server === "ollama"
        ? phrase`Run ollama pull ${failure.model}`
        : phrase`Download ${failure.model} in ${failure.provider}`
    }, or point the model alias ${failure.alias} at another model in models.yaml.`,
  "model-timeout": () => tryLater(),
  // A per-run budget doesn't reset, so only a monthly one can be waited out.
  budget: (_run, failure) =>
    failure.per === "run"
      ? phrase`Raise the budget in models.yaml.`
      : phrase`Raise the budget in models.yaml, or wait until it resets on ${failure.resetsOn}.`,
  "turn-limit": (run, failure) =>
    phrase`See what ${failure.agent} did with ${suggestedCommand("runs show", run.dir, run.runId)}. Raise its turn limit in ${failure.agentFile} if it needs more turns.`,
  "tool-timeout": () => tryLater(),
  "local-only": (_run, failure) =>
    phrase`Point ${failure.agent}'s model alias ${failure.alias} at a local model in models.yaml.`,
  "site-blocked": (_run, failure) =>
    phrase`Add ${failure.site} to ${failure.agent}'s allowed sites, if ${failure.agent} should reach it.`,
  "sandbox-not-ready": (_run, failure) => sandboxMessages.refusedFix(failure.code).phrase,
  // "In models.yaml" first, so it can't read as where the tools are.
  "model-no-tools": (_run, failure) =>
    phrase`In models.yaml, point the model alias ${failure.alias} at a model that can use tools.`,
  error: () => errorMessages.internalFix().phrase,
  internal: () => errorMessages.internalFix().phrase,
} satisfies ByReason;

/** Line 1 of a run that started and then failed, keyed `runFailed.<reason>`. */
export const runFailedMessages = defineMessages("runFailed", lineOne);
/** Line 2, the one fix, keyed `runFailedFix.<reason>`. */
export const runFailedFixMessages = defineMessages("runFailedFix", lineTwo);

/** The two lines of a failed run: `message` and `fix`, as `--json` names them too (cli-output 1.8). */
export function runFailedLines(
  run: FailedRun,
  failure: RunFailure,
): { readonly message: Message; readonly fix: Message } {
  // TypeScript can't pair a union with the table entry of its own reason; `satisfies ByReason` above does.
  type AnyReason = (run: FailedRun, failure: RunFailure) => Message;
  const message = runFailedMessages[failure.reason] as AnyReason;
  const fix = runFailedFixMessages[failure.reason] as AnyReason;
  return { message: message(run, failure), fix: fix(run, failure) };
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

/** Every key error names the secret and the variable Halonic reads it from, the same as the reader does. */
function namedSecret(secret: string): string {
  return `${secret} (${secretVariableName(secret)})`;
}

/** A place in Studio, such as "Settings › Models › OpenAI", with › as a mark. */
function studioPlace(...places: readonly string[]): Phrase {
  return places.flatMap((place, index) =>
    index === 0 ? [place] : [" ", markPart("studioPath"), " ", place],
  );
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
  return phrase`${busy} Halonic tried ${timesInWords(retried.tries)} over ${retried.over}, then stopped.`;
}

/** `provider-busy`, `model-timeout` and `tool-timeout`: nothing the user set caused it. */
function tryLater(): Phrase {
  return phrase`Run it again in a few minutes.`;
}
