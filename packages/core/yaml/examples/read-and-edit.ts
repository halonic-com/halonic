import { editYaml, readYaml, writeYamlFile } from "../src/index.ts";

const text = `# Nightly billing check
name: Billing
steps:
  - id: check # runs first
    model: slow
`;

/** Reads a file, finds a node's line and column, edits it and writes the data back. */
export function runExample(): {
  position: { line: number; col: number } | undefined;
  problem: string | undefined;
  edited: string | undefined;
  layout: string | undefined;
  written: string;
} {
  const read = readYaml(text);
  if (!read.ok) throw new Error(read.error.message);
  const position = read.value.positionOf(["steps", 0, "id"]); // { line: 4, col: 9 }

  // A file we don't support says where, and what to do instead.
  const bad = readYaml("base: &base 1\n");
  const problem = bad.ok ? undefined : `${bad.error.kind} at ${bad.error.line}:${bad.error.col}`; // "unsupported at 1:13"

  // An edit keeps every comment and line it doesn't touch.
  const edited = editYaml(text, [{ kind: "set", path: ["steps", 0, "model"], value: "fast" }]);

  // writeYamlFile writes data only: comments are gone.
  const written = writeYamlFile(read.value.data);

  return {
    position,
    problem,
    edited: edited.ok ? edited.value.text : undefined,
    layout: edited.ok ? edited.value.layout : undefined, // "kept"
    written,
  };
}
