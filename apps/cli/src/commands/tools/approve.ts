// `halonic tools approve <source> <tool>… [--fingerprint <fingerprint>]`
// and `halonic tools approve <source> --all` (cli-output 3.10, HAL-3004):
// approve without a question, by name or every waiting tool, each at the
// fingerprint read now or the one the person gives.

import {
  approveAllShown,
  approveNamedTool,
  type ListedToolApprovalCheck,
  type NamedToolApproval,
} from "@halonicjs/app/listed-tools";
import type { ListedToolFingerprint } from "@halonicjs/ports";
import {
  type CommandContext,
  type CommandInput,
  type CommandResult,
  OwnLineError,
  UsageError,
} from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
import { columns } from "../../messages/columns.ts";
import { dim, markPart, type Phrase, phrase } from "../../messages/phrase.ts";
import { toolsMessages } from "../../messages/tools.ts";
import { nearMatch } from "../../near-match.ts";
import { printable } from "../../output/printable.ts";
import { shellWord } from "../../output/shell-word.ts";
import { type ApprovedEntry, approvedEntry, leftOutEntry } from "./json.ts";
import {
  checkToolSource,
  isOffered,
  noToolsToApprove,
  openToolSource,
  type ToolSource,
  type ToolsMachine,
  toolsCommand,
} from "./source.ts";

/** How many hex digits of a fingerprint `--all` shows after `htl1:`, to keep one line per tool. */
const shortFingerprintDigits = 12;

/**
 * Approves the tools named, or with `--all` every tool waiting now. The
 * command line is checked first, so a wrong one connects nothing and
 * approves nothing.
 *
 * @throws UsageError for names with `--all`, `--fingerprint` with more than one tool or with `--all`, or no tools
 */
export async function approveTools(
  input: CommandInput,
  context: CommandContext,
  machine: ToolsMachine,
): Promise<CommandResult> {
  const names = input.positionals.slice(1);
  const all = input.options["all"] === true;
  const given = input.options["fingerprint"];
  const fingerprint = typeof given === "string" ? (given as ListedToolFingerprint) : undefined;
  if (input.positionals.length === 0) {
    throw new UsageError(toolsMessages.nameTheSource("approve"));
  }
  checkCommandLine(names, all, fingerprint);

  const source = await openToolSource(input, context, "approve");
  const check = await checkToolSource(source, machine, context);
  if (typeof check === "string") {
    const { line, json } = noToolsToApprove(check, source);
    return { exitCode: exitCode.ok, lines: [line], json: { approved: [], leftOut: [], ...json } };
  }
  if (all) {
    return await approveAll(check, source, machine);
  }
  return await approveByName(check, names, fingerprint, source, context, machine);
}

/** The usage errors, before anything is read or started. */
function checkCommandLine(names: readonly string[], all: boolean, fingerprint: string | undefined) {
  if (all && names.length > 0) {
    throw new UsageError(toolsMessages.namesAndAll(), toolsMessages.namesAndAllFix());
  }
  if (fingerprint !== undefined && all) {
    throw new UsageError(toolsMessages.fingerprintWithAll(), toolsMessages.oneAtATime());
  }
  if (fingerprint !== undefined && names.length > 1) {
    throw new UsageError(
      toolsMessages.fingerprintManyTools(names.map(printable)),
      toolsMessages.oneAtATime(),
    );
  }
  if (!all && names.length === 0) {
    throw new UsageError(toolsMessages.nameTheTools());
  }
}

/**
 * `--all`, the command line's Approve all (C2): exactly the tools waiting in
 * this check that the connector's `tools.allow` offers to agents (all of
 * them when it has no `allow`), each at the fingerprint it prints. A tool
 * `allow` leaves out is never offered, so `--all` doesn't approve it; naming
 * it still does. A tool its server keeps
 * changing is left out, and named with the command that approves it.
 */
async function approveAll(
  check: ListedToolApprovalCheck,
  source: ToolSource,
  machine: ToolsMachine,
): Promise<CommandResult> {
  const offered = check.waiting.filter((waiting) => isOffered(source, waiting.listedName));
  const { approved, leftOut } = await approveAllShown(
    check,
    offered,
    machine.approvals,
    machine.clock,
  );
  const rows = columns(
    approved.map((waiting) => [
      phrase`${markPart("done")} ${toolsMessages.approvedRow(printable(waiting.listedName)).phrase}`,
      phrase`${dim(shortFingerprint(waiting.fingerprint))}`,
    ]),
  );
  const leftOutLines = leftOut.map((waiting) => {
    const name = printable(waiting.listedName);
    const command = toolsCommand("approve", source, shellWord(waiting.listedName));
    return phrase`${markPart("needsYou")} ${toolsMessages.leftOutKeepsChanging(name, source.shown, command).phrase}`;
  });
  return {
    exitCode: exitCode.ok,
    lines: [...rows, ...leftOutLines, allSummary(approved.length, offered.length, source)],
    json: { approved: approved.map(approvedEntry), leftOut: leftOut.map(leftOutEntry) },
  };
}

/**
 * `--all`'s last line. Nothing waiting is good news; tools that wait but all
 * keep changing is not, so it says none were approved.
 */
function allSummary(approvedCount: number, waitingCount: number, source: ToolSource): Phrase {
  if (approvedCount > 0) {
    const said = toolsMessages.approvedAsTheyAre(approvedCount, source.shown);
    return phrase`${markPart("done")} ${said.phrase}`;
  }
  if (waitingCount === 0) {
    return phrase`${markPart("done")} ${toolsMessages.nothingWaiting(source.shown).phrase}`;
  }
  return phrase`${markPart("needsYou")} ${toolsMessages.approvedNoneKeepChanging(source.shown).phrase}`;
}

/**
 * Approves each tool named, in order, one line each. The first one that
 * can't be approved ends the command with its error, and the tools after it
 * aren't tried; the ones before it stay approved, and their lines are
 * printed already.
 */
async function approveByName(
  check: ListedToolApprovalCheck,
  names: readonly string[],
  fingerprint: ListedToolFingerprint | undefined,
  source: ToolSource,
  context: CommandContext,
  machine: ToolsMachine,
): Promise<CommandResult> {
  const lines: Phrase[] = [];
  const approved: ApprovedEntry[] = [];
  for (const name of names) {
    const result = await approveNamedTool(
      check,
      name,
      machine.approvals,
      machine.clock,
      fingerprint,
    );
    const said = [
      ...approvedLines(result, name, source, approved),
      ...notOfferedLines(name, source),
    ];
    for (const line of said) {
      context.printAhead(line);
      lines.push(line);
    }
    if (result.outcome === "approved") {
      approved.push(approvedEntry(result.waiting));
    }
  }
  return { exitCode: exitCode.ok, lines, json: { approved, leftOut: [] } };
}

/**
 * The lines for one tool that was approved, or is approved already.
 *
 * @throws OwnLineError when it can't be approved: it changed since the
 *   fingerprint given (`conflict`), Halonic refused it (`denied`), or the
 *   source doesn't list it (`not_found`)
 */
function approvedLines(
  result: NamedToolApproval,
  typed: string,
  source: ToolSource,
  approvedBefore: readonly ApprovedEntry[],
): Phrase[] {
  // `--json` names the tools approved before the stop, so a script knows what stayed approved.
  const jsonFields = { approved: approvedBefore };
  const name = printable(typed);
  switch (result.outcome) {
    case "approved":
      return [
        phrase`${markPart("done")} ${toolsMessages.approvedOne(name, source.shown).phrase}`,
        phrase`  ${dim(result.waiting.fingerprint)}`,
      ];
    case "already_approved":
      return [
        phrase`${markPart("done")} ${toolsMessages.approvedAlready(name, source.shown).phrase}`,
      ];
    case "changed":
      throw new OwnLineError(
        "conflict",
        toolsMessages.fingerprintNotCurrent(name, result.waiting.fingerprint),
        toolsMessages.reviewItFirst(toolsCommand("review", source)),
        jsonFields,
      );
    case "refused":
      throw new OwnLineError(
        "denied",
        toolsMessages.refused(name, printable(result.reason)),
        undefined,
        jsonFields,
      );
    case "not_listed": {
      const near = nearMatch(typed, result.listed);
      throw new OwnLineError(
        "not_found",
        toolsMessages.notListed(name, source.shown),
        near === undefined
          ? toolsMessages.seeItsTools(toolsCommand("review", source))
          : toolsMessages.didYouMean(printable(near)),
        jsonFields,
      );
    }
    case "unreadable":
      // The check was refused before any tool was looked up (`checkToolSource`).
      throw new OwnLineError(
        "unavailable",
        toolsMessages.unreadableUnnamed(source.shown),
        undefined,
        jsonFields,
      );
  }
}

/**
 * A tool the connector's `tools.allow` leaves out is approved when named,
 * so it is ready once `allow` names it, but agents never see it until then
 * (HAL-12340). Only reached when the approval went through: an error throws
 * before this.
 */
function notOfferedLines(typed: string, source: ToolSource): Phrase[] {
  if (isOffered(source, typed)) {
    return [];
  }
  return [
    phrase`${markPart("needsYou")} ${toolsMessages.notInAllow(printable(typed), source.shown).phrase}`,
  ];
}

/** `htl1:` and the first 12 hex digits, then "…": what `--all` prints per tool. */
function shortFingerprint(fingerprint: string): string {
  const prefix = "htl1:";
  return `${fingerprint.slice(0, prefix.length + shortFingerprintDigits)}…`;
}
