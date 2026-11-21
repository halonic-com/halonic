import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { HarnessSignIn } from "./harness.ts";
import { signInCommandText } from "./harness-sign-in-command.ts";

/** An invented Windows drive, joined in so the folders below read as Windows ones. */
const drive = "W:\\"; // leak-guard: allow absolute-path an invented Windows drive

const signIn: HarnessSignIn = {
  program: "fake",
  args: ["auth", "login"],
  folderVariable: "FAKE_CONFIG_DIR",
};

/** PowerShell's step that makes the folder, before the sign-in. */
const newItem = (folder: string) =>
  `New-Item -ItemType Directory -Force -Path ${folder} | Out-Null`;

verifies("ports.harness-sign-in-command", () => {
  it("makes the agent's folder, then sets it for the command only, in sh", () => {
    expect(signInCommandText(signIn, "/data/agents/writer", "sh")).toBe(
      "mkdir -p -m 700 '/data/agents/writer' && FAKE_CONFIG_DIR='/data/agents/writer' fake auth login",
    );
  });

  it("makes the agent's folder, then sets the variable, in PowerShell", () => {
    expect(signInCommandText(signIn, `${drive}data\\writer`, "powershell")).toBe(
      `${newItem(`'${drive}data\\writer'`)}; $env:FAKE_CONFIG_DIR = '${drive}data\\writer'; fake auth login`,
    );
  });

  it("keeps a quote in the folder as it is, in sh", () => {
    expect(signInCommandText(signIn, "/data/it's here", "sh")).toBe(
      "mkdir -p -m 700 '/data/it'\\''s here' && FAKE_CONFIG_DIR='/data/it'\\''s here' fake auth login",
    );
  });

  it("keeps a quote in the folder as it is, in PowerShell", () => {
    const folder = `'${drive}data\\it''s here'`;
    expect(signInCommandText(signIn, `${drive}data\\it's here`, "powershell")).toBe(
      `${newItem(folder)}; $env:FAKE_CONFIG_DIR = ${folder}; fake auth login`,
    );
  });

  it("leaves `$`, `~` and wildcards in the folder unexpanded", () => {
    expect(signInCommandText(signIn, "/data/$HOME/~/*", "sh")).toBe(
      "mkdir -p -m 700 '/data/$HOME/~/*' && FAKE_CONFIG_DIR='/data/$HOME/~/*' fake auth login",
    );
    const folder = `'${drive}$env:TEMP\\*'`;
    expect(signInCommandText(signIn, `${drive}$env:TEMP\\*`, "powershell")).toBe(
      `${newItem(folder)}; $env:FAKE_CONFIG_DIR = ${folder}; fake auth login`,
    );
  });
});
