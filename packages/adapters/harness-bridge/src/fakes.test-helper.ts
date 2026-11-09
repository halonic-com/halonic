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
}

/** Sends one request to the bridge and reads the whole reply. */
export async function send(
  bridge: OpenHarnessBridge,
  path: string,
  request: TestRequest = {},
): Promise<{ status: number; text: string }> {
  const headers: Record<string, string> = {};
  if (request.token !== undefined) headers[harnessBridgeTokenHeader] = request.token;
  const response = await fetch(`${bridge.url}${path}`, {
    method: request.method ?? "POST",
    headers,
    ...(request.body === undefined ? {} : { body: request.body }),
  });
  return { status: response.status, text: await response.text() };
}
