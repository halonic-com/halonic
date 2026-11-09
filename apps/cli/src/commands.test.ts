import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { commands } from "./generated/commands.ts";

verifies("cli.help", () => {
  it("names every command after its folder, so the help shows the word you type", () => {
    for (const [folder, command] of Object.entries(commands)) {
      expect(command.name).toBe(folder);
    }
  });
});
