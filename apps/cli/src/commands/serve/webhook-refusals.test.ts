import type { Server } from "@halonicjs/host-server";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type Phrase, plainText } from "../../messages/phrase.ts";
import { reportWebhookRefusals } from "./webhook-refusals.ts";

const reason =
  "{{trigger.date}} isn't a trigger value. Use {{trigger.at}}, {{trigger.lastRun}}, {{trigger.body}} or {{trigger.headers.<name>}}.";

/** A server that answers every request with `status` and an error body. */
function answering(status: number, message = reason): Server {
  return {
    handle: async () => Response.json({ code: "some_code", message }, { status }),
  };
}

/** The lines printed while `server` answers one POST to `path`, and that answer. */
async function printedFor(
  server: Server,
  path: string,
): Promise<{ lines: string[]; response: Response }> {
  const printed: Phrase[] = [];
  const reported = reportWebhookRefusals(server, {
    routineName: async (key) => (key === "reports/weekly-report" ? "Weekly report" : null),
    print: (line) => printed.push(line),
  });
  const response = await reported.handle(
    new Request(`http://localhost:4747${path}`, { method: "POST", body: "{}" }),
  );
  return { lines: printed.map(plainText), response };
}

verifies("cli.commands.serve.webhook-refusals", () => {
  describe("a refused webhook delivery's line", () => {
    it("names the routine and the server's reason for a 400, and passes the answer on", async () => {
      const { lines, response } = await printedFor(
        answering(400),
        "/api/webhooks/reports/weekly-report",
      );

      expect(lines).toEqual([`✕ Weekly report didn't start on a web request: ${reason}`]);
      expect(response.status).toBe(400);
      expect(((await response.json()) as { message: string }).message).toBe(reason);
    });

    it("points to --debug for a 500", async () => {
      const { lines } = await printedFor(answering(500), "/api/webhooks/reports/weekly-report");

      expect(lines).toEqual([
        "✕ Weekly report didn't start on a web request · see why with --debug",
      ]);
    });

    it("names the address when no routine is there", async () => {
      const { lines } = await printedFor(answering(400), "/api/webhooks/reports/gone");

      expect(lines).toEqual([`✕ reports/gone didn't start on a web request: ${reason}`]);
    });

    it("prints nothing for an unsigned request, a start, or a refusal outside webhooks", async () => {
      const quiet = [
        await printedFor(answering(401), "/api/webhooks/reports/weekly-report"),
        await printedFor(answering(202), "/api/webhooks/reports/weekly-report"),
        await printedFor(answering(400), "/api/runs"),
      ];

      expect(quiet.flatMap(({ lines }) => lines)).toEqual([]);
    });
  });
});
