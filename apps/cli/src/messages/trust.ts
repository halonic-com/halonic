import { counted } from "./counts.ts";
import { defineMessages } from "./define.ts";
import { dim, type Phrase, phrase } from "./phrase.ts";
import { suggestedCommand } from "./suggested-command.ts";

/** Where an unpinned program downloads its code from: npm for `npx`, PyPI for `uvx` and `pipx run`. */
export type PackageRegistry = "npm" | "PyPI";

/** How many rows of one kind are marked New and how many Changed since the workspace was trusted. */
export interface RowChanges {
  readonly added: number;
  readonly changed: number;
}

/** The changed rows by kind, in the summary's order: programs, agents, addresses. */
export interface TrustChangeCounts {
  readonly programs: RowChanges;
  /** Counted per agent, not per field (revision 40). */
  readonly agents: RowChanges;
  /** HTTP connectors and local integrations, one each however many settings it reads. */
  readonly addresses: RowChanges;
}

/**
 * What the first-time summary counts. Sites are counted once each across all
 * agents; addresses count every setting address of a local integration.
 */
export interface TrustCounts {
  readonly programs: number;
  readonly agents: number;
  readonly secrets: number;
  readonly addresses: number;
  readonly sites: number;
}

/**
 * The sentences of `halonic trust [--dir <folder>]` (cli-output 1.7, 1.9 and
 * 3.5 at revision 40), in the content and order of Studio's trust check
 * (microcopy 4.3). In 0.1 the check covers connectors and agents that run in
 * Claude Code or Codex only, so there are no sections for models, budgets
 * or sending without asking. Dates come in as the output writes them, such as
 * "3 Nov". Wherever a fix names `halonic trust`, `dir` is the user's own
 * `--dir`, so the command works where they typed it.
 */
export const trustMessages = defineMessages("trust", {
  summary: () => phrase`Review what a workspace can start, and trust it on this computer`,
  /**
   * What `trust` was doing, for "✕ Couldn't trust Acme: …": the workspace's
   * name, or the folder as typed before the workspace was read.
   */
  action: (name?: string) => phrase`trust ${name ?? "this folder"}`,

  /** The options in `halonic trust --help` (team, HAL-188 4c). */
  listOption: () => phrase`List the workspaces trusted on this computer.`,
  removeOption: () => phrase`Remove the trust, so the workspace's programs don't start.`,
  yesOption: () => phrase`Trust without asking. Needs --fingerprint.`,
  fingerprintOption: () => phrase`The fingerprint from the check you reviewed.`,

  heading: (name: string, folder: string) => phrase`Trust check for ${name} (${folder})`,
  intro: (name: string) =>
    phrase`Before anything in ${name} runs on this computer, here's what it can start and where it can talk to.`,
  /** The heading instead, when the workspace changed since it was trusted. */
  changedHeading: (name: string, trustedOn: string) =>
    phrase`What changed in ${name} since you trusted it on ${trustedOn}`,
  /**
   * The first-time summary, under the intro: "Will start 2 programs and 1
   * agent, pass 1 secret and allow 2 sites." Counts of 0 are left out
   * (revision 40). Called only when something is counted.
   */
  startSummary: (counts: TrustCounts) => phrase`Will ${listed(summaryClauses(counts))}.`,
  /**
   * Studio's summary sentence, first under the changed heading. It names only
   * what changed, never a 0 (cli-output 3.5, revisions 24 and 40). One
   * changed row carries the date; several are one list, programs, agents,
   * then addresses, new before changed, without the date, because the
   * heading already has it. Called only when something changed.
   */
  changeSummary: (changes: TrustChangeCounts, trustedOn: string) => {
    const parts = changeParts(changes);
    const [only] = parts;
    if (parts.length === 1 && only?.startsWith("1 ")) {
      return phrase`${only} since you trusted this on ${trustedOn}.`;
    }
    return phrase`${listed(parts)}.`;
  },
  /** After a row that wasn't there when it was trusted. */
  newRow: () => phrase`New`,
  /** After a row that is different from when it was trusted. */
  changedRow: () => phrase`Changed`,
  programsHeading: () => phrase`Programs`,
  /** The secrets a program gets, after its command: "gets the secret GMAIL_TOKEN". */
  getsSecrets: (names: readonly string[]) =>
    phrase`gets the ${names.length === 1 ? "secret" : "secrets"} ${listed(names)}`,
  agentsHeading: () => phrase`Agents`,
  /** The line under the Agents heading. The terminal has no count and no collapsing. */
  agentsIntro: () => phrase`Agents in this workspace that run in Claude Code or Codex.`,
  /** The label over an agent's sites, one per line, every one of them. */
  allowedSites: () => phrase`Allowed sites`,
  /** The label over an agent's folder, shown only when it isn't `files/agents/<id>`. */
  workingFolder: () => phrase`Working folder`,
  /** After a wildcard site, `*.example.com`. */
  everySiteUnder: (domain: string) => phrase`every site under ${domain}`,
  /** After a site with a Punycode label (`xn--`). */
  nonLatin: () => phrase`(non-Latin letters)`,
  /** The program an agent runs in, as on the agent page: "Claude Code", "Codex". */
  harnessName: (harness: string) => phrase`${harnessNames.get(harness) ?? harness}`,
  /** A changed agent's harness: "Claude Code → Codex". */
  harnessChanged: (before: Phrase, after: Phrase) => phrase`${before} → ${after}`,
  /** A changed agent's sites: "now also allows a, no longer allows b". */
  sitesChanged: (added: readonly string[], removed: readonly string[]) => {
    const now = phrase`now also allows ${added.join(", ")}`;
    const gone = phrase`no longer allows ${removed.join(", ")}`;
    if (removed.length === 0) {
      return now;
    }
    return added.length === 0 ? gone : phrase`${now}, ${gone}`;
  },
  /** A changed agent's folder: "working folder files/agents/coder → src/app". */
  workingFolderChanged: (before: string, after: string) =>
    phrase`working folder ${dim(before)} → ${dim(after)}`,
  /**
   * The section for connectors reached by an address rather than a program,
   * after Agents, as Studio's Addresses section (microcopy 4.3; team, HAL-3468).
   */
  addressesHeading: () => phrase`Addresses`,
  /** A local integration's setting with no address in it yet. */
  settingNotSet: () => phrase`not set`,
  /**
   * A local integration's setting whose URL can't be trusted, such as one
   * with a password in it: "can't be used: the URL has user info".
   */
  settingRefused: (reason: string) => phrase`can't be used: ${reason}`,
  /** Under a program whose version isn't pinned, with a ! (decided from the command alone). */
  notPinned: (registry: PackageRegistry) =>
    phrase`Can download new code from ${registry} when it starts: version not pinned.`,
  /** The label above the full fingerprint, which is never shortened. */
  fingerprintHeading: () => phrase`Fingerprint`,

  /** The question, framed with [y/N] by the question line. */
  question: (name: string) => phrase`Trust ${name} on this computer?`,
  /** The second question for a program that isn't pinned (Studio's checkbox). */
  notPinnedQuestion: () => phrase`It can download new code when it starts. Trust it anyway?`,
  trusted: (name: string) => phrase`${name} can run now.`,
  /** Answer No, or Enter: exit 3. */
  notTrusted: () => phrase`Not trusted. Nothing was started.`,
  alreadyTrusted: (name: string, trustedOn: string) =>
    phrase`${name} is already trusted on this computer. Nothing changed since ${trustedOn}.`,
  /** With a !, before the check, when the record of what's trusted can't be read. */
  listUnreadable: () =>
    phrase`Halonic couldn't read its list of trusted workspaces, so it's asking again.`,

  /** `--list`: "trusted on 3 Nov", after the name and the folder. */
  trustedOn: (date: string) => phrase`trusted on ${date}`,
  noneTrusted: () => phrase`No trusted workspaces yet.`,
  /** `--remove`. */
  removed: (name: string) =>
    phrase`Removed trust for ${name}. Its programs and real models won't start until you review it again.`,

  /** `--yes` alone: wrong usage, exit 2, and never a question (Liam's F5 on HAL-2618). */
  yesNeedsFingerprint: () =>
    phrase`--yes needs --fingerprint, so you trust exactly what you reviewed.`,
  yesNeedsFingerprintFix: (dir?: string) =>
    phrase`Run ${suggestedCommand("trust", dir)} to see it; the fingerprint is in the check, above the question.`,
  /** `--fingerprint` doesn't match: exit 3, and never a question, also in a terminal (F5). */
  fingerprintChanged: () => phrase`it changed since that fingerprint was made.`,
  fingerprintChangedFix: (dir?: string) =>
    phrase`Run ${suggestedCommand("trust", dir)} again to see what changed.`,
  /** No terminal, or `CI` set, and no flags that answer: exit 3 (F6), in F16's two lines (D4). */
  noTerminal: (name: string) =>
    phrase`${name} isn't trusted on this computer yet, and there's no terminal to ask you.`,
  noTerminalFix: (dir?: string) =>
    phrase`Review it with ${suggestedCommand("trust", dir)}, then pass --yes --fingerprint <fingerprint>.`,

  /** Why another command didn't start: "Acme isn't trusted on this computer yet." (section 4). */
  notTrustedYet: (name: string) => phrase`${name} isn't trusted on this computer yet.`,
  /** The fix under {@link notTrustedYet}. */
  reviewThenTrust: (dir?: string) =>
    phrase`Review what it can start, then trust it: ${suggestedCommand("trust", dir)}`,
});

/** The agent page's names of the harnesses, by the id an agent file writes. */
const harnessNames: ReadonlyMap<string, string> = new Map([
  ["claude-code", "Claude Code"],
  ["codex", "Codex"],
]);

/** "start 2 programs and 1 agent", "pass 1 secret", …: the clauses whose count isn't 0. */
function summaryClauses(counts: TrustCounts): string[] {
  const started = [
    counts.programs > 0 ? counted(counts.programs, "program", "programs") : undefined,
    counts.agents > 0 ? counted(counts.agents, "agent", "agents") : undefined,
  ].filter((part) => part !== undefined);
  return [
    started.length > 0 ? `start ${started.join(" and ")}` : undefined,
    counts.secrets > 0 ? `pass ${counted(counts.secrets, "secret", "secrets")}` : undefined,
    counts.addresses > 0 ? `list ${counted(counts.addresses, "address", "addresses")}` : undefined,
    counts.sites > 0 ? `allow ${counted(counts.sites, "site", "sites")}` : undefined,
  ].filter((part) => part !== undefined);
}

/** "1 new program", "2 changed agents", …: the parts that aren't 0, in the summary's order. */
function changeParts(changes: TrustChangeCounts): string[] {
  const kinds = [
    [changes.programs, "program", "programs"],
    [changes.agents, "agent", "agents"],
    [changes.addresses, "address", "addresses"],
  ] as const;
  return kinds.flatMap(([rows, one, many]) =>
    [
      rows.added > 0 ? counted(rows.added, `new ${one}`, `new ${many}`) : undefined,
      rows.changed > 0 ? counted(rows.changed, `changed ${one}`, `changed ${many}`) : undefined,
    ].filter((part) => part !== undefined),
  );
}

/** "A", "A and B", "A, B and C". */
function listed(names: readonly string[]): Phrase {
  const last = names.at(-1) ?? "";
  if (names.length < 2) {
    return phrase`${last}`;
  }
  return phrase`${names.slice(0, -1).join(", ")} and ${last}`;
}
