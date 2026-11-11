import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadContext } from "../lib/context.ts";
import { rules } from "../rules/all.ts";
import {
  type FixturePackage,
  manifestFor,
  removeFixtureRepo,
  writeFixtureRepo,
} from "./fixture-repo.ts";

const newDependency = {
  category: "dev-tooling",
  layers: ["tooling"],
  reason: "A change that approves its own dependency.",
  allowedIn: ["@halonicjs/tooling-x"],
};

const tool: FixturePackage = {
  directory: "tooling/x",
  manifest: manifestFor("@halonicjs/tooling-x", "tooling", {
    devDependencies: { "self-approved-library": "catalog:" },
  }),
};

describe("tooling/check: lists from the base commit", () => {
  it("fails a change that adds a dependency together with its allow-list entry", () => {
    const head = writeFixtureRepo([tool], {
      extraDependencies: { "self-approved-library": newDependency },
    });
    const base = writeFixtureRepo([]);
    try {
      const messages = (listsRoot?: string): string[] =>
        rules["dependencies"]?.(loadContext(head, listsRoot)).problems.map((p) => p.message) ?? [];
      // Against its own list the change passes the entry check.
      expect(
        messages().some((message) => message.includes("isn't in tooling/check/dependencies.json")),
      ).toBe(false);
      // Against the base's list it is an unapproved dependency.
      expect(
        messages(base).some((message) =>
          message.includes("isn't in tooling/check/dependencies.json"),
        ),
      ).toBe(true);
    } finally {
      removeFixtureRepo(head);
      removeFixtureRepo(base);
    }
  });

  it("fails when a list is missing in the base instead of reading the change's copy", () => {
    const head = writeFixtureRepo([tool]);
    const base = writeFixtureRepo([]);
    try {
      rmSync(join(base, "tooling/check/dependencies.json"));
      expect(() => loadContext(head, base)).toThrow(/dependencies\.json is missing/);
    } finally {
      removeFixtureRepo(head);
      removeFixtureRepo(base);
    }
  });

  it("reads deny.toml from the change, because the deny-toml rule checks it", () => {
    const head = writeFixtureRepo([tool]);
    const base = writeFixtureRepo([]);
    try {
      const file = "apps/studio/src-tauri/deny.toml";
      mkdirSync(join(head, "apps/studio/src-tauri"), { recursive: true });
      writeFileSync(join(head, file), "# the change's own copy\n");
      mkdirSync(join(base, "apps/studio/src-tauri"), { recursive: true });
      writeFileSync(join(base, file), "# the base's copy\n");
      expect(loadContext(head, base).read(file)).toBe("# the change's own copy\n");
    } finally {
      removeFixtureRepo(head);
      removeFixtureRepo(base);
    }
  });
});
