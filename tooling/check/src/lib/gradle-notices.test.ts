import { describe, expect, test } from "vitest";
import {
  type GradleArtifact,
  type GradlePolicy,
  type GradleRules,
  gradleNoticeEntries,
  gradlePolicyProblems,
} from "./gradle-notices.ts";

const apache = { name: "The Apache Software License, Version 2.0", url: null };
const sdk = "Android Software Development Kit License";

const policy: GradlePolicy = {
  names: { [apache.name]: "Apache-2.0", "The MIT License": "MIT", "GNU GPL v3": "GPL-3.0-only" },
  proprietary: [
    {
      artifact: "com.example.gms:acme-basement",
      terms: sdk,
      url: "https://example.com/terms",
      task: "HAL-1",
    },
  ],
};

const rules: GradleRules = {
  policy,
  allowed: new Set(["Apache-2.0", "MIT"]),
  text: (spdx) => (spdx === "Apache-2.0" ? "Apache License text" : undefined),
  file: (path) =>
    path === "texts/yuv.txt" ? "Copyright The Yuv Authors\nBSD-3 text\n" : undefined,
};

const yuv = { name: "BSD License", url: "https://example.com/yuv/README" };
const bundled = {
  artifact: "com.example:acme-camera",
  name: yuv.name,
  url: yuv.url,
  component: "yuv",
  licence: "MIT",
  text: "texts/yuv.txt",
  source: "https://example.com/yuv/LICENSE",
  task: "HAL-1",
};

function library(name: string, extra: Partial<GradleArtifact> = {}): GradleArtifact {
  return { group: "com.example", name, version: "1.0.0", licences: [apache], ...extra };
}

describe("gradleNoticeEntries", () => {
  test("accepts a vague POM licence name only for the library and URL a bundled entry names", () => {
    const withBundled = { ...rules, policy: { ...policy, bundled: [bundled] } };
    const found = gradleNoticeEntries(
      {
        artifacts: [
          library("acme-camera", { licences: [apache, yuv] }),
          library("acme-other", { licences: [apache, yuv] }),
          library("acme-camera", {
            group: "com.example",
            version: "2.0.0",
            licences: [apache, { ...yuv, url: "https://example.com/other" }],
          }),
        ],
      },
      withBundled,
    );
    expect(found.entries).toEqual([
      {
        name: "com.example:acme-camera",
        versions: ["1.0.0"],
        licence: "Apache-2.0 AND MIT",
        texts: [
          "Apache License text",
          "yuv, bundled in com.example:acme-camera, is under MIT:\n\nCopyright The Yuv Authors\nBSD-3 text",
        ],
      },
    ]);
    expect(found.problems).toEqual([
      `com.example:acme-other@1.0.0 is under "BSD License", which "gradle.names" in tooling/check/licences.json doesn't map to an SPDX ID`,
      `com.example:acme-camera@2.0.0 is under "BSD License", which "gradle.names" in tooling/check/licences.json doesn't map to an SPDX ID`,
    ]);
  });

  test("fails bundled code whose text is missing or whose licence isn't allowed", () => {
    const missing = { ...bundled, text: "texts/gone.txt" };
    const gpl = { ...bundled, artifact: "com.example:acme-gpl", licence: "GPL-3.0-only" };
    const found = gradleNoticeEntries(
      {
        artifacts: [
          library("acme-camera", { licences: [apache, yuv] }),
          library("acme-gpl", { licences: [yuv] }),
        ],
      },
      { ...rules, policy: { ...policy, bundled: [missing, gpl] } },
    );
    expect(found.entries).toEqual([]);
    expect(found.problems).toEqual([
      "com.example:acme-camera@1.0.0 bundles yuv, but texts/gone.txt is missing: add its licence text there",
      "com.example:acme-gpl@1.0.0 bundles yuv under GPL-3.0-only, which isn't allowed in shipped code",
    ]);
  });

  test("lists an open-source library with its SPDX ID, the stored text and its embedded notices", () => {
    const found = gradleNoticeEntries(
      { artifacts: [library("acme-core", { embedded: "  Guava: Apache-2.0\n" })] },
      rules,
    );
    expect(found.problems).toEqual([]);
    expect(found.entries).toEqual([
      {
        name: "com.example:acme-core",
        versions: ["1.0.0"],
        licence: "Apache-2.0",
        texts: ["Apache License text", "Guava: Apache-2.0"],
      },
    ]);
  });

  test("lists a named proprietary library with its terms, then its embedded notices verbatim", () => {
    const found = gradleNoticeEntries(
      {
        artifacts: [
          {
            group: "com.example.gms",
            name: "acme-basement",
            version: "18.1.0",
            licences: [{ name: sdk, url: "https://example.com/terms" }],
            embedded: "JSR 305: BSD-3-Clause",
          },
        ],
      },
      rules,
    );
    expect(found.problems).toEqual([]);
    expect(found.entries[0]).toEqual({
      name: "com.example.gms:acme-basement",
      versions: ["18.1.0"],
      licence: `${sdk} (not open source)`,
      homepage: "https://example.com/terms",
      texts: [
        `com.example.gms:acme-basement is not open-source software. It is distributed under the ${sdk}: https://example.com/terms`,
        "JSR 305: BSD-3-Clause",
      ],
    });
  });

  test("fails a proprietary library whose POM names other terms than the exception", () => {
    const found = gradleNoticeEntries(
      {
        artifacts: [
          library("acme-basement", { group: "com.example.gms", licences: [{ name: "New terms" }] }),
        ],
      },
      rules,
    );
    expect(found.entries).toEqual([]);
    expect(found.problems).toEqual([
      `com.example.gms:acme-basement@1.0.0 names "New terms" in its POM, but licences.json accepts it only under "${sdk}": check the new terms before you change the entry`,
    ]);
  });

  test("fails the same terms on a library the exception doesn't name", () => {
    const found = gradleNoticeEntries(
      { artifacts: [library("acme-vision", { licences: [{ name: sdk }] })] },
      rules,
    );
    expect(found.problems).toEqual([
      `com.example:acme-vision@1.0.0 is under "${sdk}", which "gradle.names" in tooling/check/licences.json doesn't map to an SPDX ID`,
    ]);
  });

  test("fails a mapped licence that isn't allowed, one without a stored text and one with none", () => {
    const found = gradleNoticeEntries(
      {
        artifacts: [
          library("acme-gpl", { licences: [{ name: "GNU GPL v3" }] }),
          library("acme-mit", { licences: [{ name: "The MIT License" }] }),
          library("acme-bare", { licences: [] }),
        ],
      },
      rules,
    );
    expect(found.entries).toEqual([]);
    expect(found.problems).toEqual([
      "com.example:acme-gpl@1.0.0 is under GPL-3.0-only, which isn't allowed in shipped code",
      "com.example:acme-mit@1.0.0 is under MIT, but tooling/check/licence-texts/MIT.txt is missing: add the licence's full text there",
      "com.example:acme-bare@1.0.0 names no licence in its POM or a parent POM",
    ]);
  });

  test("needs every licence a POM lists to be allowed, as a POM doesn't say and or or", () => {
    const found = gradleNoticeEntries(
      { artifacts: [library("acme-dual", { licences: [apache, { name: "GNU GPL v3" }] })] },
      rules,
    );
    expect(found.entries).toEqual([]);
    expect(found.problems).toHaveLength(1);
  });

  test("fails an empty file, which means the Gradle task found nothing", () => {
    expect(gradleNoticeEntries({ artifacts: [] }, rules).problems).toEqual([
      "the Gradle licence file lists no libraries: the Gradle task found nothing",
    ]);
  });
});

describe("gradlePolicyProblems", () => {
  test("names an incomplete bundled entry and one under a licence that isn't shipped", () => {
    expect(
      gradlePolicyProblems(
        {
          ...policy,
          bundled: [
            { ...bundled, source: "" },
            { ...bundled, component: "gpl-yuv", licence: "GPL-3.0-only" },
          ],
        },
        rules.allowed,
      ).filter((problem) => problem.includes("bundled")),
    ).toEqual([
      `tooling/check/licences.json: the bundled entry "yuv" needs "group:name", name, url, component, licence, text, source and task`,
      `tooling/check/licences.json: the bundled entry "gpl-yuv" is under GPL-3.0-only, which isn't on the shipped list`,
    ]);
  });

  test("accepts a policy that maps only to shipped licences", () => {
    expect(
      gradlePolicyProblems({ ...policy, names: { [apache.name]: "Apache-2.0" } }, rules.allowed),
    ).toEqual([]);
  });

  test("names a mapping to a licence that isn't shipped and an incomplete exception", () => {
    const problems = gradlePolicyProblems(
      {
        names: { "GNU GPL v3": "GPL-3.0-only" },
        proprietary: [{ artifact: "acme-basement", terms: sdk, url: "", task: "HAL-1" }],
      },
      rules.allowed,
    );
    expect(problems).toEqual([
      'tooling/check/licences.json: "gradle.names" maps "GNU GPL v3" to GPL-3.0-only, which isn\'t on the shipped list',
      'tooling/check/licences.json: the proprietary entry "acme-basement" needs "group:name", terms, url and task',
    ]);
  });
});
