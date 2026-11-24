/**
 * Prepares a reply's text for the lexer (spec 1.2): takes the program out of
 * markdown fences, strips comments and trims.
 */

const FENCE_LINE = /^[ \t]*```[ \t]*([\w.+-]*)(.*)$/;
const STATEMENT_START = /^\s*\$?[A-Za-z_]\w*\s*=(?!=)/;

interface Block {
  readonly tag: string;
  readonly lines: string[];
}

export function prepareSource(text: string): string {
  return stripComments(extractProgram(text.replaceAll("\r\n", "\n"))).trim();
}

/** True when the line has the shape `name = …`. */
export function startsStatement(line: string): boolean {
  return STATEMENT_START.test(line);
}

function extractProgram(text: string): string {
  if (!text.includes("```")) return text;
  const scan = new FenceScan();
  for (const line of text.split("\n")) scan.add(line);
  const program = scan.finish().filter((block) => block.tag !== "openui-js");
  if (program.some((block) => startsStatement(firstCodeLine(block.lines)))) {
    return program.map((block) => block.lines.join("\n")).join("\n");
  }
  return scan.outside.join("\n");
}

/** Sorts lines into fenced blocks and the text outside them. */
class FenceScan {
  readonly outside: string[] = [];
  private readonly blocks: Block[] = [];
  private open: Block | undefined;
  /** A double-quoted string runs on, so a fence line here is part of it. */
  private inString = false;

  add(line: string): void {
    const fence = this.inString ? undefined : readFenceLine(line);
    if (fence === undefined) this.addText(line);
    else if (this.open) this.close();
    else this.openBlock(fence);
  }

  finish(): readonly Block[] {
    this.close();
    return this.blocks;
  }

  private addText(line: string): void {
    const inBlock = this.open !== undefined;
    (this.open?.lines ?? this.outside).push(line);
    // Outside a block a quote only opens a string on a statement line, so prose can't.
    const counts = inBlock || this.inString || startsStatement(line);
    this.inString = counts && endsInsideString(line, this.inString);
  }

  private openBlock(fence: { tag: string; code: string }): void {
    this.open = { tag: fence.tag, lines: fence.code === "" ? [] : [fence.code] };
    this.inString = endsInsideString(fence.code, false);
  }

  private close(): void {
    if (this.open) this.blocks.push(this.open);
    this.open = undefined;
    this.inString = false;
  }
}

function readFenceLine(line: string): { tag: string; code: string } | undefined {
  const match = FENCE_LINE.exec(line);
  // Three backticks that close again on the same line are inline code.
  if (!match || match[2]?.includes("```")) return undefined;
  return { tag: match[1] ?? "", code: (match[2] ?? "").trim() };
}

function firstCodeLine(lines: readonly string[]): string {
  const isComment = (line: string) => /^\s*(\/\/|#)/.test(line) || line.trim() === "";
  return lines.find((line) => !isComment(line)) ?? "";
}

/** Whether a double-quoted string is still open at the end of the line. */
function endsInsideString(line: string, inString: boolean): boolean {
  let inside = inString;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (inside && char === "\\") index++;
    else if (char === '"') inside = !inside;
  }
  return inside;
}

/** Removes `//` and `#` comments that start outside strings (spec 1.2, step 2). */
function stripComments(text: string): string {
  let out = "";
  let index = 0;
  while (index < text.length) {
    const char = text[index] ?? "";
    if (char === '"' || char === "'") {
      const end = stringEnd(text, index);
      out += text.slice(index, end);
      index = end;
    } else if (char === "#" || text.startsWith("//", index)) {
      const lineEnd = text.indexOf("\n", index);
      index = lineEnd === -1 ? text.length : lineEnd;
    } else {
      out += char;
      index++;
    }
  }
  return out;
}

/** Where the string opening at `start` ends, or the end of the text. */
function stringEnd(text: string, start: number): number {
  const quote = text[start];
  for (let index = start + 1; index < text.length; index++) {
    if (text[index] === "\\") index++;
    else if (text[index] === quote) return index + 1;
  }
  return text.length;
}
