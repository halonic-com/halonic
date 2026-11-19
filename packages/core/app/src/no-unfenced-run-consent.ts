// The consent store every host uses until the yes to run without the sandbox
// is offered (HAL-12639). Nothing can give that yes yet: no app calls
// `UnfencedRuns.allow`. A store that read a yes from the profile would let a
// file placed there by hand start plugin or integration code outside the
// fence, a path nobody designed. This one never holds a yes, so the gate
// answers `needs-yes` wherever the fence isn't there.

import type { UnfencedRunConsentStore } from "@halonicjs/ports";

/**
 * A saved yes to run without the sandbox that is never there: `get` always
 * answers `null`, `save` keeps nothing and `remove` has nothing to remove
 * (requirement `app.no-unfenced-run-consent`). The `halonic` command and the
 * agent host decide their starts with it until Studio offers the yes; then a
 * host that offers it switches to a store in the profile.
 *
 * @example
 * const runs = new UnfencedRuns({ store: noUnfencedRunConsent, clock: systemClock });
 */
export const noUnfencedRunConsent: UnfencedRunConsentStore = Object.freeze({
  get: async () => null,
  save: async () => undefined,
  remove: async () => undefined,
});
