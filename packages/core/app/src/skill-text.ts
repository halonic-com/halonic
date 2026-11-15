// A skill file's text, read into the parts the skill page edits and changed
// again without touching the rest (requirement `app.skill-text`). Nothing is
// read from disk or written: the caller keeps the text and saves it as one
// change.

import { err, ok, type Result } from "@halonicjs/std";
import { editYaml, readYaml } from "@halonicjs/yaml";

/** The header fields the skill page doesn't edit, each as the page shows it. */
export interface SkillHeaderField {
  readonly key: string;
  /** The value as one line: text as it is, anything else as JSON. */
  readonly value: string;
}

/** What the skill page shows of a `SKILL.md`. */
export interface SkillParts {
  readonly name: string;
  /** "When to use it": agents read it to decide when to use the skill. */
  readonly description: string;
  /** The Markdown after the header, trimmed. */
  readonly instructions: string;
  /** The other header fields, in the file's order; the page shows them read-only. */
  readonly otherHeader: readonly SkillHeaderField[];
}

/** A change to a skill; a part left out stays as it is. */
export interface SkillChange {
  readonly name?: string;
  readonly description?: string;
  readonly instructions?: string;
}

/**
 * Why a skill can't be read or changed. `name_missing` and `description_missing` mean the change
 * would empty the part, which the page refuses; `unreadable` means the file has no header or
 * its header isn't valid YAML, so only a person can fix it in the file.
 */
export type SkillTextError = "name_missing" | "description_missing" | "unreadable";

// The same pattern the loader uses to split the header from the body.
const frontMatterPattern = /^(---\r?\n)([\s\S]*?)(\r?\n---\r?\n?)([\s\S]*)$/;

interface Split {
  readonly opening: string;
  readonly header: string;
  readonly closing: string;
  readonly body: string;
}

function split(text: string): Split | undefined {
  const match = frontMatterPattern.exec(text);
  if (match === null) {
    return undefined;
  }
  const [, opening = "", header = "", closing = "", body = ""] = match;
  return { opening, header, closing, body };
}

function oneLine(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Reads the parts of a skill file.
 *
 * @example
 * readSkillText("---\nname: Refunds\ndescription: Use for refunds\nlicense: MIT\n---\nBe kind.\n");
 * // ok({ name: "Refunds", description: "Use for refunds", instructions: "Be kind.",
 * //      otherHeader: [{ key: "license", value: "MIT" }] })
 */
export function readSkillText(text: string): Result<SkillParts, SkillTextError> {
  const parts = split(text);
  const header = parts === undefined ? undefined : readYaml(parts.header);
  if (parts === undefined || header === undefined || !header.ok) {
    return err("unreadable");
  }
  const data = header.value.data;
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return err("unreadable");
  }
  const fields = Object.entries(data);
  return ok({
    name: textOf(fields.find(([key]) => key === "name")?.[1]),
    description: textOf(fields.find(([key]) => key === "description")?.[1]),
    instructions: parts.body.trim(),
    otherHeader: fields
      .filter(([key]) => key !== "name" && key !== "description")
      .map(([key, value]) => ({ key, value: oneLine(value) })),
  });
}

/**
 * The skill's text with the change made. Every other header field keeps its value, its order and
 * its comments, and the text is returned as it was when the change changes nothing, so a field
 * that was left unedited writes nothing. A name or description that is empty after trimming is
 * refused rather than written.
 *
 * @example
 * editSkillText("---\nname: Refunds\ndescription: Old\n---\nBe kind.\n", { description: "New" });
 * // ok("---\nname: Refunds\ndescription: New\n---\nBe kind.\n")
 */
export function editSkillText(text: string, change: SkillChange): Result<string, SkillTextError> {
  const parts = split(text);
  const current = readSkillText(text);
  if (parts === undefined || !current.ok) {
    return err("unreadable");
  }
  const name = change.name?.trim();
  const description = change.description?.trim();
  if (name === "") {
    return err("name_missing");
  }
  if (description === "") {
    return err("description_missing");
  }
  const headerEdits = [
    ...(name !== undefined && name !== current.value.name
      ? [{ kind: "set" as const, path: ["name"], value: name }]
      : []),
    ...(description !== undefined && description !== current.value.description
      ? [{ kind: "set" as const, path: ["description"], value: description }]
      : []),
  ];
  const edited = editYaml(parts.header, headerEdits);
  if (!edited.ok) {
    return err("unreadable");
  }
  return ok(
    `${parts.opening}${edited.value.text.replace(/\r?\n$/, "")}${parts.closing}${bodyOf(parts.body, change.instructions)}`,
  );
}

/** The body after the header: as it was unless the instructions changed, then the new ones keep the leading blank lines. */
function bodyOf(body: string, instructions: string | undefined): string {
  if (instructions === undefined || instructions.trim() === body.trim()) {
    return body;
  }
  const leading = /^\s*/.exec(body)?.[0] ?? "";
  const trimmed = instructions.trim();
  return trimmed === "" ? "" : `${leading}${trimmed}\n`;
}
