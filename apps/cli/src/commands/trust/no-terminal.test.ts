import { sep } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { fullFingerprint, trustKit } from "../../test/trust-kit.spec.ts";

const { folder, store, commands, writeAcme } = trustKit();

verifies("cli.commands.trust.review-and-trust", () => {
  it("without a terminal, refuses with the check on stderr and the bare fingerprint last on stdout", async () => {
    writeAcme();
    const io = captureIo(folder());

    const code = await runCli(["trust", "--dir", "acme"], io, commands());

    expect(code).toBe(exitCode.notTrusted);
    expect(io.stderr[0]).toBe(`Trust check for Acme (.${sep}acme)`);
    expect(io.stdout).toHaveLength(1);
    expect(io.stdout[0]).toMatch(fullFingerprint);
    // The fix is the command that trusts what the check showed, ready to copy (HAL-14262).
    expect(io.stderr.slice(-2)).toEqual([
      "✕ Acme isn't trusted on this computer yet, and there's no terminal to ask you.",
      `  Read the list above, then run: halonic trust --dir acme --yes --fingerprint ${io.stdout[0]}`,
    ]);
    expect([...io.stdout, ...io.stderr].join("\n")).not.toContain("…");
    expect(await store().list()).toEqual([]);
  });

  it("with --json and no --yes, refuses with the fingerprint in the error", async () => {
    writeAcme();
    const io = captureIo(folder());

    const code = await runCli(["trust", "--dir", "acme", "--json"], io, commands());

    expect(code).toBe(exitCode.notTrusted);
    const document = JSON.parse(io.stdout.join("\n"));
    expect(document.ok).toBe(false);
    expect(document.error.kind).toBe("not_trusted");
    expect(document.error.fingerprint).toMatch(fullFingerprint);
  });
});
