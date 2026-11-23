import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  type ConnectionFacts,
  connectionChecking,
  connectionHeading,
  connectionLines,
  connectionReport,
} from "./connection-check.ts";

const at = new Date(2026, 10, 22, 10, 42);

function facts(more: Partial<ConnectionFacts>): ConnectionFacts {
  return {
    status: undefined,
    gaveUp: false,
    route: "tailscale",
    computer: "Tim's laptop",
    ...more,
  };
}

const timedOut = facts({ status: { state: "reconnecting", lastTry: "timeout" } });

verifies("remote.phone-connection-check", () => {
  it("names an online phone and a computer that doesn't answer, with the check for its route", () => {
    const [phone, computer] = connectionLines(timedOut);
    expect(phone).toMatchObject({ mark: "pass", sentence: "Online, through Tailscale" });
    expect(computer).toMatchObject({
      mark: "problem",
      sentence: "Tim's laptop isn't answering.",
      fix: "Check that Tim's laptop is on and awake, Halonic is open, and Tailscale is on there.",
    });
    expect(connectionHeading(connectionLines(timedOut))).toBe("1 problem");
  });

  it("asks for the same Wi-Fi for a computer reached through it", () => {
    const [phone, computer] = connectionLines({ ...timedOut, route: "wifi" });
    expect(phone?.sentence).toBe("Online, through this Wi-Fi");
    expect(computer?.fix).toBe(
      "Check that Tim's laptop is on and awake, Halonic is open, and both are on the same Wi-Fi.",
    );
  });

  it("counts an offline phone once: the computer's line is info until it is online", () => {
    const lines = connectionLines(
      facts({ status: { state: "reconnecting", lastTry: "network-down" } }),
    );
    expect(lines.map((line) => line.mark)).toEqual(["problem", "info"]);
    expect(lines[0]?.fix).toBe(
      "Turn on Wi-Fi or mobile data. It reconnects by itself when it is back online.",
    );
    expect(lines[1]?.sentence).toBe("Not checked until your phone is online.");
    expect(connectionHeading(lines)).toBe("1 problem");
  });

  it("says no problems once the computer answers", () => {
    const lines = connectionLines(facts({ status: { state: "connected" } }));
    expect(lines.map((line) => line.sentence)).toEqual([
      "Online, through Tailscale",
      "Tim's laptop answers.",
    ]);
    expect(connectionHeading(lines)).toBe("No problems found");
  });

  it("checks until a try finishes, and a first reach that gave up is a problem", () => {
    expect(connectionChecking(facts({ status: { state: "connecting" } }))).toBe(true);
    const gaveUp = facts({ status: { state: "connecting" }, gaveUp: true });
    expect(connectionChecking(gaveUp)).toBe(false);
    const [phone, computer] = connectionLines(gaveUp);
    expect(phone).toMatchObject({ mark: "info", sentence: "Not known yet: no try has finished." });
    expect(computer?.report[0]).toBe("isn't answering · no answer in 30 seconds");
  });

  it("builds the report from fixed words, with what the phone didn't check", () => {
    expect(connectionReport(connectionLines(timedOut), at)).toBe(
      [
        "Check this connection",
        "2026-11-22 10:42",
        "1 problem",
        "",
        "✓ Phone           online · through Tailscale",
        "✕ Your computer   isn't answering · timed out",
        "                  Fix: check that it is on and awake, Halonic is open, and Tailscale is on there.",
        "– Not checked     engine, models, sandbox · needs your computer first",
      ].join("\n"),
    );
  });

  it("never puts the computer's name in the report", () => {
    // Built from parts, as in Check this computer's leak test, so the repo's leak guard doesn't
    // read it as a real key.
    const key = ["sk", "ant", "api03", "Q".repeat(32)].join("-");
    const leaky = `tim@example.com ${key}`;
    for (const status of [
      { state: "connected" },
      { state: "reconnecting", lastTry: "refused" },
      { state: "reconnecting", lastTry: "network-down" },
      { state: "connecting" },
    ] as const) {
      const report = connectionReport(connectionLines(facts({ status, computer: leaky })), at);
      expect(report).not.toContain("tim@example.com");
      expect(report).not.toContain(key);
    }
  });
});
