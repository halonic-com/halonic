import type { Routine } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { PlacedRoutine } from "./due.ts";
import { type RunSignals, type SignalSent, signalsDue } from "./signals-due.ts";

const at = (iso: string) => new Date(iso);

function placed(trigger: object, id = "on-paid", enabled = true): PlacedRoutine {
  const routine = {
    version: 1,
    id,
    name: id,
    enabled,
    trigger,
    overlap: "skip",
    catchUp: "none",
    run: { workflow: "w", input: {} },
  } as unknown as Routine;
  return { hub: null, routine };
}

function sent(seq: number, iso: string, name = "invoice.paid", data = {}): SignalSent {
  return { id: `run-1:${seq}`, name, data, at: iso };
}

const onPaid = placed({ signal: { name: "invoice.paid" } });
const lastTick = at("2026-11-20T10:00:00Z");
const now = at("2026-11-20T10:01:00Z");
const run = (...signals: SignalSent[]): RunSignals => ({ id: "run-1", signals });

verifies("routines.signals-due", () => {
  it("starts a routine on a signal of its name, naming the signal and the run", () => {
    const paid = sent(4, "2026-11-20T10:00:30Z", "invoice.paid", { vendor: "Acme" });
    expect(signalsDue([onPaid], [run(paid)], lastTick, now)).toEqual([
      {
        key: "@workspace/on-paid",
        placed: onPaid,
        at: at("2026-11-20T10:00:30Z"),
        trigger: "signal",
        signal: { id: "run-1:4", name: "invoice.paid", data: { vendor: "Acme" } },
        sentBy: "run-1",
      },
    ]);
  });

  it("ignores a signal of another name", () => {
    const other = sent(4, "2026-11-20T10:00:30Z", "invoice.sent");
    expect(signalsDue([onPaid], [run(other)], lastTick, now)).toEqual([]);
  });

  it("starts only on the signals that pass `when`, read as trigger.signal", () => {
    const filtered = placed({
      signal: { name: "invoice.paid", when: { exists: "{{trigger.signal.vendor}}" } },
    });
    const withVendor = sent(4, "2026-11-20T10:00:30Z", "invoice.paid", { vendor: "Acme" });
    const without = sent(5, "2026-11-20T10:00:40Z");
    const starts = signalsDue([filtered], [run(withVendor, without)], lastTick, now);
    expect(starts.map((start) => start.signal.id)).toEqual(["run-1:4"]);
  });

  it("lets `when` read the time the signal was sent as trigger.at", () => {
    const morning = placed({
      signal: {
        name: "invoice.paid",
        when: { equals: ["{{trigger.at}}", "2026-11-20T10:00:30.000Z"] },
      },
    });
    const signals = [sent(4, "2026-11-20T10:00:30Z"), sent(5, "2026-11-20T10:00:31Z")];
    const starts = signalsDue([morning], [run(...signals)], lastTick, now);
    expect(starts.map((start) => start.signal.id)).toEqual(["run-1:4"]);
  });

  it("counts a signal sent by a workflow step's child run like any other", () => {
    const child = {
      id: "child-1",
      parentRunId: "run-1",
      signals: [sent(2, "2026-11-20T10:00:30Z")],
    };
    const starts = signalsDue([onPaid], [child], lastTick, now);
    expect(starts.map((start) => start.sentBy)).toEqual(["child-1"]);
  });

  it("looks two minutes back past the last tick, and no further", () => {
    const late = sent(4, "2026-11-20T09:58:30Z");
    const tooOld = sent(3, "2026-11-20T09:57:59Z");
    const starts = signalsDue([onPaid], [run(tooOld, late)], lastTick, now);
    expect(starts.map((start) => start.signal.id)).toEqual(["run-1:4"]);
  });

  it("counts a signal sent exactly now and none sent after it", () => {
    const signals = [sent(4, "2026-11-20T10:01:00Z"), sent(5, "2026-11-20T10:01:00.001Z")];
    const starts = signalsDue([onPaid], [run(...signals)], lastTick, now);
    expect(starts.map((start) => start.signal.id)).toEqual(["run-1:4"]);
  });

  it("drops signals older than the 7-day catch-up window", () => {
    const signals = [sent(1, "2026-11-12T10:01:00Z"), sent(2, "2026-11-14T10:01:00Z")];
    const longAgo = at("2026-11-11T10:01:00Z");
    const starts = signalsDue([onPaid], [run(...signals)], longAgo, now);
    expect(starts.map((start) => start.signal.id)).toEqual(["run-1:2"]);
  });

  it("starts no disabled routine and no routine on another trigger", () => {
    const disabled = placed({ signal: { name: "invoice.paid" } }, "off", false);
    const hourly = placed({ schedule: "0 * * * *" }, "hourly");
    const signals = [run(sent(4, "2026-11-20T10:00:30Z"))];
    expect(signalsDue([disabled, hourly], signals, lastTick, now)).toEqual([]);
  });

  it("starts nothing without a last tick, or when now is not after it", () => {
    const signals = [run(sent(4, "2026-11-20T10:00:00Z"))];
    expect(signalsDue([onPaid], signals, null, now)).toEqual([]);
    expect(signalsDue([onPaid], signals, now, now)).toEqual([]);
  });

  it("orders starts oldest first, then by key, then by signal id", () => {
    const audit = placed({ signal: { name: "invoice.paid" } }, "audit");
    const first = { id: "run-2", signals: [{ ...sent(1, "2026-11-20T10:00:10Z"), id: "run-2:1" }] };
    const second = run(sent(7, "2026-11-20T10:00:20Z"), sent(6, "2026-11-20T10:00:20Z"));
    const starts = signalsDue([onPaid, audit], [second, first], lastTick, now);
    expect(starts.map((start) => `${start.key} ${start.signal.id}`)).toEqual([
      "@workspace/audit run-2:1",
      "@workspace/on-paid run-2:1",
      "@workspace/audit run-1:6",
      "@workspace/audit run-1:7",
      "@workspace/on-paid run-1:6",
      "@workspace/on-paid run-1:7",
    ]);
  });
});
