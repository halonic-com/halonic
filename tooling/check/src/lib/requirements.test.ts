import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import {
  expectedRequirementId,
  isRequirementFile,
  type ParsedRequirement,
  parseRequirementFile,
} from "./requirements.ts";

const file = "packages/core/workflow/requirements/timer-fires.md";
const id = "workflow.timer-fires";

const valid = `# workflow.timer-fires

- Status: active
- Since: 0.1.0
- Source: HAL-42 (Elena's inventory U5)

When the delay of a timer has passed,
the engine shall fire the timer once.

## Examples

- Given a timer of 5 minutes,
  when 5 minutes pass,
  then the timer fires once.
- Given a timer of 0 minutes, then it fires at once.
`;

function messagesFor(text: string): string[] {
  const parsed: ParsedRequirement = parseRequirementFile(file, text, id);
  return parsed.ok ? [] : parsed.problems.map((problem) => `${problem.line}: ${problem.message}`);
}

verifies("check.requirement-id-from-path", () => {
  test.each([
    [
      "packages/core/workflow/requirements/timer-fires.md",
      "packages/core/workflow",
      "workflow.timer-fires",
    ],
    [
      "packages/studio/features/agents/src/explorer/requirements/filter-by-hub.md",
      "packages/studio/features/agents",
      "agents.explorer.filter-by-hub",
    ],
    [
      "apps/cli/src/commands/validate/requirements/exit-code-on-error.md",
      "apps/cli",
      "cli.commands.validate.exit-code-on-error",
    ],
    ["tooling/check/requirements/trace.md", "tooling/check", "check.trace"],
  ])("%s gives the ID of its path", (path, packageDirectory, expected) => {
    expect(expectedRequirementId(path, packageDirectory)).toBe(expected);
  });

  test("only Markdown files directly in a requirements/ folder are requirement files", () => {
    expect(isRequirementFile("packages/core/workflow/requirements/a.md")).toBe(true);
    expect(isRequirementFile("packages/core/workflow/requirements/old/a.md")).toBe(false);
    expect(isRequirementFile("packages/core/workflow/requirements/a.ts")).toBe(false);
    expect(isRequirementFile("packages/core/workflow/README.md")).toBe(false);
  });
});

verifies("check.requirement-file-format", () => {
  test("reads every part of a well-formed file", () => {
    const parsed = parseRequirementFile(file, valid, id);
    expect(parsed).toEqual({
      ok: true,
      requirement: {
        id,
        file,
        status: "active",
        since: "0.1.0",
        source: "HAL-42 (Elena's inventory U5)",
        statement: "When the delay of a timer has passed, the engine shall fire the timer once.",
        examples: [
          "Given a timer of 5 minutes, when 5 minutes pass, then the timer fires once.",
          "Given a timer of 0 minutes, then it fires at once.",
        ],
      },
    });
  });

  test("accepts Windows line endings", () => {
    expect(messagesFor(valid.replaceAll("\n", "\r\n"))).toEqual([]);
  });

  test.each([
    [
      "no heading",
      valid.replace("# workflow.timer-fires\n", "\n"),
      '1: The first line must be "# workflow.timer-fires".',
    ],
    [
      "an ID that doesn't match the path",
      valid.replace("# workflow.timer-fires", "# workflow.timer"),
      '1: The ID "workflow.timer" doesn\'t match the file\'s path, which gives "workflow.timer-fires".',
    ],
    [
      "an unknown status",
      valid.replace("Status: active", "Status: done"),
      '3: Status "done" is not one of draft, active, retired.',
    ],
    [
      "a status twice",
      valid.replace("- Since", "- Status: draft\n- Since"),
      '4: "Status" appears twice.',
    ],
    [
      "a missing Source",
      valid.replace("- Source: HAL-42 (Elena's inventory U5)\n", ""),
      '1: The "- Source: …" line is missing.',
    ],
    [
      "an empty Source",
      valid.replace("Source: HAL-42 (Elena's inventory U5)", "Source:"),
      '5: "Source" is empty.',
    ],
    [
      "a Since that isn't a version",
      valid.replace("0.1.0", "soon"),
      '4: Since "soon" is not a version such as 0.1.0.',
    ],
    [
      "an unknown field",
      valid.replace("- Since", "- Owner: julian\n- Since"),
      '4: Unknown field "Owner". Use Status, Since, Source.',
    ],
  ])("rejects %s", (_case, text, message) => {
    expect(messagesFor(text)).toContain(message);
  });

  test("rejects a sentence that isn't in EARS form", () => {
    const noShape = valid.replace("When the delay", "Once the delay");
    expect(messagesFor(noShape).join("\n")).toMatch(/^7: The sentence must have an EARS shape/m);
    const noShall = valid.replace("shall fire", "fires");
    expect(messagesFor(noShall).join("\n")).toMatch(
      /^7: The sentence must say what the system "shall" do/m,
    );
    const ifWithoutThen = valid.replace(
      "When the delay of a timer has passed,",
      "If the timer is cancelled,",
    );
    expect(messagesFor(ifWithoutThen).join("\n")).toMatch(/An "If" requirement reads/);
  });

  test("rejects a file without a sentence", () => {
    const text = valid.replace(
      "When the delay of a timer has passed,\nthe engine shall fire the timer once.\n",
      "",
    );
    expect(messagesFor(text).join("\n")).toMatch(/The requirement sentence \(EARS\) is missing/);
  });

  test("rejects missing or malformed examples", () => {
    const noSection = valid.slice(0, valid.indexOf("## Examples"));
    expect(messagesFor(noSection).join("\n")).toMatch(/Add a "## Examples" section/);
    const empty = valid.slice(0, valid.indexOf("- Given a timer of 5"));
    expect(messagesFor(empty).join("\n")).toMatch(/^10: The "## Examples" section has no/m);
    const noGiven = valid.replace("- Given a timer of 0 minutes", "- A timer of 0 minutes");
    expect(messagesFor(noGiven)).toContain('15: Each example starts with "Given".');
    const noThen = valid.replace("then it fires at once", "it fires at once");
    expect(messagesFor(noThen)).toContain(
      '15: Each example says what happens: "Given …, (when …,) then …".',
    );
  });
});
