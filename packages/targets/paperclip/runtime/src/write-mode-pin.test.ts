import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { acmeSnapshot, fakeHost, githubToken, publishedSnapshot } from "./fake-host.test-helper.ts";
import type { ActionCall, ActionHandlers } from "./handlers.ts";
import { writingTool } from "./paperclip-writes.test-helper.ts";
import { writeMode } from "./paperclip-writes.ts";
import { registerWorkspaceTools } from "./register.ts";

const declarations = [
  { name: "acme_tool", displayName: "acme_tool", description: "", parametersSchema: {} },
];

/** A comment tool in `mode`, or with no mode when `mode` is null. */
function commentTool(mode: "dry-run" | "write" | null) {
  return writingTool("paperclip.comment", mode === null ? null : { mode });
}

/**
 * A plugin built with `built` and pinned to a snapshot with `pinned`, whose
 * comment handler records the mode it would run in and writes nothing.
 */
async function plugin(built: ReturnType<typeof commentTool>, pinned: typeof built) {
  const modes: string[] = [];
  const handlers: ActionHandlers = {
    "paperclip.comment": {
      capabilities: [],
      run: async (call: ActionCall) => {
        modes.push(writeMode(call.tool));
        return { content: "ran" };
      },
    },
  };
  const published = await publishedSnapshot(acmeSnapshot({ tools: [pinned] }));
  const host = fakeHost({ githubToken, ...published.pin }, published.answers);
  const builtIn = acmeSnapshot({
    workspace: { name: "acme", commit: "0".repeat(40) },
    tools: [built],
  });
  registerWorkspaceTools(host.ctx, { declarations, builtIn, handlers });
  return { call: host.call, modes };
}

verifies("runtime.paperclip-writes", () => {
  describe("a pinned snapshot's mode", () => {
    test("can't switch a tool built in dry run to write: the tool is off", async () => {
      for (const built of [commentTool("dry-run"), commentTool(null)]) {
        const { call, modes } = await plugin(built, commentTool("write"));
        expect(await call("acme_tool", {})).toEqual({
          error:
            "acme_tool is off: the workspace snapshot 1111111111111111111111111111111111111111 sets mode: write, which the plugin wasn't built with; that needs a new plugin build.",
        });
        expect(modes).toEqual([]);
      }
    });

    test("may switch a tool built to write back to dry run", async () => {
      const { call, modes } = await plugin(commentTool("write"), commentTool("dry-run"));
      expect(await call("acme_tool", {})).toEqual({ content: "ran" });
      expect(modes).toEqual(["dry-run"]);
    });

    test("may keep a tool built to write in write", async () => {
      const { call, modes } = await plugin(commentTool("write"), commentTool("write"));
      expect(await call("acme_tool", {})).toEqual({ content: "ran" });
      expect(modes).toEqual(["write"]);
    });
  });
});
