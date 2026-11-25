// The version a Studio preview build carries (HAL-18308). Every preview used to
// be built as tauri.conf.json's version, so a newer preview found the same
// version installed and the installer offered to run again (repair) instead
// of updating.
//
// A preview is the next patch, as a pre-release numbered by the workflow's
// run: 0.1.0 gives 0.1.1-preview.<run>. The installer compares versions as
// semver, so that is newer than the release installed (0.1.0) and than every
// earlier preview, and older than the 0.1.1 release that follows it. Tauri
// turns it into 0.1.1.0 for the Windows file version, which takes no text.
//
//   node preview-version.mjs <tauri.conf.json> <run number>
// prints the version.

import { readFileSync } from "node:fs";
import { argv, exit, stdout } from "node:process";
import { pathToFileURL } from "node:url";

/** The preview version for a release version such as 0.1.0 and a run number above zero. */
export function previewVersion(releaseVersion, runNumber) {
  const parts = /^(\d+)\.(\d+)\.(\d+)$/.exec(releaseVersion);
  if (parts === null) {
    throw new Error(`'${releaseVersion}' isn't a release version such as 0.1.0`);
  }
  if (!/^[1-9]\d*$/.test(String(runNumber))) {
    throw new Error(`'${runNumber}' isn't a run number above zero`);
  }
  const [, major, minor, patch] = parts;
  return `${major}.${minor}.${Number(patch) + 1}-preview.${runNumber}`;
}

if (import.meta.url === pathToFileURL(argv[1] ?? "").href) {
  const [config, runNumber] = argv.slice(2);
  if (config === undefined || runNumber === undefined) {
    console.error("usage: node preview-version.mjs <tauri.conf.json> <run number>");
    exit(2);
  }
  const { version } = JSON.parse(readFileSync(config, "utf8"));
  stdout.write(`${previewVersion(version, runNumber)}\n`);
}
