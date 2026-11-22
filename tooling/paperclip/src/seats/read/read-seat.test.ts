import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import type { Command, CommandResult } from "./command.ts";
import { readSeat, type SeatToRead } from "./read-seat.ts";

const seat: SeatToRead = { id: "seat-a", configDir: "/seats/seat-a", account: "seat-a@acme.test" };
const now = () => "2026-11-22T10:03:00.000Z";
const env = { PATH: "/usr/bin", HOME: "/var/lib/seats" };

const signedIn = exited(
  JSON.stringify({ loggedIn: true, authMethod: "claude.ai", email: "seat-a@acme.test" }),
);
const usageText = [
  "Current session: 23% used · resets Nov 22, 3pm (UTC)",
  "Current week (all models): 41% used · resets Nov 25, 9:30am (UTC)",
  "Current week (Sonnet only): 12% used · resets Nov 25, 9:30am (UTC)",
].join("\n");

function exited(stdout: string, code = 0, stderr = ""): CommandResult {
  return { kind: "exited", code, stdout, stderr };
}

/** A made-up `claude`: answers the sign-in call, then the usage calls in turn. */
function fakeClaude(signIn: CommandResult, usage: readonly CommandResult[]) {
  const calls: Command[] = [];
  const answers = [...usage];
  const run = async (command: Command): Promise<CommandResult> => {
    calls.push(command);
    if (command.args[0] === "auth") {
      return signIn;
    }
    return answers.shift() ?? { kind: "timed-out" };
  };
  const usageCalls = () => calls.filter((call) => call.args[0] === "-p").length;
  return { run, calls, usageCalls };
}

verifies("paperclip.seats-read", () => {
  test("a subscription seat's usage is read into its windows", async () => {
    const claude = fakeClaude(signedIn, [exited(usageText)]);

    const { reading, signIn } = await readSeat(seat, { run: claude.run, now, env });

    expect(signIn?.state).toBe("signed-in");
    expect(reading).toEqual({
      seatId: "seat-a",
      at: "2026-11-22T10:03:00.000Z",
      error: undefined,
      session: { usedPercent: 23, resetsAt: "2026-11-22T15:00:00.000Z" },
      week: { usedPercent: 41, resetsAt: "2026-11-25T09:30:00.000Z" },
      weekByModel: { "Sonnet only": { usedPercent: 12, resetsAt: "2026-11-25T09:30:00.000Z" } },
    });
    expect(JSON.stringify(reading)).not.toContain("acme.test");
  });

  test("a signed-out seat and an API key sign-in are never asked for usage", async () => {
    const signedOut = fakeClaude(exited(JSON.stringify({ loggedIn: false }), 1), []);
    const apiKey = fakeClaude(
      exited(JSON.stringify({ loggedIn: true, authMethod: "api_key" })),
      [],
    );

    for (const claude of [signedOut, apiKey]) {
      const { reading } = await readSeat(seat, { run: claude.run, now, env });
      expect(reading.error).toBe("signed-out");
      expect(claude.usageCalls()).toBe(0);
    }
  });

  test("a usage read that times out is tried once more, then kept as a time-out", async () => {
    const claude = fakeClaude(signedIn, [{ kind: "timed-out" }, { kind: "timed-out" }]);

    const { reading } = await readSeat(seat, { run: claude.run, now, env });

    expect(claude.usageCalls()).toBe(2);
    expect(reading.error).toBe("timeout");
  });

  test("an unreadable usage read that works the second time gives a good reading", async () => {
    const claude = fakeClaude(signedIn, [
      exited("Failed to load usage data", 1),
      exited(usageText),
    ]);

    const { reading } = await readSeat(seat, { run: claude.run, now, env });

    expect(claude.usageCalls()).toBe(2);
    expect(reading.error).toBeUndefined();
  });

  test("a rate-limited usage read is not tried again", async () => {
    const claude = fakeClaude(signedIn, [exited("", 1, "Failed to load usage data: rate_limited")]);

    const { reading } = await readSeat(seat, { run: claude.run, now, env });

    expect(claude.usageCalls()).toBe(1);
    expect(reading.error).toBe("rate-limited");
  });

  test("a sign-in call that times out is a time-out without a sign-in", async () => {
    const claude = fakeClaude({ kind: "timed-out" }, []);

    const outcome = await readSeat(seat, { run: claude.run, now, env });

    expect(outcome.reading.error).toBe("timeout");
    expect(outcome.signIn).toBeUndefined();
  });

  test("the program gets only the given variables and the seat's folder, without a shell", async () => {
    const claude = fakeClaude(signedIn, [exited(usageText)]);

    await readSeat(seat, { run: claude.run, now, env });

    for (const call of claude.calls) {
      expect(call.program).toBe("claude");
      expect(call.env).toEqual({ ...env, CLAUDE_CONFIG_DIR: "/seats/seat-a" });
      expect(call.timeoutMs).toBeGreaterThan(0);
    }
  });
});
