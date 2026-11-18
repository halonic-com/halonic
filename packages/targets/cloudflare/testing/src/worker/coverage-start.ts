/**
 * Starts V8's precise coverage inside workerd. The build puts this file first
 * in a Worker built for coverage, so counting starts before the suites and
 * the code under test load: their top-level code counts as run. Node's own
 * coverage can't see inside workerd, so the Node runner fetches the counts
 * from `/coverage` when it stops, and maps them back to the source files.
 *
 * The session needs workerd's local-development flags (see `coverageFlags`
 * in `workerd-runner.ts`). A normal test Worker never loads this file.
 */

import { Session } from "node:inspector";
import { coverageHook, type RawCoverage } from "./protocol.ts";

const session = new Session();
session.connect();

function post(method: string, params?: object): Promise<unknown> {
  return new Promise((resolve, reject) => {
    session.post(method, params, (error, result) => (error ? reject(error) : resolve(result)));
  });
}

await post("Profiler.enable");
await post("Profiler.startPreciseCoverage", { callCount: true, detailed: true });

(globalThis as { [coverageHook]?: () => Promise<RawCoverage> })[coverageHook] = async () =>
  (await post("Profiler.takePreciseCoverage")) as RawCoverage;
