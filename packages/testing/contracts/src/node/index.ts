// Node-only helpers for bindings whose tests run in Node. The suites
// themselves stay in `../index.ts`, free of Node APIs, so they also run in
// workerd (plan 4.4).
export { type ConnectionTrap, refuseRealConnections, trapConnections } from "./connections.ts";
