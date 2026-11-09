import { describe, expect, test } from "vitest";
import type { DependencyList } from "./config-files.ts";
import { componentName, findSbomProblems, renderNotices, withProduct } from "./sbom.ts";

const list = {
  dependencies: { yaml: { category: "core-exception" } },
} as unknown as DependencyList;
const own = new Set(["@halonicjs/std"]);

describe("findSbomProblems", () => {
  test("accepts listed libraries and our own packages", () => {
    const sbom = {
      components: [
        {
          name: "std",
          group: "@halonicjs",
          version: "0.0.0",
          purl: "pkg:npm/%40halonicjs/std@0.0.0",
        },
        { name: "yaml", version: "2.9.1", purl: "pkg:npm/yaml@2.9.1" },
      ],
    };
    expect(findSbomProblems(sbom, list, own)).toEqual([]);
  });

  test("names a library that is not on the list, once", () => {
    const sbom = {
      components: [
        { name: "left-pad", version: "1.3.0", purl: "pkg:npm/left-pad@1.3.0" },
        { name: "left-pad", version: "1.3.0", purl: "pkg:npm/left-pad@1.3.0" },
      ],
    };
    expect(findSbomProblems(sbom, list, own)).toEqual([
      "left-pad@1.3.0 is in the SBOM but not in tooling/check/dependencies.json",
    ]);
  });

  test("reports a component that is not an npm package", () => {
    const sbom = { components: [{ name: "libfoo", version: "1", purl: "pkg:cargo/libfoo@1" }] };
    expect(findSbomProblems(sbom, list, own)).toHaveLength(1);
  });

  test("an empty SBOM has no problems", () => {
    expect(findSbomProblems({}, list, own)).toEqual([]);
  });
});

describe("componentName", () => {
  test("joins scope and name", () => {
    expect(componentName({ name: "std", group: "@halonicjs" })).toBe("@halonicjs/std");
    expect(componentName({ name: "yaml" })).toBe("yaml");
  });
});

describe("renderNotices", () => {
  test("sorts packages and says when a licence file is missing", () => {
    const text = renderNotices("Halonic", [
      { name: "zod", versions: ["4.0.0"], licence: "MIT", text: "MIT text\n" },
      { name: "yaml", versions: ["2.9.1"], licence: "ISC", author: "Eemeli Aro" },
    ]);
    expect(text.indexOf("yaml 2.9.1")).toBeLessThan(text.indexOf("zod 4.0.0"));
    expect(text).toContain("Author: Eemeli Aro");
    expect(text).toContain("ships no licence file");
    expect(text).toContain("MIT text");
  });
});

describe("withProduct", () => {
  test("replaces the root package with the named product and keeps the rest", () => {
    const sbom = {
      metadata: { timestamp: "2026-01-01", component: { name: "root", version: "0.0.0" } },
      components: [{ name: "yaml", version: "2.9.1" }],
    };
    const named = withProduct(sbom, "halonic-cli", "0.0.0-test.1");
    expect(named.metadata?.component).toMatchObject({
      type: "application",
      name: "halonic-cli",
      version: "0.0.0-test.1",
    });
    expect(named.metadata?.["timestamp"]).toBe("2026-01-01");
    expect(named.components).toEqual(sbom.components);
  });

  test("points the dependency graph at the renamed product", () => {
    const sbom = {
      metadata: {
        component: { name: "root", version: "0.0.0", "bom-ref": "@halonicjs/root@0.0.0" },
      },
      dependencies: [
        { ref: "@halonicjs/root@0.0.0", dependsOn: ["yaml@2.9.1"] },
        { ref: "yaml@2.9.1", dependsOn: [] },
      ],
    };
    const named = withProduct(sbom, "halonic-cli", "1.0.0");
    expect(named.dependencies).toEqual([
      { ref: "halonic-cli@1.0.0", dependsOn: ["yaml@2.9.1"] },
      { ref: "yaml@2.9.1", dependsOn: [] },
    ]);
  });

  test("adds the product when the SBOM has no metadata", () => {
    expect(withProduct({}, "halonic-cli", "1.0.0").metadata?.component?.name).toBe("halonic-cli");
  });
});
