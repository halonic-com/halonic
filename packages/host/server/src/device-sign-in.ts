import type { Secrets } from "@halonicjs/ports";
import type { DeviceSessions } from "./device-sessions.ts";
import { cookieValues } from "./session-verifier.ts";
import { passwordSecretName, type SignIn, sessionCookieNames } from "./sign-in.ts";

/** The session id of a device session: this, then the device's id. Never the token or its hash. */
export const deviceSessionPrefix = "device:";

/** A device token in `Authorization`: 64 hex characters, as {@link DeviceSessions.start} makes it. */
const deviceBearer = /^Bearer ([0-9a-f]{64})$/;

/**
 * The sign-in, also signed in by a device session. A device token counts only in
 * `Authorization: Bearer`, and only while a password is set (`server.device-pairing`): the same
 * token in the session cookie names no password session, so it is refused. A request that carries
 * a session cookie and an `Authorization` header both is refused (`server.session-credential`).
 * A request without `Authorization` is left to the password sign-in.
 */
export function withDeviceSessions(
  signIn: SignIn,
  devices: DeviceSessions,
  secrets: Pick<Secrets, "get">,
): SignIn {
  async function session(request: Request, context: Parameters<SignIn["session"]>[1]) {
    const authorization = request.headers.get("authorization");
    const passwordHash = await secrets.get(passwordSecretName);
    if (authorization === null || passwordHash === null) {
      return signIn.session(request, context);
    }
    const cookies = request.headers.get("cookie");
    const hasCookie = sessionCookieNames.some((name) => cookieValues(cookies, name).length > 0);
    const token = deviceBearer.exec(authorization)?.[1];
    if (hasCookie || token === undefined) {
      return null;
    }
    const deviceId = await devices.check(token, passwordHash);
    return deviceId === null ? null : `${deviceSessionPrefix}${deviceId}`;
  }

  return {
    ...signIn,
    session,
    async isSignedIn(request, context) {
      return (await session(request, context)) !== null;
    },
  };
}
