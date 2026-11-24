import {
  effectiveToolScriptLimits,
  type ToolScriptIsolate,
  type ToolScriptIsolateFunction,
  type ToolScriptIsolateFunctions,
  type ToolScriptIsolateResult,
  type ToolScriptIsolateValue,
  type ToolScriptLimits,
  toolScriptDefaultLimits,
} from "@halonicjs/ports";

/** Makes the isolate under test. */
export type MakeToolScriptIsolate = () => ToolScriptIsolate | Promise<ToolScriptIsolate>;

/** One fence run: the functions on `ctx`, the input and lower limits. */
export interface FenceRun {
  readonly functions?: ToolScriptIsolateFunctions;
  readonly input?: ToolScriptIsolateValue;
  readonly limits?: Partial<ToolScriptLimits>;
  readonly signal?: AbortSignal;
}

/** A script module whose `run(ctx)` has `body` as its body. */
export function script(body: string): string {
  return `export async function run(ctx) {\n${body}\n}\n`;
}

/** Runs plain JavaScript in the isolate with the agent defaults, lowered by `run.limits`. */
export async function runScript(
  make: MakeToolScriptIsolate,
  code: string,
  run: FenceRun = {},
): Promise<ToolScriptIsolateResult> {
  const isolate = await make();
  return isolate.run({
    runId: `fence-${crypto.randomUUID()}`,
    code,
    input: run.input ?? null,
    functions: run.functions ?? {},
    limits: effectiveToolScriptLimits(isolate.limits, toolScriptDefaultLimits.agent, run.limits),
    ...(run.signal === undefined ? {} : { signal: run.signal }),
  });
}

/** A host function that records each argument it got and answers with `answer`. */
export function recorder(answer: ToolScriptIsolateValue = null): {
  readonly calls: ToolScriptIsolateValue[];
  readonly fn: ToolScriptIsolateFunction;
} {
  const calls: ToolScriptIsolateValue[] = [];
  return {
    calls,
    fn: async (args) => {
      calls.push(args);
      return answer;
    },
  };
}

/** A host function whose answer the test gives later, with `release`. */
export function held(): {
  readonly calls: number;
  readonly fn: ToolScriptIsolateFunction;
  release(value?: ToolScriptIsolateValue): void;
} {
  const waiting: ((value: ToolScriptIsolateValue) => void)[] = [];
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    fn: () => {
      calls += 1;
      return new Promise<ToolScriptIsolateValue>((resolve) => waiting.push(resolve));
    },
    release: (value = null) => {
      for (const resolve of waiting.splice(0)) resolve(value);
    },
  };
}

/** Lets every pending host promise and microtask run. */
export async function settleHost(): Promise<void> {
  for (let round = 0; round < 10; round += 1) await Promise.resolve();
}
