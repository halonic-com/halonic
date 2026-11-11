import type { Agent, Skill } from "@halonicjs/format";
import type { ChatMessage } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { KernelRuns, writerAgent } from "../kernel/kernel-test-kit.test-helper.ts";
import { call, callAnswer, textAnswer } from "../testing/scripted-model.ts";
import { delegationHint } from "../tools/subagents/subagent-tools.ts";
import { agentSystemPrompt, connectorHint } from "./agent-system-prompt.ts";
import { type RunsSetup, replyStart, runsOn } from "./local-runs-test-kit.test-helper.ts";

/** Runs the reply workflow to its end on the given answers and setup. */
async function runReply(answers: Parameters<typeof runsOn>[0], setup: RunsSetup) {
  const started = runsOn(answers, new KernelRuns(), setup);
  await started.executor.start(replyStart);
  await started.scheduler.runDue();
  return started;
}

/** An agent of the `acme` hub with the writer's defaults. */
function agent(id: string, fields: Partial<Agent> = {}): Agent {
  return { ...writerAgent(), id, name: id, ...fields };
}

const houseStyle: Skill = {
  id: "house-style",
  name: "House style",
  description: "How Acme writes.",
  body: "Use short sentences.",
};

/** The roles of a request's messages, in order. */
function roles(messages: readonly ChatMessage[] | undefined): string[] {
  return (messages ?? []).map((message) => message.role);
}

verifies("engine.run-agent-instructions", () => {
  it("sends the agent's instructions and skills as a system message before the step's prompt", async () => {
    const writer = agent("writer", {
      instructions: "  You write replies.\n",
      skills: ["house-style"],
    });

    const { model } = await runReply([textAnswer("Dear support")], {
      agents: { writer },
      skills: { "house-style": houseStyle },
    });

    const messages = model.requests[0]?.messages;
    expect(roles(messages)).toEqual(["system", "user"]);
    expect(messages?.[0]?.content).toBe(
      "You write replies.\n\n## Skill: House style\nHow Acme writes.\n\nUse short sentences.",
    );
  });

  it("leaves out a skill the run's definitions don't have", () => {
    const writer = agent("writer", { instructions: "You write replies.", skills: ["missing"] });

    expect(agentSystemPrompt(writer, { "house-style": houseStyle })).toBe("You write replies.");
  });

  it("sends the step's prompt alone for an agent with nothing to tell, or with no file", async () => {
    const withDefaults = await runReply([textAnswer("Dear support")], {
      agents: { writer: agent("writer") },
    });
    const withoutFile = await runReply([textAnswer("Dear support")], {});

    expect(roles(withDefaults.model.requests[0]?.messages)).toEqual(["user"]);
    expect(roles(withoutFile.model.requests[0]?.messages)).toEqual(["user"]);
  });

  it("adds the subagent and connector lines, and how to reply for a choice or JSON", () => {
    const chooser = agent("writer", {
      subagents: ["checker"],
      connectors: ["mail"],
      output: { type: "choice", options: ["yes", "no"] },
    });
    const json = agent("writer", { output: { type: "json", schema: { type: "object" } } });

    expect(agentSystemPrompt(chooser, {})).toBe(
      [delegationHint, connectorHint, "Reply with exactly one of: yes, no. No other words."].join(
        "\n\n",
      ),
    );
    expect(agentSystemPrompt(json, {})).toBe(
      'Reply with JSON only. It must match this JSON Schema: {"type":"object"}',
    );
    expect(agentSystemPrompt(agent("writer", { output: { type: "json" } }), {})).toBe(
      "Reply with JSON only.",
    );
  });

  it("gives a subagent its own instructions and skills, before the task it was handed", async () => {
    const writer = agent("writer", { instructions: "You write replies.", subagents: ["checker"] });
    const checker = agent("checker", {
      instructions: "You check replies.",
      skills: ["house-style"],
    });

    const { model } = await runReply(
      [
        callAnswer(call("d-1", "delegate_checker", { task: "Check the reply to support" })),
        textAnswer("Looks good"),
        textAnswer("Dear support"),
      ],
      { agents: { writer, checker }, skills: { "house-style": houseStyle } },
    );

    expect(model.requests[1]?.messages).toEqual([
      {
        role: "system",
        content:
          "You check replies.\n\n## Skill: House style\nHow Acme writes.\n\nUse short sentences.",
      },
      { role: "user", content: "Check the reply to support" },
    ]);
  });
});
