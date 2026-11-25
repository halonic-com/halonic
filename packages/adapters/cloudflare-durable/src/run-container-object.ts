import { DurableObject } from "cloudflare:workers";
import type {
  ContainerProcess,
  RunContainer,
  RunContainerCommand,
  RunContainerSetup,
} from "@halonicjs/adapter-sandbox-cloudflare-container";
import { systemClock } from "@halonicjs/std";
import { type ContainerOutboundProps, RunContainerLogic } from "./run-container-logic.ts";

/**
 * The Durable Object that owns one run's container, named as the run's own run object is, so
 * two scopes never share one. Its calls are those of {@link RunContainerLogic}. The Worker
 * subclasses it with the handler of the intercepts and the way to its run objects, which this
 * package can't name.
 *
 * Never rename or delete this class: Cloudflare deletes a Durable Object class's data with it.
 * Its name is in `durableObjectClassNames`, with a migration in the Worker's configuration.
 */
export abstract class RunContainerObject extends DurableObject implements RunContainer {
  readonly #logic: RunContainerLogic<Fetcher>;

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    const { storage } = ctx;
    this.#logic = new RunContainerLogic<Fetcher>({
      objectName: ctx.id.name,
      container: ctx.container,
      storage: {
        get: (key) => storage.get(key),
        put: (key, value) => storage.put(key, value),
        setAlarm: (atMs) => storage.setAlarm(atMs),
        deleteAlarm: () => storage.deleteAlarm(),
      },
      // Read through `this` on every call, so the subclass's hooks count.
      outboundHandlerOf: (props) => this.outboundHandler(props),
      revokeBridge: (name) => this.revokeBridge(name),
      clock: systemClock,
    });
  }

  /** The handler the container's intercepts send to, told `props`. */
  protected abstract outboundHandler(props: ContainerOutboundProps): Fetcher;

  /** Revokes the bridge credential of the run whose run object is named `runObjectName`. */
  protected abstract revokeBridge(runObjectName: string): Promise<void>;

  /** Whether the deployment gives this class a container. */
  available(): boolean {
    return this.#logic.available();
  }

  begin(setup: RunContainerSetup): Promise<void> {
    return this.#logic.begin(setup);
  }

  exec(runId: string, command: RunContainerCommand): Promise<ContainerProcess> {
    return this.#logic.exec(runId, command);
  }

  end(runId: string): Promise<void> {
    return this.#logic.end(runId);
  }

  override alarm(): Promise<void> {
    return this.#logic.alarm();
  }
}
