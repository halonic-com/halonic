import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { stepName } from "./step-name.ts";

/** The four steps of Acme's support-reply workflow, with their descriptions as written there. */
const acmeSteps = {
  read: "Read the email",
  classify: "Classify it",
  draft: "Draft a reply",
  review:
    "Approve this reply?\n{{context.reply}}\n\nSample: approving finishes the run. Nothing is sent.",
};

verifies("cli.step-name", () => {
  it("names each Acme step by the first line of its description", () => {
    expect(stepName("read", acmeSteps.read)).toBe("Read the email");
    expect(stepName("classify", acmeSteps.classify)).toBe("Classify it");
    expect(stepName("draft", acmeSteps.draft)).toBe("Draft a reply");
    expect(stepName("review", acmeSteps.review)).toBe("Approve this reply?");
  });

  it("names each Acme step by its id with a capital when it has no description", () => {
    expect(stepName("read")).toBe("Read");
    expect(stepName("classify")).toBe("Classify");
    expect(stepName("draft")).toBe("Draft");
    expect(stepName("review")).toBe("Review");
  });

  it("trims the first line and falls back to the id when it is empty", () => {
    expect(stepName("draft", "  Draft a reply  \nMore")).toBe("Draft a reply");
    expect(stepName("draft", "")).toBe("Draft");
    expect(stepName("draft", "   \nSecond line")).toBe("Draft");
  });

  it("makes only the first letter a capital and leaves the rest of the id as it is", () => {
    expect(stepName("draftReply")).toBe("DraftReply");
    expect(stepName("not-replied")).toBe("Not-replied");
  });
});
