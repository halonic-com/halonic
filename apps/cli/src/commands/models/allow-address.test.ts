import { chmod, readFile } from "node:fs/promises";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import type { SecretSetup } from "../../secret-host.ts";
import { captureIo } from "../../test/capture-io.ts";
import { secretFixture } from "../../test/secret-setup.ts";
import { modelsCommandWith } from "./command.ts";

const gateway = "https://gateway.example.com";
/** The gateway's address with a user name and password, built here so no source line holds one. */
function withUserInfo(): string {
  const url = new URL(gateway);
  url.username = "user";
  url.password = "fake-pw";
  return url.href;
}

const keyValue = "sk-live-do-not-print";

let fixture: Awaited<ReturnType<typeof secretFixture>>;

beforeEach(async () => {
  fixture = await secretFixture();
  await fixture.store().set("openai-key", keyValue);
  await fixture.store().set("other-key", "sk-other");
});

afterEach(() => fixture.cleanup());

/** Runs `halonic models allow-address <args>` in-process, with `extra` added to the environment the profile reads. */
async function allow(args: readonly string[], extra: Record<string, string> = {}) {
  const profile = fixture.setup.profile;
  const setup: SecretSetup = {
    ...fixture.setup,
    ...(profile === undefined
      ? {}
      : { profile: { ...profile, variables: { ...profile.variables, ...extra } } }),
  };
  const io = captureIo(fixture.folder);
  const code = await runCli(["models", "allow-address", ...args], io, [modelsCommandWith(setup)]);
  return { code, io };
}

const secretsFile = () => join(fixture.folder, "profile", "secrets", "secrets.json");

verifies("cli.commands.models.allow-address", () => {
  it("allows the address for the key and keeps the key's other addresses", async () => {
    await fixture.store().setAllowedOrigins("openai-key", ["https://api.example.com"]);

    const { code, io } = await allow(["openai-key", gateway]);

    expect(code).toBe(exitCode.ok);
    expect(io.stdout).toEqual([`✓ Allowed ${gateway} for key "openai-key".`]);
    expect(await fixture.store().allowedOrigins("openai-key")).toEqual([
      "https://api.example.com",
      gateway,
    ]);
  });

  it("changes only the key it was given", async () => {
    await allow(["openai-key", gateway]);

    expect(await fixture.store().allowedOrigins("other-key")).toBeUndefined();
  });

  it("says that only the address part is kept when a path was typed", async () => {
    const { code, io } = await allow(["openai-key", `${gateway}/v1/chat?x=1`]);

    expect(code).toBe(exitCode.ok);
    expect(io.stdout).toEqual([
      `Only the address part is kept: ${gateway}.`,
      `✓ Allowed ${gateway} for key "openai-key".`,
    ]);
  });

  it("changes nothing and exits 0 for an address that is already allowed", async () => {
    await allow(["openai-key", gateway]);
    const before = await readFile(secretsFile(), "utf8");

    const { code, io } = await allow(["openai-key", gateway]);

    expect(code).toBe(exitCode.ok);
    expect(io.stdout).toEqual([
      `${gateway} is already allowed for key "openai-key". Nothing changed.`,
    ]);
    expect(await readFile(secretsFile(), "utf8")).toBe(before);
  });

  it("allows an address that differs only in look as a new address", async () => {
    await allow(["openai-key", gateway]);

    for (const lookAlike of [
      `${gateway}.evil.example.org`,
      "http://gateway.example.com",
      `${gateway}:8443`,
    ]) {
      const { io } = await allow(["openai-key", lookAlike]);
      expect(io.stdout.at(-1)).toContain("✓ Allowed");
    }
    expect(await fixture.store().allowedOrigins("openai-key")).toEqual([
      gateway,
      "https://gateway.example.com.evil.example.org",
      "http://gateway.example.com",
      "https://gateway.example.com:8443",
    ]);
  });

  describe("refusals, each on stderr with a non-zero exit and the addresses as they were", () => {
    it.each([
      [
        "a key that isn't stored",
        ["missing-key", gateway],
        exitCode.notFound,
        'There is no key named "missing-key". Save it first with: halonic secret set missing-key',
      ],
      [
        "an address that isn't one",
        ["openai-key", "gateway.example.com"],
        exitCode.usage,
        `"gateway.example.com" isn't an address. Use one that starts with https:// or http://, for example https://gateway.example.com.`,
      ],
      [
        "an address with a user name",
        ["openai-key", withUserInfo()],
        exitCode.usage,
        "Remove the user name and password from the address.",
      ],
    ])("%s", async (_label, args, expectedCode, text) => {
      const { code, io } = await allow(args);

      expect(code).toBe(expectedCode);
      expect(io.stderr.join("\n")).toContain(text);
      expect(io.stdout).toEqual([]);
      expect(await fixture.store().allowedOrigins("openai-key")).toBeUndefined();
    });

    it("a key that already has the most addresses", async () => {
      const eight = Array.from({ length: 8 }, (_, index) => `https://host${index}.example.com`);
      await fixture.store().setAllowedOrigins("openai-key", eight);

      const { code, io } = await allow(["openai-key", gateway]);

      expect(code).toBe(exitCode.limitReached);
      expect(io.stderr.join("\n")).toContain('Key "openai-key" is already allowed for 8 addresses');
      expect(await fixture.store().allowedOrigins("openai-key")).toEqual(eight);
    });

    it("without a key name and an address", async () => {
      expect((await allow(["openai-key"])).code).toBe(exitCode.usage);
      expect((await allow([])).code).toBe(exitCode.usage);
    });
  });

  describe("a profile that can't be written", () => {
    // Windows has no read permission bits, and root writes any file.
    it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
      "[platform:win32] needs POSIX modes: shows the saved-addresses row and changes nothing",
      async () => {
        await chmod(secretsFile(), 0o444);
        const before = await readFile(secretsFile(), "utf8");

        const { code, io } = await allow(["openai-key", gateway]);

        expect(code).toBe(exitCode.unavailable);
        expect(io.stderr.join("\n")).toContain(
          "Couldn't read the addresses saved for this key. Nothing was changed.",
        );
        expect(await readFile(secretsFile(), "utf8")).toBe(before);
      },
    );
  });

  describe("inside a run", () => {
    it("refuses with the agreed text on stderr, exits denied and leaves the store as it was", async () => {
      const before = await readFile(secretsFile(), "utf8");

      const { code, io } = await allow(["openai-key", gateway], {
        HALONIC_RUN_TOKEN: "fake-run-token",
      });

      expect(code).toBe(exitCode.denied);
      expect(io.stderr.join("\n")).toContain("This command can't be run from inside a run.");
      expect(io.stderr.join("\n")).toContain(
        "Run it in your own terminal, or use the Models page.",
      );
      expect(io.stdout).toEqual([]);
      expect(await readFile(secretsFile(), "utf8")).toBe(before);
    });

    it("refuses before it reads the arguments, and never prints the marker's value", async () => {
      const { code, io } = await allow([], { HALONIC_RUN_TOKEN: "fake-run-token" });

      expect(code).toBe(exitCode.denied);
      expect(io.stderr.join("\n")).not.toContain("fake-run-token");
    });

    it("refuses when the marker is present but empty", async () => {
      const { code } = await allow(["openai-key", gateway], { HALONIC_RUN_TOKEN: "" });

      expect(code).toBe(exitCode.denied);
    });

    it("takes the normal path when the marker is absent", async () => {
      const { code } = await allow(["openai-key", gateway]);

      expect(code).toBe(exitCode.ok);
    });
  });

  it("never prints the key's value or the profile path", async () => {
    const outputs = [
      await allow(["openai-key", gateway]),
      await allow(["missing-key", gateway]),
      await allow(["openai-key", "nope"]),
      await allow(["openai-key", gateway], { HALONIC_RUN_TOKEN: "fake-run-token" }),
    ].flatMap(({ io }) => [...io.stdout, ...io.stderr]);

    for (const line of outputs) {
      expect(line).not.toContain(keyValue);
      expect(line).not.toContain(fixture.folder);
    }
  });

  it("never says origin, host or URL in what it prints", async () => {
    const outputs = [
      await allow(["openai-key", gateway]),
      await allow(["missing-key", gateway]),
      await allow(["openai-key", "nope"]),
      await allow(["openai-key", gateway]),
    ].flatMap(({ io }) => [...io.stdout, ...io.stderr]);

    for (const line of outputs) {
      expect(line).not.toMatch(/\b(origin|host|url)\b/iu);
    }
  });
});
