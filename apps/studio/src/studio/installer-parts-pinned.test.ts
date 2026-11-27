import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";

// Vitest runs each package's tests from the package folder.
const shellFolder = join(process.cwd(), "src-tauri");
const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

/** A pin as part-pins.mjs writes it. */
interface Pin {
  version: string;
  sha256: string;
  size: number;
  url: string;
  minRuntime?: string;
}

// A plain script the workflows run with the runner's own Node, so it has no
// types: imported by path, with the functions it exports typed here.
const script = pathToFileURL(join(shellFolder, "windows/part-pins.mjs")).href;
const pins = (await import(script)) as {
  assetName: (part: "runtime" | "image", version: string) => string;
  pinUrlProblem: (url: string) => string | null;
  pinProblems: (pin: unknown, part: "runtime" | "image") => string[];
  minRuntime: () => string;
  pinRuntime: (dir: string, repo: string, tag: string) => Promise<Pin>;
  pinImage: (dir: string, repo: string, tag: string, imageVersion: string) => Promise<Pin>;
  checkPin: (pinFile: string, archive: string) => Promise<Pin>;
  publishParts: (
    dist: string,
    repo: string,
    tag: string,
    dirs: { runtime: string; image: string },
  ) => Promise<{ asset: string; size: number }[]>;
};

const release = "https://github.com/halonic-com/halonic/releases/download";
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

/** A folder with an invented runtime and image, as runtime-archive.sh and build.sh write them. */
function builtParts(): { runtime: string; image: string; dist: string } {
  const root = mkdtempSync(join(tmpdir(), "acme-parts-"));
  folders.push(root);
  const runtime = join(root, "wsl-runtime");
  const image = join(root, "wsl-image");
  const dist = join(root, "dist");
  for (const folder of [runtime, image, dist]) mkdirSync(folder);
  const runtimeBytes = "acme runtime archive";
  writeFileSync(join(runtime, "halonic-runtime.tar.gz"), runtimeBytes);
  writeFileSync(
    join(runtime, "halonic-runtime.json"),
    JSON.stringify({
      version: "0.1.2+0123456789ab",
      sha256: sha256(runtimeBytes),
      size: runtimeBytes.length,
    }),
  );
  const imageBytes = "acme image archive";
  writeFileSync(join(image, "halonic-wsl.tar.gz"), imageBytes);
  writeFileSync(join(image, "sizes.json"), JSON.stringify({ sha256: sha256(imageBytes) }));
  writeFileSync(join(dist, "SHA256SUMS"), "");
  return { runtime, image, dist };
}

verifies("studio.installer-parts-pinned", () => {
  describe("the allow-list", () => {
    it("allows a release asset of halonic and of halonic-preview", () => {
      expect(pins.pinUrlProblem(`${release}/v0.1.2/halonic-wsl-3.tar.gz`)).toBeNull();
      expect(
        pins.pinUrlProblem(
          "https://github.com/halonic-com/halonic-preview/releases/download/v0.1.2-preview.7/halonic-runtime-0.1.2-abc.tar.gz",
        ),
      ).toBeNull();
    });

    it.each([
      ["plain HTTP", "http://github.com/halonic-com/halonic/releases/download/v1/a.tar.gz"],
      ["another port", "https://github.com:8443/halonic-com/halonic/releases/download/v1/a.tar.gz"],
      [
        "port 443 written out",
        "https://github.com:443/halonic-com/halonic/releases/download/v1/a.tar.gz",
      ],
      ["a user name", "https://acme@github.com/halonic-com/halonic/releases/download/v1/a.tar.gz"],
      [
        "another host",
        "https://raw.githubusercontent.com/halonic-com/halonic/releases/download/v1/a.tar.gz",
      ],
      [
        "a look-alike host",
        "https://github.com.acme.example/halonic-com/halonic/releases/download/v1/a.tar.gz",
      ],
      ["another repository", "https://github.com/acme/halonic/releases/download/v1/a.tar.gz"],
      [
        "a repository with the same start",
        "https://github.com/halonic-com/halonic-acme/releases/download/v1/a.tar.gz",
      ],
      ["the repository's code", "https://github.com/halonic-com/halonic/raw/main/a.tar.gz"],
      ["a path that climbs out", `${release}/../../../acme/x/releases/download/v1/a.tar.gz`],
      ["a deeper path", `${release}/v1/acme/a.tar.gz`],
      ["no asset", `${release}/v1/`],
      ["a query", `${release}/v1/a.tar.gz?acme=1`],
      ["not a URL", "halonic-runtime.tar.gz"],
    ])("refuses %s", (_case, url) => {
      expect(pins.pinUrlProblem(url)).not.toBeNull();
    });
  });

  describe("pinning", () => {
    it("adds the release url and the runtime floor to the runtime's manifest", async () => {
      const { runtime } = builtParts();
      const pin = await pins.pinRuntime(runtime, "halonic-com/halonic", "v0.1.2");
      expect(pin.url).toBe(`${release}/v0.1.2/halonic-runtime-0.1.2-0123456789ab.tar.gz`);
      expect(pin.minRuntime).toBe(pins.minRuntime());
      expect(JSON.parse(readFileSync(join(runtime, "halonic-runtime.json"), "utf8"))).toEqual(pin);
      expect(pins.pinProblems(pin, "runtime")).toEqual([]);
    });

    it("writes the image's pin with its image version", async () => {
      const { image } = builtParts();
      const pin = await pins.pinImage(image, "halonic-com/halonic", "v0.1.2", "3\n");
      expect(pin).toEqual({
        version: "3",
        sha256: sha256("acme image archive"),
        size: "acme image archive".length,
        url: `${release}/v0.1.2/halonic-wsl-3.tar.gz`,
      });
      expect(JSON.parse(readFileSync(join(image, "halonic-wsl.json"), "utf8"))).toEqual(pin);
    });

    it("refuses an archive that isn't the one its manifest pins", async () => {
      const { runtime, image } = builtParts();
      writeFileSync(join(runtime, "halonic-runtime.tar.gz"), "another archive");
      await expect(pins.pinRuntime(runtime, "halonic-com/halonic", "v0.1.2")).rejects.toThrow(
        "the pin says",
      );
      writeFileSync(join(image, "halonic-wsl.tar.gz"), "another image");
      await expect(pins.pinImage(image, "halonic-com/halonic", "v0.1.2", "3")).rejects.toThrow(
        "sizes.json pins",
      );
    });

    it("refuses a repository outside the allow-list, so the build stops", async () => {
      const { runtime } = builtParts();
      await expect(pins.pinRuntime(runtime, "acme/halonic", "v0.1.2")).rejects.toThrow(
        "isn't under a Halonic release",
      );
    });

    it("checks a pin's url, SHA-256 and size against its archive, as -PinParts does", async () => {
      const { runtime } = builtParts();
      await pins.pinRuntime(runtime, "halonic-com/halonic", "v0.1.2");
      const pinFile = join(runtime, "halonic-runtime.json");
      const archive = join(runtime, "halonic-runtime.tar.gz");
      await expect(pins.checkPin(pinFile, archive)).resolves.toMatchObject({
        version: "0.1.2+0123456789ab",
      });
      const pin = JSON.parse(readFileSync(pinFile, "utf8")) as Pin;
      writeFileSync(
        pinFile,
        JSON.stringify({ ...pin, url: "https://acme.example/halonic-runtime.tar.gz" }),
      );
      await expect(pins.checkPin(pinFile, archive)).rejects.toThrow("isn't on github.com");
      writeFileSync(pinFile, JSON.stringify({ ...pin, size: pin.size + 1 }));
      await expect(pins.checkPin(pinFile, archive)).rejects.toThrow("the pin says");
      writeFileSync(
        pinFile,
        JSON.stringify({ version: pin.version, sha256: pin.sha256, size: pin.size, url: pin.url }),
      );
      await expect(pins.checkPin(pinFile, archive)).rejects.toThrow("no minRuntime");
    });
  });

  describe("publishing", () => {
    it("adds both parts under their versioned names, listed in SHA256SUMS with their pins' SHA-256", async () => {
      const { runtime, image, dist } = builtParts();
      const runtimePin = await pins.pinRuntime(runtime, "halonic-com/halonic", "v0.1.2");
      const imagePin = await pins.pinImage(image, "halonic-com/halonic", "v0.1.2", "3");
      const published = await pins.publishParts(dist, "halonic-com/halonic", "v0.1.2", {
        runtime,
        image,
      });
      expect(published).toEqual([
        { asset: "halonic-runtime-0.1.2-0123456789ab.tar.gz", size: runtimePin.size },
        { asset: "halonic-wsl-3.tar.gz", size: imagePin.size },
      ]);
      expect(readFileSync(join(dist, "SHA256SUMS"), "utf8")).toBe(
        `${runtimePin.sha256}  halonic-runtime-0.1.2-0123456789ab.tar.gz\n${imagePin.sha256}  halonic-wsl-3.tar.gz\n`,
      );
      expect(sha256(readFileSync(join(dist, "halonic-wsl-3.tar.gz"), "utf8"))).toBe(
        imagePin.sha256,
      );
    });

    it("adds nothing when a pin names another release or a part isn't the pinned file", async () => {
      const { runtime, image, dist } = builtParts();
      await pins.pinRuntime(runtime, "halonic-com/halonic", "v0.1.2");
      await pins.pinImage(image, "halonic-com/halonic", "v0.1.2", "3");
      await expect(
        pins.publishParts(dist, "halonic-com/halonic", "v0.1.3", { runtime, image }),
      ).rejects.toThrow("this release's asset is");
      writeFileSync(join(image, "halonic-wsl.tar.gz"), "another image");
      await expect(
        pins.publishParts(dist, "halonic-com/halonic", "v0.1.2", { runtime, image }),
      ).rejects.toThrow("the pin says");
      expect(readFileSync(join(dist, "SHA256SUMS"), "utf8")).toBe("");
    });

    it("names assets only with characters GitHub keeps", () => {
      expect(pins.assetName("runtime", "0.1.2+abc")).toBe("halonic-runtime-0.1.2-abc.tar.gz");
      expect(pins.assetName("image", "3")).toBe("halonic-wsl-3.tar.gz");
    });
  });

  describe("the installer and the workflows", () => {
    it("packs the pins and no archive with -PinParts, and keeps -Runtime and -Image as they were", () => {
      const text = read("src-tauri/windows/build-installer.ps1");
      expect(text).toContain("[switch]$PinParts");
      expect(text).toContain("if ($PinParts -and -not ($Runtime -and $Image)) { throw");
      expect(text).toContain("node (Join-Path $PSScriptRoot 'part-pins.mjs') check $pin $archive");
      expect(text).toContain("Assert-Pin $runtimeManifest $runtimeArchive");
      expect(text).toContain("Assert-Pin $imagePin $imageArchive");
      expect(text).toContain(
        "if ($PinParts) { $configs += @('--config', 'tauri.pins.conf.json') }",
      );
      const config = JSON.parse(read("src-tauri/tauri.pins.conf.json")) as {
        bundle: { resources: object };
      };
      expect(config.bundle.resources).toEqual({
        "binaries/halonic-runtime.json": "halonic-runtime.json",
        "binaries/halonic-wsl.json": "halonic-wsl.json",
      });
    });

    it("pins, publishes and checks both parts on a release, and packs an installer with pins in a dry run", () => {
      const text = read("../../.github/workflows/release.yml");
      expect(text).toContain(
        'part-pins.mjs pin runtime "$RUNNER_TEMP/wsl-runtime" "$GITHUB_REPOSITORY" "$TAG"',
      );
      expect(text).toContain(
        'part-pins.mjs pin image "$RUNNER_TEMP/wsl-image" "$GITHUB_REPOSITORY" "$TAG"',
      );
      expect(text).toContain('part-pins.mjs publish dist "$GITHUB_REPOSITORY" "$TAG"');
      expect(text).toContain("build-installer.ps1 -Step pack -PinParts");
      expect(text).toContain('done < "$RUNNER_TEMP/parts.txt"');
    });

    it("pins and stages both parts on every preview build, and publishes and checks them", () => {
      const text = read("../../.github/workflows/studio-preview.yml");
      expect(text).toContain("node $pins pin runtime");
      expect(text).toContain("node $pins pin image");
      expect(text).toContain("node $pins publish $staged halonic-com/halonic-preview $tag");
      expect(text).toContain('part-pins.mjs publish dist "$PREVIEW_REPO" "v$VERSION"');
      expect(text).toContain('dist/SHA256SUMS "${parts[@]}"');
      expect(text).toContain('done < "$RUNNER_TEMP/parts.txt"');
    });
  });
});
