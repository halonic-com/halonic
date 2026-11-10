import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bundleEntry, executableName, seaConfig } from "../src/build/build-sea.ts";
import { collectPayload, payloadManifest } from "../src/build/payload.ts";

/**
 * `pnpm build:sea`: writes `dist/halonic-agent-host` (`.exe` on Windows), with
 * the files the host runs from embedded in it, and prints its size.
 */

const packageDirectory = join(import.meta.dirname, "..");
const dist = join(packageDirectory, "dist");
const { version } = JSON.parse(readFileSync(join(packageDirectory, "package.json"), "utf8")) as {
  version: string;
};
mkdirSync(dist, { recursive: true });
const payload = collectPayload(packageDirectory, join(packageDirectory, "..", ".."));
const manifest = payloadManifest(payload);
const bundle = join(dist, "main.mjs");
const output = join(dist, executableName(process.platform));
writeFileSync(
  bundle,
  bundleEntry(readFileSync(join(packageDirectory, "src/main.ts"), "utf8"), {
    HALONIC_AGENT_HOST_VERSION: version,
    HALONIC_AGENT_HOST_PAYLOAD: manifest,
  }),
);
const config = join(dist, "sea-config.json");
writeFileSync(config, seaConfig(bundle, output, payload));
execFileSync(process.execPath, ["--build-sea", config], { stdio: "inherit" });
// macOS refuses to run a changed binary with an invalid signature, so give it an ad-hoc one.
// The real signing identity comes with the release work.
if (process.platform === "darwin") {
  execFileSync("codesign", ["--force", "--sign", "-", output], { stdio: "inherit" });
}
console.log(
  `Built ${output} (${statSync(output).size} bytes, ${manifest.files.length} payload files).`,
);
