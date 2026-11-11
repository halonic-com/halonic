import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { Message } from "./define.ts";
import { plainText } from "./phrase.ts";
import { workflowMessages } from "./workflow.ts";

const words = (message: Message) => plainText(message.phrase);

verifies("cli.messages", () => {
  it("lists a workspace's workflows once each, or says it has none", () => {
    expect([
      words(
        workflowMessages.seeWorkflows("acme", ["support-reply", "weekly-report", "support-reply"]),
      ),
      words(workflowMessages.seeWorkflows("acme", [])),
    ]).toEqual(["Workflows in acme: support-reply, weekly-report.", "acme has no workflows yet."]);
  });
});
