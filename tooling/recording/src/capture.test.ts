import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { castFromScriptLog, driverScript } from "./capture.ts";
import { echoRecording } from "./fixtures.test-helper.ts";

/** A log as `script` writes it: its header line, then the writes; and the matching classic timing file. */
function scriptLog(writes: readonly (readonly [number, string | Buffer])[]): {
  log: Buffer;
  timing: string;
} {
  const bodies = writes.map(([, body]) =>
    typeof body === "string" ? Buffer.from(body, "utf8") : body,
  );
  const header = Buffer.from(
    'Script started on 2026-11-11 22:00:00+00:00 [COMMAND="bash driver.sh"]\n',
  );
  const footer = Buffer.from(
    '\nScript done on 2026-11-11 22:00:09+00:00 [COMMAND_EXIT_CODE="0"]\n',
  );
  const timing = writes
    .map(([delay], index) => `${delay} ${bodies[index]?.length ?? 0}`)
    .join("\n");
  return { log: Buffer.concat([header, ...bodies, footer]), timing: `${timing}\n` };
}

verifies("recording.capture", () => {
  describe("castFromScriptLog", () => {
    test("keeps each write's real time and puts a labelled marker where a command is typed", () => {
      const { log, timing } = scriptLog([
        [0.5, "~ $ \x1b]5179;ty"],
        [0.25, "pe;echo hi\x07echo hi\r\n\x1b]5179;enter\x07hi\r\n"],
        [1, "\r\n~ $ "],
      ]);
      const cast = castFromScriptLog(log, timing, echoRecording());
      expect(cast.events).toEqual([
        { time: 0, kind: "o", data: "~ $ " },
        { time: 0.25, kind: "m", data: "echo hi" },
        { time: 0.25, kind: "o", data: "echo hi\r\n" },
        { time: 0.25, kind: "o", data: "hi\r\n" },
        { time: 1.25, kind: "o", data: "\r\n~ $ " },
      ]);
      expect(cast.header).toMatchObject({
        version: 2,
        width: 20,
        height: 3,
        title: "Terminal · acme",
      });
    });

    test("keeps a character whose bytes span two writes whole", () => {
      const tick = Buffer.from("✓", "utf8");
      const { log, timing } = scriptLog([
        [0, Buffer.concat([Buffer.from("a "), tick.subarray(0, 2)])],
        [0.1, Buffer.concat([tick.subarray(2), Buffer.from(" b")])],
      ]);
      const cast = castFromScriptLog(log, timing, echoRecording());
      expect(cast.events.map((event) => event.data).join("")).toBe("a ✓ b");
    });

    test("stops with the failure when a command in the session failed", () => {
      const { log, timing } = scriptLog([[0, "nope\r\n\x1b]5179;failed;127\x07"]]);
      expect(() => castFromScriptLog(log, timing, echoRecording())).toThrow(/failed \(127\)/);
    });

    test("refuses a log without script's header line", () => {
      expect(() => castFromScriptLog(Buffer.from("hello\n"), "0 5\n", echoRecording())).toThrow(
        /header/,
      );
    });
  });

  describe("driverScript", () => {
    test("echoes and runs each command, with {name} filled from its unseen set command", () => {
      const recording = echoRecording({
        commands: [
          {
            run: "halonic runs send {run} approve",
            typing: 1,
            hold: 0,
            set: { run: "printf 4a6b83" },
          },
        ],
      });
      const script = driverScript(recording);
      expect(script).toContain('run=$( (printf 4a6b83) 2>/dev/null ) && [ -n "$run" ]');
      expect(script).toContain(`printf '%s\\n' "halonic runs send \${run} approve"`);
      // biome-ignore lint/suspicious/noTemplateCurlyInString: bash's own expansion, written literally
      expect(script).toContain('halonic runs send "${run}" approve\n');
    });

    test("escapes what bash would expand in the echoed line", () => {
      const script = driverScript(
        echoRecording({ commands: [{ run: 'echo "$HOME" `id`', typing: 1, hold: 0 }] }),
      );
      expect(script).toContain(`printf '%s\\n' "echo \\"\\$HOME\\" \\\`id\\\`"`);
    });
  });
});
