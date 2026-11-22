import { stripTypeScriptTypes } from "node:module";
import { parseAstAsync } from "vitest/node";

/** The part of an ESTree node this file reads: its type and where it sits in the text. */
interface SyntaxNode {
  readonly type: string;
  readonly start: number;
  readonly end: number;
}

/** Turns JSX into code of the same length, one UTF-16 unit per character, as the parser counts. */
class SameOffsetText {
  readonly #original: string;
  readonly #units: string[];

  constructor(original: string) {
    this.#original = original;
    this.#units = original.split("");
  }

  /**
   * Writes a JSX element or fragment as an array literal, with the code of
   * each `{…}` inside it kept where it is as one of the array's entries. A
   * child of another element starts with a comma, which separates it from
   * the entry before it; the first child leaves a hole, which is valid.
   */
  #element(node: SyntaxNode, isChild: boolean): void {
    this.#blank(node.start, node.end);
    if (isChild) {
      this.#units[node.start] = ",";
      this.#units[node.start + 1] = "[";
    } else {
      this.#units[node.start] = "[";
    }
    this.#units[node.end - 1] = "]";
    for (const child of childNodes(node)) {
      this.#insideElement(child);
    }
  }

  /** Finds the JSX in plain code, which is left as it is. */
  code(node: SyntaxNode): void {
    if (node.type === "JSXElement" || node.type === "JSXFragment") {
      this.#element(node, false);
      return;
    }
    for (const child of childNodes(node)) {
      this.code(child);
    }
  }

  toString(): string {
    return this.#units.join("");
  }

  #insideElement(node: SyntaxNode): void {
    if (node.type === "JSXElement" || node.type === "JSXFragment") {
      this.#element(node, true);
      return;
    }
    // `{expression}`, `{...spread}` as an attribute or a child: the braces become `,` and ` `.
    if (
      node.type === "JSXExpressionContainer" ||
      node.type === "JSXSpreadAttribute" ||
      node.type === "JSXSpreadChild"
    ) {
      this.#restore(node.start + 1, node.end - 1);
      this.#units[node.start] = ",";
      for (const child of childNodes(node)) {
        this.code(child);
      }
      return;
    }
    for (const child of childNodes(node)) {
      this.#insideElement(child);
    }
  }

  /** Spaces out a range, keeping its line breaks so every line keeps its number. */
  #blank(start: number, end: number): void {
    for (let index = start; index < end; index += 1) {
      const unit = this.#units[index];
      if (unit !== "\n" && unit !== "\r") {
        this.#units[index] = " ";
      }
    }
  }

  #restore(start: number, end: number): void {
    for (let index = start; index < end; index += 1) {
      this.#units[index] = this.#original[index] ?? " ";
    }
  }
}

function isSyntaxNode(value: unknown): value is SyntaxNode {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { type?: unknown }).type === "string" &&
    typeof (value as { start?: unknown }).start === "number"
  );
}

/** The nodes right below a node, in any of its fields. */
function childNodes(node: SyntaxNode): SyntaxNode[] {
  return Object.values(node).flatMap((value: unknown) => {
    const values: unknown[] = Array.isArray(value) ? value : [value];
    return values.filter(isSyntaxNode);
  });
}

/**
 * Turns a `.tsx` or `.jsx` source into JavaScript with every character
 * where it was, so coverage counted in offsets into the source (as the
 * workerd runs leave it) still points at the same code. Vitest does the same
 * for a `.ts` file with Node's type stripping, which can't read JSX: each JSX
 * element becomes an array literal holding the code of its `{…}` parts, and
 * Node then strips the types.
 *
 * @param source - the file's text
 * @param language - how to parse it, from the file's extension
 * @returns JavaScript of the same length, with the same line breaks
 * @throws when the source doesn't parse, or has TypeScript that Node can't strip (an `enum`)
 */
export async function sameOffsetJavaScript(
  source: string,
  language: "jsx" | "tsx",
): Promise<string> {
  const ast: unknown = await parseAstAsync(source, { lang: language });
  const text = new SameOffsetText(source);
  if (isSyntaxNode(ast)) {
    text.code(ast);
  }
  const withoutJsx = text.toString();
  return language === "tsx" ? stripTypeScriptTypes(withoutJsx, { mode: "strip" }) : withoutJsx;
}
