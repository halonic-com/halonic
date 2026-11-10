import { counted } from "./counts.ts";
import { defineMessages } from "./define.ts";
import { dim, markPart, type Phrase, phrase } from "./phrase.ts";
import { suggestedCommand } from "./suggested-command.ts";

/** What a finished run did, for its receipt line. Only the parts that apply are shown. */
export interface RunReceipt {
  readonly changedFiles: number;
  /** What it sent, each already counted, such as "1 email"; empty when it sent nothing. */
  readonly sent: readonly string[];
  readonly askedYou: number;
  /** The estimated cost as the output writes money, such as "€0.004"; left out for a run on the test model. */
  readonly estimatedCost?: string;
}

/** A secret as key errors name it: its name, and the variable Halonic reads it from. */
export interface SecretName {
  /** The name the provider file gives it, such as `openai-key`. */
  readonly name: string;
  /** Its `HALONIC_SECRET_` variable, such as `HALONIC_SECRET_OPENAI_KEY`. */
  readonly variable: string;
}

/**
 * The sentences of `halonic run <workflow>` (cli-output 1.9 and 3.4): the
 * heading, the waiting line, the receipt, and line 1 and line 2 of a run
 * that failed. A failed run's line 1 is its own sentence, "Support reply
 * failed in the step Draft reply: …"; line 2 is the fix, the Studio button
 * written as a command or a Studio place. Wherever a fix names a `halonic`
 * command, `dir` is the user's own `--dir`.
 */
export const runMessages = defineMessages("run", {
  summary: () => phrase`Run a workflow and follow it step by step`,
  /** What `run` was doing, for "✕ Couldn't run support-reply: …". */
  action: (workflow: string) => phrase`run ${workflow}`,
  /** The end of line 1 when `run` was refused before its first step. */
  nothingRan: () => phrase`Nothing ran.`,

  heading: (title: string, workspace: string, runId: string) =>
    phrase`Running ${title} in ${workspace} ${markPart("separator")} run ${runId}`,
  /** What a step's line says after its name: "Sorter · fast", "Gmail · fin@acme.example". */
  stepFacts: (facts: readonly string[]) => joinedFacts(facts),
  /** With a !: the wait step's description, its first line, as written. */
  waitingForYou: (description: string) => phrase`Waiting for you: ${description}`,
  /** With a !, for a wait step without a description. */
  waitingInStep: (step: string) => phrase`Waiting for you in the step ${step}.`,
  /** Under the waiting line: the events in the step's order, the first one written out. */
  answerHere: (runId: string, events: readonly string[], dir?: string) =>
    answerLine(runId, events, dir),
  /** With a !, before the run starts, for an agent set to "On this computer". Never a question. */
  onThisComputer: (agent: string, chosenOn: string) =>
    phrase`${agent} runs on this computer without the sandbox, as chosen on ${chosenOn}.`,

  /** "Support reply finished in 18 s.", with the duration as the output writes it. */
  finished: (title: string, duration: string) => phrase`${title} finished in ${duration}.`,
  /** The receipt (glossary): changed, sent, asked and cost, in that order. */
  receipt: (receipt: RunReceipt) => receiptLine(receipt),
  runLog: (runId: string, dir?: string) =>
    phrase`Run log: ${suggestedCommand("runs show", dir, runId)}`,

  /** Line 1 of a run that started and then failed. */
  failedInStep: (title: string, step: string, reason: Phrase) =>
    phrase`${title} failed in the step ${step}: ${reason}`,
  /** `key-refused`: "OpenAI didn't accept the key in the secret openai-key (HALONIC_SECRET_OPENAI_KEY), used by the model alias smart." */
  keyRefused: (provider: string, secret: SecretName, alias: string) =>
    phrase`${provider} didn't accept the key in the secret ${namedSecret(secret)}, used by the model alias ${alias}.`,
  /** `no-key`, the same shape. */
  noKey: (secret: SecretName, alias: string) =>
    phrase`there's no key in the secret ${namedSecret(secret)}, used by the model alias ${alias}.`,

  replaceKey: (provider: string, variable: string) =>
    phrase`Replace the key in Studio (${studioPlace("Settings", "Models", provider)}), or set ${variable}, then run again.`,
  addKey: (provider: string, variable: string) =>
    phrase`Add the key in Studio (${studioPlace("Settings", "Models", provider)}), or set ${variable}, then run again.`,
  signedOutFix: (service: string) =>
    phrase`Sign in again in Studio (${studioPlace("Library", service)}), then run again.`,
  outOfCreditFix: (provider: string) =>
    phrase`Add credit at ${provider}, then run again. This isn't your Halonic budget.`,
  /** `provider-busy`, `model-timeout` and `tool-timeout`. */
  tryLaterFix: () => phrase`Run it again in a few minutes.`,
  /** `model-unreachable` on this computer. */
  startOllamaFix: () => phrase`Start Ollama, then run again.`,
  /** `model-unreachable` for a cloud provider. */
  checkConnectionFix: () => phrase`Check your internet connection, then run again.`,
  modelMissingFix: (model: string, alias: string) =>
    phrase`Run ollama pull ${model}, or point the model alias ${alias} at another model in models.yaml.`,
  /** `budget`, with the reset date as the output writes it, such as "1 Dec". */
  budgetFix: (resetsOn: string) =>
    phrase`Raise the budget in models.yaml, or wait until it resets on ${resetsOn}.`,
  turnLimitFix: (agent: string, runId: string, agentFile: string, dir?: string) =>
    phrase`See what ${agent} did with ${suggestedCommand("runs show", dir, runId)}. Raise its turn limit in ${agentFile} if it needs more turns.`,
  /** `blocked` because the workspace is local only. */
  localOnlyFix: (agent: string, alias: string) =>
    phrase`Point ${agent}'s model alias ${alias} at a local model in models.yaml.`,
  /** `blocked` because the sandbox stopped a site. */
  blockedSiteFix: (site: string, agent: string) =>
    phrase`Add ${site} to ${agent}'s allowed sites, if ${agent} should reach it.`,
});

function namedSecret(secret: SecretName): string {
  return `${secret.name} (${secret.variable})`;
}

/** A place in Studio, such as "Settings › Models › OpenAI", with › as a mark. */
function studioPlace(...places: readonly string[]): Phrase {
  return places.flatMap((place, index) =>
    index === 0 ? [place] : [" ", markPart("studioPath"), " ", place],
  );
}

function joinedFacts(facts: readonly string[]): Phrase {
  return facts.flatMap((fact, index) =>
    index === 0 ? [fact] : [" ", markPart("separator"), " ", fact],
  );
}

/** "Answer in Studio's Inbox, or here: halonic runs send 01JD8Q approve  (or reject)". */
function answerLine(runId: string, events: readonly string[], dir?: string): Phrase {
  const [first = "", ...others] = events;
  const command = `${suggestedCommand("runs send", dir, runId)} ${first}`;
  const line = phrase`Answer in Studio's Inbox, or here: ${command}`;
  if (others.length === 0) {
    return line;
  }
  return phrase`${line}  ${dim(`(or ${others.join(" or ")})`)}`;
}

/** "Changed 1 file · sent 1 email · asked you once · estimated cost €0.004". */
function receiptLine(receipt: RunReceipt): Phrase {
  const parts: string[] = [];
  if (receipt.changedFiles > 0) {
    parts.push(`changed ${counted(receipt.changedFiles, "file", "files")}`);
  }
  // "Sent nothing" is always there, because that's what people check.
  parts.push(receipt.sent.length === 0 ? "sent nothing" : `sent ${receipt.sent.join(", ")}`);
  if (receipt.askedYou > 0) {
    parts.push(`asked you ${timesInWords(receipt.askedYou)}`);
  }
  if (receipt.estimatedCost !== undefined) {
    parts.push(`estimated cost ${receipt.estimatedCost}`);
  }
  const [first = "", ...rest] = parts;
  return joinedFacts([first.charAt(0).toUpperCase() + first.slice(1), ...rest]);
}

function timesInWords(times: number): string {
  if (times === 1) {
    return "once";
  }
  return times === 2 ? "twice" : `${times} times`;
}
