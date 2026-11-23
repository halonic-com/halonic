import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";

// Vitest runs each package's tests from the package folder.
const shellFolder = join(process.cwd(), "src-tauri");
const imageFolder = resolve(process.cwd(), "../../infra/wsl-image");

/** The files a Tauri config copies next to the app: source path to installed name. */
function resources(file: string): Record<string, string> {
  const config = JSON.parse(readFileSync(join(shellFolder, file), "utf8")) as {
    bundle?: { resources?: Record<string, string> };
  };
  return config.bundle?.resources ?? {};
}

/** The image file `build.sh` writes: its `tarball=` line, gzipped. */
function builtImageName(): string {
  const source = readFileSync(join(imageFolder, "build.sh"), "utf8");
  const match = /^tarball="\$out\/([^"]+)"$/m.exec(source);
  if (match?.[1] === undefined) throw new Error("build.sh has no tarball= line");
  return `${match[1]}.gz`;
}

verifies("studio.installer-wsl-image", () => {
  it("installs the image under the name build.sh writes and the shell reads", () => {
    expect(builtImageName()).toBe("halonic-wsl.tar.gz");
    expect(resources("tauri.image.conf.json")).toEqual({
      "binaries/halonic-wsl.tar.gz": builtImageName(),
    });
  });

  it("ships no image from the installer config alone", () => {
    expect(Object.values(resources("tauri.installer.conf.json"))).not.toContain(builtImageName());
  });

  it("checks the pinned SHA-256, then copies the image and adds the image config, only with -Image", () => {
    const text = readFileSync(join(shellFolder, "windows/build-installer.ps1"), "utf8");
    expect(text).toContain("[string]$Image");
    const block = text.slice(text.indexOf("if ($Image) {"), text.indexOf("if ($Config) {"));
    expect(block).toContain("$imageSizes = Join-Path $Image 'sizes.json'");
    expect(block).toContain("Get-FileHash $imageArchive -Algorithm SHA256");
    const check = block.indexOf("if ($imagePinned -ne $imageActual) { throw");
    expect(check).toBeGreaterThan(-1);
    expect(block.indexOf("Copy-Item $imageArchive $bin")).toBeGreaterThan(check);
    expect(block.indexOf("'--config', 'tauri.image.conf.json'")).toBeGreaterThan(check);
    expect(text.split("tauri.image.conf.json'").length).toBe(2);
  });
});
