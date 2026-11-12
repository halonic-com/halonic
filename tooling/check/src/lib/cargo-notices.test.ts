import { describe, expect, test } from "vitest";
import {
  type CargoMetadata,
  type CargoPackage,
  type CrateFiles,
  cargoNoticeEntries,
  licenceAllowed,
  linkedCrates,
  parseLicence,
  parseStoredText,
} from "./cargo-notices.ts";

function crate(name: string, version = "1.0.0", extra: Partial<CargoPackage> = {}): CargoPackage {
  return {
    id: `${name}@${version}`,
    name,
    version,
    license: "MIT",
    license_file: null,
    authors: [],
    repository: `https://example.com/${name}`,
    homepage: null,
    manifest_path: `/registry/${name}-${version}/Cargo.toml`,
    ...extra,
  };
}

const normal = [{ kind: null }];

describe("linkedCrates", () => {
  const metadata: CargoMetadata = {
    packages: [
      crate("acme-shell", "0.1.0"),
      crate("acme-store", "0.1.0"),
      crate("serde"),
      crate("serde", "2.0.0"),
      crate("cc"),
      crate("insta"),
      crate("both"),
      crate("unused"),
    ],
    workspace_members: ["acme-shell@0.1.0", "acme-store@0.1.0"],
    resolve: {
      nodes: [
        {
          id: "acme-shell@0.1.0",
          deps: [
            { pkg: "acme-store@0.1.0", dep_kinds: normal },
            { pkg: "serde@1.0.0", dep_kinds: normal },
            { pkg: "cc@1.0.0", dep_kinds: [{ kind: "build" }] },
            { pkg: "insta@1.0.0", dep_kinds: [{ kind: "dev" }] },
            { pkg: "both@1.0.0", dep_kinds: [{ kind: "build" }, { kind: null }] },
          ],
        },
        { id: "acme-store@0.1.0", deps: [{ pkg: "serde@2.0.0", dep_kinds: normal }] },
      ],
    },
  };

  test("walks normal dependencies only, leaves our own crates out and keeps each version", () => {
    expect(linkedCrates(metadata).map((pkg) => pkg.id)).toEqual([
      "both@1.0.0",
      "serde@1.0.0",
      "serde@2.0.0",
    ]);
  });

  test("finds nothing without a resolve graph", () => {
    expect(linkedCrates({ ...metadata, resolve: null })).toEqual([]);
  });
});

describe("licence expressions", () => {
  const allowed = (expression: string, list: string[]): boolean =>
    licenceAllowed(parseLicence(expression), new Set(list));

  test("OR passes when any branch is allowed", () => {
    expect(allowed("MIT OR Apache-2.0", ["Apache-2.0"])).toBe(true);
    expect(allowed("MIT OR GPL-3.0", ["Apache-2.0"])).toBe(false);
  });

  test("AND passes only when every part is allowed", () => {
    expect(allowed("MIT AND BSD-3-Clause", ["MIT", "BSD-3-Clause"])).toBe(true);
    expect(allowed("MIT AND BSD-3-Clause", ["MIT"])).toBe(false);
  });

  test("reads the old slash form as OR", () => {
    expect(allowed("MIT/Apache-2.0", ["Apache-2.0"])).toBe(true);
    expect(allowed("MIT/Apache-2.0", ["ISC"])).toBe(false);
  });

  test("AND binds tighter than OR, and brackets group", () => {
    expect(allowed("MIT OR Apache-2.0 AND GPL-3.0", ["MIT"])).toBe(true);
    expect(allowed("(MIT OR Apache-2.0) AND GPL-3.0", ["MIT"])).toBe(false);
    expect(allowed("(MIT OR Apache-2.0) AND Unicode-3.0", ["MIT", "Unicode-3.0"])).toBe(true);
  });

  test("a WITH exception is its own licence", () => {
    expect(allowed("Apache-2.0 WITH LLVM-exception", ["Apache-2.0"])).toBe(false);
    expect(
      allowed("Apache-2.0 WITH LLVM-exception OR MIT", ["Apache-2.0 WITH LLVM-exception"]),
    ).toBe(true);
  });

  test.each(["", "MIT OR", "(MIT", "MIT)", "MIT Apache-2.0", "Apache-2.0 WITH"])(
    "rejects %j",
    (expression) => {
      expect(() => parseLicence(expression)).toThrow("is not a licence expression");
    },
  );
});

describe("parseStoredText", () => {
  test("reads the version and source from the first line", () => {
    expect(
      parseStoredText("acme", "acme 1.2.3 https://example.com/LICENSE\r\nMIT text\r\n"),
    ).toEqual({ version: "1.2.3", source: "https://example.com/LICENSE", text: "MIT text\n" });
  });

  test.each(["MIT text\n", "other 1.0.0 https://example.com\n", "acme 1.0.0\n"])(
    "rejects a first line that isn't the crate, version and URL: %j",
    (file) => {
      expect(() => parseStoredText("acme", file)).toThrow('must start with "acme <version>');
    },
  );
});

describe("cargoNoticeEntries", () => {
  const policy = {
    allow: ["MIT", "Apache-2.0"],
    exceptions: [{ crate: "selectors", allow: ["MPL-2.0"] }],
  };
  const folders: Record<string, Record<string, string>> = {
    "/registry/serde-1.0.0": { "LICENSE-MIT": "MIT text", "LICENSE-APACHE": "Apache text" },
    "/registry/own-file-1.0.0": { "Cargo.toml": "", "docs/TERMS": "Own terms" },
  };
  const stored: Record<string, string> = {
    selectors: "selectors 0.38.0 https://example.com/MPL\nMPL text\n",
  };
  const files: CrateFiles = {
    list: (directory) => Object.keys(folders[directory] ?? {}),
    read: (path) => {
      const at = path.indexOf("-1.0.0/") + "-1.0.0/".length;
      const text = folders[path.slice(0, at - 1)]?.[path.slice(at)];
      if (text === undefined) throw new Error(`no file ${path}`);
      return text;
    },
    stored: (name) => stored[name],
  };

  test("reads the crate's licence files, in name order", () => {
    const { entries, problems } = cargoNoticeEntries(
      [crate("serde", "1.0.0", { authors: ["Acme Team"] })],
      policy,
      files,
    );
    expect(problems).toEqual([]);
    expect(entries).toEqual([
      {
        name: "serde",
        versions: ["1.0.0"],
        licence: "MIT",
        author: "Acme Team",
        homepage: "https://example.com/serde",
        texts: ["Apache text", "MIT text"],
      },
    ]);
  });

  test("reads the license-file named in Cargo.toml", () => {
    const { entries } = cargoNoticeEntries(
      [crate("own-file", "1.0.0", { license_file: "docs/TERMS" })],
      policy,
      files,
    );
    expect(entries[0]?.texts).toEqual(["Own terms"]);
  });

  test("fails when the license-file named in Cargo.toml is missing", () => {
    const { entries, problems } = cargoNoticeEntries(
      [crate("own-file", "1.0.0", { license_file: "docs/GONE" })],
      policy,
      files,
    );
    expect(entries).toEqual([]);
    expect(problems).toEqual([
      "own-file@1.0.0: can't read docs/GONE, the license-file its Cargo.toml names",
    ]);
  });

  test("uses a stored text for a crate without a licence file, and its exception", () => {
    const { entries, problems } = cargoNoticeEntries(
      [crate("selectors", "0.38.0", { license: "MPL-2.0" })],
      policy,
      files,
    );
    expect(problems).toEqual([]);
    expect(entries[0]?.texts).toEqual(["MPL text\n"]);
  });

  test("fails when the stored text is for another version", () => {
    const { problems } = cargoNoticeEntries(
      [crate("selectors", "0.39.0", { license: "MPL-2.0" })],
      policy,
      files,
    );
    expect(problems).toEqual([
      "the stored licence text for selectors is for 0.38.0, Cargo.lock has 0.39.0: check the licence of 0.39.0 and update tooling/check/licence-texts/crates/selectors.txt",
    ]);
  });

  test("fails when a crate has neither a licence file nor a stored text", () => {
    const { problems } = cargoNoticeEntries([crate("bare")], policy, files);
    expect(problems).toEqual([
      "bare@1.0.0 ships no licence file: store its text in tooling/check/licence-texts/crates/bare.txt",
    ]);
  });

  test("applies an exception to its own crate only", () => {
    const { problems } = cargoNoticeEntries(
      [crate("serde", "1.0.0", { license: "MPL-2.0" })],
      policy,
      files,
    );
    expect(problems).toEqual([
      "serde@1.0.0 is under MPL-2.0, which deny.toml does not allow for it",
    ]);
  });

  test("fails on a missing or unreadable licence field", () => {
    const { problems } = cargoNoticeEntries(
      [crate("serde", "1.0.0", { license: null }), crate("serde", "1.0.0", { license: "MIT OR" })],
      policy,
      files,
    );
    expect(problems).toEqual([
      "serde@1.0.0 names no licence in its Cargo.toml",
      'serde@1.0.0: "MIT OR" is not a licence expression: it ends too early',
    ]);
  });
});
