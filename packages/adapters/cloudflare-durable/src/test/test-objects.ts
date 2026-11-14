/**
 * The Durable Object classes whose clocks a suite moves, for specs that run a contract in
 * workerd: this package's own and the Worker's (`@halonicjs/adapter-cloudflare-durable/testing`).
 * Test code only: never import it from a runtime bundle.
 */

export { clocksByObjectName, TestCoordinationObject } from "./test-coordination-object.ts";
export {
  type Case,
  cases,
  SuiteClock,
  TestRoutinesObject,
  TestRunObject,
} from "./test-run-object.ts";
