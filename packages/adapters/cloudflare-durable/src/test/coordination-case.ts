/**
 * The coordination objects of the `DurableCoordination` specs: the real `CoordinationObject` on
 * a clock the suite sets, with a note of every name asked for and every stub taken. Test code
 * only: never import it from a runtime bundle.
 */

import { env } from "cloudflare:workers";
import type { CoordinationNamespace } from "../durable-coordination.ts";
import { SuiteCase } from "./suite-case.ts";
import type { TestCoordinationObject } from "./test-coordination-object.ts";

/** What the runner binds for these specs. */
interface TestEnv {
  COORDINATION: DurableObjectNamespace<TestCoordinationObject>;
}

/** The objects of a case of their own, counted. */
export function countingNamespace() {
  const { COORDINATION } = env as TestEnv;
  const objects = new SuiteCase().namespace(COORDINATION);
  const counted = {
    names: [] as string[],
    gets: 0,
    idFromName(name: string): DurableObjectId {
      counted.names.push(name);
      return objects.idFromName(name);
    },
    get(id: DurableObjectId) {
      counted.gets += 1;
      return objects.get(id);
    },
  } satisfies CoordinationNamespace<DurableObjectId> & { names: string[]; gets: number };
  return counted;
}
