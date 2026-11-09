import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  type ArgumentCheck,
  type ArgumentIssue,
  type ArgumentSchema,
  type MakeError,
  runTool,
  type ToolImplementation,
} from "./run-tool.ts";

interface EchoArguments {
  readonly text: string;
  readonly times: number;
}

/**
 * Checks `{ text, times? }` like `z.strictObject({ text: z.string().max(10),
 * times: z.int().min(1).default(1) })`. The kit has no Zod, so its tests use
 * this stand-in; the integrations repo runs `runTool` with real Zod schemas.
 */
const echoArguments: ArgumentSchema<EchoArguments> = {
  safeParse(input: unknown): ArgumentCheck<EchoArguments> {
    if (typeof input !== "object" || input === null) {
      return failure([{ path: [] }]);
    }
    const { text, times = 1, ...extra } = input as Record<string, unknown>;
    const issues: ArgumentIssue[] = [];
    if (typeof text !== "string" || text.length > 10) issues.push({ path: ["text"] });
    if (typeof times !== "number" || !Number.isInteger(times) || times < 1) {
      issues.push({ path: ["times"] });
    }
    // Zod reports unknown keys once, on the object itself.
    if (Object.keys(extra).length > 0) issues.push({ path: [] });
    if (issues.length > 0) return failure(issues);
    return { success: true, data: { text: text as string, times: times as number } };
  },
};

function failure(issues: ArgumentIssue[]): ArgumentCheck<never> {
  return { success: false, error: { issues } };
}

const echoTool = {
  declaration: {
    name: "test_echo",
    description: "Repeats text.",
    parameters: { type: "object", required: ["text"] },
    risk: "read",
    untrusted: false,
  },
  arguments: echoArguments,
  async run(prefix, args, signal) {
    signal?.throwIfAborted();
    return { text: `${prefix}${args.text.repeat(args.times)}` };
  },
} satisfies ToolImplementation<string, typeof echoArguments>;

class TestError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
const makeError: MakeError = (code, message) => new TestError(code, message);

verifies("integration-kit.run-tool", () => {
  it("runs the named tool with the parsed arguments and returns its result as JSON", async () => {
    const result = await runTool(
      [echoTool],
      ">",
      { name: "test_echo", args: { text: "ab" } },
      makeError,
    );
    expect(JSON.parse(result)).toEqual({ text: ">ab" });
  });

  it("passes the call's signal to the tool", async () => {
    const call = runTool(
      [echoTool],
      "",
      { name: "test_echo", args: { text: "ab" }, signal: AbortSignal.abort("stop") },
      makeError,
    );
    await expect(call).rejects.toBe("stop");
  });

  it("refuses an unknown tool as not-found and shortens the name it repeats", async () => {
    const call = runTool([echoTool], "", { name: "x".repeat(200), args: {} }, makeError);
    await expect(call).rejects.toMatchObject({
      code: "not-found",
      message: `There is no tool named ${"x".repeat(64)}.`,
    });
  });

  it("names each bad argument once, never its value", async () => {
    const call = runTool(
      [echoTool],
      "",
      { name: "test_echo", args: { text: "a secret sentence", times: 0, extra: 1 } },
      makeError,
    );
    await expect(call).rejects.toMatchObject({
      code: "bad-arguments",
      message: "Check these arguments: text, times, (arguments).",
    });
    await expect(call).rejects.not.toThrow(/secret sentence/);
  });

  it("names a field whose path holds a number or a symbol", async () => {
    const nested: ArgumentSchema = {
      safeParse: () => failure([{ path: ["to", 0] }, { path: [Symbol("key")] }]),
    };
    const tool = { ...echoTool, arguments: nested, run: async () => "never" };
    const call = runTool([tool], "", { name: "test_echo", args: {} }, makeError);
    await expect(call).rejects.toMatchObject({
      message: "Check these arguments: to.0, Symbol(key).",
    });
  });
});
