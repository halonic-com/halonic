import type { ServiceCheckOutcome, SetupRecord, SetupService } from "@halonicjs/google-setup";
import { listNames } from "./account-labels.ts";

/** One service's result as step 7 reads it, from the record's last check. */
export interface ServiceResultLine {
  readonly service: string;
  /** The service's name, such as "Drive". */
  readonly label: string;
  readonly result: ServiceCheckOutcome;
}

/**
 * The ticked services whose check ran after the last sign-in. A result from an earlier sign-in
 * says nothing about the grant the user just made, so it is left out, and so is a service that
 * was never checked.
 */
export function currentResultLines(
  services: readonly SetupService[],
  record: Pick<SetupRecord, "lastSignInAt" | "services">,
): ServiceResultLine[] {
  if (record.lastSignInAt === null) return [];
  const signedInAt = Date.parse(record.lastSignInAt);
  return services.flatMap((service) => {
    const checked = record.services[service.id];
    if (checked === undefined || Date.parse(checked.checkedAt) < signedInAt) return [];
    return [{ service: service.id, label: service.label, result: checked.result }];
  });
}

/** What one line says and whether it passed. `enableUrl` is the API's page in the Console, for apiOff. */
export interface ResultText {
  readonly passed: boolean;
  readonly text: string;
  readonly enableUrl?: string;
}

/** Google being busy or down (429, 5xx): waiting helps. Any other refusal doesn't get better by waiting. */
function isBusyStatus(status: number): boolean {
  return status === 429 || status >= 500;
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
        text: `${label}: you didn't allow ${label} access. ${label} won't work until you sign in again and tick it.`,
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
        text: isBusyStatus(result.status)
          ? `${label}: Google couldn't check it just now (error ${result.status}). Wait a moment, then check again.`
          : `${label}: Google refused the check (error ${result.status}). Sign in again.`,
      };
    case "unreachable":
      return {
        passed: false,
        text: `${label}: Studio couldn't reach Google to check it. Check your connection, then check again.`,
      };
  }
}

/**
 * Whether checking again can change a line: an API switched on, or Google answering after being
 * busy. A scope the user left empty only changes with a new sign-in.
 */
export function canCheckAgain(line: ServiceResultLine): boolean {
  return !resultText(line).passed && line.result.kind !== "scopeNotGranted";
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
