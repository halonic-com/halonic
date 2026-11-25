import type { RequestContext, ServerPorts } from "./api.ts";
import { errorResponse, serverErrors } from "./errors.ts";
import { countLoginAttempt, tooManyAttempts } from "./sign-in.ts";

type PasswordAgainPorts = Pick<ServerPorts, "passwordHasher" | "coordination" | "clock">;

/**
 * The `serve-password` asked for again on top of a session, checked like a sign-in: counted
 * against the login limit first, so a stolen device token can't guess it freely. Gives `null`
 * when `password` is the current one, else the answer to send: 429 over the limit, or 401
 * `wrong_password`, the same whatever the route would have done. "Add a device", Allow and the
 * Paperclip key routes all ask through this one check.
 */
export async function checkPasswordAgain(
  ports: PasswordAgainPorts,
  context: RequestContext,
  password: string,
  passwordHash: string,
): Promise<Response | null> {
  const attempt = await countLoginAttempt(ports.coordination, context);
  if (!attempt.allowed) {
    return tooManyAttempts(attempt, ports.clock);
  }
  const isRight = await ports.passwordHasher.verify(password, passwordHash);
  return isRight ? null : errorResponse(serverErrors.wrongPassword);
}
