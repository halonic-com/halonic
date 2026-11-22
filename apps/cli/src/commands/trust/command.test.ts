import { chmodSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, sep } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { terminalTyping, trustKit } from "../../test/trust-kit.spec.ts";
import { leakedAddressParts, userInfoConnectorYaml } from "../../test/user-info-connector.ts";

const { folder, store, commands, writeAcme, fingerprintOfAcme } = trustKit();

verifies("cli.commands.trust.review-and-trust", () => {
  it("shows the check, asks both questions in a terminal and trusts on two yeses", async () => {
    writeAcme();
    const io = captureIo(folder());
    const { terminal, written } = terminalTyping("y", "y");

    const code = await runCli(["trust", "--dir", "acme"], io, commands(), { terminal });

    expect(code).toBe(exitCode.ok);
    expect(io.stdout).toEqual(["✓ Acme can run now."]);
    expect(written()).toContain(`Trust check for Acme (.${sep}acme)`);
    expect(written()).toContain("! Can download new code from npm when it starts");
    expect(written()).toContain("Trust Acme on this computer? [y/N]");
    expect(written()).toContain("It can download new code when it starts. Trust it anyway? [y/N]");
    expect(await store().list()).toHaveLength(1);
  });

  it("names a workspace without a name by its folder, not '.', run from inside it", async () => {
    writeAcme({ "workspace.yaml": "id: acme\n" });
    const io = captureIo(join(folder(), "acme"));
    const { terminal, written } = terminalTyping("n");

    await runCli(["trust"], io, commands(), { terminal });

    expect(written()).toContain("Trust check for acme (.)");
    expect(written()).toContain("Trust acme on this computer? [y/N]");
  });

  it("escapes control characters in the workspace's name in the question, the refusal, the ✓ line and --list", async () => {
    // A cursor move and a carriage return, which could rewrite the check above the line.
    writeAcme({ "workspace.yaml": 'id: acme\nname: "Acme\\u001b[6A\\r"\n' });
    const shown = "Acme\\u001b[6A\\u000d";
    const raw = (text: string) => text.includes("\u001b") || text.includes("\r");

    const { terminal, written } = terminalTyping("n");
    await runCli(["trust", "--dir", "acme"], captureIo(folder()), commands(), { terminal });
    expect(written()).toContain(`Trust ${shown} on this computer? [y/N]`);
    expect(raw(written())).toBe(false);

    const refused = captureIo(folder());
    await runCli(["trust", "--dir", "acme"], refused, commands());
    expect(refused.stderr).toContain(
      `✕ ${shown} isn't trusted on this computer yet, and there's no terminal to ask you.`,
    );
    expect(raw(refused.stderr.join("\n"))).toBe(false);

    const fingerprint = refused.stdout.at(-1) ?? "";
    const trusted = captureIo(folder());
    await runCli(
      ["trust", "--dir", "acme", "--yes", "--fingerprint", fingerprint],
      trusted,
      commands(),
    );
    expect(trusted.stdout).toEqual([`✓ ${shown} can run now.`]);

    const listed = captureIo(folder());
    await runCli(["trust", "--list"], listed, commands());
    expect(listed.stdout.join("\n")).toContain(shown);
    expect(raw(listed.stdout.join("\n"))).toBe(false);
  });

  it("saves nothing when either answer is no", async () => {
    writeAcme();
    for (const answers of [["n"], ["y", ""]]) {
      const io = captureIo(folder());
      const { terminal } = terminalTyping(...answers);

      const code = await runCli(["trust", "--dir", "acme"], io, commands(), { terminal });

      expect(code).toBe(exitCode.notTrusted);
      expect(io.stdout).toEqual(["Not trusted. Nothing was started."]);
    }
    expect(await store().list()).toEqual([]);
  });

  it("names the file of a connector whose URL has user info, without its address, and saves nothing (HAL-5421)", async () => {
    writeAcme({ "library/connectors/web.connector.yaml": userInfoConnectorYaml });
    const io = captureIo(folder());
    const json = captureIo(folder());
    const { terminal, written } = terminalTyping("y", "y");

    const code = await runCli(["trust", "--dir", "acme"], io, commands(), { terminal });
    const jsonCode = await runCli(["trust", "--dir", "acme", "--json"], json, commands());

    expect([code, jsonCode]).toEqual([exitCode.usage, exitCode.usage]);
    expect(io.stderr).toEqual([
      "✕ Couldn't trust acme: library/connectors/web.connector.yaml can't be trusted, because the URL has user info.",
      "  Fix the address in that file, then try again.",
    ]);
    expect(JSON.parse(json.stdout.join("\n"))).toMatchObject({
      ok: false,
      error: { kind: "invalid_input" },
    });
    expect(
      leakedAddressParts([...io.stdout, ...io.stderr, ...json.stdout, ...json.stderr, written()]),
    ).toEqual([]);
    expect(await store().list()).toEqual([]);
  });

  it("names the file of a provider whose address has user info, not its id (HAL-5569)", async () => {
    writeAcme({
      "providers/claude.yaml":
        "id: claude\ntype: anthropic\nbaseUrl: https://ops:pw@api.anthropic.com/v1\n",
    });
    const io = captureIo(folder());

    const code = await runCli(["trust", "--dir", "acme"], io, commands());

    expect(code).toBe(exitCode.usage);
    expect(io.stderr.join("\n")).toContain(
      "providers/claude.yaml can't be trusted, because the URL has user info.",
    );
    expect([...io.stdout, ...io.stderr].join("\n")).not.toContain("pw");
    expect(await store().list()).toEqual([]);
  });

  it("names the provider's file when a connector has the same id (HAL-5569)", async () => {
    writeAcme({
      "library/connectors/mail.connector.yaml":
        "name: Mail\ntransport:\n  http:\n    url: https://mail.example.com/mcp\ntools:\n  approve: []\n",
      "providers/mail.yaml":
        "id: mail\ntype: anthropic\nbaseUrl: https://ops:pw@api.anthropic.com/v1\n",
    });
    const io = captureIo(folder());

    const code = await runCli(["trust", "--dir", "acme"], io, commands());

    expect(code).toBe(exitCode.usage);
    const stderr = io.stderr.join("\n");
    expect(stderr).toContain("providers/mail.yaml can't be trusted");
    expect(stderr).not.toContain("mail.connector.yaml");
  });

  it("lists the trusted workspaces, with the fingerprint only in --json, and removes one", async () => {
    writeAcme();
    const empty = captureIo(folder());
    await runCli(["trust", "--list"], empty, commands());
    const fingerprint = await fingerprintOfAcme();
    const trust = ["trust", "--dir", "acme", "--yes", "--fingerprint", fingerprint];
    await runCli(trust, captureIo(folder()), commands());

    const list = captureIo(folder());
    await runCli(["trust", "--list"], list, commands());
    const json = captureIo(folder());
    await runCli(["trust", "--list", "--json"], json, commands());
    const removed = captureIo(folder());
    const code = await runCli(["trust", "--dir", "acme", "--remove"], removed, commands());

    expect(empty.stdout).toEqual(["No trusted workspaces or plugins yet."]);
    expect(list.stdout).toEqual([`Acme   .${sep}acme   trusted on 3 Nov`]);
    expect(JSON.parse(json.stdout.join("\n")).workspaces).toEqual([
      {
        kind: "workspace",
        name: "Acme",
        folder: `.${sep}acme`,
        fingerprint,
        trustedAt: "2026-11-03T12:00:00.000Z",
      },
    ]);
    expect(code).toBe(exitCode.ok);
    expect(removed.stdout).toEqual([
      "✓ Removed trust for Acme. Its programs and real models won't start until you review it again.",
    ]);
    expect(await store().list()).toEqual([]);
  });

  it("lists a workspace from where the user is, also when they got there through a link", async () => {
    writeAcme();
    const fingerprint = await fingerprintOfAcme();
    const trust = ["trust", "--dir", "acme", "--yes", "--fingerprint", fingerprint];
    await runCli(trust, captureIo(folder()), commands());
    // A link stands in for what a Windows short name such as `RUNNER~1` does:
    // the same folder under another path than the record's real one.
    const link = join(folder(), "link");
    symlinkSync(folder(), link, "junction");

    const list = captureIo(link);
    await runCli(["trust", "--list"], list, commands());

    expect(list.stdout).toEqual([`Acme   .${sep}acme   trusted on 3 Nov`]);
  });

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "[platform:win32] needs POSIX modes: lists every trusted workspace when a folder in one can't be read",
    async () => {
      writeAcme();
      const fingerprint = await fingerprintOfAcme();
      const trust = ["trust", "--dir", "acme", "--yes", "--fingerprint", fingerprint];
      await runCli(trust, captureIo(folder()), commands());
      const connectors = join(folder(), "acme", "library", "connectors");
      chmodSync(connectors, 0o000);
      try {
        const list = captureIo(folder());
        const code = await runCli(["trust", "--list"], list, commands());

        expect(code).toBe(exitCode.ok);
        expect(list.stdout).toEqual([`Acme   .${sep}acme   trusted on 3 Nov`]);
      } finally {
        chmodSync(connectors, 0o755);
      }
    },
  );

  it("lists a workspace under its folder when its workspace.yaml has no name to read", async () => {
    writeAcme();
    const fingerprint = await fingerprintOfAcme();
    const trust = ["trust", "--dir", "acme", "--yes", "--fingerprint", fingerprint];
    await runCli(trust, captureIo(folder()), commands());
    writeFileSync(join(folder(), "acme", "workspace.yaml"), "id: acme\nname: [Acme\n");

    const list = captureIo(folder());
    const code = await runCli(["trust", "--list"], list, commands());

    expect(code).toBe(exitCode.ok);
    expect(list.stdout).toEqual([`.${sep}acme   .${sep}acme   trusted on 3 Nov`]);
  });

  it("removes the trust of a workspace whose folder is gone", async () => {
    writeAcme();
    const fingerprint = await fingerprintOfAcme();
    await runCli(
      ["trust", "--dir", "acme", "--yes", "--fingerprint", fingerprint],
      captureIo(folder()),
      commands(),
    );
    rmSync(join(folder(), "acme"), { recursive: true });
    const io = captureIo(folder());

    // The record's key is the real path; the folder is gone, so it's the resolved one.
    const code = await runCli(["trust", "--dir", "acme", "--remove"], io, commands());

    expect(code).toBe(exitCode.ok);
    expect(io.stdout[0]).toContain(`Removed trust for .${sep}acme.`);
  });
});
