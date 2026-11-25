import type { RoutineHealth } from "@halonicjs/app/routines";

/** The served workspace's routine scheduler: its health, and pausing it (`server.routines`). */
export interface RoutineSchedule {
  health(): RoutineHealth;
  /** Pauses the routines, or resumes them, from the next tick on. */
  pause(paused: boolean): void;
}
