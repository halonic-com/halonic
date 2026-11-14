import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { secret, secretFixture } from "../../test/secret-setup.ts";

let fixture: Awaited<ReturnType<typeof secretFixture>>;

beforeEach(async () => {
  fixture = await secretFixture();
});

afterEach(() => fixture.cleanup());

verifies("cli.commands.secret.remove", () => {
  it("removes a saved secret and leaves the others", async () => {
    await fixture.store().set("openai-key", "sk-live-1234");
    await fixture.store().set("anthropic-key", "sk-ant-5678");

    const { code, io } = await secret(fixture.folder, fixture.setup, ["remove", "openai-key"]);

    expect(code).toBe(exitCode.ok);
    expect(io.stdout).toEqual(["✓ Removed openai-key."]);
    expect(await fixture.store().names()).toEqual(["anthropic-key"]);
  });

  it("succeeds when no such secret is saved", async () => {
    const { code, io } = await secret(fixture.folder, fixture.setup, ["remove", "openai-key"]);

    expect(code).toBe(exitCode.ok);
    expect(io.stdout).toEqual(["✓ Removed openai-key."]);
  });

  it("refuses a sign-in token's name and changes nothing", async () => {
    await fixture.store().set("token-key", "kept");

    const { code, io } = await secret(fixture.folder, fixture.setup, ["remove", "token-key"]);

    expect(code).toBe(exitCode.usage);
    expect(io.stderr[0]).toContain("can't be changed here");
    expect(await fixture.store().get("token-key")).toBe("kept");
  });

  it("needs exactly one name", async () => {
    for (const args of [["remove"], ["remove", "a-key", "b-key"]]) {
      const { code, io } = await secret(fixture.folder, fixture.setup, args);

      expect(code).toBe(exitCode.usage);
      expect(io.stderr[0]).toBe("✕ halonic secret remove needs the secret's name.");
    }
  });
});
