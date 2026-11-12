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

verifies("ports.harness-sign-in-command", () => {
  it("sets the agent's folder for the command only, in sh", () => {
    expect(signInCommandText(signIn, "/data/agents/writer", "sh")).toBe(
      "FAKE_CONFIG_DIR='/data/agents/writer' fake auth login",
    );
  });

  it("keeps a quote in the folder as it is, in sh", () => {
    expect(signInCommandText(signIn, "/data/it's here", "sh")).toBe(
      "FAKE_CONFIG_DIR='/data/it'\\''s here' fake auth login",
    );
  });

  it("sets the variable first in PowerShell, with its own quoting", () => {
    expect(signInCommandText(signIn, `${drive}data\\it's here`, "powershell")).toBe(
      `$env:FAKE_CONFIG_DIR = '${drive}data\\it''s here'; fake auth login`,
    );
  });

  it("leaves `$`, `~` and wildcards in the folder unexpanded", () => {
    expect(signInCommandText(signIn, "/data/$HOME/~/*", "sh")).toBe(
      "FAKE_CONFIG_DIR='/data/$HOME/~/*' fake auth login",
    );
    expect(signInCommandText(signIn, `${drive}$env:TEMP\\*`, "powershell")).toBe(
      `$env:FAKE_CONFIG_DIR = '${drive}$env:TEMP\\*'; fake auth login`,
    );
  });
});
