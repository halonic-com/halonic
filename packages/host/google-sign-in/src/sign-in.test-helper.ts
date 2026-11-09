import type { SetupService } from "@halonicjs/google-setup";
import { encodeBase64url, type RandomBytes } from "@halonicjs/std";
import {
  fakeAccountRef,
  fakeClient,
  fakeCode,
  fakeEmail,
  fakeGoogle,
  fakeTokenStore,
  type RecordedRequest,
  testStart,
} from "./fake-google.test-helper.ts";
import { createPendingSignIns } from "./pending-sign-ins.ts";
import { finishGoogleSignIn, type StartGoogleSignInInput, startGoogleSignIn } from "./sign-in.ts";

export const gmailScope = "https://www.googleapis.com/auth/gmail.readonly";
export const driveScope = "https://www.googleapis.com/auth/drive.file";
export const gmailCheckUrl = "https://gmail.googleapis.com/gmail/v1/users/me/profile";
export const tokenEndpoint = "https://oauth2.googleapis.com/token";

/** A service with a check after sign-in, as Gmail's sheet has. */
export const gmailService: SetupService = {
  id: "gmail",
  label: "Gmail",
  googleApis: [{ api: "gmail.googleapis.com", name: "Gmail API" }],
  googleScopes: [{ scope: gmailScope, reason: "Reads your mail" }],
  googleCheck: { method: "GET", url: gmailCheckUrl },
};

/** A service without a check, so its result can only be `allowed`. */
export const driveService: SetupService = {
  id: "drive",
  label: "Drive",
  googleApis: [{ api: "drive.googleapis.com", name: "Google Drive API" }],
  googleScopes: [{ scope: driveScope, reason: "Opens the files you pick" }],
};

export const startInput: StartGoogleSignInInput = {
  accountRef: fakeAccountRef,
  clientId: fakeClient.clientId,
  clientRef: fakeClient.clientRef,
  redirect: { port: 8787, path: "/google/callback" },
  account: fakeEmail,
  services: [gmailService],
};

/**
 * A random source that fills each call's bytes with the call's number, so the
 * test knows the verifier (first call) and `state` (second call) and they differ.
 */
function countingRandomBytes(): RandomBytes {
  let call = 0;
  return (byteCount) => {
    call += 1;
    return new Uint8Array(byteCount).fill(call);
  };
}

/** The verifier `countingRandomBytes` gives: 32 bytes of 0x01, as base64url. */
export const knownVerifier = encodeBase64url(new Uint8Array(32).fill(1));

/** The requests to Google's token endpoint, leaving out the checks. */
export function tokenRequests(requests: readonly RecordedRequest[]): RecordedRequest[] {
  return requests.filter((request) => request.url === tokenEndpoint);
}

/** One server with a fake Google, a fake store and a clock at `testStart`. */
export function testServer(answer: (request: RecordedRequest) => Response) {
  const clock = { now: () => new Date(testStart) };
  const google = fakeGoogle(answer);
  const tokens = fakeTokenStore();
  const ports = {
    pendingSignIns: createPendingSignIns(clock),
    http: google,
    tokens,
    clock,
    readClientSecret: async (clientRef: string) =>
      clientRef === fakeClient.clientRef ? fakeClient.clientSecret : null,
  };

  return {
    google,
    tokens,
    ports,
    /** Starts a sign-in and returns its auth URL and `state`. */
    async start(input: StartGoogleSignInInput = startInput) {
      const authUrl = await startGoogleSignIn(input, ports.pendingSignIns, countingRandomBytes());
      return { authUrl, state: new URL(authUrl).searchParams.get("state") ?? "" };
    },
    /** Sends Google's callback with these query parameters. */
    finish: (query: Record<string, string>) =>
      finishGoogleSignIn(new URLSearchParams(query), ports),
  };
}

/** Starts a sign-in and sends back a callback with the fake code and the right `state`. */
export async function signInOnce(answer: (request: RecordedRequest) => Response) {
  const server = testServer(answer);
  const { authUrl, state } = await server.start();
  const result = await server.finish({ code: fakeCode, state });
  return { ...server, authUrl, result };
}
