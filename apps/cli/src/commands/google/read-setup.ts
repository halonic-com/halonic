import { SetupRecordError, type SetupRecords } from "@halonicjs/google-setup";
import { OwnLineError } from "../../command.ts";
import { googleMessages } from "../../messages/google.ts";

/** The record for the ref, or the "no such account" refusal; a damaged record is an error as it is. */
export async function readSetup(setups: SetupRecords, accountRef: string) {
  try {
    const record = await setups.read(accountRef);
    if (record !== null) {
      return record;
    }
  } catch (error) {
    if (!(error instanceof SetupRecordError && error.reason === "not-found")) {
      throw error;
    }
  }
  throw new OwnLineError(
    "not_found",
    googleMessages.unknownAccount(),
    googleMessages.unknownAccountFix(),
  );
}
