import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { editSkillText, readSkillText } from "./skill-text.ts";

const skill = [
  "---",
  "name: Acme refunds # shown in the list",
  "description: Use for refund questions",
  "license: MIT",
  "allowed-tools: Read",
  "---",
  "",
  "## Refunds",
  "Refund within 14 days.",
  "",
].join("\n");

function edited(change: Parameters<typeof editSkillText>[1], text = skill): string {
  const result = editSkillText(text, change);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
}

verifies("app.skill-text", () => {
  it("reads the parts and lists the other header fields in order", () => {
    expect(readSkillText(skill)).toEqual({
      ok: true,
      value: {
        name: "Acme refunds",
        description: "Use for refund questions",
        instructions: "## Refunds\nRefund within 14 days.",
        otherHeader: [
          { key: "license", value: "MIT" },
          { key: "allowed-tools", value: "Read" },
        ],
      },
    });
  });

  it("keeps the other header fields and the comment when the description changes", () => {
    expect(edited({ description: "Use for returns" })).toBe(
      skill.replace("Use for refund questions", "Use for returns"),
    );
  });

  it("keeps the comment when the name changes", () => {
    expect(edited({ name: "Refunds" })).toContain("name: Refunds # shown in the list");
  });

  it("writes nothing when the given parts are unchanged", () => {
    expect(
      edited({
        name: "Acme refunds",
        description: "Use for refund questions",
        instructions: "## Refunds\nRefund within 14 days.",
      }),
    ).toBe(skill);
  });

  it("changes the instructions and keeps the blank line under the header", () => {
    expect(edited({ instructions: "Be kind." })).toBe(
      skill.replace("## Refunds\nRefund within 14 days.\n", "Be kind.\n"),
    );
  });

  it("refuses an empty name or description", () => {
    expect(editSkillText(skill, { name: "   " })).toEqual({
      ok: false,
      error: "name_missing",
    });
    expect(editSkillText(skill, { description: "" })).toEqual({
      ok: false,
      error: "description_missing",
    });
  });

  it("says a file without a header is unreadable", () => {
    expect(readSkillText("Just text")).toEqual({
      ok: false,
      error: "unreadable",
    });
    expect(editSkillText("Just text", { name: "A" })).toEqual({
      ok: false,
      error: "unreadable",
    });
  });

  it("shows a header value that isn't text as JSON", () => {
    const text = "---\nname: A\ndescription: B\ntools: [Read, Grep]\n---\n";
    expect(readSkillText(text)).toMatchObject({
      value: { otherHeader: [{ key: "tools", value: '["Read","Grep"]' }] },
    });
  });

  it("leaves a block-scalar description alone when it is unchanged", () => {
    const text = "---\nname: A\ndescription: |\n  Use for refunds\n---\nBody\n";
    expect(edited({ description: "Use for refunds" }, text)).toBe(text);
  });

  it("starts added instructions on a new line when the file ends at the closing line", () => {
    expect(edited({ instructions: "Be kind." }, "---\nname: A\ndescription: B\n---")).toBe(
      "---\nname: A\ndescription: B\n---\nBe kind.\n",
    );
  });

  it("keeps a blank line before the closing line when nothing changed", () => {
    const text = "---\nname: A\ndescription: B\n\n---\nBody\n";
    expect(edited({ name: "A" }, text)).toBe(text);
  });

  it("doesn't pass the old body's indentation on to new instructions", () => {
    expect(
      edited({ instructions: "Be kind." }, "---\nname: A\ndescription: B\n---\n    old code\n"),
    ).toBe("---\nname: A\ndescription: B\n---\nBe kind.\n");
  });
});
