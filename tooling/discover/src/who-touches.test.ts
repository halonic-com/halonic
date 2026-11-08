import { describe, expect, test } from "vitest";
import { packageOfFile, resolvePackage, touchesByPackage } from "./who-touches.ts";

const packages = [
  { name: "@halonicjs/engine", directory: "packages/core/engine" },
  { name: "@halonicjs/engine-tools", directory: "packages/core/engine-tools" },
  { name: "@halonicjs/studio-feature-agents", directory: "packages/studio/features/agents" },
];

describe("packageOfFile", () => {
  test("maps a file to the package whose folder holds it, not a sibling with a longer name", () => {
    expect(packageOfFile("packages/core/engine/src/kernel.ts", packages)).toBe("@halonicjs/engine");
    expect(packageOfFile("packages/core/engine-tools/src/a.ts", packages)).toBe(
      "@halonicjs/engine-tools",
    );
  });

  test("files outside every package belong to the repo root", () => {
    expect(packageOfFile("turbo.json", packages)).toBe("(repo root)");
  });
});

describe("touchesByPackage", () => {
  test("lists each pull request once per package it changes", () => {
    const pullRequest = {
      number: 7,
      title: "feat(agents): filter by hub",
      headRefName: "elena/HAL-42-agent-filter",
      files: [
        { path: "packages/studio/features/agents/src/a.ts" },
        { path: "packages/studio/features/agents/src/b.ts" },
        { path: "pnpm-lock.yaml" },
      ],
    };
    const touches = touchesByPackage([pullRequest], packages);
    expect(touches.get("@halonicjs/studio-feature-agents")).toEqual([pullRequest]);
    expect(touches.get("(repo root)")).toEqual([pullRequest]);
    expect(touches.has("@halonicjs/engine")).toBe(false);
  });
});

describe("resolvePackage", () => {
  test("finds a package by name, folder or last part", () => {
    expect(resolvePackage("@halonicjs/engine", packages)?.directory).toBe("packages/core/engine");
    expect(resolvePackage("packages/core/engine/", packages)?.name).toBe("@halonicjs/engine");
    expect(resolvePackage("agents", packages)?.name).toBe("@halonicjs/studio-feature-agents");
    expect(resolvePackage("nothing", packages)).toBeUndefined();
  });
});
