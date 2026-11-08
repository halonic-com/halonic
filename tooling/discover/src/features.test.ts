import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { loadContext } from "@halonicjs/tooling-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  featureExportName,
  fixFeatureList,
  generatedFeaturesFile,
  renderFeaturesFile,
  writeFeaturesFile,
} from "./features.ts";

const realRoot = join(import.meta.dirname, "..", "..", "..");

describe("featureExportName", () => {
  it("turns a folder name into the feature's export name", () => {
    expect(featureExportName("agents")).toBe("agentsFeature");
    expect(featureExportName("source-control")).toBe("sourceControlFeature");
  });
});

describe("renderFeaturesFile", () => {
  it("imports every feature and lists them in order", () => {
    const text = renderFeaturesFile([
      "@halonicjs/studio-feature-agents",
      "@halonicjs/studio-feature-source-control",
    ]);
    expect(text).toContain('import { agentsFeature } from "@halonicjs/studio-feature-agents";');
    expect(text).toContain("= [agentsFeature, sourceControlFeature];");
  });

  it("produces a typed empty list when there are no features", () => {
    expect(renderFeaturesFile([])).toContain("readonly GeneratedFeature[] = [];");
  });
});

describe("fixFeatureList and writeFeaturesFile", () => {
  let root: string;
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  const addFeature = (name: string): void => {
    write(
      `packages/studio/features/${name}/package.json`,
      JSON.stringify({ name: `@halonicjs/studio-feature-${name}` }),
    );
  };
  const writeApp = (dependencies: Record<string, string>): void => {
    write(
      "apps/studio/package.json",
      `${JSON.stringify({ name: "@halonicjs/app-studio", dependencies }, null, 2)}\n`,
    );
  };
  const appDependencies = (): Record<string, string> =>
    JSON.parse(readFileSync(join(root, "apps/studio/package.json"), "utf8")).dependencies;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "halonic-discover-"));
    for (const file of [
      "pnpm-workspace.yaml",
      "tooling/check/policy.json",
      "tooling/check/dependencies.json",
    ]) {
      write(file, readFileSync(join(realRoot, file), "utf8"));
    }
    write("package.json", JSON.stringify({ name: "@halonicjs/root" }));
    execFileSync("git", ["init", "-q"], { cwd: root });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("adds missing features and removes stale ones, keeping other dependencies", () => {
    addFeature("inbox");
    addFeature("agents");
    writeApp({
      "@halonicjs/studio-feature-gone": "workspace:*",
      "@halonicjs/studio-feature-inbox": "^1.0.0",
      "@halonicjs/std": "workspace:*",
    });
    expect(fixFeatureList(loadContext(root))).toBe(true);
    expect(Object.entries(appDependencies())).toEqual([
      ["@halonicjs/std", "workspace:*"],
      ["@halonicjs/studio-feature-agents", "workspace:*"],
      ["@halonicjs/studio-feature-inbox", "workspace:*"],
    ]);
  });

  it("leaves a correct list alone", () => {
    addFeature("agents");
    writeApp({ "@halonicjs/studio-feature-agents": "workspace:*" });
    const before = readFileSync(join(root, "apps/studio/package.json"), "utf8");
    expect(fixFeatureList(loadContext(root))).toBe(false);
    expect(readFileSync(join(root, "apps/studio/package.json"), "utf8")).toBe(before);
  });

  it("does nothing without the Studio app", () => {
    addFeature("agents");
    expect(fixFeatureList(loadContext(root))).toBe(false);
    expect(writeFeaturesFile(loadContext(root))).toBe(false);
    expect(existsSync(join(root, "apps/studio"))).toBe(false);
  });

  it("writes the generated list once and again only when the features change", () => {
    addFeature("agents");
    writeApp({});
    expect(writeFeaturesFile(loadContext(root))).toBe(true);
    const path = join(root, generatedFeaturesFile);
    expect(readFileSync(path, "utf8")).toBe(
      renderFeaturesFile(["@halonicjs/studio-feature-agents"]),
    );
    expect(writeFeaturesFile(loadContext(root))).toBe(false);

    addFeature("inbox");
    expect(writeFeaturesFile(loadContext(root))).toBe(true);
    expect(readFileSync(path, "utf8")).toContain("= [agentsFeature, inboxFeature];");
  });
});
