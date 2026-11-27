import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { answerRowFault } from "./wait-card.ts";

/** A 600px row, and its answers on one line at their natural width, Approve at the right end. */
const row = { x: 0, y: 100, width: 600, height: 40 };
const reject = { x: 400, y: 104, width: 80, height: 32 };
const approve = { x: 488, y: 104, width: 112, height: 32 };

verifies("studio-click-test.wait-card-row", () => {
  it("passes one right-aligned row with Approve at its right end", () => {
    expect(answerRowFault(row, approve, reject)).toBeUndefined();
  });

  it("fails when Approve is on a line under Reject", () => {
    expect(answerRowFault(row, { ...approve, x: 0, y: 140 }, reject)).toMatch(/aren't in one row/);
  });

  it("fails when Approve is at the left of Reject, naming every box", () => {
    const left = answerRowFault(row, { ...approve, x: 280 }, { ...reject, x: 520 });
    expect(left).toBe(
      "Approve isn't at the right of Reject (row 600×40 at 0,100, Approve 112×32 at 280,104, Reject 80×32 at 520,104).",
    );
  });

  it("fails when Approve doesn't end the row", () => {
    expect(answerRowFault(row, { ...approve, x: 400 }, { ...reject, x: 300 })).toMatch(
      /right edge/,
    );
  });

  it("fails when the answers are stretched to fill the row", () => {
    const stretched = answerRowFault(
      row,
      { ...approve, x: 304, width: 296 },
      { ...reject, x: 0, width: 296 },
    );
    expect(stretched).toMatch(/natural width/);
  });
});
