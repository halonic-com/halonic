import type { Harness } from "@halonicjs/ports";
import { afterEach, describe, expect, it } from "vitest";
import { type HostServer, startHostServer } from "../server/host-server.ts";
import { randomLaunchToken } from "../server/launch-token.ts";
import type { TerminalCommand, TerminalOpened } from "../terminal/open-terminal.ts";
import { manualSignInCommand, type SignInRouteDeps, signInRoute } from "./sign-in-route.ts";

const token = randomLaunchToken();

/** An invented agent folder, absolute on this computer. */
const settingsFolder =
  process.platform === "win32"
    ? "W:\\person\\halonic\\agents\\writer" // leak-guard: allow absolute-path an invented Windows drive
    : "/data/agents/writer";

const signIn = { program: "fake", args: ["auth", "login"], folderVariable: "FAKE_CONFIG_DIR" };

const fake: Harness = {
  id: "fake",
  name: "Fake",
  signIn,
  detect: async () => ({ status: "ready", version: "1.0.0" }),
  start: () => {
    throw new Error("not used");
  },
};

/** A harness with no sign-in of its own, like the built-in loop. */
const withoutSignIn: Harness = { id: "loop", name: "Loop", detect: fake.detect, start: fake.start };

let server: HostServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

/**
 * Starts the route; `opened` is what the terminal answers, and each command
 * it got is kept. `found` is the program's path, `null` when it isn't there.
 */
async function started(
  opened: TerminalOpened | Error,
  found: string | null = "/opt/fake/bin/fake",
): Promise<{ url: string; commands: TerminalCommand[] }> {
  const commands: TerminalCommand[] = [];
  const deps: SignInRouteDeps = {
    harnesses: [fake, withoutSignIn],
    findProgram: async () => found ?? undefined,
    openTerminal: async (command) => {
      commands.push(command);
      if (opened instanceof Error) throw opened;
      return opened;
    },
    platform: "linux",
  };
  server = await startHostServer(token, [signInRoute(deps)]);
  return { url: server.url, commands };
}

function signInFor(url: string, body: unknown): Promise<Response> {
  return fetch(`${url}/v1/harnesses/sign-in`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /v1/harnesses/sign-in", () => {
  it("opens the program's own sign-in with only the agent's folder added", async () => {
    const { url, commands } = await started({ opened: true });
    const answer = await signInFor(url, { harness: "fake", settingsFolder });
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({ opened: true });
    expect(commands).toEqual([
      {
        program: "/opt/fake/bin/fake",
        args: ["auth", "login"],
        variables: { FAKE_CONFIG_DIR: settingsFolder },
      },
    ]);
  });

  it("answers the command to run by hand when no window opened", async () => {
    const { url } = await started({ opened: false, reason: "No terminal was found." });
    const answer = await signInFor(url, { harness: "fake", settingsFolder });
    expect(await answer.json()).toEqual({
      opened: false,
      reason: "No terminal was found.",
      command: manualSignInCommand(signIn, settingsFolder, "linux"),
    });
  });

  it("opens nothing for a program that isn't on this computer, and says so", async () => {
    const { url, commands } = await started({ opened: true }, null);
    const answer = await signInFor(url, { harness: "fake", settingsFolder });
    expect(await answer.json()).toMatchObject({
      opened: false,
      reason: "Fake wasn't found on this computer.",
    });
    expect(commands).toEqual([]);
  });

  it("refuses an unknown harness, one without a sign-in, and a relative folder", async () => {
    const { url, commands } = await started({ opened: true });
    const unknown = await signInFor(url, { harness: "other", settingsFolder });
    expect(unknown.status).toBe(404);
    const none = await signInFor(url, { harness: "loop", settingsFolder });
    expect(none.status).toBe(422);
    expect(await none.json()).toMatchObject({ error: { kind: "no_sign_in" } });
    const relative = await signInFor(url, { harness: "fake", settingsFolder: "agents/writer" });
    expect(relative.status).toBe(400);
    expect(commands).toEqual([]);
  });

  it("answers 422 with the reason when the terminal refuses the command", async () => {
    const { url } = await started(new Error("Halonic never runs a skill's scripts."));
    const answer = await signInFor(url, { harness: "fake", settingsFolder });
    expect(answer.status).toBe(422);
    expect(await answer.json()).toEqual({
      error: { kind: "sign_in_refused", message: "Halonic never runs a skill's scripts." },
    });
  });
});

describe("manualSignInCommand", () => {
  it("quotes the folder for sh", () => {
    expect(manualSignInCommand(signIn, "/data/it's here", "darwin")).toBe(
      "FAKE_CONFIG_DIR='/data/it'\\''s here' fake auth login",
    );
  });

  it("sets the variable in PowerShell on Windows", () => {
    const drive = "W:\\"; // leak-guard: allow absolute-path an invented Windows drive
    expect(manualSignInCommand(signIn, `${drive}it's here`, "win32")).toBe(
      `$env:FAKE_CONFIG_DIR = '${drive}it''s here'; fake auth login`,
    );
  });
});
