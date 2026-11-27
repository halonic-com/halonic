// `request_action`: an agent asks the user to run a reviewed action stepper.
// The board's rule is that an agent may only request an action, never run
// it, so this tool files a request and nothing more. Its dependencies hold no
// `ActionSender` or `ActionRecords` (ADR 2026-11-24, action sender): only
// the user's Studio has those, and it decides again when the user opens it.

import {
  decideRequester,
  type RequesterPolicy,
  requestExpiresAt,
  type StepperCatalog,
  stepperRequestFormat,
  validateStepperRequest,
} from "@halonicjs/action-steppers";
import { type ActionRequestedEvent, checkActionEvent } from "@halonicjs/events";
import type { Clock, IdGenerator } from "@halonicjs/ports";
import type { TurnLog } from "../../agent/turn-log.ts";
import type { HalonicTool } from "../../agent/turn-tools.ts";
import { integerArg, requiredStringArg, type ToolArgs } from "../tool-args.ts";

/**
 * Reads the user's requester policy from their profile, outside every
 * workspace, because an agent can edit workspace files. Read-only: nothing
 * on the engine's side can change the policy.
 */
export interface RequesterPolicySource {
  /**
   * The policy as the profile has it now, or the default when it has none.
   *
   * @throws when the profile's policy can't be read; the request is then not filed
   */
  read(): Promise<RequesterPolicy>;
}

/** What a host gives the engine so its agents can file action requests. */
export interface ActionRequests {
  /** The reviewed definitions this Halonic ships, which a request must name. */
  readonly catalog: StepperCatalog;
  readonly policy: RequesterPolicySource;
}

/**
 * Everything `request_action` reaches. It has no field that can run a step
 * or write a request's record: a test fails if one is added.
 */
export interface RequestActionToolOptions extends ActionRequests {
  /** The agent's hub: the source the engine attests for the policy. */
  readonly hubId: string;
  readonly runId: string;
  /** The agent that files, named in the request's `requester`. */
  readonly agent: string;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  /** The run's log, where `action.requested` goes. */
  readonly log: TurnLog;
}

/** The name of the tool. */
export const requestActionToolName = "request_action";

/**
 * The `request_action` tool (requirement `engine.request-action`): checks a
 * request against the catalog and the user's requester policy, writes
 * `action.requested` to the run log and answers with the request's id.
 *
 * @example
 * const tool = requestActionTool({ catalog, policy, hubId: "acme", runId: "r-1", agent: "ops", clock, ids, log });
 * await tool.run({ definition: "acme.restart-app", version: 1, parameters: { app: "web" }, reason: "It hangs." });
 * // => "Filed request req_1. The user reviews it in Studio and runs it or declines it."
 */
export function requestActionTool(options: RequestActionToolOptions): HalonicTool {
  return {
    definition: {
      name: requestActionToolName,
      description:
        "Asks the user to run one reviewed action from Halonic's catalog. You run nothing: the user reviews the request and runs it in Studio, or declines it. Answers with the request's id.",
      parameters: {
        type: "object",
        properties: {
          definition: {
            type: "string",
            description: "The action's id, such as github.set-variable.",
          },
          version: { type: "integer", minimum: 1, description: "The action's major version." },
          parameters: {
            type: "object",
            description: "The action's parameters: plain values only, under the names it lists.",
          },
          reason: { type: "string", description: "Why, in a sentence the user reads." },
          expect: {
            type: "object",
            description:
              "State you saw, such as the current value, checked before the action runs.",
          },
        },
        required: ["definition", "version", "reason"],
      },
    },
    // Filing changes nothing outside the run: the user still has to open and run it.
    risk: "read",
    run: (args) => fileActionRequest(options, args),
  };
}

/**
 * Files one action request for an agent in a run.
 *
 * @returns the text the model gets back, with the request's id
 * @throws Error naming what's wrong when the request doesn't pass the catalog, the policy or the event's allow-list
 */
export async function fileActionRequest(
  options: RequestActionToolOptions,
  args: ToolArgs,
): Promise<string> {
  const definition = requiredStringArg(args, "definition");
  if (args["version"] === undefined) throw new Error('"version" is required');
  const version = integerArg(args, "version", { min: 1, max: 1000, fallback: 1 });
  const reason = requiredStringArg(args, "reason");
  const parameters = args["parameters"] ?? {};
  const risk = checkAgainstCatalog(options.catalog, { definition, version, reason, parameters });
  const policy = await options.policy.read();
  const source = { kind: "halonic" as const, id: options.hubId };
  if (decideRequester(policy, source, options.agent, risk) === "blocked") {
    throw new Error(
      `the user's settings don't let this agent request \`${risk}\` actions, so nothing was filed`,
    );
  }
  const event = requestedEvent(options, { definition, version, reason, parameters, args });
  await options.log.append(withoutAt(event));
  return `Filed request ${event.request}. The user reviews it in Studio and runs it or declines it.`;
}

interface RequestFields {
  readonly definition: string;
  readonly version: number;
  readonly reason: string;
  readonly parameters: unknown;
}

/**
 * Runs the one validator Studio also runs, on a request of one `use` block,
 * so the agent hears early what Studio would refuse.
 */
function checkAgainstCatalog(catalog: StepperCatalog, fields: RequestFields) {
  const reference = `${fields.definition}@${fields.version}`;
  const document = {
    format: stepperRequestFormat,
    title: reference,
    reason: fields.reason,
    blocks: [{ kind: "use", ref: reference, parameters: fields.parameters }],
  };
  const checked = validateStepperRequest(JSON.stringify(document), catalog);
  if (!checked.ok) {
    throw new Error(`the request wasn't filed: ${checked.error.map(oneBlockReason).join("; ")}`);
  }
  return checked.value.risk;
}

/** A request here has one block, so "block 1: " says nothing. */
function oneBlockReason(reason: string): string {
  return reason.replace(/^block 1: /, "");
}

function requestedEvent(
  options: RequestActionToolOptions,
  fields: RequestFields & { readonly args: ToolArgs },
): ActionRequestedEvent {
  const now = options.clock.now().getTime();
  const expect = fields.args["expect"];
  const candidate = {
    type: "action.requested",
    request: options.ids.next("req"),
    at: new Date(now).toISOString(),
    definition: fields.definition,
    version: fields.version,
    parameters: fields.parameters,
    requester: { kind: "agent", agent: options.agent, run: options.runId },
    reason: fields.reason,
    expires: new Date(requestExpiresAt({ receivedAt: now })).toISOString(),
    ...(expect === undefined || expect === null ? {} : { expect }),
  };
  const checked = checkActionEvent(candidate);
  if (!checked.ok) throw new Error(`the request wasn't filed: ${checked.problems.join("; ")}`);
  return checked.event as ActionRequestedEvent;
}

function withoutAt(event: ActionRequestedEvent) {
  const { at: _filedAt, ...line } = event;
  return line;
}
