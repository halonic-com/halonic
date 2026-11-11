import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expectTypeOf } from "vitest";
import type {
  ApprovalResolver,
  ModelSkipReason,
  RunFailureReason,
  StoredBlob,
  ToolNoun,
  ToolOutcome,
  ToolRisk,
  ToolVerb,
} from "./run-basics.ts";
import type { RunEventBody, RunEventType } from "./run-event.ts";
import type { LoggedSandboxBlock } from "./sandbox-blocked.ts";
import type { DeniedPathGroupCode, SandboxOpenedView, SandboxStrength } from "./sandbox-opened.ts";

// Type tests for the run log fields added after the reference shapes in
// run-event.test.ts, one requirement each.

type EventOf<T extends RunEventType> = Extract<RunEventBody, { type: T }>;

verifies("events.tool-result-outcome", () => {
  typeTest("says how a tool call ended: ok, error or unknown", () => {
    expectTypeOf<ToolOutcome>().toEqualTypeOf<"ok" | "error" | "unknown">();
    expectTypeOf<EventOf<"tool.result">["outcome"]>().toEqualTypeOf<ToolOutcome | undefined>();
  });
});

verifies("events.tool-result-risk", () => {
  typeTest("says what a tool can do: read, write or send", () => {
    expectTypeOf<ToolRisk>().toEqualTypeOf<"read" | "write" | "send">();
    expectTypeOf<EventOf<"tool.result">["risk"]>().toEqualTypeOf<ToolRisk | undefined>();
  });

  typeTest("names what one call sends in the singular and the plural", () => {
    expectTypeOf<ToolNoun>().toEqualTypeOf<{ one: string; many: string }>();
    expectTypeOf<EventOf<"tool.result">["noun"]>().toEqualTypeOf<ToolNoun | undefined>();
  });

  typeTest("says what one call did to its noun: sent, saved, created, updated or moved", () => {
    expectTypeOf<ToolVerb>().toEqualTypeOf<"sent" | "saved" | "created" | "updated" | "moved">();
    expectTypeOf<EventOf<"tool.result">["verb"]>().toEqualTypeOf<ToolVerb | undefined>();
  });

  typeTest("takes a sending call with its noun and verb, and a call without them", () => {
    expectTypeOf({
      type: "tool.result",
      agent: "writer",
      tool: "send_email",
      result: "sent",
      outcome: "ok",
      risk: "send",
      noun: { one: "email", many: "emails" },
    } as const).toExtend<EventOf<"tool.result">>();
    expectTypeOf({
      type: "tool.result",
      agent: "writer",
      tool: "drive_create_file",
      result: "saved",
      outcome: "ok",
      risk: "send",
      noun: { one: "file", many: "files" },
      verb: "saved",
    } as const).toExtend<EventOf<"tool.result">>();
    expectTypeOf({
      type: "tool.result",
      agent: "writer",
      tool: "search_email",
      result: "[]",
      risk: "read",
    } as const).toExtend<EventOf<"tool.result">>();
    expectTypeOf({
      type: "tool.result",
      agent: "writer",
      tool: "lookup",
      result: "[]",
    } as const).toExtend<EventOf<"tool.result">>();
  });
});

verifies("events.agent-finished-error", () => {
  typeTest("says why an agent failed without failing the run", () => {
    expectTypeOf<EventOf<"agent.finished">["error"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<EventOf<"agent.finished">["reason"]>().toEqualTypeOf<
      RunFailureReason | undefined
    >();
  });
});

verifies("events.approval-resolved-by", () => {
  typeTest("says who resolved an approval: a person or a rule", () => {
    expectTypeOf<ApprovalResolver>().toEqualTypeOf<"person" | "rule">();
    expectTypeOf<EventOf<"approval.resolved">["by"]>().toEqualTypeOf<
      ApprovalResolver | undefined
    >();
  });
});

verifies("events.sandbox-opened", () => {
  typeTest("records a sandboxed step's display copy of its profile and nothing else", () => {
    expectTypeOf<EventOf<"sandbox.opened">>().toEqualTypeOf<{
      type: "sandbox.opened";
      state: string;
      agent: string;
      sandbox: SandboxOpenedView;
    }>();
    expectTypeOf<SandboxOpenedView>().toEqualTypeOf<{
      strength: SandboxStrength;
      workingFolder: string;
      readOnlyPaths: string[];
      deniedGroups: DeniedPathGroupCode[];
      deniedPaths: string[];
      allowedSites: string[];
      timeLimitMs: number;
    }>();
    expectTypeOf<SandboxStrength>().toEqualTypeOf<"os" | "vm" | "remote">();
    expectTypeOf<DeniedPathGroupCode>().toEqualTypeOf<
      | "ssh-keys"
      | "cloud-sign-ins"
      | "browser-data"
      | "password-stores"
      | "halonic-data"
      | "agent-settings"
    >();
  });
});

verifies("events.sandbox-off", () => {
  typeTest("records a step that ran without the sandbox and when the person chose that", () => {
    expectTypeOf<EventOf<"sandbox.off">>().toEqualTypeOf<{
      type: "sandbox.off";
      state: string;
      agent: string;
      chosenAt: string;
    }>();
  });
});

verifies("events.llm-skipped", () => {
  typeTest("names the skipped alias, its model, why, and the alias tried instead", () => {
    expectTypeOf<EventOf<"llm.skipped">>().toEqualTypeOf<{
      type: "llm.skipped";
      agent: string;
      alias: string;
      provider: string;
      model: string;
      reason: ModelSkipReason;
      next?: string;
    }>();
    expectTypeOf<ModelSkipReason>().toEqualTypeOf<"no-key">();
  });

  typeTest("leaves next out when no alias is left", () => {
    const last: RunEventBody = {
      type: "llm.skipped",
      agent: "writer",
      alias: "default",
      provider: "openai",
      model: "gpt-mini",
      reason: "no-key",
    };
    expectTypeOf(last).toMatchTypeOf<RunEventBody>();
  });
});

verifies("events.tool-call-as-text", () => {
  typeTest("marks an answer whose text is a tool call, and is absent otherwise", () => {
    expectTypeOf<EventOf<"llm.response">["toolCallAsText"]>().toEqualTypeOf<true | undefined>();
    // @ts-expect-error: the mark is set or absent, never false
    expectTypeOf<false>().toMatchTypeOf<EventOf<"llm.response">["toolCallAsText"]>();
  });
});

verifies("events.started-events", () => {
  typeTest("records that a step's sandbox is being opened, and how long the engine waits", () => {
    expectTypeOf<EventOf<"sandbox.started">>().toEqualTypeOf<{
      type: "sandbox.started";
      state: string;
      agent: string;
      timeoutMs: number;
    }>();
  });

  typeTest("records that a step's harness is being started, and how long the engine waits", () => {
    expectTypeOf<EventOf<"harness.started">>().toEqualTypeOf<{
      type: "harness.started";
      state: string;
      agent: string;
      harness: string;
      timeoutMs: number;
    }>();
  });
});

verifies("events.sandbox-blocked", () => {
  typeTest("records a refused access and how many accesses it stands for", () => {
    expectTypeOf<EventOf<"sandbox.blocked">>().toEqualTypeOf<{
      type: "sandbox.blocked";
      state: string;
      agent: string;
      block: LoggedSandboxBlock;
      count: number;
    }>();
  });
});

verifies("events.tool-result-blob", () => {
  typeTest("keeps a large result's hash, size and media type", () => {
    expectTypeOf<StoredBlob>().toEqualTypeOf<{ hash: string; size: number; mediaType: string }>();
    expectTypeOf<EventOf<"tool.result">["resultBlob"]>().toEqualTypeOf<StoredBlob | undefined>();
  });

  typeTest("takes a result with its start and a blob, and one without a blob", () => {
    expectTypeOf({
      type: "tool.result",
      agent: "clerk",
      tool: "export",
      result: "id,amount\n1,12.50",
      outcome: "ok",
      resultBlob: { hash: "a".repeat(64), size: 300_000, mediaType: "text/plain" },
    } as const).toExtend<EventOf<"tool.result">>();
    expectTypeOf({
      type: "tool.result",
      agent: "clerk",
      tool: "export",
      result: "id,amount",
    } as const).toExtend<EventOf<"tool.result">>();
  });
});

verifies("events.waiting-description", () => {
  typeTest("lets run.waiting carry the filled-in title and body, both optional", () => {
    expectTypeOf<EventOf<"run.waiting">["title"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<EventOf<"run.waiting">["body"]>().toEqualTypeOf<string | undefined>();
  });
});

verifies("events.answer-labels", () => {
  typeTest("lets run.waiting carry its answers' labels, optional", () => {
    expectTypeOf<EventOf<"run.waiting">["labels"]>().toEqualTypeOf<
      Record<string, string> | undefined
    >();
  });
});
