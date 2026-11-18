// Attack tests for a plugin's fingerprint (plugins P10, HAL-1743): after a
// person trusts a plugin, any change to its folder turns it off, however small
// or well hidden. Each case reads the folder as the app does, trusts it, makes
// one change and reads it again.
import type { Clock, Digest } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { readPluginFolder } from "./plugin-folder.ts";
import { weatherManifest } from "./testing/plugin-fixtures.ts";
import { TestFolderReader } from "./testing/test-folder-reader.ts";
import { TestTrustStore } from "./testing/test-trust-store.ts";
import { TrustService } from "./trust-service.ts";

/** SHA-256 from Web Crypto, as the platforms' `Digest` adapters give it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

type Files = Record<string, string | Uint8Array>;

/** The plugin as it was trusted, by path from the plugins folder. */
const trustedFiles: Files = {
  "weather/plugin.yaml": weatherManifest,
  "weather/backend/index.js": 'export { default } from "./lib/forecast.js";\n',
  "weather/backend/lib/forecast.js": "export default {};\n",
  "weather/backend/lib/deep/units.js": "export const unit = 'C';\n",
  "weather/assets/icon.bin": new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
  "weather/README.md": "# Weather\n",
};

/** The files with `change` applied: a value sets a file, `null` removes it. */
function changed(change: Record<string, string | Uint8Array | null>): Files {
  const files: Files = { ...trustedFiles };
  for (const [path, content] of Object.entries(change)) {
    if (content === null) delete files[path];
    else files[path] = content;
  }
  return files;
}

async function read(files: Files) {
  const result = await readPluginFolder(new TestFolderReader().putFiles(files), digest, "weather");
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

/** A trust service in which a person trusted the plugin as {@link trustedFiles} has it. */
async function trusted(): Promise<TrustService> {
  const clock: Clock = { now: () => new Date("2026-11-18T09:00:00.000Z") };
  const service = new TrustService({
    store: new TestTrustStore(),
    digest,
    clock,
    appVersion: "0.1.0",
  });
  const subject = await read(trustedFiles);
  const check = await service.checkPlugin(subject);
  expect((await service.grantPlugin(subject, check.fingerprint, "prompt")).ok).toBe(true);
  return service;
}

const forecast = trustedFiles["weather/backend/lib/forecast.js"] as string;
const icon = trustedFiles["weather/assets/icon.bin"] as Uint8Array;

verifies("app.plugin-trust", () => {
  describe("a change to a trusted plugin's folder turns it off", () => {
    it("keeps the plugin on when nothing changed", async () => {
      const service = await trusted();
      expect((await service.checkPlugin(await read(trustedFiles))).status).toBe("trusted");
    });

    it.each<[string, Record<string, string | Uint8Array | null>]>([
      ["a hidden file added at the top", { "weather/.npmrc": "registry=https://evil.test\n" }],
      ["a hidden file added in the backend", { "weather/backend/.preload.js": "fetch('x');\n" }],
      ["an empty file added", { "weather/backend/lib/empty.js": "" }],
      ["a file added deep in a nested folder", { "weather/backend/lib/deep/more/x.js": "1;\n" }],
      [
        "a nested file's bytes changed",
        { "weather/backend/lib/deep/units.js": "export const unit = 'F';\n" },
      ],
      [
        "one byte appended to the backend's code",
        { "weather/backend/lib/forecast.js": `${forecast} ` },
      ],
      ["a file emptied", { "weather/README.md": "" }],
      [
        "a byte flipped in a file that isn't text",
        { "weather/assets/icon.bin": new Uint8Array([0x89, 0x50, 0x4e, 0x48]) },
      ],
      [
        "a comment added to the manifest, which parses the same",
        { "weather/plugin.yaml": `${weatherManifest}# a comment\n` },
      ],
      [
        "the manifest's line endings changed",
        { "weather/plugin.yaml": weatherManifest.replaceAll("\n", "\r\n") },
      ],
      [
        "a file renamed only in case",
        { "weather/backend/lib/forecast.js": null, "weather/backend/lib/Forecast.js": forecast },
      ],
      [
        "a file moved to another folder, bytes unchanged",
        { "weather/assets/icon.bin": null, "weather/icon.bin": icon },
      ],
      [
        "two files swapping their bytes",
        {
          "weather/backend/lib/forecast.js": "export const unit = 'C';\n",
          "weather/backend/lib/deep/units.js": forecast,
        },
      ],
      ["a file the plugin doesn't use removed", { "weather/README.md": null }],
    ])("%s", async (_, change) => {
      const service = await trusted();
      const check = await service.checkPlugin(await read(changed(change)));
      expect(check.status).toBe("changed");
      expect(check).not.toHaveProperty("grant");
    });

    it("refuses the folder outright when a link is added, so nothing is checked through it", async () => {
      const reader = new TestFolderReader()
        .putFiles(trustedFiles)
        .putLink("weather/backend/lib/x.js");
      const result = await readPluginFolder(reader, digest, "weather");
      expect(result.ok).toBe(false);
    });
  });
});
