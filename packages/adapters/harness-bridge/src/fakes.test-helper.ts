import { request as httpRequest } from "node:http";
import {
  type HarnessBridgeOptions,
  harnessBridgeTokenHeader,
  type OpenHarnessBridge,
} from "@halonicjs/ports";

/** Stands in for every part of the run the bridge's own checks never use. */
async function notUsedYet(): Promise<never> {
  throw new Error("The bridge skeleton doesn't use this part of the run.");
}

/** A run with no providers, tools or approvals: enough for the bridge's own checks. */
export function fakeRun(signal?: AbortSignal): HarnessBridgeOptions {
  return {
    runId: "run_1",
    agentId: "writer",
    providers: {},
    price: () => null,
    recorder: { record: notUsedYet },
    tools: { list: notUsedYet, check: notUsedYet, call: notUsedYet },
    approvals: { request: notUsedYet },
    ...(signal === undefined ? {} : { signal }),
  };
}

/** What a test request sends besides its path. */
export interface TestRequest {
  method?: string;
  /** The run token to send; `undefined` sends none. */
  token?: string;
  body?: string;
  /** More headers, such as `origin`, or a `host` other than the bridge's own. */
  headers?: Record<string, string>;
}

/**
 * Sends one request to the bridge and reads the whole reply. It uses Node's
 * `http` rather than `fetch`, so a test can send any `Host` header.
 */
export function send(
  bridge: OpenHarnessBridge,
  path: string,
  request: TestRequest = {},
): Promise<{ status: number; text: string }> {
  const headers: Record<string, string> = { ...request.headers };
  if (request.token !== undefined) headers[harnessBridgeTokenHeader] = request.token;
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest(
      new URL(path, bridge.url),
      { method: request.method ?? "POST", headers },
      (reply) => {
        const chunks: Buffer[] = [];
        reply.on("data", (chunk: Buffer) => chunks.push(chunk));
        reply.on("end", () =>
          resolve({ status: reply.statusCode ?? 0, text: Buffer.concat(chunks).toString() }),
        );
        reply.on("error", reject);
      },
    );
    outgoing.on("error", reject);
    outgoing.end(request.body);
  });
}
