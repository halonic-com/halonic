import { s } from "@halonicjs/schema-kit";
import { absolutePath } from "../sandbox/profile-schema.ts";

/**
 * What Studio gives to check this computer: the workspace folder to check
 * too, one the launcher named. Left out, only the computer is checked.
 * Nothing else: the host decides every other input itself.
 */
export const doctorBody = s.object({ workspace: absolutePath.optional() }).strict();
