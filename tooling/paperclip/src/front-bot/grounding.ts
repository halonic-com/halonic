import {
  clockTime,
  commentLimit,
  type FrontBotInput,
  frontBotUserText,
  shownEarlier,
} from "./prompt.ts";
import { holdsSecretShape } from "./secret-shape.ts";

/**
 * The plain-code check every first reply passes before it is posted
 * (HAL-18847 section 7, point 1: Liam's condition). The prompt asks the model
 * to behave; this check guarantees the worst cases without a model: a reply
 * that names a number, time, link or name the bot wasn't given, or claims a
 * result, is never posted. A rejected reply leaves only its reason code.
 */

/** Why a reply was rejected. Only the code is logged, never the reply. */
export type GroundingReason =
  | "secret_shape"
  | "too_long"
  | "bare_acknowledgement"
  | "unhedged_answer"
  | "first_person"
  | "banned_word"
  | "time_promise"
  | "unknown_number"
  | "unknown_link"
  | "unknown_name"
  | "result_word";

/** What the check decided. */
export type Grounding =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: GroundingReason };

/** About 20 words is the voice's rule; this leaves room for a task title in quotes. */
const maxWords = 30;
const maxCharacters = 240;

/** Replies that say nothing; the bot should have answered SKIP. */
const bareAcknowledgements = new Set([
  "on it",
  "ok",
  "okay",
  "got it",
  "noted",
  "sure",
  "will do",
  "looking",
  "looking into it",
  "working on it",
  "checking",
  "one moment",
]);

/** A reply that starts by answering the question; the bot never answers, it only frames. */
const unhedgedAnswer =
  /^\s*(?:yes|no|yep|nope|correct|right|sure thing|definitely|it is|it's|it isn't)\b/i;

const firstPerson = /(?<![\w'’])(?:I|I'm|I’m|I'll|I’ll|I've|I’ve|I'd|I’d|me|my|mine)(?![\w'’])/;
const bannedWords = /\bsafe(?:ly)?\b|!|\p{Extended_Pictographic}/iu;
const timePromises =
  /\b(?:in (?:a|\d+) (?:moment|minute|minutes|min|mins|hour|hours|sec|second|seconds|bit|few)|within|shortly|soon|right away|asap|by (?:today|tonight|tomorrow|the end|end of))\b/i;

/**
 * Words that state a result or a claimed action. Allowed only when negated
 * ("Not done yet.") or quoted from an earlier comment together with that
 * comment's own time.
 */
const resultWords = [
  "merged",
  "done",
  "fixed",
  "passed",
  "passing",
  "green",
  "deployed",
  "shipped",
  "released",
  "published",
  "resolved",
  "completed",
  "finished",
  "closed",
  "approved",
  "queued",
  "started",
  "restarted",
  "reverted",
  "landed",
  "succeeded",
  "sent",
  "posted",
  "added",
  "opened",
  "updated",
];
const resultPattern = new RegExp(`\\b(?:${resultWords.join("|")})\\b`, "gi");
const negation =
  /\b(?:not|isn't|isn’t|aren't|aren’t|wasn't|wasn’t|hasn't|hasn’t|haven't|haven’t|never|no)\s+(?:\w+\s+)?$/i;

/**
 * Capitalised words the bot may start a sentence with, or use as fixed terms,
 * without finding them in the input. Every other capitalised word counts as a
 * name and must appear in the input.
 */
const commonWords = new Set(
  (
    "a an the about request requests depends adds asks also answer current plan question " +
    "this that these those it its your for on in to of and or but so which what why how " +
    "when where who whether same earlier new still not needs part follows ties waiting " +
    "pr prs ci utc task build run release"
  ).split(" "),
);

const numberPattern = /\d+(?:[.:]\d+)*/g;
const linkPattern = /https?:\/\/[^\s)>\]]+|\]\(([^)\s]+)\)/g;
const capitalisedPattern = /\b[A-Z][\w'’-]*/g;

function words(text: string): string[] {
  return text.split(/\s+/).filter((word) => word !== "");
}

function isBareAcknowledgement(line: string): boolean {
  const normalised = line
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .trim();
  return bareAcknowledgements.has(normalised);
}

function allNumbersKnown(line: string, input: string): boolean {
  const known = new Set(input.match(numberPattern) ?? []);
  return (line.match(numberPattern) ?? []).every((number) => known.has(number));
}

function allLinksKnown(line: string, input: string): boolean {
  for (const match of line.matchAll(linkPattern)) {
    const link = (match[1] ?? match[0]).replace(/[.,;:]+$/, "");
    if (!input.includes(link)) {
      return false;
    }
  }
  return true;
}

function allNamesKnown(line: string, input: string): boolean {
  const known = new Set((input.match(/[\p{L}\p{N}_-]+/gu) ?? []).map((word) => word));
  for (const match of line.match(capitalisedPattern) ?? []) {
    const name = match.replace(/['’]s$/, "").replace(/[-'’]+$/, "");
    if (!known.has(name) && !commonWords.has(name.toLowerCase())) {
      return false;
    }
  }
  return true;
}

/**
 * A result word is fine when negated, or when an earlier comment the bot was
 * shown says it and the reply names that comment's time: then the reply quotes
 * who said it and when. The task title and the new message never count, since
 * the person's own question ("Is #6129 merged yet?") holds the word it asks
 * about, and a time from one comment never vouches for a word from another.
 */
function resultWordsAllowed(line: string, input: FrontBotInput): boolean {
  const timesInLine = new Set(line.match(/\b\d{1,2}:\d{2}\b/g) ?? []);
  const quotedBodies = shownEarlier(input)
    .filter((comment) => timesInLine.has(clockTime(comment.at)))
    .map((comment) => comment.body.slice(0, commentLimit).toLowerCase());
  for (const match of line.matchAll(resultPattern)) {
    const before = line.slice(0, match.index);
    if (negation.test(before)) {
      continue;
    }
    const word = new RegExp(`\\b${match[0].toLowerCase()}\\b`);
    if (!quotedBodies.some((body) => word.test(body))) {
      return false;
    }
  }
  return true;
}

/**
 * Checks one reply against what the bot was given. Cheap checks on the reply
 * alone come first; then every number, link and name must be found in the exact
 * text it sent, and result words need a negation or an earlier comment quoted
 * with its time. Result words come before names, so a sentence that starts with
 * one is reported as a result.
 */
export function checkGrounding(line: string, given: FrontBotInput): Grounding {
  const input = frontBotUserText(given);
  const reject = (reason: GroundingReason): Grounding => ({ ok: false, reason });
  if (holdsSecretShape(line)) return reject("secret_shape");
  if (line.length > maxCharacters || words(line).length > maxWords) return reject("too_long");
  if (isBareAcknowledgement(line)) return reject("bare_acknowledgement");
  if (unhedgedAnswer.test(line)) return reject("unhedged_answer");
  if (firstPerson.test(line)) return reject("first_person");
  if (bannedWords.test(line)) return reject("banned_word");
  if (timePromises.test(line)) return reject("time_promise");
  if (!allNumbersKnown(line, input)) return reject("unknown_number");
  if (!allLinksKnown(line, input)) return reject("unknown_link");
  if (!resultWordsAllowed(line, given)) return reject("result_word");
  if (!allNamesKnown(line, input)) return reject("unknown_name");
  return { ok: true };
}
