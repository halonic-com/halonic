// The public API of @halonicjs/format/routine: the routine schema, for code
// that reads a routine without reading YAML, such as the Worker. It must not
// import `yaml`, even indirectly; routine-entry.test.ts checks that. `.`
// exports the routine types and `WEBHOOK_REFUSED_HEADERS`, not the schema.

export { Routine, type RoutineTarget, type RoutineTrigger } from "../kinds/routine/schema.ts";
export { WEBHOOK_REFUSED_HEADERS } from "../kinds/routine/webhook-headers.ts";
