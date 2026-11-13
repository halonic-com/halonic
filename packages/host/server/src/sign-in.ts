import type { WindowCount } from "@halonicjs/ports";
import type { RequestContext, ServerPorts } from "./api.ts";
import { errorResponse, serverErrors } from "./errors.ts";

/** The secret that holds the sign-in password hash. No value means the server has no password. */
export const passwordSecretName = "serve-password";

/**
 * `__Host-` makes a browser keep the cookie to this exact host, over HTTPS, for the whole
 * site. A browser drops a `Secure` cookie set over plain HTTP, and `serve --network` is
 * open over `http://<LAN address>:<port>`, so that path gets the same cookie without
 * the prefix and without `Secure`.
 */
const secureCookieName = "__Host-halonic-session";
const plainCookieName = "halonic-session";
const sessionLifetimeMs = 30 * 24 * 60 * 60 * 1000;

/**
 * Every attempt counts, so a wrong guess costs one counter step and never a password check.
 * With a client address the host vouches for, each address gets its own count and the whole
 * server gets a higher ceiling. Without one, the whole server is held to the per-address number.
 */
const loginAttemptsKey = "login-attempts";
const loginAddressKeyPrefix = "login-attempts:address:";
const loginWindowMs = 15 * 60 * 1000;
const loginAttemptsPerWindow = 10;
const loginAttemptsPerWindowForServer = 100;

/** More than any real password; it keeps the work of one check bounded. */
const maxPasswordLength = 1024;

/** What the sign-in routes do. */
export interface SignIn {
  /** `POST /api/login`: checks the password and starts a session. */
  login(request: Request, body: Uint8Array, context: RequestContext): Promise<Response>;
  /** `POST /api/logout`: ends the session the request carries, if any. */
  logout(request: Request, context: RequestContext): Promise<Response>;
  /**
   * Whether the request may use the routes behind the sign-in. Always true on
   * a server with no password: it answers only on loopback, and the host
   * check has already refused everything else.
   */
  isSignedIn(request: Request, context: RequestContext): Promise<boolean>;
}

type SignInPorts = Pick<ServerPorts, "secrets" | "passwordHasher" | "coordination" | "clock">;

export function createSignIn(ports: SignInPorts): SignIn {
  const { secrets, passwordHasher, coordination, clock } = ports;

  /**
   * Sessions are stored as the SHA-256 of the token, so a leaked store can't
   * be used to sign in. The token is 32 random bytes, so a fast hash is enough.
   */
  async function sessionKey(token: string): Promise<string> {
    return `session:${await sha256Hex(token)}`;
  }

  async function startSession(context: RequestContext, request: Request): Promise<Response> {
    const token = newSessionToken();
    const expiresAt = new Date(clock.now().getTime() + sessionLifetimeMs);
    const stored = await coordination.compareAndSet(
      await sessionKey(token),
      null,
      expiresAt.toISOString(),
    );
    if (!stored) {
      // 256 random bits never collide; a store that says otherwise is broken.
      throw new Error("the session store refused a new session token");
    }
    const response = Response.json({ signedIn: true });
    response.headers.append(
      "Set-Cookie",
      sessionCookie(request, context, token, sessionLifetimeMs / 1000),
    );
    return response;
  }

  /** Counts one attempt: the client's own count first, so a refused client never uses up the server's. */
  async function countAttempt(context: RequestContext): Promise<WindowCount> {
    if (context.clientAddress === undefined) {
      return coordination.countInWindow(loginAttemptsKey, loginWindowMs, loginAttemptsPerWindow);
    }
    const key = `${loginAddressKeyPrefix}${await sha256Hex(context.clientAddress)}`;
    const own = await coordination.countInWindow(key, loginWindowMs, loginAttemptsPerWindow);
    if (!own.allowed) {
      return own;
    }
    return coordination.countInWindow(
      loginAttemptsKey,
      loginWindowMs,
      loginAttemptsPerWindowForServer,
    );
  }

  return {
    async login(request, body, context) {
      const hash = await secrets.get(passwordSecretName);
      if (hash === null) {
        return errorResponse(serverErrors.notFound);
      }
      const password = readPassword(request, body);
      if (password === null) {
        return errorResponse(serverErrors.badRequest);
      }
      const attempt = await countAttempt(context);
      if (!attempt.allowed) {
        const waitMs = Date.parse(attempt.resetAt) - clock.now().getTime();
        const retryAfter = String(Math.max(1, Math.ceil(waitMs / 1000)));
        return errorResponse(serverErrors.tooManyAttempts, { "Retry-After": retryAfter });
      }
      if (!(await passwordHasher.verify(password, hash))) {
        return errorResponse(serverErrors.wrongPassword);
      }
      return startSession(context, request);
    },

    async logout(request, context) {
      const token = readSessionToken(request, context);
      if (token !== null) {
        const key = await sessionKey(token);
        const expiresAt = await coordination.read(key);
        if (expiresAt !== null) {
          await coordination.compareAndSet(key, expiresAt, null);
        }
      }
      const response = new Response(null, { status: 204 });
      response.headers.append("Set-Cookie", sessionCookie(request, context, "", 0));
      return response;
    },

    async isSignedIn(request, context) {
      if ((await secrets.get(passwordSecretName)) === null) {
        return true;
      }
      const token = readSessionToken(request, context);
      if (token === null) {
        return false;
      }
      const key = await sessionKey(token);
      const expiresAt = await coordination.read(key);
      if (expiresAt === null) {
        return false;
      }
      if (clock.now().getTime() >= Date.parse(expiresAt)) {
        await coordination.compareAndSet(key, expiresAt, null);
        return false;
      }
      return true;
    },
  };
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return toHex(new Uint8Array(digest));
}

/** The password from a JSON body of the form `{ "password": "…" }`, or `null` when the body is anything else. */
function readPassword(request: Request, body: Uint8Array): string | null {
  if (mediaType(request.headers.get("content-type")) !== "application/json") {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(body));
    const password = (parsed as { password?: unknown } | null)?.password;
    const isUsable =
      typeof password === "string" && password.length > 0 && password.length <= maxPasswordLength;
    return isUsable ? password : null;
  } catch {
    return null;
  }
}

/** The media type of a `Content-Type` value, without its parameters, in lower case. */
function mediaType(contentType: string | null): string {
  return (contentType ?? "").split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

/** The host's word wins: behind a proxy that ends TLS the request URL says `http` for an HTTPS client. */
function isSecure(request: Request, context: RequestContext): boolean {
  return context.secure ?? new URL(request.url).protocol === "https:";
}

function readSessionToken(request: Request, context: RequestContext): string | null {
  const sessionCookieName = isSecure(request, context) ? secureCookieName : plainCookieName;
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === sessionCookieName) {
      return value.join("=");
    }
  }
  return null;
}

function sessionCookie(
  request: Request,
  context: RequestContext,
  token: string,
  maxAgeSeconds: number,
): string {
  const secure = isSecure(request, context);
  const name = secure ? secureCookieName : plainCookieName;
  const attributes = secure ? "Path=/; Secure; HttpOnly" : "Path=/; HttpOnly";
  return `${name}=${token}; ${attributes}; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
}

/** 32 random bytes as hex text. These come from the system's random source, never from `ports.ids`. */
function newSessionToken(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
