/** A 1-based line and column in a YAML text. */
export interface SourcePosition {
  readonly line: number;
  readonly col: number;
}

/**
 * Why a YAML text could not be read:
 * - `syntax`: the text is not valid YAML.
 * - `unsupported`: valid YAML that workspace files may not use (anchors,
 *   aliases, tags, several documents, lists or maps as keys).
 * - `too-deep`: lists and maps nest deeper than the limit.
 * - `too-large`: the text is longer than the limit.
 */
export type YamlProblemKind = "syntax" | "unsupported" | "too-deep" | "too-large";

/** A YAML text that could not be read, and where the reason sits in it. */
export interface YamlProblem extends SourcePosition {
  readonly kind: YamlProblemKind;
  /** One line that says what is wrong, without the position. */
  readonly message: string;
}
