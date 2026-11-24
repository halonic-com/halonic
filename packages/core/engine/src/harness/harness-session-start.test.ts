import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { runCallOn as runOn } from "./harness-call-test-kit.test-helper.ts";
import { finished, harnessPorts } from "./harness-test-kit.test-helper.ts";

verifies("engine.harness-session-start", () => {
  it("says the harness session started fresh, because Halonic doesn't resume one yet", async () => {
    const ports = harnessPorts();
    ports.harness.events = [finished("Done")];

    const { written } = await runOn(ports);

    expect(written.find((event) => event.type === "harness.started")).toMatchObject({
      session: { start: "fresh", reason: "no-resume" },
    });
  });
});
