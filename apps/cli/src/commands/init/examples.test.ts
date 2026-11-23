import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { examplesFolderFor } from "./examples.ts";

verifies("cli.commands.init.package-examples", () => {
  it("looks only in the package's own examples folder in the npm package", () => {
    const bundle = join("/", "project", "node_modules", "halonic", "dist", "cli");
    expect(examplesFolderFor(true, bundle)).toBe(
      join("/", "project", "node_modules", "halonic", "examples"),
    );
  });

  it("uses the repository's examples folder next to the sources", () => {
    const sources = join("/", "repo", "apps", "cli", "src", "commands", "init");
    expect(examplesFolderFor(false, sources)).toBe(join("/", "repo", "examples"));
  });
});
