import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { secret, secretFixture } from "../../test/secret-setup.ts";

let fixture: Awaited<ReturnType<typeof secretFixture>>;

beforeEach(async () => {
  fixture = await secretFixture();
});

afterEach(() => fixture.cleanup());

const notSet =
  "openai-key isn't set, so nothing changed. To see the secrets that are set, run halonic secret list.";

verifies("cli.commands.secret.remove", () => {
  it("removes a saved secret and leaves the others", async () => {
    await fixture.store().set("openai-key", "sk-live-1234");
    await fixture.store().set("anthropic-key", "sk-ant-5678");

    const { code, io } = await secret(fixture.folder, fixture.setup, ["remove", "openai-key"]);

    expect(code).toBe(exitCode.ok);
    expect(io.stdout).toEqual(["✓ Removed openai-key."]);
    expect(await fixture.store().names()).toEqual(["anthropic-key"]);
  });

  it("says it isn't set, how to see the names that are, and changes nothing", async () => {
    await fixture.store().set("anthropic-key", "sk-ant-5678");

    const { code, io } = await secret(fixture.folder, fixture.setup, ["remove", "openai-key"]);

    expect(code).toBe(exitCode.ok);
    expect(io.stdout).toEqual([notSet]);
    expect(await fixture.store().names()).toEqual(["anthropic-key"]);
  });

  it("names the variable that still holds a secret that isn't saved", async () => {
    const withVariable = await secretFixture(undefined, { HALONIC_SECRET_OPENAI_KEY: "sk-env" });
    try {
      const { code, io } = await secret(withVariable.folder, withVariable.setup, [
        "remove",
        "openai-key",
        "--json",
      ]);

      expect(code).toBe(exitCode.ok);
      expect(JSON.parse(io.stdout.join("\n"))).toMatchObject({
        name: "openai-key",
        removed: false,
      });

      const text = await secret(withVariable.folder, withVariable.setup, ["remove", "openai-key"]);
      expect(text.io.stdout).toEqual([
        "No secret openai-key is saved. Nothing changed.",
        "  HALONIC_SECRET_OPENAI_KEY is still set, so runs still read openai-key from it. Unset it to remove openai-key.",
      ]);
    } finally {
      await withVariable.cleanup();
    }
  });

  it("doesn't name an empty variable, which runs treat as unset", async () => {
    const empty = await secretFixture(undefined, { HALONIC_SECRET_OPENAI_KEY: "" });
    try {
      const { io } = await secret(empty.folder, empty.setup, ["remove", "openai-key"]);

      expect(io.stdout).toEqual([notSet]);
    } finally {
      await empty.cleanup();
    }
  });

  it("removes a secret saved under another spelling of its name", async () => {
    await fixture.store().set("Notes_Token", "acme-notes-1");

    const { code, io } = await secret(fixture.folder, fixture.setup, ["remove", "notes-token"]);

    expect(code).toBe(exitCode.ok);
    expect(io.stdout).toEqual(["✓ Removed notes-token."]);
    expect(await fixture.store().names()).toEqual([]);
  });

  it("refuses a sign-in token's name and changes nothing", async () => {
    await fixture.store().set("token-key", "kept");

    const { code, io } = await secret(fixture.folder, fixture.setup, ["remove", "token-key"]);

    expect(code).toBe(exitCode.usage);
    expect(io.stderr[0]).toContain("can't be changed here");
    expect(await fixture.store().get("token-key")).toBe("kept");
  });

  it("refuses the host key, says it can't be removed, with no usage line and changes nothing", async () => {
    await fixture.store().set("remote-host-key", "kept");

    const { code, io } = await secret(fixture.folder, fixture.setup, ["remove", "Remote_Host_Key"]);

    expect(code).toBe(exitCode.usage);
    expect(io.stderr).toEqual([
      '✕ Secret name "Remote_Host_Key" is the key paired phones use to confirm this computer. Halonic keeps it itself, so it can\'t be removed.',
    ]);
    expect(await fixture.store().get("remote-host-key")).toBe("kept");
  });

  it("needs exactly one name", async () => {
    for (const args of [["remove"], ["remove", "a-key", "b-key"]]) {
      const { code, io } = await secret(fixture.folder, fixture.setup, args);

      expect(code).toBe(exitCode.usage);
      expect(io.stderr[0]).toBe("✕ halonic secret remove needs the secret's name.");
    }
  });
});
