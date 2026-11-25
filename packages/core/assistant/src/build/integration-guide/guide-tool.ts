// The Build chat's `integration_guide` tool (`assistant.build.integration-guide`):
// one section of the pinned integration guide at a time.

import type { ChatTool } from "@halonicjs/app";
import { textArgument } from "../build-chat.ts";
import { toolTexts } from "../tool-texts.ts";
import { integrationGuideSection, integrationGuideSections } from "./sections.ts";

/** `integration_guide`: one top-level section of the guide, by its name. */
export function integrationGuideTool(): ChatTool {
  const names = integrationGuideSections.map((section) => section.name);
  return {
    definition: {
      name: "integration_guide",
      description:
        "Reads one section of the guide for writing a Halonic integration. Read it before you write or change an integration: start with Contents, then each section you need.",
      parameters: {
        type: "object",
        properties: { section: { type: "string", enum: names } },
        required: ["section"],
      },
    },
    async call(toolCall) {
      const name = textArgument(toolCall.arguments, "section");
      const section = integrationGuideSection(name);
      return section === undefined
        ? toolTexts.unknownGuideSection(name, names)
        : section.text.trimEnd();
    },
  };
}
