import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { followSystemRegion, systemRegion } from "./system-region.ts";

const answering = (answer: unknown) => ({ invoke: async () => answer }) as never;
const failing = () =>
  ({
    invoke: async () => {
      throw new Error("no locale");
    },
  }) as never;

verifies("studio.entry", () => {
  it("asks the shell for the system region (HAL-9452)", async () => {
    const commands: string[] = [];
    const invoke = async (command: string) => {
      commands.push(command);
      return "de-CH";
    };

    expect(await systemRegion({ invoke } as never)).toBe("de-CH");
    expect(commands).toEqual(["system_region"]);
  });

  it("reads nothing when the shell names no region or fails", async () => {
    expect(await systemRegion(answering(null))).toBeUndefined();
    expect(await systemRegion(failing())).toBeUndefined();
  });

  it("applies the region once, unless the window stopped first", async () => {
    const applied: string[] = [];
    followSystemRegion(answering("fr-FR"), (region) => applied.push(region));
    followSystemRegion(answering("it-IT"), (region) => applied.push(region))();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(applied).toEqual(["fr-FR"]);
  });
});
