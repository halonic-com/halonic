import { describe, expect, it } from "vitest";
import { runExample } from "../examples/load-a-workspace.ts";
import { runExample as runTrustContentExample } from "../examples/trust-content.ts";

describe("the README examples", () => {
  it("load a workspace and give the results its comments promise", async () => {
    expect(await runExample()).toEqual({
      agents: ["billing/clerk"],
      issues: ["hubs/billing/agents/checker.agent.yaml:3 output.type invalid_union"],
      ignored: ["README.md"],
    });
  });

  it("build the trust content its comment promises", () => {
    expect(runTrustContentExample()).toEqual({
      connectors: [
        {
          version: 1,
          id: "mail",
          transport: "stdio",
          settings: {
            command: "node",
            path: "/usr/bin/node",
            args: ["./scripts/mail.js", "--inbox", "work"],
            cwd: ".",
            env: { MODE: "safe" },
            secretEnv: { MAIL_TOKEN: "‹secret mail-token›" },
          },
          tools: { approve: ["send_mail"] },
        },
      ],
    });
  });
});
