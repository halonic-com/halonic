import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

// Every program the build and smoke scripts start goes through this fake, and
// every file they touch through the fake fs below, so the test sees each start
// and nothing really runs or is written.
const started = vi.hoisted(() => [] as { file: string; args: readonly string[] }[]);
/** What the built host prints for each of the smoke script's runs. */
const answerOf = vi.hoisted(() => (args: readonly string[]): string => {
  if (args.includes("--version")) return "0.0.81\n";
  const sandbox = args.includes("--sandbox-check")
    ? '{"ok":true,"reason":null,"missing":[]}\n'
    : "";
  return `halonic-agent-host 1.2.3\n${sandbox}`;
});
vi.mock("node:child_process", () => ({
  execFileSync: (file: string, args?: readonly string[] | object) => {
    started.push({ file, args: Array.isArray(args) ? args : [] });
    return answerOf(Array.isArray(args) ? args : []);
  },
}));
vi.mock("node:fs", () => ({
  mkdtempSync: (prefix: string) => `${prefix}test`,
  readdirSync: () => ["1.2.3-0123456789abcdef"],
  rmSync: () => undefined,
  mkdirSync: () => undefined,
  writeFileSync: () => undefined,
  statSync: () => ({ size: 1 }),
  readFileSync: (path: string) =>
    path.endsWith("package.json") ? '{ "version": "1.2.3" }' : "const x: number = 1;\n",
}));
// Collecting the payload reads the repo; this test is only about what starts.
vi.mock("./build/payload.ts", () => ({
  collectPayload: () => ({ files: [], packages: {} }),
  payloadManifest: () => ({ digest: "0", packages: {}, files: [] }),
}));

const packageDirectory = join(import.meta.dirname, "..");
const dist = join(packageDirectory, "dist");
const platform = Object.getOwnPropertyDescriptor(process, "platform");

afterAll(() => {
  if (platform !== undefined) {
    Object.defineProperty(process, "platform", platform);
  }
});

describe("what the build and smoke scripts start", () => {
  it("is only Node, codesign and the built host, never a skill's scripts (HAL-188)", async () => {
    // On macOS the build also signs the host, so pretend to be there to see every start.
    Object.defineProperty(process, "platform", { value: "darwin" });
    vi.spyOn(console, "log").mockReturnValue(undefined);
    await import("../scripts/build.ts");
    await import("../scripts/smoke.ts");
    const host = join(dist, "halonic-agent-host");
    const profile = join(tmpdir(), "agent-host-smoke-test");
    const srtCli = join(profile, "agent-host", "1.2.3-0123456789abcdef", "node_modules");
    expect(started).toEqual([
      { file: process.execPath, args: ["--build-sea", join(dist, "sea-config.json")] },
      { file: "codesign", args: ["--force", "--sign", "-", host] },
      { file: host, args: ["--profile-folder", profile] },
      { file: host, args: ["--profile-folder", profile, "--sandbox-check"] },
      {
        file: host,
        args: [join(srtCli, "@anthropic-ai", "sandbox-runtime", "dist", "cli.js"), "--version"],
      },
    ]);
    expect(process.exitCode).toBeUndefined();
  });
});
