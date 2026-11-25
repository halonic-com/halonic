import type { RuntimeHost, ToolDeclaration, ToolRunContext } from "./host.ts";
import { HostLink } from "./host-link.ts";
import { rpcHost, type ToolRun } from "./rpc-host.ts";
import {
  type Frame,
  frame,
  hostCallTimeoutMs,
  maxFrameLength,
  parseFrame,
  pinnedSdkVersion,
  pluginApiVersion,
  RpcError,
  rpcErrors,
} from "./worker-protocol.ts";

/**
 * Our own client for Paperclip's plugin worker protocol: it answers
 * Paperclip's `initialize`, `health`, `shutdown` and `executeTool`, and gives
 * the runtime a `RuntimeHost` whose calls go back to Paperclip. It uses only
 * built-in web APIs, so the worker ships no Paperclip code.
 */

/** The worker's two pipes: Paperclip's lines in, the worker's lines out. */
export interface WorkerStreams {
  readonly input: AsyncIterable<string | Uint8Array>;
  readonly write: (line: string) => void;
}

/** What `initialize` hands the plugin: its manifest, as installed, and its settings. */
export interface WorkerStart {
  readonly capabilities: readonly string[];
  readonly tools: readonly ToolDeclaration[];
  readonly config: Readonly<Record<string, unknown>>;
}

/** Registers the plugin's tools on the host, once, when Paperclip initializes the worker. */
export type WorkerSetup = (host: RuntimeHost, start: WorkerStart) => void | Promise<void>;

type Request = Extract<Frame, { kind: "request" }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Cuts text into whole lines, keeping a partial line for the next text. A
 * line longer than the limit comes out once, cut at the limit, so it gets
 * refused, and the rest of it is dropped up to its newline.
 */
function lineSplitter(): (text: string) => string[] {
  let buffered = "";
  let dropping = false;
  return (text) => {
    buffered += text;
    const lines: string[] = [];
    for (let end = buffered.indexOf("\n"); end !== -1; end = buffered.indexOf("\n")) {
      const line = buffered.slice(0, end);
      buffered = buffered.slice(end + 1);
      if (dropping) dropping = false;
      else if (line.trim() !== "") lines.push(line);
    }
    if (buffered.length > maxFrameLength) {
      if (!dropping) lines.push(buffered);
      dropping = true;
      buffered = "";
    }
    return lines;
  };
}

/** The input's lines, as text. */
async function* lines(input: AsyncIterable<string | Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  const split = lineSplitter();
  for await (const chunk of input) {
    yield* split(typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true }));
  }
}

/** Reads `initialize`'s params, or refuses them: another API version, or no manifest. */
function readStart(params: unknown): WorkerStart {
  if (!isRecord(params) || params["apiVersion"] !== pluginApiVersion) {
    const version = isRecord(params) ? JSON.stringify(params["apiVersion"]) : "none";
    throw new RpcError(
      rpcErrors.invalidParams,
      `Paperclip speaks plugin API version ${version}, but this worker was written for version ${pluginApiVersion} (plugin SDK ${pinnedSdkVersion}). Rebuild the plugin with a runtime for this Paperclip.`,
    );
  }
  const manifest = params["manifest"];
  if (!isRecord(manifest) || !Array.isArray(manifest["capabilities"])) {
    throw new RpcError(rpcErrors.invalidParams, "initialize has no manifest with capabilities.");
  }
  return {
    capabilities: manifest["capabilities"].filter(
      (name): name is string => typeof name === "string",
    ),
    tools: Array.isArray(manifest["tools"]) ? (manifest["tools"] as ToolDeclaration[]) : [],
    config: isRecord(params["config"]) ? params["config"] : {},
  };
}

/** Reads `executeTool`'s params, or refuses them. */
function readToolCall(params: unknown) {
  const runContext = isRecord(params) ? params["runContext"] : undefined;
  const named = isRecord(params) && typeof params["toolName"] === "string";
  const scoped =
    isRecord(runContext) &&
    typeof runContext["agentId"] === "string" &&
    typeof runContext["companyId"] === "string";
  if (!named || !scoped) {
    throw new RpcError(
      rpcErrors.invalidParams,
      "executeTool needs a toolName and a runContext with an agent and a company.",
    );
  }
  return {
    toolName: String(params["toolName"]),
    parameters: params["parameters"],
    runContext: runContext as unknown as ToolRunContext,
  };
}

/** Starts the worker on its pipes; `done` settles when Paperclip shuts it down or closes its input. */
export function startWorker(
  streams: WorkerStreams,
  setup: WorkerSetup,
  options: { readonly timeoutMs?: number } = {},
): { readonly done: Promise<void> } {
  const send = (message: Record<string, unknown>) => {
    try {
      streams.write(frame(message));
    } catch {
      // Paperclip closed the pipe; the worker stops when its input ends.
    }
  };
  const link = new HostLink(send, options.timeoutMs ?? hostCallTimeoutMs);
  const tools = new Map<string, ToolRun>();
  let initialized = false;
  let stop: () => void = () => {};
  const stopped = new Promise<void>((resolve) => {
    stop = resolve;
  });

  async function initialize(params: unknown) {
    if (initialized)
      throw new RpcError(rpcErrors.invalidRequest, "the worker is already initialized.");
    const start = readStart(params);
    initialized = true;
    link.allow(start.capabilities);
    await setup(rpcHost(link, tools), start);
    return { ok: true, supportedMethods: [] };
  }

  async function executeTool(params: unknown, invocationId?: string) {
    if (!initialized)
      throw new RpcError(rpcErrors.invalidRequest, "the worker isn't initialized yet.");
    const { toolName, parameters, runContext } = readToolCall(params);
    const run = tools.get(toolName);
    if (run === undefined)
      throw new RpcError(rpcErrors.workerError, `no tool ${toolName} is registered.`);
    return run(parameters, runContext, rpcHost(link, tools, invocationId));
  }

  async function dispatch(request: Request): Promise<unknown> {
    switch (request.method) {
      case "initialize":
        return initialize(request.params);
      case "health":
        return { status: "ok" };
      case "shutdown":
        queueMicrotask(stop);
        return null;
      case "executeTool":
        return executeTool(request.params, request.invocationId);
      default:
        throw new RpcError(rpcErrors.methodNotFound, `the worker has no method ${request.method}.`);
    }
  }

  async function answer(request: Request) {
    try {
      send({ id: request.id, result: (await dispatch(request)) ?? null });
    } catch (error) {
      const code = error instanceof RpcError ? error.code : rpcErrors.workerError;
      send({ id: request.id, error: { code, message: (error as Error).message } });
    }
  }

  function receive(message: Frame) {
    if (message.kind === "request") void answer(message);
    else if (message.kind === "result" || message.kind === "error") link.receive(message);
    else if (message.kind === "invalid")
      send({ id: message.id, error: { code: message.code, message: message.message } });
  }

  const reading = (async () => {
    try {
      for await (const line of lines(streams.input)) receive(parseFrame(line));
    } catch {
      // A broken input pipe ends the worker like a closed one.
    }
  })();
  return { done: Promise.race([reading, stopped]).finally(() => link.stop()) };
}
