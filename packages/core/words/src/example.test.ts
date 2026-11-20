import { describe, expect, it } from "vitest";
import { runExample } from "../examples/word-a-doctor-line.ts";

describe("the README example", () => {
  it("gives the words its comments promise", () => {
    expect(runExample()).toEqual({
      key: "doctor.diskFree",
      free: "48 GB free · Halonic uses 1.4 GB (run logs 1.1 GB)",
      low: "Low on disk space: 0.8 GB free",
    });
  });
});
