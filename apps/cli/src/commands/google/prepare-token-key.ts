import { TokenKeyMissingError } from "@halonicjs/adapter-token-store";
import { OwnLineError } from "../../command.ts";
import type { GoogleHost } from "../../google-host.ts";
import { googleMessages } from "../../messages/google.ts";

/**
 * Makes sure a secret can be sealed before anything is asked or opened: the
 * profile's token key is found, or made while no token is sealed yet. A key
 * that is gone while sealed tokens remain is refused with its fix line.
 *
 * @throws OwnLineError `conflict` when the key is gone but sealed tokens remain
 */
export async function prepareTokenKey(host: GoogleHost): Promise<void> {
  try {
    await host.prepareTokenKey();
  } catch (error) {
    if (!(error instanceof TokenKeyMissingError)) {
      throw error;
    }
    throw new OwnLineError(
      "conflict",
      googleMessages.tokenKeyMissing(),
      googleMessages.tokenKeyMissingFix(),
    );
  }
}
