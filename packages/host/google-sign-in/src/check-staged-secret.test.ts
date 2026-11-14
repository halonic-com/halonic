import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { checkStagedClientSecret } from "./check-staged-secret.ts";
import {
  fakeAccessToken,
  fakeAccountRef,
  fakeClient,
  fakeGoogle,
  fakeRefreshToken,
  fakeTokenStore,
  hostileError,
  htmlErrorPage,
  type RecordedRequest,
} from "./fake-google.test-helper.ts";
import { findLeakedSecrets } from "./leak-scan.test-helper.ts";
import { tokenEndpoint } from "./sign-in.test-helper.ts";

const refreshName = `google-account-${fakeAccountRef}`;
const stagedSecret = "fake-staged-secret-0000000001";
const rotatedRefreshToken = "fake-refresh-token-0000000002";

const input = {
  accountRef: fakeAccountRef,
  clientId: fakeClient.clientId,
  clientRef: fakeClient.clientRef,
};

function refreshSuccess(overrides: Record<string, unknown> = {}): Response {
  return Response.json({ access_token: fakeAccessToken, expires_in: 3599, ...overrides });
}

/** Runs the check against a fake Google, with a refresh token saved unless `saved` is `null` and a secret staged unless `staged` is `null`. */
async function check(
  answer: (request: RecordedRequest) => Response,
  options: { saved?: string | null; staged?: string | null } = {},
) {
  const http = fakeGoogle(answer);
  const tokens = fakeTokenStore();
  const saved = options.saved === undefined ? fakeRefreshToken : options.saved;
  if (saved !== null) {
    tokens.values.set(refreshName, saved);
  }
  const staged = options.staged === undefined ? stagedSecret : options.staged;
  const reads: string[] = [];
  const result = await checkStagedClientSecret(input, {
    http,
    tokens,
    readStagedClientSecret: async (clientRef) => {
      reads.push(clientRef);
      return clientRef === fakeClient.clientRef ? staged : null;
    },
  });
  return { result, http, tokens, reads };
}

verifies("google-sign-in.staged-secret-check", () => {
  describe("checkStagedClientSecret", () => {
    it("refreshes with the staged secret and the saved refresh token, and nothing else", async () => {
      const { result, http, tokens } = await check(() => refreshSuccess());

      expect(result).toEqual({ kind: "accepted" });
      expect(http.requests).toHaveLength(1);
      const [refresh] = http.requests;
      expect(refresh?.url).toBe(tokenEndpoint);
      expect(refresh?.method).toBe("POST");
      expect(refresh?.redirect).toBe("error");
      expect(refresh?.signal).toBeInstanceOf(AbortSignal);
      expect(Object.fromEntries(refresh?.form ?? [])).toEqual({
        grant_type: "refresh_token",
        refresh_token: fakeRefreshToken,
        client_id: fakeClient.clientId,
        client_secret: stagedSecret,
      });
      expect(tokens.namesWritten).toEqual([]);
    });

    it("replaces the saved refresh token when Google sends a new one", async () => {
      const { result, tokens } = await check(() =>
        refreshSuccess({ refresh_token: rotatedRefreshToken }),
      );

      expect(result).toEqual({ kind: "accepted" });
      expect(tokens.values.get(refreshName)).toBe(rotatedRefreshToken);
    });

    it("says refused when Google refuses the staged secret, and keeps the refresh token", async () => {
      const { result, tokens } = await check(() => hostileError("invalid_client", 401));

      expect(result).toEqual({ kind: "refused" });
      expect(tokens.values.get(refreshName)).toBe(fakeRefreshToken);
    });

    it("says the staged secret wasn't tested when Google refuses the refresh token", async () => {
      const { result, tokens } = await check(() => hostileError("invalid_grant"));

      expect(result).toEqual({ kind: "signInRefused" });
      expect(tokens.values.get(refreshName)).toBe(fakeRefreshToken);
    });

    it("returns Google's error code for any other error", async () => {
      const { result } = await check(() => hostileError("server_error", 500));

      expect(result).toEqual({ kind: "googleError", errorCode: "server_error", status: 500 });
    });

    it("sends nothing when no secret is staged", async () => {
      const { result, http } = await check(() => refreshSuccess(), { staged: null });

      expect(result).toEqual({ kind: "nothingStaged" });
      expect(http.requests).toEqual([]);
    });

    it("sends nothing when the account has no refresh token", async () => {
      const { result, http } = await check(() => refreshSuccess(), { saved: null });

      expect(result).toEqual({ kind: "notSignedIn" });
      expect(http.requests).toEqual([]);
    });

    it("says unreachable when Google can't be reached", async () => {
      const { result } = await check(() => {
        throw new Error("network down");
      });

      expect(result).toEqual({ kind: "unreachable" });
    });

    it("refuses a bad ref before reading or sending anything", async () => {
      const http = fakeGoogle(() => refreshSuccess());
      const tokens = fakeTokenStore();
      let reads = 0;
      const ports = {
        http,
        tokens,
        readStagedClientSecret: async () => {
          reads += 1;
          return stagedSecret;
        },
      };

      await expect(
        checkStagedClientSecret({ ...input, accountRef: "x@example.com" }, ports),
      ).rejects.toBeInstanceOf(RangeError);
      await expect(
        checkStagedClientSecret({ ...input, clientRef: "client:other" }, ports),
      ).rejects.toBeInstanceOf(RangeError);
      expect(reads).toBe(0);
      expect(http.requests).toEqual([]);
    });

    it("keeps every secret out of the result, also when Google's answer echoes them", async () => {
      const secrets = {
        stagedSecret,
        refreshToken: fakeRefreshToken,
        accessToken: fakeAccessToken,
      };
      const echo = Object.values(secrets).join(" ");
      const answers: Array<() => Response> = [
        () => refreshSuccess(),
        () => hostileError(echo, 401),
        () => hostileError("invalid_client", 401),
        () => hostileError("invalid_grant"),
        htmlErrorPage,
        () => {
          throw new Error(`reset while sending ${echo}`, { cause: echo });
        },
      ];

      for (const answer of answers) {
        const { result, http, tokens } = await check(answer);
        expect(
          findLeakedSecrets(secrets, {
            results: [result],
            texts: [...http.requests.map((request) => request.url), ...tokens.namesWritten],
          }),
        ).toEqual([]);
      }
    });
  });
});
