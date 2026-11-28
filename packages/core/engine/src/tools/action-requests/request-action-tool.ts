// `request_action`: an agent asks the user to run a reviewed action stepper.
// The board's rule is that an agent may only request an action, never run
// it, so this tool files a request and nothing more. Its dependencies hold no
// `ActionSender` or `ActionRecords` (ADR 2026-11-24, action sender): only
// the user's Studio has those, and it decides again when the user opens it.

import {
  type AttestedSource,
  decideRequester,
  type RequesterPolicy,
  requestExpiresAt,
  type StepperCatalog,
  stepperRequestFormat,
  validateStepperRequest,
} from "@halonicjs/action-steppers";
import { type ActionRequestedEvent, checkActionEvent } from "@halonicjs/events";
import type { Clock, IdGenerator, RunStore } from "@halonicjs/ports";
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

/**
 * The source a host attests for its runs' requests. Its kind is always
 * `halonic`, so a run can never pass as the user, who always passes.
 */
export interface HalonicSource extends AttestedSource {
  readonly kind: "halonic";
}

/** What a host gives the engine so its agents can file action requests. */
export interface ActionRequests {
  /** The reviewed definitions this Halonic ships, which a request must name. */
  readonly catalog: StepperCatalog;
  readonly policy: RequesterPolicySource;
  /**
   * Who the host is, as Studio names it when it decides again, such as
   * `halonic-server:<origin>`. The host sets it, never the workspace: a hub's
   * folder name is the same in every clone, so it can't widen the policy.
   */
  readonly source: HalonicSource;
}

/**
 * Everything `request_action` reaches. It has no field that can run a step
 * or write a request's record: a test fails if one is added.
 */
export interface RequestActionToolOptions extends ActionRequests {
  readonly runId: string;
  /** The agent that files, named in the request's `requester`. */
  readonly agent: string;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  /** The run's log, where `action.requested` goes. */
  readonly log: TurnLog;
  /** The run's stored events, where the requests it filed before are counted. */
  readonly runs: Pick<RunStore, "events">;
}

/**
 * The most requests one run may file (requirement `engine.request-action-cap`).
 * Filing is `read` risk, so no approval stops an agent that loops; the cap
 * keeps it from burying the user's inbox.
 */
export const maxActionRequestsPerRun = 10;

/** The name of the tool. */
export const requestActionToolName = "request_action";

/**
 * The `request_action` tool (requirement `engine.request-action`): checks a
 * request against the catalog and the user's requester policy, writes
 * `action.requested` to the run log and answers with the request's id.
 *
 * @example
 * const source = { kind: "halonic", id: "halonic-server:https://acme.example" } as const;
 * const tool = requestActionTool({ catalog, policy, source, runId: "r-1", agent: "ops", clock, ids, log, runs });
 * await tool.run({ definition: "acme.restart-app", version: 1, parameters: { app: "web" }, reason: "It hangs." });
 * // => "Filed request req_1. The user reviews it in Studio and runs it or declines it."
 */
export function requestActionTool(options: RequestActionToolOptions): HalonicTool {
  let queue: Promise<unknown> = Promise.resolve();
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
    run: (args) => {
      // One at a time, so calls made together can't each count the same total.
      const filed = queue.then(() => fileActionRequest(options, args));
      queue = filed.catch(() => undefined);
      return filed;
    },
  };
}

/**
 * Files one action request for an agent in a run.
 *
 * @returns the text the model gets back, with the request's id
 * @throws Error naming what's wrong when the run filed its most requests, or the request doesn't pass the catalog, the policy or the event's allow-list
 */
export async function fileActionRequest(
  options: RequestActionToolOptions,
  args: ToolArgs,
): Promise<string> {
  const definition = requiredStringArg(args, "definition");
  if (args["version"] === undefined || args["version"] === null) {
    throw new Error('"version" is required');
  }
  const version = integerArg(args, "version", { min: 1, max: 1000, fallback: 1 });
  const reason = requiredStringArg(args, "reason");
  const parameters = args["parameters"] ?? {};
  await refuseOverCap(options);
  const risk = checkAgainstCatalog(options.catalog, { definition, version, reason, parameters });
  const policy = await options.policy.read();
  if (decideRequester(policy, options.source, options.agent, risk) === "blocked") {
    throw new Error(
      `the user's settings don't let this agent request \`${risk}\` actions, so nothing was filed`,
    );
  }
  const event = requestedEvent(options, { definition, version, reason, parameters, args });
  await options.log.append(withoutAt(event));
  return `Filed request ${event.request}. The user reviews it in Studio and runs it or declines it.`;
}

/** Fails once the run filed {@link maxActionRequestsPerRun} requests, counted in its stored log. */
async function refuseOverCap(options: RequestActionToolOptions): Promise<void> {
  const events = await options.runs.events(options.runId);
  const filed = events.filter((event) => event.type === "action.requested").length;
  if (filed >= maxActionRequestsPerRun) {
    throw new Error(
      `this run already filed ${filed} action requests, the most one run may file, so nothing was filed. Wait for the user to answer the ones in Studio.`,
    );
  }
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
