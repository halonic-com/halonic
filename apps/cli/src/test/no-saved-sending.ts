import type { SendingSettings } from "@halonicjs/app";

/** A run's connectors' `sending` for a test where nobody switched sending on: off for every connector. */
export const noSavedSending: SendingSettings = {
  checkSending: async ({ connector }) => ({
    allowed: false,
    reason: `sending is off for the connector "${connector}"`,
  }),
};
