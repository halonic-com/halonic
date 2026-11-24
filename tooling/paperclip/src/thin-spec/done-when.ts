/**
 * The "Done when" lint (HAL-17403, the no-AI half of the spec gate in
 * HAL-17395): a code task should end with a `Done when` line a reviewer can
 * check. Pure text, so the tests can read it.
 */

/** The spec template a flagged task is pointed to. */
export const specTemplateLink = "/HAL/issues/HAL-17395#document-spec-template";

/** A `Done when` line, plain or in Markdown (`**Done when:**`, `## Done when`), and what follows it on that line. */
const doneWhenLine = /^[\s#>*_-]*done when\b[*_ \t]*[:.\-–]?[*_ \t]*(.*)$/im;

/** A test file: a path such as `export.test.ts` or `flow.spec.tsx`. */
const testPath = /[\w./-]+\.(?:test|spec)\.[a-z]+\b/i;

/** The word test next to the test's name in quotes or backticks: `test "exports twice"`, `the "exports twice" test`. */
const namedTest = /\btests?\s+["'`“‘][^"'`”’\n]+|["'`”’]\s*tests?\b/i;

/** A command in backticks, such as `pnpm test`. */
const backtickedCommand = /`[^`\n]+`/;

/** A result someone can see: the user sees, the screen shows, the CLI prints or exits. */
const visibleResult = /\b(?:sees?|shows?|prints?|exits?)\b/i;

/**
 * What the task says it is done when: the rest of the `Done when` line, or,
 * under a heading, the lines up to the next blank line. Undefined without one.
 */
export function doneWhenText(description: string): string | undefined {
  const match = doneWhenLine.exec(description);
  if (match === null) {
    return undefined;
  }
  const rest = (match[1] ?? "").trim();
  if (rest !== "") {
    return rest;
  }
  const after = description.slice(match.index + match[0].length).replace(/^\s*\n/, "");
  return after.split(/\n\s*\n/)[0]?.trim() ?? "";
}

/** Whether a `Done when` text names something checkable: a test, a command or a visible result. */
export function checkableDoneWhen(text: string): boolean {
  return [testPath, namedTest, backtickedCommand, visibleResult].some((rule) => rule.test(text));
}

/** Whether a task's description lacks a checkable `Done when` line. */
export function doneWhenMissing(description: string | null | undefined): boolean {
  const text = doneWhenText(description ?? "");
  return text === undefined || !checkableDoneWhen(text);
}

/** The one-sentence comment on a flagged task. */
export function doneWhenComment(): string {
  return `This task has no checkable **Done when** line (a test, a command in backticks, or what the user sees); please add one, following the [spec template](${specTemplateLink}).`;
}
