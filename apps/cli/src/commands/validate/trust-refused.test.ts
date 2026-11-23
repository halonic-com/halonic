import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { removeTestFolder } from "../../test/remove-folder.ts";
import {
  leakedAddressParts,
  userInfoConnectorYaml,
  userInfoUrl,
} from "../../test/user-info-connector.ts";
import { smallWorkspace, validateIn, writeFiles } from "../../test/validate-workspace.ts";

const refused =
  "This file can't be trusted, because the address has a user name or password in it. Fix the address, and keep any password or key as a secret instead.";

let folder: string;
let workspace: string;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "halonic-cli-trust-refused-"));
  workspace = join(folder, "acme");
});

afterEach(async () => {
  await removeTestFolder(folder);
});

/** The small workspace with a provider `gw` at `baseUrl`. */
function withProviderAt(baseUrl: string): void {
  writeFiles(workspace, {
    ...smallWorkspace,
    "providers/gw.yaml": `id: gw\ntype: openai-compatible\nbaseUrl: ${baseUrl}\n`,
  });
}

verifies("cli.commands.validate.trust-refused", () => {
  it("fails on a provider whose address has a user name and password, without the address", async () => {
    withProviderAt(userInfoUrl());

    const { code, io } = await validateIn(workspace);

    expect(code).toBe(exitCode.failed);
    expect(io.stdout).toContain(`providers${sep}gw.yaml`);
    expect(io.stdout.join("\n")).toContain(`✕ ${refused}  (trust-refused)`);
    expect(leakedAddressParts([...io.stdout, ...io.stderr])).toEqual([]);
  });

  it("gives one error for a connector whose URL has them, in --json", async () => {
    writeFiles(workspace, {
      ...smallWorkspace,
      "library/connectors/web.connector.yaml": userInfoConnectorYaml,
    });

    const { io } = await validateIn(workspace, "--json");

    const report = JSON.parse(io.stdout.join("\n")) as {
      problems: { file: string; code: string; message: string }[];
    };
    expect(report.problems.filter((problem) => problem.code === "trust-refused")).toEqual([
      expect.objectContaining({ file: "library/connectors/web.connector.yaml", message: refused }),
    ]);
    expect(leakedAddressParts(io.stdout)).toEqual([]);
  });

  it("says nothing for an address without them", async () => {
    withProviderAt("https://gw.example.com/v1");

    const { io } = await validateIn(workspace, "--json");

    expect(io.stdout.join("\n")).not.toContain("trust-refused");
  });
});
