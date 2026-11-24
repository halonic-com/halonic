import type { CodingToolsServer } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { runCallOn } from "./harness-call-test-kit.test-helper.ts";
import { finished, harnessPorts } from "./harness-test-kit.test-helper.ts";

const server: CodingToolsServer = {
  program: "<halonic>/node",
  args: ["coding-tools"],
  codePaths: ["<halonic>"],
};

verifies("engine.run-harness", () => {
  it("gives the harness the coding tools server the profile allows", async () => {
    const ports = harnessPorts();
    ports.harness.events = [finished("ok")];
    const { profiles } = ports.options;
    const built = profiles.profileOf.bind(profiles);
    vi.spyOn(profiles, "profileOf").mockImplementation(async (...args) => ({
      ...(await built(...args)),
      codingTools: server,
    }));

    await runCallOn(ports);

    expect(ports.harness.tasks[0]?.codingTools).toEqual(server);
  });

  it("gives the harness no coding tools server when the profile names none", async () => {
    const ports = harnessPorts();
    ports.harness.events = [finished("ok")];

    await runCallOn(ports);

    expect(ports.harness.tasks[0]).not.toHaveProperty("codingTools");
  });
});
