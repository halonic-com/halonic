import type { ProviderRouting } from "./provider-routing.ts";

/**
 * An effort a program sent on a model call, as Anthropic's
 * `output_config.effort` or OpenAI's `reasoning.effort` takes it
 * (requirement `events.llm-request-effort`).
 */
export type ProgramEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

/**
 * A model call going out, before its reply.
 * `alias`: the model alias the call went to, such as `fast`; absent in
 * older logs and when the model has none (requirement
 * `engine.llm-request-alias`). `address`: the `host:port` of a provider on
 * this computer, such as `localhost:11434`, never a URL, path or user
 * name; absent for any other provider and in older logs (requirement
 * `engine.llm-event-address`). `effort`: the effort the harness bridge set
 * on the call in place of the program's, and `programEffort` the one the
 * program itself sent (requirement `events.llm-request-effort`).
 * `subagent`: set, on the request and its response alike, when a sub-agent of
 * the program made the call; absent for the agent itself (requirement `events.llm-subagent`).
 * `routing`: the OpenRouter host pin the bridge sent (`events.llm-request-routing`).
 */
export interface LlmRequestEvent {
  type: "llm.request";
  agent: string;
  provider: string;
  model: string;
  alias?: string;
  address?: string;
  effort?: "low" | "medium" | "high";
  programEffort?: ProgramEffort;
  subagent?: string;
  routing?: ProviderRouting;
  messages: number;
}
