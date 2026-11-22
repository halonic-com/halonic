// The meter of a workspace that sells nothing (requirement `engine.meter-port`):
// the engine's default, so a run without a meter behaves as runs always have.
// The budget still keeps runs to what the workspace sets.

import type {
  Meter,
  MeterAnswer,
  MeterCheckKind,
  MeterMaximum,
  MeterPrincipal,
  MeterUsage,
  Reservation,
  ReserveAnswer,
  StepTimes,
} from "./meter.ts";

/** A meter that allows everything and records nothing. */
export class NoMeter implements Meter {
  async check(
    _principal: MeterPrincipal,
    _request: { readonly kind: MeterCheckKind },
  ): Promise<MeterAnswer> {
    return { allowed: true };
  }

  async reserve(principal: MeterPrincipal, _maximum: MeterMaximum): Promise<ReserveAnswer> {
    return { allowed: true, reservation: { id: "none", principal } };
  }

  async settle(_reservation: Reservation, _times: StepTimes): Promise<void> {}

  async record(_principal: MeterPrincipal, _usage: MeterUsage): Promise<void> {}
}
