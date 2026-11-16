import { describe, expect, it } from "vitest";
import { itemFilePath, itemFileRef } from "./item-file.ts";

describe("itemFilePath", () => {
  it("names a skill's SKILL.md, in a hub or shared", () => {
    expect(itemFilePath("skill", { hub: "support", id: "tone" })).toBe(
      "hubs/support/library/skills/tone/SKILL.md",
    );
    expect(itemFilePath("skill", { hub: null, id: "tone" })).toBe("library/skills/tone/SKILL.md");
  });

  it("names the one file of the other kinds", () => {
    expect(itemFilePath("knowledge", { hub: null, id: "faq" })).toBe("library/knowledge/faq.yaml");
    expect(itemFilePath("collection", { hub: "p", id: "claims" })).toBe(
      "library/collections/claims.collection.yaml",
    );
    expect(itemFilePath("connector", { hub: null, id: "mail" })).toBe(
      "library/connectors/mail.connector.yaml",
    );
  });

  it("opens as a file tab of the workspace folder", () => {
    expect(itemFileRef("skill", { hub: null, id: "tone" })).toEqual({
      kind: "file",
      hub: "workspace",
      id: "library/skills/tone/SKILL.md",
    });
  });
});
