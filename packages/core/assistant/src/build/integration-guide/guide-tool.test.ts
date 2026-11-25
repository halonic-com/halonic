import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { chatTools } from "../../testing/call-tool.test-helper.ts";
import { testWorkspace } from "../../testing/test-workspace.test-helper.ts";
import { builtInAuthoringInstructions } from "../authoring-skill.ts";
import { integrationGuideText } from "./guide.generated.ts";
import {
  guideSections,
  integrationGuideSection,
  integrationGuideSections,
  introductionName,
} from "./sections.ts";
import { integrationGuideSource } from "./source.ts";

/** The SHA-256 of `text`'s UTF-8 bytes, in lowercase hex. */
async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The guide's top-level headings, as its own Contents lists them. */
const topLevelSections = [
  "Contents",
  "1. What an integration is",
  "2. Where it goes and what it's called",
  "3. The permission sheet comes first",
  "4. Talking to the service",
  "5. Tools",
  "6. Model providers, MCP and knowledge sources",
  "7. Errors",
  "8. Readable code",
  "9. Tests and recordings",
  "10. What an integration must never do",
  "11. Shipping",
];

verifies("assistant.build.integration-guide", () => {
  describe("the pinned copy", () => {
    it("matches the SHA-256 recorded for its source commit", async () => {
      expect(integrationGuideSource.commit).toMatch(/^[0-9a-f]{40}$/u);
      expect(await sha256(integrationGuideText)).toBe(integrationGuideSource.sha256);
    });

    it("fails the check once a single character is edited", async () => {
      const edited = integrationGuideText.replace("Writing", "Writting");
      expect(await sha256(edited)).not.toBe(integrationGuideSource.sha256);
    });
  });

  describe("integration_guide", () => {
    const call = chatTools(testWorkspace({}));

    it.each(topLevelSections)("returns the section %j by its name", async (name) => {
      const text = await call("integration_guide", { section: name });
      expect(text.startsWith(`## ${name}\n`)).toBe(true);
      expect(text).not.toMatch(/\n## /u);
    });

    it("returns the title and opening as the Introduction", async () => {
      const text = await call("integration_guide", { section: introductionName });
      expect(text.startsWith("# Writing a Halonic integration\n")).toBe(true);
      expect(text).not.toContain("## Contents");
    });

    it("offers every section and nothing else, and the sections together are the whole guide", () => {
      expect(integrationGuideSections.map((section) => section.name)).toEqual([
        introductionName,
        ...topLevelSections,
      ]);
      const joined = integrationGuideSections.map((section) => section.text).join("\n");
      expect(joined).toBe(integrationGuideText);
    });

    it("finds a section whatever its case and the spaces around it", () => {
      expect(integrationGuideSection("  5. TOOLS ")?.name).toBe("5. Tools");
    });

    it("refuses an unknown section plainly, naming the sections", async () => {
      const text = await call("integration_guide", { section: "Pricing" });
      expect(text).toBe(
        `Error: the integration guide has no section "Pricing". The sections are: ${[introductionName, ...topLevelSections].map((name) => `"${name}"`).join(", ")}.`,
      );
    });
  });

  it("doesn't start a section at a heading inside a code block", () => {
    const guide = "# Guide\nHi.\n## 1. Start\n```md\n## not a section\n```\n## 2. End\nBye.\n";
    expect(guideSections(guide).map((section) => section.name)).toEqual([
      introductionName,
      "1. Start",
      "2. End",
    ]);
  });

  it("tells the model to read the guide before it writes an integration", () => {
    expect(builtInAuthoringInstructions).toContain(
      "Before you write or change one, read the integration guide with `integration_guide`",
    );
  });
});
