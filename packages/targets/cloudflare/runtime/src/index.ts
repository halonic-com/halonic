/**
 * Entry point of the Halonic Worker. The default export is the Worker; the
 * Durable Object classes are re-exported under their fixed names, because
 * Cloudflare finds them on the Worker's exports and keys each object's data by
 * the class name (see `durableObjectClassNames` in `adapter-cloudflare-durable`).
 */

export { CoordinationObject, RoutinesObject } from "@halonicjs/adapter-cloudflare-durable";
export { RunObject } from "./run-object.ts";
// biome-ignore lint/style/noDefaultExport: Cloudflare finds the Worker on the default export.
export { worker as default } from "./worker.ts";
