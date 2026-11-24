/**
 * Reads the display part of OpenUI Lang 1.1, whole or as a stream.
 *
 * A stream reads its whole buffer again on every chunk, closing what is still
 * open, so the result after the last chunk is the result of reading the full
 * text by construction (spec 4: streaming equals parsing).
 */

import { evaluateProgram, type OpenUiTree, type ParsedStatement } from "./evaluate.ts";
import { lex } from "./lexer.ts";
import type { OpenUiLibrary } from "./library.ts";
import { OPENUI_MAX_CHARS, OpenUiLimitError } from "./limits.ts";
import {
  NotSupportedError,
  type OpenUiFeature,
  ParseFailure,
  parseExpression,
  unsupportedFeature,
} from "./parse.ts";
import { prepareSource } from "./source.ts";
import { splitStatements } from "./statements.ts";

/** What reading a reply gives: a tree, or the reason it can't be drawn at all. */
export type OpenUiReadResult =
  | OpenUiTree
  /** The reply uses a part of OpenUI Lang the reader leaves out; no part of it is drawn. */
  | { readonly kind: "not-supported"; readonly feature: OpenUiFeature }
  /** The reply passed a size limit or a nesting limit (see `limits.ts`). */
  | { readonly kind: "too-large" }
  | { readonly kind: "too-deep" };

/** Reads a complete reply. */
export function readOpenUi(text: string, library: OpenUiLibrary): OpenUiReadResult {
  return read(text, library, true);
}

/** Reads a reply as it streams in: every chunk gives a result that can be drawn. */
export class OpenUiStream {
  private text = "";

  private readonly library: OpenUiLibrary;

  constructor(library: OpenUiLibrary) {
    this.library = library;
  }

  /** Adds a chunk and reads everything so far. */
  push(chunk: string): OpenUiReadResult {
    if (this.text.length <= OPENUI_MAX_CHARS) this.text += chunk;
    return read(this.text, this.library, false);
  }

  /** Ends the stream and gives the final result; a later chunk starts a new stream. */
  end(): OpenUiReadResult {
    const result = read(this.text, this.library, true);
    this.text = "";
    return result;
  }
}

function read(text: string, library: OpenUiLibrary, final: boolean): OpenUiReadResult {
  if (text.length > OPENUI_MAX_CHARS) return { kind: "too-large" };
  try {
    const source = prepareSource(text);
    const { statements, open } = splitStatements(source, lex(source));
    const parsed: ParsedStatement[] = [];
    for (const [index, statement] of statements.entries()) {
      const feature = unsupportedFeature(statement.name, statement.tokens);
      if (feature) return { kind: "not-supported", feature };
      const expression = parseOrDrop(statement.tokens);
      if (expression === undefined) continue;
      // While streaming, a statement that needed closing never replaces a complete one (spec 4, rule 3).
      const pending = !final && open && index === statements.length - 1;
      if (pending && parsed.some((earlier) => earlier.name === statement.name)) continue;
      parsed.push({ name: statement.name, expression });
    }
    return evaluateProgram({
      statements: parsed,
      library,
      final,
      incomplete: open,
      hasText: source !== "",
    });
  } catch (error) {
    if (error instanceof NotSupportedError)
      return { kind: "not-supported", feature: error.feature };
    if (error instanceof OpenUiLimitError) return { kind: error.limit };
    throw error;
  }
}

function parseOrDrop(tokens: Parameters<typeof parseExpression>[0]) {
  try {
    return parseExpression(tokens);
  } catch (error) {
    if (error instanceof ParseFailure) return undefined;
    throw error;
  }
}
