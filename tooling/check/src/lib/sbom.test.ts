import { describe, expect, test } from "vitest";
import type { DependencyList } from "./config-files.ts";
import {
  componentName,
  findSbomProblems,
  type NoticeEntry,
  type NoticeSection,
  renderNotices,
  withProduct,
} from "./sbom.ts";

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
      "left-pad@1.3.0 is in the SBOM but not in tooling/check/dependencies.json, and no listed package depends on it",
    ]);
  });

  test("accepts a package that a listed one depends on, at any depth", () => {
    const ref = (name: string): string => `pkg:npm/${name}@1.0.0`;
    const component = (name: string) => ({
      name,
      version: "1.0.0",
      purl: ref(name),
      "bom-ref": ref(name),
    });
    const sbom = {
      components: [
        component("yaml"),
        component("child"),
        component("grandchild"),
        component("stray"),
      ],
      dependencies: [
        { ref: ref("yaml"), dependsOn: [ref("child")] },
        { ref: ref("child"), dependsOn: [ref("grandchild")] },
        { ref: ref("stray"), dependsOn: [ref("yaml")] },
      ],
    };
    expect(findSbomProblems(sbom, list, own)).toEqual([
      "stray@1.0.0 is in the SBOM but not in tooling/check/dependencies.json, and no listed package depends on it",
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
  const npm = (entries: NoticeEntry[]): NoticeSection[] => [{ title: "npm packages", entries }];

  test("sorts packages and says when a licence file is missing", () => {
    const text = renderNotices(
      "Halonic",
      npm([
        { name: "zod", versions: ["4.0.0"], licence: "MIT", texts: ["MIT text\n"] },
        { name: "yaml", versions: ["2.9.1"], licence: "ISC", author: "Eemeli Aro", texts: [] },
      ]),
    );
    expect(text.indexOf("yaml 2.9.1")).toBeLessThan(text.indexOf("zod 4.0.0"));
    expect(text).toContain("Author: Eemeli Aro");
    expect(text).toContain("ships no licence file");
    expect(text).toContain("MIT text");
  });

  test("prints the sections in order, each sorted by name and version", () => {
    const text = renderNotices("Halonic", [
      {
        title: "npm packages",
        entries: [{ name: "zod", versions: ["4.0.0"], licence: "MIT", texts: [] }],
      },
      {
        title: "Rust crates",
        entries: [
          { name: "serde", versions: ["2.0.0"], licence: "MIT", texts: [] },
          { name: "Zeta", versions: ["1.0.0"], licence: "MIT", texts: [] },
          { name: "serde", versions: ["1.0.0"], licence: "MIT", texts: [] },
        ],
      },
    ]);
    const order = [
      "npm packages",
      "zod 4.0.0",
      "Rust crates",
      "Zeta 1.0.0",
      "serde 1.0.0",
      "serde 2.0.0",
    ];
    const at = order.map((label) => text.indexOf(`\n${label}\n`));
    expect(at.every((index) => index > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  test("prints a licence text once and points back to it, line endings and surrounding blank space aside", () => {
    const text = renderNotices("Halonic", [
      {
        title: "npm packages",
        entries: [
          { name: "zod", versions: ["4.0.0"], licence: "MIT", texts: ["MIT text\r\nline 2\n"] },
        ],
      },
      {
        title: "Rust crates",
        entries: [
          { name: "serde", versions: ["1.0.0"], licence: "MIT", texts: ["MIT text\nline 2\n"] },
          { name: "itoa", versions: ["1.0.0"], licence: "MIT", texts: ["MIT text\nline 2"] },
        ],
      },
    ]);
    expect(text.match(/MIT text/g)).toHaveLength(1);
    expect(text).toContain("serde 1.0.0\nLicence: MIT\n\nSame licence text as zod 4.0.0 above.");
    expect(text).toContain("itoa 1.0.0\nLicence: MIT\n\nSame licence text as zod 4.0.0 above.");
  });

  test("compares each licence file on its own", () => {
    const text = renderNotices(
      "Halonic",
      npm([
        {
          name: "a",
          versions: ["1.0.0"],
          licence: "MIT OR Apache-2.0",
          texts: ["Apache", "MIT by A"],
        },
        {
          name: "b",
          versions: ["1.0.0"],
          licence: "MIT OR Apache-2.0",
          texts: ["Apache", "MIT by B"],
        },
      ]),
    );
    expect(text).toContain(
      "Licence: MIT OR Apache-2.0\n\nSame licence text as a 1.0.0 above.\n\nMIT by B",
    );
    expect(text.match(/Apache\n/g)).toHaveLength(1);
  });

  test("comes out the same for the same entries in any order", () => {
    const entries: NoticeEntry[] = [
      { name: "b", versions: ["1.0.0"], licence: "MIT", texts: ["same"] },
      { name: "a", versions: ["1.0.0"], licence: "MIT", texts: ["same"] },
    ];
    expect(renderNotices("Halonic", npm(entries))).toBe(
      renderNotices("Halonic", npm([...entries].reverse())),
    );
    expect(renderNotices("Halonic", npm(entries))).toContain("Same licence text as a 1.0.0 above.");
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
