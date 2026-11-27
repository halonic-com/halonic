import { findRuleMatches, isPlaceholder, secretRules } from "@halonicjs/std/secret-rules";
import { findRealEmails } from "./emails.ts";

/**
 * The pre-send scans for "Offer to Halonic": the last check, in Studio, on
 * exactly the text that would leave this computer. Any finding blocks
 * sending. A finding names the file, the line and the kind, never the
 * value, so the screen can show it without repeating what it found.
 *
 * Two scans run here: the repo's secret rules, and the user's own values
 * (the integration's setting values, the profile name and e-mail, and any
 * e-mail address outside the example domains). A user value is also found
 * as it is written in a JSON or JS string and in a URL or form body; any
 * other address as written or with its `@` URL-encoded (`%40`). Stored key values are not checked here:
 * row 4 of the I6 plan (HAL-18392) adds a shell command for them, so they
 * never reach the page.
 */

/** One file of the offer, with the exact text that would be sent. */
export interface OfferFile {
  /** The path in the pull request, such as `integrations/offered/shop/OFFER.md`. */
  readonly path: string;
  readonly text: string;
}

/** One setting of the integration, as the user filled it in. */
export interface SettingValue {
  readonly name: string;
  readonly value: string;
}

/** The user's own values, which must not leave with the offer. */
export interface UserValues {
  readonly settings: readonly SettingValue[];
  readonly profileName: string | undefined;
  readonly profileEmail: string | undefined;
}

/** One of the user's own values, named but never shown. */
export type UserValueKind =
  | { readonly kind: "setting"; readonly setting: string }
  | { readonly kind: "profile-name" }
  | { readonly kind: "profile-email" };

/** What a finding is. None of the kinds carries the value. */
export type OfferFindingKind =
  | { readonly kind: "secret"; readonly rule: string }
  | { readonly kind: "email" }
  | UserValueKind;

/** A finding, safe to show: the file, the line and the kind. */
export type OfferFinding = OfferFindingKind & {
  readonly file: string;
  /** The 1-based line; undefined when the file's path is what matches. */
  readonly line: number | undefined;
};

export interface OfferScan {
  readonly findings: readonly OfferFinding[];
  /** User values too short to look for without matching ordinary words. */
  readonly notChecked: readonly UserValueKind[];
}

/** A shorter value, such as `eu` or `10`, would match all over ordinary code. */
export const shortestCheckedValue = 4;

/**
 * A user value and how to find it: any of its written forms, whole, in any
 * case, not inside a longer word.
 */
interface UserValuePattern {
  readonly kind: UserValueKind;
  readonly pattern: RegExp;
}

function escapeForPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

/**
 * How a value can appear in the files: as typed, escaped inside a JSON or
 * JS string (`"` and `\`), and encoded in a URL (`@` as `%40`) or a form
 * body (a space as `+`).
 */
function writtenForms(value: string): string[] {
  // A lone surrogate would make encodeURIComponent throw; the typed form still matches.
  const inUrl = encodeURIComponent(value.toWellFormed());
  const forms = [value, JSON.stringify(value).slice(1, -1), inUrl, inUrl.replaceAll("%20", "+")];
  return [...new Set(forms)];
}

function userValuePatterns(user: UserValues): {
  patterns: UserValuePattern[];
  notChecked: UserValueKind[];
} {
  const values: [UserValueKind, string | undefined][] = [
    ...user.settings.map(({ name, value }): [UserValueKind, string] => [
      { kind: "setting", setting: name },
      value,
    ]),
    [{ kind: "profile-name" }, user.profileName],
    [{ kind: "profile-email" }, user.profileEmail],
  ];
  const patterns: UserValuePattern[] = [];
  const notChecked: UserValueKind[] = [];
  for (const [kind, raw] of values) {
    const value = raw?.trim() ?? "";
    if (value === "") {
      continue;
    }
    if (value.length < shortestCheckedValue) {
      notChecked.push(kind);
      continue;
    }
    const anyForm = writtenForms(value).map(escapeForPattern).join("|");
    patterns.push({
      kind,
      pattern: new RegExp(`(?<![\\p{L}\\p{N}])(?:${anyForm})(?![\\p{L}\\p{N}])`, "iu"),
    });
  }
  return { patterns, notChecked };
}

function findSecrets(line: string): OfferFindingKind[] {
  const found: OfferFindingKind[] = [];
  for (const rule of secretRules) {
    for (const value of findRuleMatches(rule, line)) {
      if (!isPlaceholder(value)) {
        found.push({ kind: "secret", rule: rule.name });
      }
    }
  }
  return found;
}

/**
 * The user values on a line, then any other real e-mail address, also one
 * whose `@` is URL-encoded. The profile e-mail is reported once, as itself,
 * not again as an address.
 */
function findUserValues(
  line: string,
  patterns: readonly UserValuePattern[],
  profileEmail: string | undefined,
): OfferFindingKind[] {
  const found: OfferFindingKind[] = patterns
    .filter(({ pattern }) => pattern.test(line))
    .map(({ kind }) => kind);
  const own = profileEmail?.trim().toLowerCase();
  for (const address of findRealEmails(line.replaceAll(/%40/gi, "@"))) {
    if (address.toLowerCase() !== own) {
      found.push({ kind: "email" });
    }
  }
  return found;
}

/** Both scans over one line of a file, or over a file's path. */
function scanLine(
  line: string,
  patterns: readonly UserValuePattern[],
  profileEmail: string | undefined,
): OfferFindingKind[] {
  return [...findSecrets(line), ...findUserValues(line, patterns, profileEmail)];
}

/** Runs both scans over every file of the offer, its path included. */
export function scanOffer(files: readonly OfferFile[], user: UserValues): OfferScan {
  const { patterns, notChecked } = userValuePatterns(user);
  const findings: OfferFinding[] = [];
  for (const file of files) {
    for (const kind of scanLine(file.path, patterns, user.profileEmail)) {
      findings.push({ ...kind, file: file.path, line: undefined });
    }
    file.text.split("\n").forEach((text, index) => {
      for (const kind of scanLine(text, patterns, user.profileEmail)) {
        findings.push({ ...kind, file: file.path, line: index + 1 });
      }
    });
  }
  return { findings, notChecked };
}
