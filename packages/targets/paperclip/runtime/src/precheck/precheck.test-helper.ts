import { acmeSnapshot, acmeTool, fakeHost, githubToken } from "../fake-host.test-helper.ts";
import { type ActionHandlers, runtimeHandlers } from "../handlers.ts";
import { registerWorkspaceTools } from "../register.ts";
import type { PrecheckFetch } from "./precheck-service.ts";

/**
 * A plugin built with acme's `ready_for_review` on `halonic.precheck`, a
 * fake precheck service that answers from a script, and a fake clock that
 * each pause moves on. No test waits for real time.
 */

/** One request the fake service got. */
export interface SentRequest {
  readonly url: string;
  readonly method: string;
  readonly body?: unknown;
  readonly redirect: string;
  readonly hasSignal: boolean;
}

/** One scripted answer: a response, or an error the fetch throws. */
export type ScriptedAnswer = Response | Error;

/** A JSON answer with a status. */
export function answer(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

export const readyForReview = acmeTool("ready_for_review", {
  action: { run: "halonic.precheck", with: {} },
});

/** The plugin, its fake service and the requests it got. */
export function precheckPlugin(
  script: readonly ScriptedAnswer[],
  options: { readonly config?: Record<string, unknown>; readonly handlers?: ActionHandlers } = {},
) {
  const sent: SentRequest[] = [];
  const pending = [...script];
  const fetch: PrecheckFetch = async (url, init) => {
    sent.push({
      url,
      method: init.method,
      ...(init.body === undefined ? {} : { body: JSON.parse(init.body) }),
      redirect: init.redirect,
      hasSignal: init.signal instanceof AbortSignal,
    });
    const next = pending.shift();
    if (next === undefined) {
      throw new Error("the fake precheck service has no answer left");
    }
    if (next instanceof Error) {
      throw next;
    }
    return next;
  };
  let clock = 0;
  const sleeps: number[] = [];
  const builtIn = acmeSnapshot({ tools: [acmeTool("pr_status"), readyForReview] });
  const host = fakeHost({ githubToken, ...options.config }, { "/repos/acme/website": {} });
  registerWorkspaceTools(host.ctx, {
    declarations: ["pr_status", "ready_for_review"].map((name) => ({
      name,
      displayName: name,
      description: `Acme's ${name}.`,
      parametersSchema: { type: "object", properties: {} },
    })),
    builtIn,
    handlers: options.handlers ?? runtimeHandlers,
    precheck: {
      fetch,
      sleep: async (ms) => {
        sleeps.push(ms);
        clock += ms;
      },
      clock: () => clock,
    },
  });
  return { ...host, requests: sent, sleeps };
}
