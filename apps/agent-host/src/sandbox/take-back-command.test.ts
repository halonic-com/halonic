import { PassThrough } from "node:stream";
import { SrtSandbox } from "@halonicjs/adapter-sandbox-srt";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type HostIo, run } from "../host.ts";

type TakeBackResult = Awaited<ReturnType<SrtSandbox["takeBack"]>>;

/** A sandbox whose take-back answers `result`, and counts how often it was asked into `asked`. */
function sandboxAnswering(result: TakeBackResult, asked: { count: number }): SrtSandbox {
  return Object.assign(new SrtSandbox(), {
    takeBack: async () => {
      asked.count += 1;
      return result;
    },
  });
}

/** Host input and output that keep what the host prints. */
function starter(): { io: HostIo; lines: string[] } {
  const lines: string[] = [];
  const io: HostIo = {
    input: new PassThrough(),
    write: (text) => void lines.push(text),
    writeError: () => {},
    takeOutput: () => new PassThrough(),
  };
  return { io, lines };
}

verifies("agent-host.sandbox-take-back", () => {
  describe("--sandbox-take-back", () => {
    it("prints what the take-back did on one JSON line, and exits with 0 when it is done", async () => {
      for (const outcome of ["taken_back", "none"] as const) {
        const { io, lines } = starter();
        const asked = { count: 0 };
        const sandbox = sandboxAnswering({ ok: true, outcome }, asked);
        expect(await run(["--sandbox-take-back"], "1.2.3", io, () => sandbox)).toBe(0);
        expect(asked.count).toBe(1);
        expect(lines).toEqual([`{"ok":true,"outcome":"${outcome}"}\n`]);
      }
    });

    it("exits with 1 when it ran with administrator rights or srt couldn't forget the grants", async () => {
      for (const outcome of ["elevated", "failed"] as const) {
        const { io, lines } = starter();
        const sandbox = sandboxAnswering({ ok: false, outcome }, { count: 0 });
        expect(await run(["--sandbox-take-back"], "1.2.3", io, () => sandbox)).toBe(1);
        expect(lines).toEqual([`{"ok":false,"outcome":"${outcome}"}\n`]);
      }
    });

    it("runs when a profile folder is given too, and doesn't serve", async () => {
      const { io, lines } = starter();
      const sandbox = sandboxAnswering({ ok: true, outcome: "none" }, { count: 0 });
      const args = ["--profile-folder", "/nowhere", "--sandbox-take-back"];
      expect(await run(args, "1.2.3", io, () => sandbox)).toBe(0);
      expect(lines).toEqual(['{"ok":true,"outcome":"none"}\n']);
    });
  });
});
