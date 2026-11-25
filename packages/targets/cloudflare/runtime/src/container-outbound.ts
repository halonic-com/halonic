import { WorkerEntrypoint } from "cloudflare:workers";
import type { ContainerOutboundProps } from "@halonicjs/adapter-cloudflare-durable";
import { outboundGate } from "@halonicjs/adapter-sandbox-cloudflare-container";
import type { RuntimeEnv } from "./env.ts";
import { runBridgeObject } from "./run-bridge-stub.ts";

/** Where {@link answerOutbound} sends what the gate lets through. */
export interface OutboundTargets {
  /** The run object named `name`, answering a request for its run's bridge. */
  bridge(name: string, request: Request): Promise<Response>;
  /** The internet, for an allowed site. */
  site(request: Request): Promise<Response>;
}

/**
 * Answers one request a run's container sent out (requirement `runtime.run-container-object`):
 * through `outboundGate` with the rules in `props`, a bridge request to the run's own run object,
 * an allowed site out to the internet, and anything else 403.
 */
export function answerOutbound(
  request: Request,
  props: ContainerOutboundProps,
  targets: OutboundTargets,
): Promise<Response> {
  const gate = outboundGate(props.rules, {
    bridge: (bridgeRequest) => targets.bridge(props.runObjectName, bridgeRequest),
    site: (siteRequest) => targets.site(siteRequest),
  });
  return gate(request);
}

/**
 * The Worker entrypoint the run container object points its intercepts at, made with
 * `ctx.exports.ContainerOutbound({ props })`. The Worker exports it under this name.
 */
export class ContainerOutbound extends WorkerEntrypoint<RuntimeEnv, ContainerOutboundProps> {
  override fetch(request: Request): Promise<Response> {
    return answerOutbound(request, this.ctx.props, {
      bridge: (name, bridgeRequest) => runBridgeObject(this.env, name).bridge(bridgeRequest),
      site: (siteRequest) => fetch(siteRequest),
    });
  }
}
