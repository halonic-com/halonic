import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { runChecks } from "./fixture-repo.ts";

/** The native-disabled errors for these files, as "file:line". */
function problems(files: Record<string, string>): string[] {
  return runChecks([], { rules: ["native-disabled"], extraFiles: files }).map(
    (problem) => `${problem.file}:${problem.line}`,
  );
}

const feature = "packages/studio/features/agents/src/save.tsx";

verifies("check.native-disabled", () => {
  test("fails on a native disabled button in a feature, with its line", () => {
    const text = "export const Save = () => (\n  <button disabled>Save</button>\n);\n";
    expect(problems({ [feature]: text })).toEqual([`${feature}:2`]);
  });

  test("fails on a self-closing button with a disabled value in a .jsx file", () => {
    const file = "packages/studio/shell/src/bar.jsx";
    const text = "export const Bar = ({ busy }) => <button type='button' disabled={busy} />;\n";
    expect(problems({ [file]: text })).toEqual([`${file}:1`]);
  });

  test("tells the author to use unavailable={{ reason }}", () => {
    const [problem] = runChecks([], {
      rules: ["native-disabled"],
      extraFiles: { [feature]: "export const A = () => <button disabled />;\n" },
    });
    expect(problem?.message).toContain("unavailable={{ reason }}");
  });

  test("allows a native disabled button inside the kit and in tests", () => {
    const text = "export const A = () => <button disabled />;\n";
    expect(
      problems({
        "packages/studio/kit/src/button/button.tsx": text,
        "packages/studio/features/agents/src/save.test.tsx": text,
      }),
    ).toEqual([]);
  });

  test("allows aria-disabled, disabled on other elements and the kit's Button", () => {
    const text = [
      'import { Button } from "@halonicjs/studio-kit";',
      "export const A = () => (",
      "  <>",
      '    <button aria-disabled="true">Run now</button>',
      "    <input disabled />",
      "    <option disabled>Taken</option>",
      '    <Button unavailable={{ reason: "why" }}>Save</Button>',
      "  </>",
      ");",
      "",
    ].join("\n");
    expect(problems({ [feature]: text })).toEqual([]);
  });

  test("ignores the word disabled in plain TypeScript and in text", () => {
    const files = {
      "packages/studio/shell/src/state.ts": "export const note = '<button disabled>';\n",
      [feature]: "export const A = () => <p>The button is disabled</p>;\n",
    };
    expect(problems(files)).toEqual([]);
  });
});
