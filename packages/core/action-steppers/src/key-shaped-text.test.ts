import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { findKeyShapedText } from "./key-shaped-text.ts";

const mixed = (times: number) => "A1b2".repeat(times);

/**
 * One invented value per rule of the leak guard (`packages/core/std/src/secret-rules.ts`),
 * put together at run time so this file holds no value the guard would flag.
 */
const leakGuardShapes: [string, string][] = [
  ["private-key", ["-----BEGIN ", "RSA PRIVATE KEY-----"].join("")],
  ["aws-access-key", ["AKIA", "QWERTYUI", "7".repeat(8)].join("")],
  ["github-token", ["ghp_", mixed(9)].join("")],
  ["github-fine-grained", ["github_pat_", mixed(6)].join("")],
  ["npm-token", ["npm_", mixed(9)].join("")],
  ["slack-token", ["xoxb-", "1234567890-", mixed(4)].join("")],
  ["google-api-key", ["AIza", "Sy", mixed(9)].join("")],
  ["google-client-secret", ["GOCSPX-", mixed(6)].join("")],
  ["oauth-code", ["?code=", "4/0", mixed(6)].join("")],
  ["stripe-key", ["sk_", "live_", mixed(6)].join("")],
  ["ai-provider-key", ["sk-", "ant-", mixed(6)].join("")],
  ["signed-token", ["eyJ", mixed(4), ".eyJ", mixed(4), ".", mixed(6)].join("")],
  ["gitlab-token", ["glpat-", mixed(6)].join("")],
  ["huggingface-token", ["hf_", mixed(9)].join("")],
  ["password-in-url", ["https://ops:", "hunter", "2hunter2", "@build.acme.example"].join("")],
  ["npm-auth-token", [":_authToken=", mixed(6)].join("")],
];

verifies("action-steppers.server-session-brief", () => {
  describe("findKeyShapedText", () => {
    it.each(leakGuardShapes)("finds the leak guard's %s shape", (_rule, value) => {
      expect(findKeyShapedText(`Then use ${value} on the server.`)).toBeDefined();
    });

    it.each([
      "Check out 3f2c9a1b4d5e6f708192a3b4c5d6e7f8091a2b3c and run the tests.",
      "Push the branch tomas/HAL-17834-server-session-core.",
      "Edit packages/core/action-steppers/src/server-session-launch.ts.",
      "The run id is 550e8400-e29b-41d4-a716-446655440000.",
      "Restart WORKER2 on build.acme.example, then read https://build.acme.example/health.",
    ])("lets ordinary text through: %s", (text) => {
      expect(findKeyShapedText(text)).toBeUndefined();
    });
  });
});
