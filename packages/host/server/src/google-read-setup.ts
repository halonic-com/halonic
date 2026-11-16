import { type SetupRecord, SetupRecordError } from "@halonicjs/google-setup";
import type { GoogleSetupReadPorts } from "./api.ts";

/** The record, or `null` when there is none or the ref isn't one. A damaged record is an error for the caller. */
export async function readSetup(
  setups: GoogleSetupReadPorts["setups"],
  accountRef: string,
): Promise<SetupRecord | null> {
  try {
    return await setups.read(accountRef);
  } catch (error) {
    if (error instanceof SetupRecordError && error.reason === "not-found") {
      return null;
    }
    throw error;
  }
}
