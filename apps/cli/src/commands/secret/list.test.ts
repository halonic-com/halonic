import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { secret, secretFixture } from "../../test/secret-setup.ts";

let fixture: Awaited<ReturnType<typeof secretFixture>>;

beforeEach(async () => {
  fixture = await secretFixture();
});

afterEach(() => fixture.cleanup());

verifies("cli.commands.secret.list", () => {
  it("lists the names in order and never a value or a sign-in token", async () => {
    await fixture.store().set("openai-key", "sk-live-1234");
    await fixture.store().set("anthropic-key", "sk-ant-5678");
    await fixture.store().set("serve-password", "$scrypt$hash");
    await fixture.store().set("token-key", "hidden");

    const { code, io } = await secret(fixture.folder, fixture.setup, ["list"]);

    expect(code).toBe(exitCode.ok);
    expect(io.stdout).toEqual(["anthropic-key", "openai-key", "serve-password"]);
    expect(io.stdout.join("\n")).not.toMatch(/sk-|scrypt|hidden/u);
  });

  it("adds the names to --json", async () => {
    await fixture.store().set("openai-key", "sk-live-1234");

    const { io } = await secret(fixture.folder, fixture.setup, ["list", "--json"]);

    expect(JSON.parse(io.stdout.join("\n"))).toMatchObject({ ok: true, secrets: ["openai-key"] });
    expect(io.stdout.join("\n")).not.toContain("sk-live-1234");
  });

  it("says so when nothing is saved", async () => {
    const { code, io } = await secret(fixture.folder, fixture.setup, ["list"]);

    expect(code).toBe(exitCode.ok);
    expect(io.stdout).toEqual(["No secrets are saved."]);
  });

  it("takes no arguments", async () => {
    const { code, io } = await secret(fixture.folder, fixture.setup, ["list", "openai-key"]);

    expect(code).toBe(exitCode.usage);
    expect(io.stderr[0]).toBe("✕ halonic secret list takes no arguments.");
  });
});
