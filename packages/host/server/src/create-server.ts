import type { CreateServer, ServerConfig } from "./api.ts";
import { errorResponse, serverErrors } from "./errors.ts";
import { checkHost, checkOrigin, readBody, withSecurityHeaders } from "./security.ts";

/** The secret that holds the sign-in password hash. No value means the server has no password. */
const passwordSecretName = "serve-password";

function checkConfig(config: ServerConfig): void {
  if (config.allowedHosts.length === 0) {
    throw new RangeError("allowedHosts needs at least one name");
  }
  if (config.dailyRequests !== undefined && !isWholeNumberAboveZero(config.dailyRequests)) {
    throw new RangeError("dailyRequests must be a whole number above zero");
  }
  if (!isWholeNumberAboveZero(config.maxBodyBytes)) {
    throw new RangeError("maxBodyBytes must be a whole number above zero");
  }
}

function isWholeNumberAboveZero(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

/**
 * Builds the server. Every request passes the security layer first: the
 * `Host` check, the `Origin` check, then the body limit. Routes come in later
 * pull requests; until then every path answers 404.
 */
export const createServer: CreateServer = ({ config, ports }) => {
  checkConfig(config);

  async function answer(request: Request): Promise<Response> {
    const hasPassword = (await ports.secrets.get(passwordSecretName)) !== null;
    const refusal =
      checkHost(request, { allowedHosts: config.allowedHosts, hasPassword }) ??
      checkOrigin(request);
    if (refusal !== null) {
      return errorResponse(refusal);
    }
    const body = await readBody(request, config.maxBodyBytes);
    if (!body.ok) {
      return errorResponse(serverErrors.bodyTooLarge);
    }
    return errorResponse(serverErrors.notFound);
  }

  return {
    async handle(request) {
      try {
        return withSecurityHeaders(await answer(request), request);
      } catch {
        // The cause stays out of the reply: a stack or path would tell a caller about the host.
        return withSecurityHeaders(errorResponse(serverErrors.internal), request);
      }
    },
  };
};
