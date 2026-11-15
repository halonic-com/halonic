/**
 * A `CoordinationObject` whose clock the suite sets over RPC, for the workerd specs that run the
 * `Coordination` contract (see `object-case.ts`). The clock lives in the object's own storage,
 * so the spec runs in a local workerd and on Cloudflare alike.
 */

import { CoordinationObject } from "../coordination-object.ts";
import { type CaseHooksStub, type CaseObject, ObjectCaseControl } from "./object-case.ts";

/** `CoordinationObject` reading the time the suite set. */
export class TestCoordinationObject extends CoordinationObject implements CaseObject {
  readonly #case = new ObjectCaseControl(this.ctx.storage);

  protected override clock = this.#case.clock;

  async setCase(clockMs: number, hooks: CaseHooksStub): Promise<void> {
    this.#case.setCase(clockMs, hooks);
  }
}
