/**
 * A `CoordinationObject` whose clock the suite moves, for the workerd specs that run the
 * `Coordination` contract. The suite and the object run in one workerd isolate, so a map in this
 * module reaches both.
 */

import type { Clock } from "@halonicjs/std";
import { CoordinationObject } from "../coordination-object.ts";

/** The clock of each object, by the object's name. */
export const clocksByObjectName = new Map<string, Clock>();

/** `CoordinationObject` reading the time from the suite's clock for its own name. */
export class TestCoordinationObject extends CoordinationObject {
  protected override clock = {
    now: (): Date => {
      const name = this.ctx.id.name;
      const clock = name === undefined ? undefined : clocksByObjectName.get(name);
      if (clock === undefined) {
        throw new Error("This test object was not made through the suite's make().");
      }
      return clock.now();
    },
  };
}
