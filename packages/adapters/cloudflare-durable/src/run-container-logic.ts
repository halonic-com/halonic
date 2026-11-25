import {
  type ContainerControl,
  type ContainerProcess,
  type OutboundRules,
  type RunContainer,
  type RunContainerCommand,
  type RunContainerSetup,
  RunContainerState,
  type RunContainerStorage,
} from "@halonicjs/adapter-sandbox-cloudflare-container";
import type { Clock } from "@halonicjs/std";

/**
 * What a run container object tells the handler of its intercepts. Only that object sets them,
 * as the handler's props: nothing in a request the container sends can change them.
 */
export interface ContainerOutboundProps {
  /** The name of the run's run object, which serves the run's bridge. */
  readonly runObjectName: string;
  readonly rules: OutboundRules;
}

/**
 * Hands out the handler the container's intercepts send to, such as a `Fetcher` for the Worker's
 * `ContainerOutbound`.
 */
export type OutboundHandlerOf<Handler> = (props: ContainerOutboundProps) => Handler;

/** What the run container object needs of its Durable Object. */
export interface RunContainerObjectParts<Handler> {
  /** The object's own name: the run object's name, the scope's prefix and the run id. */
  readonly objectName: string | undefined;
  /** The platform's container; absent where the Worker's configuration gives the class none. */
  readonly container: ContainerControl<Handler> | undefined;
  readonly storage: RunContainerStorage;
  readonly outboundHandlerOf: OutboundHandlerOf<Handler>;
  /** Revokes the run's bridge credential in its run object, named as this object is. */
  revokeBridge(objectName: string): Promise<void>;
  readonly clock: Clock;
}

/**
 * The logic of the {@link RunContainerObject}, apart from `cloudflare:workers` so Node tests it
 * with a fake container (requirement `cloudflare-durable.run-container-object`). It is
 * `RunContainerState` with the Worker's parts: the intercepts' handler is told the rules and the
 * run object's name by this object alone, and the run's end and the alarm that stops the
 * container at its time limit both revoke the run's bridge credential.
 */
export class RunContainerLogic<Handler> implements RunContainer {
  readonly #parts: RunContainerObjectParts<Handler>;
  readonly #state: RunContainerState<Handler> | undefined;

  constructor(parts: RunContainerObjectParts<Handler>) {
    this.#parts = parts;
    const { container, objectName } = parts;
    this.#state =
      container === undefined
        ? undefined
        : new RunContainerState({
            objectName,
            container,
            storage: parts.storage,
            clock: parts.clock,
            gateFor: (rules: OutboundRules) =>
              parts.outboundHandlerOf({ runObjectName: objectName ?? "", rules }),
          });
  }

  /** Whether the deployment gives this class a container: 3c's `[[containers]]` entry. */
  available(): boolean {
    return this.#state !== undefined;
  }

  /** @throws Error when the deployment gives the class no container, or as `RunContainerState.begin` does */
  async begin(setup: RunContainerSetup): Promise<void> {
    await this.#running().begin(setup);
  }

  async exec(runId: string, command: RunContainerCommand): Promise<ContainerProcess> {
    return this.#running().exec(runId, command);
  }

  /** Destroys the container and revokes the run's bridge credential. Safe to call twice. */
  async end(runId: string): Promise<void> {
    await this.#running().end(runId);
    await this.#parts.revokeBridge(runId);
  }

  /** The run's time limit has come: the container is destroyed and the credential revoked. */
  async alarm(): Promise<void> {
    const { objectName } = this.#parts;
    if (this.#state === undefined || objectName === undefined) return;
    await this.#state.alarm();
    await this.#parts.revokeBridge(objectName);
  }

  #running(): RunContainerState<Handler> {
    if (this.#state === undefined) {
      throw new Error("This deployment has no run container: its configuration gives none.");
    }
    return this.#state;
  }
}
