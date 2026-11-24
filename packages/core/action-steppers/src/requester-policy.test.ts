import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  type AttestedSource,
  decideRequester,
  defaultRequesterPolicy,
  type RequesterPolicy,
} from "./requester-policy.ts";

const acmeRuns: AttestedSource = { kind: "halonic", id: "acme" };
const paperclip: AttestedSource = { kind: "paperclip", id: "paperclip.acme.example" };
const releaseBotOnly: RequesterPolicy = {
  allowed: [{ source: acmeRuns, agents: ["release-bot"] }],
};

verifies("action-steppers.requester-policy", () => {
  describe("decideRequester", () => {
    it("lets anyone ask for a routine request under the default policy, and nobody for more", () => {
      expect(decideRequester(defaultRequesterPolicy, paperclip, undefined, "routine")).toBe(
        "allowed",
      );
      expect(decideRequester(defaultRequesterPolicy, paperclip, undefined, "admin")).toBe(
        "blocked",
      );
      expect(decideRequester(defaultRequesterPolicy, paperclip, undefined, "irreversible")).toBe(
        "blocked",
      );
    });

    it("always lets the user's own request run", () => {
      expect(
        decideRequester(
          defaultRequesterPolicy,
          { kind: "user", id: "" },
          undefined,
          "irreversible",
        ),
      ).toBe("allowed");
    });

    it("keys on the attested source, not on the agent the request claims", () => {
      expect(decideRequester(releaseBotOnly, paperclip, "release-bot", "admin")).toBe("blocked");
    });

    it("lets a named agent only narrow the rule", () => {
      expect(decideRequester(releaseBotOnly, acmeRuns, "other-bot", "admin")).toBe("blocked");
      expect(decideRequester(releaseBotOnly, acmeRuns, undefined, "admin")).toBe("blocked");
      expect(decideRequester(releaseBotOnly, acmeRuns, "release-bot", "admin")).toBe("allowed");
    });

    it("lets any agent of an allowed source run when the rule names none", () => {
      expect(
        decideRequester({ allowed: [{ source: acmeRuns }] }, acmeRuns, "other-bot", "irreversible"),
      ).toBe("allowed");
    });
  });
});
