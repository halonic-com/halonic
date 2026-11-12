import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { commands } from "./generated/commands.ts";
import { commandOrder } from "./help.ts";

verifies("cli.help", () => {
  it("names every command after its folder, so the help shows the word you type", () => {
    for (const [folder, command] of Object.entries(commands)) {
      expect(command.name).toBe(folder);
    }
  });

  it("places every command in the help's order, so a new one can't drop to the bottom unnoticed", () => {
    for (const folder of Object.keys(commands)) {
      expect(commandOrder).toContain(folder);
    }
  });
});
