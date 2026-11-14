import { maxSecretValueLength } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { readCapped } from "../../secret-host.ts";
import { pipe, secret, secretFixture, typing } from "../../test/secret-setup.ts";

let fixture: Awaited<ReturnType<typeof secretFixture>>;

beforeEach(async () => {
  fixture = await secretFixture();
});

afterEach(() => fixture.cleanup());

const value = "sk-live-1234";

verifies("cli.commands.secret.set", () => {
  it("saves the value typed at the hidden prompt", async () => {
    const { terminal, stdin, written } = typing(value);

    const { code, io } = await secret(
      fixture.folder,
      { ...fixture.setup, stdin },
      ["set", "openai-key"],
      terminal,
    );

    expect(code).toBe(exitCode.ok);
    expect(io.stdout).toEqual(["✓ Saved openai-key."]);
    // The prompt and the Enter's line ending are written; what was typed is not.
    expect(written()).toBe("Value for openai-key: \n");
    expect(await fixture.store().get("openai-key")).toBe(value);
  });

  it("saves what is piped in without its last line ending", async () => {
    for (const text of [`${value}\n`, `${value}\r\n`, value]) {
      const { code } = await secret(fixture.folder, { ...fixture.setup, stdin: pipe(text) }, [
        "set",
        "openai-key",
      ]);

      expect(code).toBe(exitCode.ok);
      expect(await fixture.store().get("openai-key")).toBe(value);
    }
  });

  it("never takes the value from an argument and never prints it", async () => {
    const { code, io } = await secret(
      fixture.folder,
      { ...fixture.setup, stdin: pipe("other\n") },
      ["set", "openai-key", value],
    );

    expect(code).toBe(exitCode.usage);
    expect(io.stderr[0]).toBe("✕ A secret's value can't be given as an argument.");
    expect(io.stderr.join("\n")).not.toContain(value);
    expect(await fixture.store().names()).toEqual([]);
  });

  it("needs a name", async () => {
    const { code, io } = await secret(fixture.folder, fixture.setup, ["set"]);

    expect(code).toBe(exitCode.usage);
    expect(io.stderr[0]).toBe("✕ halonic secret set needs the secret's name.");
  });

  it("refuses a name the service refuses before it asks for a value", async () => {
    const { terminal, stdin } = typing(value);

    const { code, io } = await secret(
      fixture.folder,
      { ...fixture.setup, stdin },
      ["set", "token-key"],
      terminal,
    );

    expect(code).toBe(exitCode.usage);
    expect(io.stderr[0]).toContain("can't be changed here");
    expect(await fixture.store().names()).toEqual([]);
  });

  it("says why a value is refused, without repeating it", async () => {
    const { code, io } = await secret(
      fixture.folder,
      { ...fixture.setup, stdin: pipe(`${"x".repeat(70000)}\n`) },
      ["set", "openai-key"],
    );

    expect(code).toBe(exitCode.usage);
    expect(io.stderr.join("\n")).not.toContain("xxxxxxxx");
    expect(await fixture.store().names()).toEqual([]);
  });

  it("saves nothing and exits 2 when stdin holds no value", async () => {
    for (const text of ["", "\n"]) {
      const { code, io } = await secret(fixture.folder, { ...fixture.setup, stdin: pipe(text) }, [
        "set",
        "openai-key",
      ]);

      expect(code).toBe(exitCode.usage);
      expect(io.stderr[0]).toBe("✕ No value was given for openai-key. Nothing was saved.");
    }
    const { terminal, stdin } = typing(undefined);
    const ended = await secret(
      fixture.folder,
      { ...fixture.setup, stdin },
      ["set", "openai-key"],
      terminal,
    );
    expect(ended.code).toBe(exitCode.usage);
    expect(await fixture.store().names()).toEqual([]);
  });

  it("asks the sign-in password twice at a terminal and saves only its hash", async () => {
    const { terminal, stdin } = typing("correct horse", "correct horse");

    const { code } = await secret(
      fixture.folder,
      { ...fixture.setup, stdin },
      ["set", "serve-password"],
      terminal,
    );

    expect(code).toBe(exitCode.ok);
    expect(await fixture.store().get("serve-password")).toBe("hash-of(13)");
  });

  it("saves nothing when the two passwords differ", async () => {
    const { terminal, stdin } = typing("correct horse", "correct hose");

    const { code, io } = await secret(
      fixture.folder,
      { ...fixture.setup, stdin },
      ["set", "serve-password"],
      terminal,
    );

    expect(code).toBe(exitCode.usage);
    expect(io.stderr[0]).toBe("✕ The two passwords are not the same. Nothing was saved.");
    expect(await fixture.store().names()).toEqual([]);
  });

  it("uses one piped sign-in password for both", async () => {
    const { code } = await secret(
      fixture.folder,
      { ...fixture.setup, stdin: pipe("correct horse\n") },
      ["set", "serve-password"],
    );

    expect(code).toBe(exitCode.ok);
    expect(await fixture.store().get("serve-password")).toBe("hash-of(13)");
  });

  it("asks nothing and saves nothing where nobody can type: CI or --json at a terminal", async () => {
    for (const flags of [["--json"], []]) {
      const { terminal, stdin, written } = typing(value);
      const env = flags.length === 0 ? { ...terminal.env, CI: "true" } : terminal.env;

      const { code, io } = await secret(
        fixture.folder,
        { ...fixture.setup, stdin },
        ["set", "openai-key", ...flags],
        { ...terminal, env },
      );

      expect(code).toBe(exitCode.usage);
      expect(written()).toBe("");
      const printed = [...io.stdout, ...io.stderr].join("\n");
      expect(printed).toContain("There's no terminal to type the value of openai-key in.");
      expect(printed).not.toContain(value);
    }
    expect(await fixture.store().names()).toEqual([]);
  });

  it("doesn't repeat a refused name that holds a pasted value", async () => {
    const pasted = `sk-${"é".repeat(40)}`;
    const { terminal, stdin, written } = typing(pasted);

    const { code, io } = await secret(
      fixture.folder,
      { ...fixture.setup, stdin },
      ["set", pasted],
      terminal,
    );

    expect(code).toBe(exitCode.usage);
    // The name is refused before any prompt, so nothing is asked or typed.
    expect(written()).toBe("");
    expect(io.stderr.join("\n")).not.toContain("éééé");
  });

  it("scrubs a value typed at the prompt from the refusal printed afterwards", async () => {
    const tooLong = `${"é".repeat(70000)}`;
    const { terminal, stdin } = typing(tooLong);

    const { code, io } = await secret(
      fixture.folder,
      { ...fixture.setup, stdin },
      ["set", "openai-key"],
      terminal,
    );

    expect(code).toBe(exitCode.usage);
    expect(io.stderr.join("\n")).not.toContain("éééé");
    expect(await fixture.store().names()).toEqual([]);
  });

  it("stops reading a pipe a little past the longest value", async () => {
    let read = 0;
    async function* endless() {
      for (;;) {
        read += 1;
        yield "x".repeat(1000);
      }
    }

    const text = await readCapped(endless());

    expect(text.length).toBeGreaterThan(maxSecretValueLength + 2);
    expect(read).toBeLessThan(100);
  });

  it("reads a small pipe whole, also from byte chunks that split a character", async () => {
    const bytes = Buffer.from(`${value}é\n`);

    const text = await readCapped([bytes.subarray(0, bytes.length - 2), bytes.subarray(-2)]);

    expect(text).toBe(`${value}é\n`);
  });
});
