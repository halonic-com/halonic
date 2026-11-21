import type { Secrets } from "@halonicjs/ports";
import type { PlacedRoutine } from "@halonicjs/routines";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { plainText } from "../../messages/phrase.ts";
import { webhookRoutineLines } from "./webhook-routines.ts";

const address = "http://localhost:4747";

/** A routine of the notes hub with the given trigger, on unless `enabled` is false. */
function placed(
  id: string,
  trigger: object,
  enabled = true,
  input: Record<string, string> = {},
): PlacedRoutine {
  return {
    hub: "notes",
    routine: {
      version: 1,
      id,
      name: id === "friday-digest" ? "Friday digest" : id,
      enabled,
      trigger,
      run: { workflow: "announce", input },
      overlap: "skip",
      catchUp: "last",
    },
  } as PlacedRoutine;
}

const webhook = { webhook: { secret: "friday-hook", headers: [] } };

/** A secrets store that knows only the given values. */
function secretsOf(values: Record<string, string>): Secrets {
  return { get: async (name) => values[name] ?? null };
}

async function lines(routines: PlacedRoutine[], secrets: Secrets): Promise<string[]> {
  return (await webhookRoutineLines(routines, secrets, address)).map(plainText);
}

verifies("cli.commands.serve.serve", () => {
  describe("the webhook routines' lines", () => {
    it("gives the address of a webhook routine whose secret is set", async () => {
      expect(
        await lines([placed("friday-digest", webhook)], secretsOf({ "friday-hook": "s" })),
      ).toEqual([
        "Friday digest starts on a web request at http://localhost:4747/api/webhooks/notes/friday-digest",
      ]);
    });

    it("adds a ✕ line when the secret has no value, or an empty one", async () => {
      const notSet =
        "✕ Friday digest won't start: its secret friday-hook isn't set. Set it with: halonic secret set friday-hook";
      for (const secrets of [secretsOf({}), secretsOf({ "friday-hook": "" })]) {
        expect((await lines([placed("friday-digest", webhook)], secrets))[1]).toBe(notSet);
      }
    });

    it("adds a ✕ line without a set command when the secret's name belongs to Halonic", async () => {
      const ownName = { webhook: { secret: "serve-password", headers: [] } };

      expect(
        await lines([placed("friday-digest", ownName)], secretsOf({ "serve-password": "s" })),
      ).toEqual([
        "Friday digest starts on a web request at http://localhost:4747/api/webhooks/notes/friday-digest",
        "✕ Friday digest won't start: its secret name serve-password belongs to Halonic or a plugin. Use a name of your own in its routine file.",
      ]);
    });

    it("leaves out a webhook routine that is off, and routines no web request starts", async () => {
      const routines = [
        placed("friday-digest", webhook, false),
        placed("hourly", { every: "1h" }),
        placed("by-hand", { manual: true }),
      ];

      expect(await lines(routines, secretsOf({}))).toEqual([]);
    });
  });
});

verifies("cli.commands.serve.webhook-refusals", () => {
  it("adds a ✕ line with validate's reason when the routine has a value its trigger hasn't", async () => {
    const routine = placed("friday-digest", webhook, true, {
      day: "{{trigger.date}}",
      also: "{{trigger.when}}",
    });

    expect(await lines([routine], secretsOf({ "friday-hook": "s" }))).toEqual([
      "Friday digest starts on a web request at http://localhost:4747/api/webhooks/notes/friday-digest",
      "✕ Friday digest won't start: {{trigger.date}} isn't a trigger value. Use {{trigger.at}}, {{trigger.lastRun}}, {{trigger.body}} or {{trigger.headers.<name>}}.",
    ]);
  });
});
