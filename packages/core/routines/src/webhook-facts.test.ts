import { parseFile } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { PlacedRoutine } from "./due.ts";
import { routineStart } from "./routine-start.ts";
import { webhookFacts } from "./webhook-facts.ts";

const at = new Date("2026-11-13T08:00:00Z");

function routineOf(headers: string, run = "run: { agent: a, prompt: '{{trigger.body}}' }") {
  const text = `id: orders\nname: Orders\ntrigger: { webhook: { secret: acme-hook, headers: ${headers} } }\n${run}\n`;
  const parsed = parseFile("routine", text, {});
  if (!parsed.ok) {
    expect.fail(JSON.stringify(parsed.error));
  }
  const routine = parsed.value.value;
  return { routine, placed: { hub: "h", routine } satisfies PlacedRoutine };
}

verifies("routines.webhook-facts", () => {
  const { routine } = routineOf("[x-event]");

  it("parses a JSON body, whatever its charset", () => {
    const facts = webhookFacts(routine.trigger, {
      at,
      body: '{"n":1}',
      headers: { "content-type": "application/json; charset=utf-8" },
    });
    expect(facts.body).toEqual({ n: 1 });
    const vendor = webhookFacts(routine.trigger, {
      at,
      body: "[2]",
      headers: { "content-type": "application/vnd.acme+json" },
    });
    expect(vendor.body).toEqual([2]);
  });

  it("keeps the text when the body says JSON but isn't, or says nothing", () => {
    const broken = webhookFacts(routine.trigger, {
      at,
      body: "{nope",
      headers: { "content-type": "application/json" },
    });
    expect(broken.body).toBe("{nope");
    const silent = webhookFacts(routine.trigger, { at, body: '{"n":1}', headers: {} });
    expect(silent.body).toBe('{"n":1}');
  });

  it("passes only the headers the routine lists", () => {
    const facts = webhookFacts(routine.trigger, {
      at,
      body: "",
      headers: { "x-event": "paid", authorization: "Bearer x", cookie: "s=1" },
    });
    expect(facts.headers).toEqual({ "x-event": "paid" });
  });

  it("never reads Object.prototype for a listed name", () => {
    const { routine: odd } = routineOf("[constructor]");
    expect(webhookFacts(odd.trigger, { at, body: "", headers: {} }).headers).toEqual({});
  });

  it("gives a routine without a webhook no headers", () => {
    const manual = { manual: true } as const;
    expect(webhookFacts(manual, { at, body: "", headers: { "x-event": "paid" } }).headers).toEqual(
      {},
    );
  });

  it("never fills in a placeholder that came in with the request", () => {
    const { routine: own, placed } = routineOf("[x-event]");
    const facts = webhookFacts(own.trigger, {
      at,
      body: "{{trigger.headers.x-event}}",
      headers: { "x-event": "secret-looking" },
    });
    expect(routineStart(placed, facts)).toMatchObject({ prompt: "{{trigger.headers.x-event}}" });
  });

  it("fills the placeholders of a workflow's input from the body and a header", () => {
    const { routine: own, placed } = routineOf(
      "[x-event]",
      "run: { workflow: w, input: { order: '{{trigger.body.id}}', event: '{{trigger.headers.x-event}}' } }",
    );
    const facts = webhookFacts(own.trigger, {
      at,
      body: '{"id":"o-7"}',
      headers: { "content-type": "application/json", "x-event": "paid" },
    });
    expect(routineStart(placed, facts)).toMatchObject({
      workflow: "w",
      input: { order: "o-7", event: "paid" },
    });
  });
});
