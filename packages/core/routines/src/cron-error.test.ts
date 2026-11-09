import { errorKindOf } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { CronError } from "./cron-error.ts";
import { parseCron } from "./parse-cron.ts";

verifies("routines.cron-rejects-bad-expressions", () => {
  it("is an invalid_input error", () => {
    expect(errorKindOf(new CronError("Cron needs 5 fields."))).toBe("invalid_input");
  });

  it("is invalid_input when thrown by the parser", () => {
    let caught: unknown;
    try {
      parseCron("* * * *");
    } catch (error) {
      caught = error;
    }
    expect(errorKindOf(caught)).toBe("invalid_input");
  });
});
