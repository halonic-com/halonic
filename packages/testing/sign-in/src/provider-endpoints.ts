import type { Grant, GrantLedger } from "./grant-ledger.ts";
import type { ProviderBehavior } from "./provider-behavior.ts";
import type { RecordedRequest } from "./recorded-request.ts";

/** What the provider's endpoints read: its state and settings, and the time. */
export interface ProviderContext {
  readonly ledger: GrantLedger;
  readonly behavior: ProviderBehavior;
  readonly clientId: string;
  readonly clientSecret: string | undefined;
  nowMs(): number;
  /** Settles when held token answers are let through; at once when none are held. */
  gate(): Promise<void>;
}

/** The provider's token endpoint, revoke endpoint and resource server. */
export class ProviderEndpoints {
  private readonly context: ProviderContext;

  constructor(context: ProviderContext) {
    this.context = context;
  }

  async token(request: RecordedRequest): Promise<Response> {
    await this.context.gate();
    if (this.context.behavior.redirectTokenEndpointTo !== undefined) {
      return new Response(null, {
        status: 307,
        headers: { location: this.context.behavior.redirectTokenEndpointTo },
      });
    }
    if (this.context.behavior.rawTokenAnswer !== undefined) {
      const {
        status,
        body,
        contentType = "application/json",
      } = this.context.behavior.rawTokenAnswer;
      return new Response(body, { status, headers: { "content-type": contentType } });
    }
    if (!clientAuthenticated(request, this.context.clientId, this.context.clientSecret))
      return refusal(401, "invalid_client");
    const grantType = request.form["grant_type"];
    if (grantType === "authorization_code") return await this.codeGrant(request);
    if (grantType === "refresh_token") return this.refreshGrant(request);
    return refusal(400, "unsupported_grant_type");
  }

  async codeGrant(request: RecordedRequest): Promise<Response> {
    const code = this.context.ledger.codes.get(request.form["code"] ?? "");
    if (code === undefined) return refusal(400, "invalid_grant");
    if (code.used) {
      // A code used twice ends what it made, as RFC 6749 section 4.1.2 asks.
      if (code.grant !== undefined) code.grant.revoked = true;
      return refusal(400, "invalid_grant");
    }
    code.used = true;
    const verifierMatches =
      (await pkceChallenge(request.form["code_verifier"] ?? "")) === code.challenge;
    if (
      code.clientId !== presentedClient(request).id ||
      code.redirectUri !== request.form["redirect_uri"] ||
      !verifierMatches
    ) {
      return refusal(400, "invalid_grant");
    }
    const grant: Grant = {
      clientId: code.clientId,
      scope: code.scope,
      revoked: false,
      currentRefreshToken: "",
      refreshTokens: [],
      accessTokens: new Map(),
    };
    this.context.ledger.grants.push(grant);
    code.grant = grant;
    return this.tokenAnswer(grant, { newRefreshToken: true });
  }

  refreshGrant(request: RecordedRequest): Response {
    const presented = request.form["refresh_token"] ?? "";
    const grant = this.context.ledger.grantOfRefreshToken(presented);
    if (grant === undefined || grant.revoked) return refusal(400, "invalid_grant");
    if (presented !== grant.currentRefreshToken) {
      // A retired refresh token was presented: it was copied, so end the grant if the provider can tell.
      if (this.context.behavior.detectReuse) grant.revoked = true;
      return refusal(400, "invalid_grant");
    }
    return this.tokenAnswer(grant, { newRefreshToken: this.context.behavior.rotateRefreshTokens });
  }

  /** The good answer: a new access token, a new refresh token when asked, shaped by `behavior`. */
  tokenAnswer(grant: Grant, { newRefreshToken }: { newRefreshToken: boolean }): Response {
    const accessToken = this.context.behavior.makeToken(
      "access",
      this.context.ledger.next("access"),
    );
    const lifetime = this.context.behavior.accessTokenLifetimeSeconds;
    grant.accessTokens.set(
      accessToken,
      lifetime === null ? Number.POSITIVE_INFINITY : this.context.nowMs() + lifetime * 1000,
    );
    if (newRefreshToken) {
      grant.currentRefreshToken = this.context.behavior.makeToken(
        "refresh",
        this.context.ledger.next("refresh"),
      );
      grant.refreshTokens.push(grant.currentRefreshToken);
    }
    const body: Record<string, unknown> = {
      access_token: accessToken,
      token_type: "Bearer",
      ...(lifetime === null ? {} : { expires_in: lifetime }),
      ...(newRefreshToken ? { refresh_token: grant.currentRefreshToken } : {}),
      ...(grant.scope === "" ? {} : { scope: grant.scope }),
      ...this.context.behavior.answerFields,
      ...(this.context.behavior.padTokenAnswerBytes > 0
        ? { padding: "p".repeat(this.context.behavior.padTokenAnswerBytes) }
        : {}),
    };
    return Response.json(body);
  }

  revoke(request: RecordedRequest): Response {
    if (!clientAuthenticated(request, this.context.clientId, this.context.clientSecret))
      return refusal(401, "invalid_client");
    const grant = this.context.ledger.grantOfRefreshToken(request.form["token"] ?? "");
    if (grant !== undefined && this.context.behavior.revokeStatus === 200) grant.revoked = true;
    return new Response("", { status: this.context.behavior.revokeStatus });
  }

  /** The resource server: 200 for an access token it would accept, 401 for any other. */
  resource(request: RecordedRequest): Response {
    const token = request.headers["authorization"]?.replace(/^Bearer /, "");
    if (token === undefined || !this.context.ledger.accessTokenWorks(token, this.context.nowMs())) {
      return new Response("unauthorized", {
        status: 401,
        headers: { "www-authenticate": 'Bearer realm="example"' },
      });
    }
    return Response.json({ ok: true, path: request.url.pathname });
  }
}

function refusal(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

/** The client ID and secret a request presents: in an HTTP Basic header, or in the form. */
function presentedClient(request: RecordedRequest): {
  id: string | undefined;
  secret: string | undefined;
} {
  const basic = request.headers["authorization"]?.match(/^Basic (.+)$/)?.[1];
  if (basic !== undefined) {
    const [id, secret] = atob(basic).split(":").map(decodeURIComponent);
    return { id, secret };
  }
  return { id: request.form["client_id"], secret: request.form["client_secret"] };
}

/** Whether the request proves the client: its ID, and its secret when the provider has one. */
function clientAuthenticated(
  request: RecordedRequest,
  clientId: string,
  clientSecret: string | undefined,
): boolean {
  const { id, secret } = presentedClient(request);
  return id === clientId && (clientSecret === undefined || secret === clientSecret);
}

/** The S256 code challenge of a verifier. */
async function pkceChallenge(verifier: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
