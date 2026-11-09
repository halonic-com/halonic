import { describe, expect, it } from "vitest";
import { type FixturePackage, runChecks, std } from "./fixture-repo.ts";

const example = 'import { x } from "../src/index.ts";\n\nexport const y = x;\n';
const copy = 'import { x } from "@halonicjs/std";\n\nexport const y = x;';

const readmeWith = (block: string): string =>
  `# std\n\n## Example\n\nThe code lives in [\`examples/y.ts\`](examples/y.ts), where it is tested.\n\n\`\`\`ts\n${block}\n\`\`\`\n`;

function withFiles(files: Record<string, string>): FixturePackage {
  return { ...std, files: { "src/index.ts": "export const x = 1;\n", ...files } };
}

function messages(pkg: FixturePackage): string[] {
  return runChecks([pkg], { coreOrder: ["@halonicjs/std"], rules: ["readme-examples"] }).map(
    (problem) => problem.message,
  );
}

describe("tooling/check: readme-examples", () => {
  it("passes a README block that matches, with the import by name", () => {
    expect(
      messages(withFiles({ "examples/y.ts": example, "README.md": readmeWith(copy) })),
    ).toEqual([]);
  });

  it("ignores a trailing newline", () => {
    expect(
      messages(
        withFiles({ "examples/y.ts": example.trimEnd(), "README.md": readmeWith(`${copy}\n`) }),
      ),
    ).toEqual([]);
  });

  it("flags a stale copy and names the package, the README and the file", () => {
    const stale = copy.replace("y = x", "y = x + 1");
    const [message, ...rest] = messages(
      withFiles({ "examples/y.ts": example, "README.md": readmeWith(stale) }),
    );
    expect(rest).toEqual([]);
    expect(message).toContain("@halonicjs/std");
    expect(message).toContain(
      "packages/core/std/README.md differs from packages/core/std/examples/y.ts",
    );
  });

  it("flags a README that still imports the example's own path", () => {
    expect(
      messages(withFiles({ "examples/y.ts": example, "README.md": readmeWith(example) })),
    ).toHaveLength(1);
  });

  it("flags an example file with no README block and says how to fix it", () => {
    const [message, ...rest] = messages(
      withFiles({ "examples/y.ts": example, "README.md": "# std\n\nNo example here.\n" }),
    );
    expect(rest).toEqual([]);
    expect(message).toContain(
      "@halonicjs/std: examples/y.ts has no block in packages/core/std/README.md",
    );
    expect(message).toContain(
      "Add a ```ts block with the contents of packages/core/std/examples/y.ts",
    );
  });

  it("flags a link that no code block follows", () => {
    expect(
      messages(
        withFiles({
          "examples/y.ts": example,
          "README.md": "See [`examples/y.ts`](examples/y.ts).\n",
        }),
      ),
    ).toEqual([expect.stringContaining("has no ```ts block after the link")]);
  });

  it("flags an example in a package with no README", () => {
    expect(messages(withFiles({ "examples/y.ts": example }))).toEqual([
      expect.stringContaining("has examples/y.ts but no README.md"),
    ]);
  });

  it("checks each example against its own block", () => {
    const other = "export const z = 2;\n";
    const readme = `${readmeWith(copy)}\nAnd [\`examples/z.ts\`](examples/z.ts):\n\n\`\`\`ts\nexport const z = 3;\n\`\`\`\n`;
    expect(
      messages(
        withFiles({ "examples/y.ts": example, "examples/z.ts": other, "README.md": readme }),
      ),
    ).toEqual([expect.stringContaining("differs from packages/core/std/examples/z.ts")]);
  });

  it("passes a package with no examples folder", () => {
    expect(messages(withFiles({ "README.md": "# std\n" }))).toEqual([]);
  });
});
