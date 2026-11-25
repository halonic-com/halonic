import {
  RunContainerObject as AdapterRunContainerObject,
  type ContainerOutboundProps,
} from "@halonicjs/adapter-cloudflare-durable";
import type { RuntimeEnv } from "./env.ts";
import { runBridgeObject } from "./run-bridge-stub.ts";

/** What the Worker's own exports give a Durable Object: the entrypoint the intercepts go to. */
interface WorkerExports {
  ContainerOutbound(options: { props: ContainerOutboundProps }): Fetcher;
}

/**
 * The Worker's run container object (requirement `runtime.run-container-object`): the adapter's
 * class, with its container's intercepts pointed at the Worker's `ContainerOutbound` and the run's
 * bridge credential revoked in the run's own run object, which has the same name.
 *
 * The Worker exports it as `RunContainerObject`, the class name Cloudflare keys the objects' data by.
 */
export class RunContainerObject extends AdapterRunContainerObject {
  protected override outboundHandler(props: ContainerOutboundProps): Fetcher {
    return (this.ctx.exports as unknown as WorkerExports).ContainerOutbound({ props });
  }

  protected override revokeBridge(runObjectName: string): Promise<void> {
    return runBridgeObject(this.env as unknown as RuntimeEnv, runObjectName).revokeBridge();
  }
}
