// When the engine's next routine is due, for the tray's "next routine at
// 14:00" (HAL-18279). Shared with `halonic serve`'s health, so it lives with
// the routine schedule in `@halonicjs/app/routines`.
export { nextRoutineAt } from "@halonicjs/app/routines";
