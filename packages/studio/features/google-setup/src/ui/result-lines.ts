import type { ServiceCheckOutcome } from "@halonicjs/google-setup";
import { listNames } from "./account-labels.ts";

/** One service's result as step 7 reads it, from the record's last check. */
export interface ServiceResultLine {
  readonly service: string;
  /** The service's name, such as "Drive". */
  readonly label: string;
  readonly result: ServiceCheckOutcome;
}

/** What one line says and whether it passed. `enableUrl` is the API's page in the Console, for apiOff. */
export interface ResultText {
  readonly passed: boolean;
  readonly text: string;
  readonly enableUrl?: string;
}

/**
 * The words for one service's result (design 3.5, item 3; 5.1). Nothing here repeats text from
 * Google: the record holds only kinds, codes and names from the sheet.
 */
export function resultText(line: ServiceResultLine): ResultText {
  const { label, result } = line;
  switch (result.kind) {
    case "works":
      return { passed: true, text: `${label} works` };
    case "allowed":
      return { passed: true, text: `${label} is allowed` };
    case "scopeNotGranted":
      return {
        passed: false,
        text: `${label}: you didn't allow ${label} access. Sign in again and tick ${label}.`,
      };
    case "apiOff": {
      const api = result.apiName === undefined ? `the ${label} API` : `the ${result.apiName}`;
      const where = result.project === undefined ? "" : ` in project ${result.project}`;
      return {
        passed: false,
        text: `${label}: ${api} is off${where}.`,
        ...(result.enableUrl === undefined ? {} : { enableUrl: result.enableUrl }),
      };
    }
    case "checkFailed":
      return {
        passed: false,
        text: `${label}: Google answered the check with an error (${result.status}). Sign in again in a moment.`,
      };
    case "unreachable":
      return {
        passed: false,
        text: `${label}: Studio couldn't reach Google to check it. Check your connection, then sign in again.`,
      };
  }
}

/**
 * The line when every service passed (design 3.5, item 4): "Google is set up for x@example.com.
 * Gmail and Drive work." Services that were only allowed say so apart from those that work.
 */
export function allPassedText(email: string, lines: readonly ServiceResultLine[]): string {
  const works = lines.filter((line) => line.result.kind === "works").map((line) => line.label);
  const allowed = lines.filter((line) => line.result.kind === "allowed").map((line) => line.label);
  const parts = [
    works.length === 0 ? null : `${listNames(works)} ${works.length === 1 ? "works" : "work"}.`,
    allowed.length === 0
      ? null
      : `${listNames(allowed)} ${allowed.length === 1 ? "is" : "are"} allowed.`,
  ].filter((part) => part !== null);
  return `Google is set up for ${email}. ${parts.join(" ")}`;
}
