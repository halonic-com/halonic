import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  hostArguments,
  payloadFolder,
  payloadProgram,
  removeOldPayloads,
  resolveWorkspace,
  unpackPayload,
} from "./main.ts";
import type { PayloadManifest } from "./payload-manifest.ts";

let profile: string;

beforeEach(() => {
  profile = mkdtempSync(join(tmpdir(), "agent-host-main-"));
});

afterEach(() => {
  rmSync(profile, { recursive: true, force: true });
});

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

/** A payload of a few files, as the build would embed it. */
const assets: Record<string, string> = {
  "apps/agent-host/src/host.ts": "export function run() {}",
  "node_modules/srt/dist/cli.js": "cli",
  "node_modules/srt/vendor/apply-seccomp": "program",
  "packages/core/ports/package.json": JSON.stringify({
    exports: {
      ".": "./src/index.ts",
      "./node": { node: "./src/node.ts", default: "./src/web.ts" },
      "./list": ["./src/a.ts", "./src/b.ts"],
      "./nested": { node: { import: "./src/node.ts" } },
      "./hidden": null,
    },
  }),
};
const manifest: PayloadManifest = {
  digest: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  entry: "apps/agent-host/src/host.ts",
  programs: ["node_modules/srt/dist/cli.js"],
  packages: { "@halonicjs/ports": "packages/core/ports" },
  files: Object.entries(assets).map(([path, text]) => ({
    path,
    sha256: sha256(text),
    size: text.length,
    executable: path.endsWith("apply-seccomp"),
  })),
};
const readAsset = (path: string) => new TextEncoder().encode(assets[path] ?? "");

describe("payloadFolder", () => {
  it("is one folder per version and payload under the profile", () => {
    expect(payloadFolder(profile, "1.2.3", manifest)).toBe(
      join(profile, "agent-host", "1.2.3-0123456789abcdef"),
    );
  });
});

describe("unpackPayload", () => {
  const folder = () => payloadFolder(profile, "1.2.3", manifest);

  it("writes every file, and only the folder itself next to the profile's others", () => {
    unpackPayload(folder(), manifest, readAsset);
    for (const [path, text] of Object.entries(assets)) {
      expect(readFileSync(join(folder(), ...path.split("/")), "utf8")).toBe(text);
    }
    expect(readdirSync(join(profile, "agent-host"))).toEqual(["1.2.3-0123456789abcdef"]);
  });

  it.skipIf(process.platform === "win32")(
    "[platform:win32] Windows has no executable file mode: keeps programs runnable",
    () => {
      unpackPayload(folder(), manifest, readAsset);
      const mode = (path: string) => statSync(join(folder(), ...path.split("/"))).mode & 0o111;
      expect(mode("node_modules/srt/vendor/apply-seccomp")).not.toBe(0);
      expect(mode("node_modules/srt/dist/cli.js")).toBe(0);
    },
  );

  it("leaves a whole earlier folder as it is", () => {
    unpackPayload(folder(), manifest, readAsset);
    const readAgain = () => {
      throw new Error("read again");
    };
    expect(() => unpackPayload(folder(), manifest, readAgain)).not.toThrow();
  });

  it("unpacks again over a folder whose file was changed", () => {
    unpackPayload(folder(), manifest, readAsset);
    const cli = join(folder(), "node_modules", "srt", "dist", "cli.js");
    writeFileSync(cli, "changed");
    unpackPayload(folder(), manifest, readAsset);
    expect(readFileSync(cli, "utf8")).toBe("cli");
  });

  it("refuses an asset that doesn't match its digest, and leaves nothing behind", () => {
    // The second file is damaged, so the first is already written when it is found.
    const damaged = (path: string) =>
      readAsset(path === "node_modules/srt/dist/cli.js" ? "x" : path);
    expect(() => unpackPayload(folder(), manifest, damaged)).toThrow(
      "The agent host is damaged: node_modules/srt/dist/cli.js doesn't match its digest.",
    );
    expect(readdirSync(join(profile, "agent-host"))).toEqual([]);
  });

  it("refuses a path that could leave the folder", () => {
    const escaping = { ...manifest, files: [{ ...manifest.files[0], path: "../outside.js" }] };
    const read = () => readAsset(manifest.entry);
    expect(() => unpackPayload(folder(), escaping as PayloadManifest, read)).toThrow(
      `The agent host is damaged: "../outside.js" isn't a plain path.`,
    );
    expect(existsSync(join(profile, "outside.js"))).toBe(false);
  });
});

describe("removeOldPayloads", () => {
  const folder = () => payloadFolder(profile, "1.2.3", manifest);
  const parent = () => join(profile, "agent-host");
  const leave = (name: string, ageMs = 0) => {
    const other = join(parent(), name);
    mkdirSync(join(other, "node_modules"), { recursive: true });
    const at = (Date.now() - ageMs) / 1000;
    utimesSync(other, at, at);
  };

  it("removes other versions' folders and keeps this one", () => {
    unpackPayload(folder(), manifest, readAsset);
    leave("1.2.2-fedcba9876543210");
    leave("1.2.3-fedcba9876543210");
    removeOldPayloads(folder());
    expect(readdirSync(parent())).toEqual(["1.2.3-0123456789abcdef"]);
    expect(readFileSync(join(folder(), "node_modules", "srt", "dist", "cli.js"), "utf8")).toBe(
      "cli",
    );
  });

  it("removes a launch's unpacking folder only once it is an hour old", () => {
    unpackPayload(folder(), manifest, readAsset);
    leave("1.2.4-fedcba9876543210.unpacking-new", 60 * 1000);
    leave("1.2.4-fedcba9876543210.unpacking-old", 2 * 60 * 60 * 1000);
    removeOldPayloads(folder());
    expect(readdirSync(parent()).sort()).toEqual([
      "1.2.3-0123456789abcdef",
      "1.2.4-fedcba9876543210.unpacking-new",
    ]);
  });
});

describe("resolveWorkspace", () => {
  const folder = () => payloadFolder(profile, "1.2.3", manifest);
  const fileUrl = (path: string) => pathToFileURL(join(folder(), ...path.split("/"))).href;

  beforeEach(() => {
    unpackPayload(folder(), manifest, readAsset);
  });

  it("finds a workspace package's export in the payload", () => {
    expect(resolveWorkspace(folder(), manifest.packages, "@halonicjs/ports")).toBe(
      fileUrl("packages/core/ports/src/index.ts"),
    );
    expect(resolveWorkspace(folder(), manifest.packages, "@halonicjs/ports/node")).toBe(
      fileUrl("packages/core/ports/src/node.ts"),
    );
  });

  it("leaves other specifiers to Node", () => {
    expect(resolveWorkspace(folder(), manifest.packages, "zod")).toBeUndefined();
    expect(resolveWorkspace(folder(), manifest.packages, "@halonicjs/other")).toBeUndefined();
  });

  it("refuses a subpath the package doesn't export", () => {
    expect(() => resolveWorkspace(folder(), manifest.packages, "@halonicjs/ports/x")).toThrow(
      `@halonicjs/ports doesn't export "./x".`,
    );
  });

  it("names an export form it can't read", () => {
    for (const [subpath, written] of [
      ["list", `["./src/a.ts","./src/b.ts"]`],
      ["nested", `{"node":{"import":"./src/node.ts"}}`],
      ["hidden", "null"],
    ]) {
      expect(() =>
        resolveWorkspace(folder(), manifest.packages, `@halonicjs/ports/${subpath}`),
      ).toThrow(
        `@halonicjs/ports exports "./${subpath}" as ${written}, which the agent host can't read. ` +
          `Use a path, or conditions "node", "import" or "default" that each name a path.`,
      );
    }
  });
});

describe("payloadProgram", () => {
  const folder = () => payloadFolder(profile, "1.2.3", manifest);
  const cli = () => join(folder(), "node_modules", "srt", "dist", "cli.js");

  it("is a program of the unpacked payload of this version", () => {
    unpackPayload(folder(), manifest, readAsset);
    expect(payloadProgram(cli(), "1.2.3", manifest)).toBe(cli());
  });

  it("is nothing for any other argument", () => {
    unpackPayload(folder(), manifest, readAsset);
    expect(payloadProgram(undefined, "1.2.3", manifest)).toBeUndefined();
    expect(payloadProgram("--profile-folder", "1.2.3", manifest)).toBeUndefined();
    expect(
      payloadProgram(join(folder(), "apps", "agent-host", "src", "host.ts"), "1.2.3", manifest),
    ).toBeUndefined();
    // Another version's folder, and a program that was changed after unpacking.
    expect(payloadProgram(cli(), "1.2.4", manifest)).toBeUndefined();
    writeFileSync(cli(), "changed");
    expect(payloadProgram(cli(), "1.2.3", manifest)).toBeUndefined();
  });

  it("is never a skill's script (HAL-188)", () => {
    unpackPayload(folder(), manifest, readAsset);
    const script = join(folder(), ".claude", "skills", "a", "scripts", "run.js");
    mkdirSync(dirname(script), { recursive: true });
    writeFileSync(script, "cli");
    expect(payloadProgram(script, "1.2.3", manifest)).toBeUndefined();
  });

  it("is nothing for a program copied anywhere else", () => {
    const elsewhere = join(profile, "elsewhere", "node_modules", "srt", "dist", "cli.js");
    mkdirSync(dirname(elsewhere), { recursive: true });
    writeFileSync(elsewhere, "cli");
    expect(payloadProgram(elsewhere, "1.2.3", manifest)).toBeUndefined();
  });
});

describe("hostArguments", () => {
  it("takes out the profile folder and keeps the rest in order", () => {
    expect(hostArguments(["--sandbox-check", "--profile-folder", "/p", "--x"])).toEqual({
      profileFolder: "/p",
      rest: ["--sandbox-check", "--x"],
    });
  });

  it("has no profile folder when none is given", () => {
    expect(hostArguments(["--x"])).toEqual({ profileFolder: undefined, rest: ["--x"] });
    expect(hostArguments(["--profile-folder"]).profileFolder).toBeUndefined();
  });
});
