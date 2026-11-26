import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { RequestLog, type RequestLogEntry } from "./request-log.ts";

/** An entry for the request number `n`, to tell entries apart. */
function entry(n: number): RequestLogEntry {
  return { method: "GET", host: "api.example.com", path: `/${n}`, durationMs: n, outcome: "ok" };
}

verifies("integration-kit.request-log", () => {
  it("keeps entries oldest first", () => {
    const log = new RequestLog();
    log.add(entry(1));
    log.add(entry(2));
    expect(log.entries().map((e) => e.path)).toEqual(["/1", "/2"]);
  });

  it("drops the oldest entries past its limit", () => {
    const log = new RequestLog(2);
    [1, 2, 3].forEach((n) => {
      log.add(entry(n));
    });
    expect(log.entries().map((e) => e.path)).toEqual(["/2", "/3"]);
  });

  it("hands out a copy, so a reader can't change the log", () => {
    const log = new RequestLog();
    log.add(entry(1));
    log.entries().pop();
    expect(log.entries()).toHaveLength(1);
  });

  it("hands each new entry to a listener until it stops listening, and a listener that throws doesn't stop the log", () => {
    const log = new RequestLog();
    const heard: string[] = [];
    log.onEntry(() => {
      throw new Error("broken listener");
    });
    const stop = log.onEntry((added) => heard.push(added.path));
    log.add(entry(1));
    stop();
    log.add(entry(2));
    expect(heard).toEqual(["/1"]);
    expect(log.entries()).toHaveLength(2);
  });
});
