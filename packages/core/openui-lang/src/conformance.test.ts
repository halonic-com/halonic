import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { OpenUiFeature } from "./parse.ts";
import { type OpenUiReadResult, OpenUiStream, readOpenUi } from "./reader.ts";
import { mergeOpenUiEdit } from "./statements.ts";
import { type Expected, type SpecCase, specCases, specLibrary } from "./test/spec-fixtures.spec.ts";

const library = specLibrary();
const cases = specCases();

/** The cases that use a part of OpenUI Lang the reader leaves out, with the part it names first. */
const NOT_SUPPORTED: Readonly<Record<string, OpenUiFeature>> = {
  "actions/001-several-actions": "state",
  "actions/002-one-action": "state",
  "actions/004-event-form-state-per-action": "state",
  "actions/006-query-rerun-on-state": "state",
  "actions/007-mutation-run": "state",
  "actions/008-tool-not-found-stops-plan": "state",
  "actions/009-custom-action": "function",
  "actions/010-one-action-by-reference": "state",
  "actions/011-action-list-is-data": "state",
  "editing/002-delete-and-gc": "state",
  "entry/005-first-is-state-declaration": "state",
  "entry/006-ternary-root-multiline": "state",
  "errors/002-unknown-function-null": "function",
  "errors/010-inline-reserved-array": "query",
  "errors/014-function-literal-args": "function",
  "evaluation/001-kind-classify": "query",
  "evaluation/005-op-coerce-values": "expression",
  "evaluation/006-member-pluck-and-null": "expression",
  "evaluation/008-builtin-sort-locale": "function",
  "evaluation/010-function-registered": "function",
  "evaluation/011-function-null-required-arg": "state",
  "evaluation/012-kind-query-dollar-name": "state",
  "grammar/006-lex-minus-and-skip": "expression",
  "grammar/008-expr-precedence-and-keys": "expression",
  "grammar/009-member-digits-field": "expression",
  "state/001-store-auto-declare": "state",
  "state/002-binding-two-way": "state",
  "streaming/001-worked-example": "function",
  "streaming/003-multiline-ternary-across-chunks": "state",
};

/** The validation rules case holds no program: form rules belong to the form component. */
const programCases = cases.filter((specCase) => specCase.expected !== undefined);

function programText(specCase: SpecCase): string {
  return specCase.patch === undefined
    ? specCase.text
    : mergeOpenUiEdit(specCase.text, specCase.patch);
}

function streamed(chunks: readonly string[]): OpenUiReadResult {
  const stream = new OpenUiStream(library);
  for (const chunk of chunks) stream.push(chunk);
  return stream.end();
}

/** The result as the fixtures write it: classes become their plain fields. */
function plain(result: OpenUiReadResult): unknown {
  return JSON.parse(JSON.stringify(result));
}

/** Errors as `code@statement`; an expected error without a statement matches any. */
function errorKeys(errors: Expected["errors"], anyStatement: ReadonlySet<string>): string[] {
  return errors
    .map((error) =>
      anyStatement.has(error.code) ? error.code : `${error.code}@${error.statementId}`,
    )
    .sort();
}

function expectTree(result: OpenUiReadResult, text: string, expected: Expected): void {
  if (result.kind !== "tree") throw new Error(`expected a tree, got ${JSON.stringify(result)}`);
  expect(plain(result)).toMatchObject({ incomplete: expected.incomplete });
  expect((plain(result) as { root: unknown }).root).toEqual(expected.root);
  const anyStatement = new Set(
    expected.errors.filter((error) => !error.statementId).map((error) => error.code),
  );
  expect(errorKeys(result.errors, anyStatement)).toEqual(errorKeys(expected.errors, anyStatement));
  expect(result.unresolved).toEqual([...expected.unresolved].sort());
  expect(result.orphans).toEqual([...expected.orphans].sort());
  // A display reply has no state, so a case that expects some uses `$state` and isn't a display case.
  expect(expected.state ?? {}).toEqual({});
  for (const errorObject of expected.errorObjects ?? [])
    expect(result.errors).toContainEqual(errorObject);
  if (expected.statements) {
    expect(text.split("\n").flatMap((line) => /^(\$?\w+)\s*=/.exec(line)?.[1] ?? [])).toEqual(
      expected.statements,
    );
  }
}

verifies("openui-lang.reader", () => {
  describe("the OpenUI Lang 1.1 conformance fixtures", () => {
    it("are all here: 58 program cases and the validation rules case", () => {
      expect(programCases).toHaveLength(58);
      expect(
        cases.filter((specCase) => specCase.expected === undefined).map((specCase) => specCase.id),
      ).toEqual(["state/005-validation-rules"]);
    });

    it.each(programCases.map((specCase) => [specCase.id, specCase] as const))(
      "%s",
      (id, specCase) => {
        const text = programText(specCase);
        const result = specCase.chunks ? streamed(specCase.chunks) : readOpenUi(text, library);
        const feature = NOT_SUPPORTED[id];
        if (feature) expect(result).toEqual({ kind: "not-supported", feature });
        else expectTree(result, text, specCase.expected as Expected);
        expect(readOpenUi(text, library)).toEqual(result);
      },
    );

    it.each(programCases.map((specCase) => [specCase.id, programText(specCase)] as const))(
      "%s, split at every character, ends with the full text's result",
      (_id, text) => {
        const whole = readOpenUi(text, library);
        for (let cut = 0; cut <= text.length; cut++) {
          expect(streamed([text.slice(0, cut), text.slice(cut)])).toEqual(whole);
        }
      },
    );
  });
});
