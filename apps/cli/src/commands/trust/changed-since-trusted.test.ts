import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { trustKit } from "../../test/trust-kit.spec.ts";

const { folder, commands, writeAcme, fingerprintOfAcme, trustAcmeThenChangeIt } = trustKit();

verifies("cli.commands.trust.review-and-trust", () => {
  it("without a terminal, says a changed workspace changed since it was trusted, not 'yet' (HAL-15117)", async () => {
    await trustAcmeThenChangeIt();
    const io = captureIo(folder());

    const code = await runCli(["trust", "--dir", "acme"], io, commands());

    expect(code).toBe(exitCode.notTrusted);
    expect(io.stderr.slice(-2)[0]).toBe(
      "✕ Acme changed since you trusted it, and there's no terminal to ask you to trust it again.",
    );
  });
});

verifies("cli.commands.trust.changes-json", () => {
  it("refuses a changed workspace with what changed in error.changes, by id and field", async () => {
    await trustAcmeThenChangeIt();
    const io = captureIo(folder());

    const code = await runCli(["trust", "--dir", "acme", "--json"], io, commands());

    expect(code).toBe(exitCode.notTrusted);
    const { error } = JSON.parse(io.stdout.join("\n"));
    expect(error.kind).toBe("not_trusted");
    expect(error.changes).toEqual({
      trustedAt: "2026-11-03T12:00:00.000Z",
      connectors: {
        added: ["notes"],
        changed: [{ id: "mail", fields: ["settings"] }],
        removed: [],
      },
      agents: { added: [], changed: [], removed: [] },
      integrations: { added: [], changed: [], removed: [] },
      providers: { added: [], changed: [], removed: [] },
    });
    expect(JSON.stringify(error.changes)).not.toContain("--all");
  });

  it("gives the changes with the trust when --yes --fingerprint trusts the changed workspace", async () => {
    await trustAcmeThenChangeIt();
    const fingerprint = await fingerprintOfAcme();
    const io = captureIo(folder());

    const args = ["trust", "--dir", "acme", "--yes", "--fingerprint", fingerprint, "--json"];
    const code = await runCli(args, io, commands());

    expect(code).toBe(exitCode.ok);
    const document = JSON.parse(io.stdout.join("\n"));
    expect(document.status).toBe("trusted");
    expect(document.changes.connectors.added).toEqual(["notes"]);
  });

  it("has no changes for a workspace that was never trusted", async () => {
    writeAcme();
    const io = captureIo(folder());

    await runCli(["trust", "--dir", "acme", "--json"], io, commands());

    expect(JSON.parse(io.stdout.join("\n")).error).not.toHaveProperty("changes");
  });
});
