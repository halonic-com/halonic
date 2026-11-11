import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { paintFor } from "../output/paint.ts";
import { extractMessages } from "./extract.ts";
import { dim, plainText, renderPhrase } from "./phrase.ts";

const noUses = { connectors: [], skills: [], knowledge: [], collections: [] };

verifies("cli.commands.extract.extract-hub", () => {
  it("names each kind of shared item with its ids, separated like the counts line", () => {
    const shared = extractMessages.shared({
      ...noUses,
      skills: ["tone"],
      collections: ["chores", "people"],
    });

    expect(plainText(shared.phrase)).toBe(
      "Shared items: skills: tone · collections: chores, people",
    );
    expect(shared.phrase[0]).toEqual(dim("Shared items: skills: tone"));
    const oldConsole = paintFor({ colour: false, live: false, unicode: false });
    expect(renderPhrase(shared.phrase, oldConsole)).toBe(
      "Shared items: skills: tone - collections: chores, people",
    );
  });

  it("leaves out the kinds the hub takes nothing of", () => {
    const shared = extractMessages.shared({ ...noUses, connectors: ["mailbox"] });

    expect(plainText(shared.phrase)).toBe("Shared items: connectors: mailbox");
  });
});
