// A listed tool as `halonic tools review` shows it (cli-output 3.10): its
// state and name, its description or what changed, its arguments, whether it
// asks before each use, and the full fingerprint `--fingerprint` takes.
// Everything a server wrote is escaped here, so no control or bidi
// character reaches the terminal (HAL-2579 G1).

import {
  type HiddenChange,
  type ListedToolChange,
  listedToolChangeLabel,
  type ReviewedTool,
} from "@halonicjs/app/listed-tools";
import { needsApproval } from "@halonicjs/format";
import type { Message } from "../../messages/define.ts";
import { bold, dim, markPart, type Phrase, phrase, plainText } from "../../messages/phrase.ts";
import { toolsMessages } from "../../messages/tools.ts";
import { printable } from "../../output/printable.ts";
import type { ToolSource } from "./source.ts";

/**
 * One tool's block: the heading, then its lines indented under it.
 *
 * @example
 * toolBlock(reviewed, source);
 * // Not approved  archive
 * //   Moves a note to the archive.
 * //   Arguments  id (string): the note's id
 * //   Asks you before each use.
 * //   htl1:9f86d0…
 */
export function toolBlock(reviewed: ReviewedTool, source: ToolSource): Phrase[] {
  const { waiting } = reviewed;
  const name = printable(waiting.listedName);
  const heading = phrase`${bold(plainText(stateWord(reviewed).phrase))}  ${bold(name)}`;
  const body =
    reviewed.state === "changed" && !waiting.keepsChanging
      ? changedLines(reviewed, source)
      : [...descriptionLines(waiting.tool.description), ...argumentLines(waiting.tool.parameters)];
  const leftOut = reviewed.leftOutArguments.map(
    (reason) => toolsMessages.leftOutArguments(printable(reason)).phrase,
  );
  const asks = needsApproval(source.connector.tools, waiting.listedName)
    ? toolsMessages.asksBeforeEachUse()
    : toolsMessages.doesntAsk(printable(source.workspace));
  return [
    heading,
    ...[
      ...body,
      ...leftOut,
      phrase`${dim(plainText(asks.phrase))}`,
      phrase`${dim(waiting.fingerprint)}`,
    ].map(indented),
  ];
}

/** The word for a tool's state, the same five as Studio's. */
function stateWord(reviewed: ReviewedTool): Message {
  if (reviewed.waiting.keepsChanging) {
    return toolsMessages.keepsChanging();
  }
  return reviewed.state === "changed" ? toolsMessages.changed() : toolsMessages.notApproved();
}

/**
 * What changed since the approval, one entry per change. With no change in
 * the text, the tool can only wait because the source connects differently
 * (`serverChanged`, N1), which is said instead, so a Changed tool never
 * stands over nothing.
 */
function changedLines(reviewed: ReviewedTool, source: ToolSource): Phrase[] {
  if (reviewed.changes.length === 0) {
    return [toolsMessages.connectsDifferently(source.shown).phrase];
  }
  return reviewed.changes.flatMap(changeLines);
}

/** One change: its plain label, then `before` and `now`, and a `!` line when a person can't see it. */
function changeLines(change: ListedToolChange): Phrase[] {
  const before = change.before === null ? toolsMessages.none() : undefined;
  const after = change.after === null ? toolsMessages.removed() : undefined;
  const lines = [
    changeLabel(change.path),
    phrase`  ${dim(plainText(toolsMessages.before().phrase))}  ${before?.phrase ?? printable(change.before ?? "")}`,
    phrase`  ${dim(plainText(toolsMessages.now().phrase))}     ${after?.phrase ?? printable(change.after ?? "")}`,
  ];
  if (change.hidden !== null) {
    lines.push(phrase`  ${markPart("needsYou")} ${hiddenMessage(change.hidden).phrase}`);
  }
  return lines;
}

/** A change's path in Studio's plain words, from the label both of them share. */
function changeLabel(path: string): Phrase {
  const label = listedToolChangeLabel(path);
  switch (label.kind) {
    case "name":
      return toolsMessages.changedName().phrase;
    case "description":
      return toolsMessages.changedDescription().phrase;
    case "required":
      return toolsMessages.changedRequired().phrase;
    case "argument":
      return toolsMessages.changedArgument(printable(label.argument), printable(label.field))
        .phrase;
    case "other":
      return toolsMessages.changedOther(printable(label.path)).phrase;
  }
}

function hiddenMessage(hidden: HiddenChange): Message {
  switch (hidden) {
    case "lookalike":
      return toolsMessages.hiddenLookalike();
    case "format":
      return toolsMessages.hiddenFormat();
    case "normalization":
      return toolsMessages.hiddenNormalization();
    case "whitespace":
      return toolsMessages.hiddenWhitespace();
  }
}

/** The description, one line per line it was written in, each escaped. */
function descriptionLines(description: string): Phrase[] {
  return description
    .split(/\r?\n/u)
    .filter((line) => line.trim() !== "")
    .map((line) => phrase`${printable(line)}`);
}

/**
 * `Arguments  id (string): the note's id`, one argument per line, lined up
 * under the first. Nothing when the tool takes no arguments.
 */
function argumentLines(parameters: Readonly<Record<string, unknown>>): Phrase[] {
  const properties = parameters["properties"];
  if (typeof properties !== "object" || properties === null || Array.isArray(properties)) {
    return [];
  }
  const label = plainText(toolsMessages.arguments().phrase);
  const under = " ".repeat(label.length);
  return Object.entries(properties).map(([name, schema], index) => {
    const lead = index === 0 ? label : under;
    return phrase`${lead}  ${argumentText(name, schema)}`;
  });
}

/** `id (string): the note's id`, leaving out the type or description it doesn't have. */
function argumentText(name: string, schema: unknown): string {
  const fields =
    typeof schema === "object" && schema !== null ? (schema as Record<string, unknown>) : {};
  const type = typeof fields["type"] === "string" ? ` (${fields["type"]})` : "";
  const description =
    typeof fields["description"] === "string" ? `: ${firstLine(fields["description"])}` : "";
  return printable(`${name}${type}${description}`);
}

function firstLine(text: string): string {
  return text.split(/\r?\n/u)[0] ?? "";
}

function indented(line: Phrase): Phrase {
  return phrase`  ${line}`;
}
