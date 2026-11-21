import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { checkProfileHome } from "../../profile-home.ts";
import { runCli } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { createTrustCommand, type TrustMachine } from "./command.ts";

/**
 * A machine whose profile folder is `HALONIC_HOME="~/.halonic"`, as a quoted
 * export leaves it, so opening it fails the way `nodeTrustMachine` does.
 */
function quotedTildeMachine(): TrustMachine {
  checkProfileHome({
    platform: "linux",
    homeFolder: "/srv/acme",
    variables: { HALONIC_HOME: "~/.halonic" },
  });
  throw new Error("HALONIC_HOME was accepted.");
}

/** Runs `halonic trust` with `args` on that machine and returns what it wrote to stderr. */
async function refusal(args: readonly string[]) {
  const io = captureIo("/srv/acme");
  const code = await runCli(["trust", ...args], io, [createTrustCommand(quotedTildeMachine)]);
  return { code, stderr: io.stderr };
}

const reason = 'HALONIC_HOME must be a full path, not "~/.halonic".';
const fix =
  '  Inside quotes the shell doesn\'t turn ~ into your home folder. Use $HOME instead: HALONIC_HOME="$HOME/.halonic".';

verifies("cli.profile-home", () => {
  it("says --list was listing, not trusting (HAL-15427)", async () => {
    expect(await refusal(["--list"])).toEqual({
      code: exitCode.usage,
      stderr: [`✕ Couldn't list the trusted workspaces and plugins: ${reason}`, fix],
    });
  });

  it("says --remove was removing the trust, for the folder as typed (HAL-15427)", async () => {
    expect(await refusal(["--remove"])).toEqual({
      code: exitCode.usage,
      stderr: [`✕ Couldn't remove the trust from this folder: ${reason}`, fix],
    });
    expect((await refusal(["--dir", "acme", "--remove"])).stderr[0]).toBe(
      `✕ Couldn't remove the trust from acme: ${reason}`,
    );
  });

  it("still says trust when it was trusting", async () => {
    expect((await refusal(["--dir", "acme"])).stderr[0]).toBe(`✕ Couldn't trust acme: ${reason}`);
  });
});
