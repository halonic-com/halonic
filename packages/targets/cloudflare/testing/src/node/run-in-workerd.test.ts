import { describe, expect, it } from "vitest";
import { runSuitesInWorkerd } from "./run-in-workerd.ts";

let wrapped = false;

// The cases register through `wrap`, here under a describe of this file's own.
await runSuitesInWorkerd([new URL("../worker/suites/clock.ts", import.meta.url)], {
  wrap: (register) => {
    wrapped = true;
    describe("registered through wrap", register);
  },
});

describe("runSuitesInWorkerd", () => {
  it("hands the cases to the wrap option to register", () => {
    expect(wrapped).toBe(true);
  });
});
