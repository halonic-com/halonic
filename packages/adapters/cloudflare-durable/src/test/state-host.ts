/**
 * Real Durable Object state for the cases that test the run object's parts one by one (its log,
 * timers, outbox and alarm logic): {@link inObjectState} runs a case's body inside a Durable
 * Object, with that object's own `ctx.storage`. Locally workerd runs the object in the suite's
 * isolate, so the body is handed over through a map in this module and only its ID goes over RPC.
 * That makes these specs local only; the contract specs (`run-store.spec.ts` and the others) are
 * the ones that also run on Cloudflare. Test code only: never import it from a runtime bundle.
 */

import { DurableObject, env } from "cloudflare:workers";

/** The bodies handed to {@link StateHostObject.run}, by ID. Each keeps its own result. */
const waitingBodies = new Map<string, (state: DurableObjectState) => Promise<void>>();

/** A Durable Object that does nothing but run the bodies {@link inObjectState} hands it. */
export class StateHostObject extends DurableObject {
  async run(bodyId: string): Promise<void> {
    const body = waitingBodies.get(bodyId);
    if (body === undefined) {
      throw new Error("No body is waiting under this ID. Is the object in the suite's isolate?");
    }
    await body(this.ctx);
  }

  /** Lets a body set the alarm; a case's clock is years ahead, so it never fires during the case. */
  override async alarm(): Promise<void> {}
}

/** What the runner binds for these specs. */
interface StateHostEnv {
  STATE_HOST: DurableObjectNamespace<StateHostObject>;
}

/**
 * Runs `body` inside a Durable Object of its own, with the object's state, and gives back what it
 * returns. Each call gets a new object, so its storage starts empty.
 */
export async function inObjectState<T>(
  body: (state: DurableObjectState) => T | Promise<T>,
): Promise<T> {
  const bodyId = crypto.randomUUID();
  let result: { value: T } | undefined;
  waitingBodies.set(bodyId, async (state) => {
    result = { value: await body(state) };
  });
  try {
    const { STATE_HOST } = env as unknown as StateHostEnv;
    await STATE_HOST.get(STATE_HOST.newUniqueId()).run(bodyId);
  } finally {
    waitingBodies.delete(bodyId);
  }
  if (result === undefined) throw new Error("The object ran no body.");
  return result.value;
}
