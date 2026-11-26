import type { CheckState } from "../pr-watcher/decide.ts";
import { clockTime } from "./prompt.ts";

/**
 * The front bot's Studio lookups (HAL-19222, v3 of the design on HAL-18847):
 * a short, fixed list of read-only lookups the bot answers by itself, without
 * a model. Plain code reads the question, one read-only source gives the
 * result, and the answer is built only from fixed phrases filled in from that
 * result. Anything that isn't exactly one of these questions, asks for an
 * action, or gets no clean result goes to the agent instead. Pure, so the
 * tests need no host.
 */

/** The fixed list. Adding a lookup is a reviewed change of its own (a security PR). */
export const lookupKinds = ["pr_status", "run_status"] as const;

export type LookupKind = (typeof lookupKinds)[number];

/** What each answer's label names as its source (Sofia's wording on HAL-18847). */
const sourceNames: Readonly<Record<LookupKind, string>> = {
  pr_status: "PR status",
  run_status: "run status",
};

/** How every lookup answer starts, so the readers that skip the bot's comments know it too. */
export const automaticAnswerStart = "*Automatic answer · from ";

/** The label an answer starts with, such as `*Automatic answer · from PR status:* `. */
export function lookupLabel(kind: LookupKind): string {
  return `${automaticAnswerStart}${sourceNames[kind]}:* `;
}

/** One question the bot may answer: a pull request by number, or a task by its identifier. */
export type LookupQuestion =
  | { readonly kind: "pr_status"; readonly pr: number }
  | { readonly kind: "run_status"; readonly task: string };

/** Why a message got no lookup: it asks for an action, or it isn't one of the questions. */
export type NoLookup = "write_request" | "not_a_lookup";

/** A message read as a lookup question, or why it isn't one. */
export type LookupMatch =
  | { readonly matched: true; readonly question: LookupQuestion }
  | { readonly matched: false; readonly reason: NoLookup };

/** Longer than this, a message is more than one plain lookup question. */
const maxQuestionLength = 120;

/**
 * Words that ask for an action. A message holding one is never a lookup, even
 * when it also asks about a status: writing stays with the agents.
 */
const writeWords =
  /\b(?:merge|queue|enqueue|dequeue|unqueue|rebase|approve|close|reopen|revert|re-?run|retry|restart|cancel|stop|start|push|fix|deploy|release|publish|label|(?:re|un)?assign|comment|trigger|kick|(?:un)?block|create|delete|remove|drop|add|put|update|edit|set|change|move|mark|wake|ping|tell|ask|please|can you|could you|would you|go ahead|let'?s)\b/;

/** The one status phrase that holds a write word; taken out before the write check. */
const queuePhrase = /\bin the (?:merge )?queue\b/g;

/** A pull request: `#6129`, `PR #6129`, `PR#6129` or `PR 6129`. */
const pr = String.raw`(?:pr ?#|#|pr )(\d{1,7})`;
/** A task identifier such as `hal-19222`, read in lower case. */
const task = String.raw`([a-z][a-z0-9]{0,9}-\d{1,7})`;
const whatIsThe = "(?:what(?:'s| is) the )?";
const now = "(?: (?:right )?now)?";

/** The only questions that count as a PR status lookup, on the whole normalised message. */
const prQuestions = [
  `${whatIsThe}(?:status|state) of ${pr}`,
  `${pr} status`,
  // "PR status" already says it's a pull request, so the number may stand alone.
  `pr status (?:of |for )?(?:pr ?#|#|pr )?(\\d{1,7})`,
  `is ${pr} (?:merged|green|red|approved|queued|in the (?:merge )?queue|open|closed|(?:a )?draft|mergeable)(?: yet)?`,
  `has ${pr} (?:been )?(?:merged|approved|queued)(?: yet)?`,
  `where is ${pr}`,
].map((pattern) => new RegExp(`^${pattern}$`));

/** The only questions that count as a run status lookup, on the whole normalised message. */
const runQuestions = [
  `${whatIsThe}run status (?:of |for |on )?${task}`,
  `${task} run status`,
  `${whatIsThe}status of (?:the run (?:on|for) )?${task}`,
  `is ${task} running${now}`,
  `is (?:anyone|someone|an agent) working on ${task}${now}`,
  `is there a run on ${task}`,
].map((pattern) => new RegExp(`^${pattern}$`));

/** The message in lower case, one space between words, straight quotes, no closing `?`, `.` or `!`. */
function normalised(message: string): string {
  return message
    .trim()
    .toLowerCase()
    .replaceAll("’", "'")
    .replace(/\s+/g, " ")
    .replace(/[?.!]+$/, "")
    .trim();
}

/** The first group a pattern in `questions` captures from the whole of `text`, if one matches. */
function firstCapture(questions: readonly RegExp[], text: string): string | undefined {
  for (const question of questions) {
    const found = question.exec(text);
    if (found !== null) {
      return found[1];
    }
  }
  return undefined;
}

/**
 * Reads a message as one lookup question. Only a short, single-line message
 * that is exactly one of the questions above counts; a message that asks for
 * anything to be done never does.
 */
export function matchLookup(message: string): LookupMatch {
  const text = normalised(message);
  if (writeWords.test(text.replace(queuePhrase, ""))) {
    return { matched: false, reason: "write_request" };
  }
  if (message.trim().includes("\n") || text.length > maxQuestionLength) {
    return { matched: false, reason: "not_a_lookup" };
  }
  const number = firstCapture(prQuestions, text);
  if (number !== undefined) {
    return { matched: true, question: { kind: "pr_status", pr: Number(number) } };
  }
  const identifier = firstCapture(runQuestions, text);
  if (identifier !== undefined) {
    return { matched: true, question: { kind: "run_status", task: identifier.toUpperCase() } };
  }
  return { matched: false, reason: "not_a_lookup" };
}

/** What the PR status source gave: only the facts an answer may say. */
export interface PrStatusResult {
  readonly kind: "pr_status";
  readonly pr: number;
  readonly state: "open" | "merged" | "closed";
  readonly draft: boolean;
  readonly ciOk: CheckState;
  readonly mergeable: "yes" | "conflict" | "unknown";
  readonly inQueue: boolean;
  readonly approvedOnHead: boolean;
}

/** The task's agent run, when one is queued or running. */
export interface ActiveRun {
  readonly status: string;
  /** The agent's name from Paperclip's own list, or undefined when it isn't on it. */
  readonly agentName: string | undefined;
  readonly startedAt: Date | undefined;
}

/** What the run status source gave: the task's status and its active run. */
export interface RunStatusResult {
  readonly kind: "run_status";
  readonly task: string;
  readonly status: string;
  readonly run: ActiveRun | undefined;
}

export type LookupResult = PrStatusResult | RunStatusResult;

/** Why a matched lookup went to the agent instead. Only the code is logged. */
export type HandOver =
  | "lookup_failed"
  | "lookup_not_found"
  | "lookup_mismatch"
  | "lookup_unreadable";

/** The answer to post, or why there is none. */
export type LookupAnswer =
  | { readonly ok: true; readonly body: string }
  | { readonly ok: false; readonly reason: HandOver };

const ciOkWords: Readonly<Record<CheckState, string>> = {
  success: "ci-ok green",
  failure: "ci-ok red",
  pending: "ci-ok running",
  missing: "no ci-ok yet",
};

const mergeableWords: Readonly<Record<PrStatusResult["mergeable"], string>> = {
  yes: "no conflict",
  conflict: "conflicts with its base branch",
  unknown: "GitHub is still checking for conflicts",
};

/** Task statuses as an answer says them; any other status has no words, so it goes to the agent. */
const taskStatusWords: Readonly<Record<string, string>> = {
  backlog: "in the backlog",
  todo: "to do",
  in_progress: "in progress",
  in_review: "in review",
  blocked: "blocked",
  done: "done",
  cancelled: "cancelled",
};

/** Run statuses as an answer says them; any other status goes to the agent. */
const runStatusWords: Readonly<Record<string, string>> = {
  queued: "queued, not started yet",
  running: "under way",
};

function words(table: Readonly<Record<string, string>>, key: string): string | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

function prText(result: PrStatusResult): string {
  const name = `PR #${result.pr}`;
  if (result.state === "merged") return `${name}: merged.`;
  if (result.state === "closed") return `${name}: closed without merging.`;
  return [
    `${name}: open${result.draft ? " as a draft" : ""}`,
    ciOkWords[result.ciOk],
    mergeableWords[result.mergeable],
    result.inQueue ? "in the merge queue" : "not in the merge queue",
    result.approvedOnHead ? "approved on its latest commit." : "not approved on its latest commit.",
  ].join("; ");
}

function runText(result: RunStatusResult): string | undefined {
  const status = words(taskStatusWords, result.status);
  if (status === undefined) return undefined;
  if (result.run === undefined) return `${result.task}: ${status}; no agent run right now.`;
  const runStatus = words(runStatusWords, result.run.status);
  if (runStatus === undefined) return undefined;
  const whose =
    result.run.agentName === undefined ? "an agent's run" : `${result.run.agentName}'s run`;
  // A queued run hasn't started, so its answer never carries a start time.
  const started =
    result.run.status !== "running" || result.run.startedAt === undefined
      ? ""
      : `, started ${clockTime(result.run.startedAt)} UTC`;
  return `${result.task}: ${status}; ${whose} is ${runStatus}${started}.`;
}

/** Whether the result is about exactly what was asked. */
function sameSubject(question: LookupQuestion, result: LookupResult): boolean {
  if (question.kind === "pr_status") {
    return result.kind === "pr_status" && result.pr === question.pr;
  }
  return result.kind === "run_status" && result.task === question.task;
}

/**
 * The answer to a question, built only from the result: the label, then fixed
 * phrases filled in with the result's own values. A result about another
 * subject, or with a value that has no fixed phrase, gives no answer.
 */
export function answerFor(question: LookupQuestion, result: LookupResult): LookupAnswer {
  if (!sameSubject(question, result)) {
    return { ok: false, reason: "lookup_mismatch" };
  }
  const text = result.kind === "pr_status" ? prText(result) : runText(result);
  if (text === undefined) {
    return { ok: false, reason: "lookup_unreadable" };
  }
  return { ok: true, body: `${lookupLabel(question.kind)}${text}` };
}

/**
 * The check right before posting: the body is exactly the answer the result
 * gives to this question, with its label. So nothing but {@link answerFor}
 * can write a lookup answer, and a body that says anything the result doesn't
 * is never posted.
 */
export function checkLookupAnswer(
  body: string,
  question: LookupQuestion,
  result: LookupResult,
): boolean {
  const answer = answerFor(question, result);
  return answer.ok && body === answer.body && body.startsWith(lookupLabel(question.kind));
}
