import { verifies } from "@halonicjs/testing-spec";
import { beforeEach, describe, expect, it } from "vitest";
import { company, me, testKey } from "./acme-data.test-helper.ts";
import { FakePaperclip } from "./fake-paperclip.test-helper.ts";
import { findRequest } from "./requests.ts";
import { PaperclipSignInClient } from "./sign-in.ts";
import { findSignInRequest, paperclipSignInRequests } from "./sign-in-requests.ts";

// Answers shaped as HAL-17423's recorded ones (`sign-in-test`), with made-up IDs and secrets.
const challengeId = "69effd29-0000-4000-8000-000000000001";
const challengeSecret = "made-up-challenge-secret";
const challenge = { id: challengeId, token: challengeSecret };
const challengePath = `/api/cli-auth/challenges/${challengeId}`;

let paperclip: FakePaperclip;
let client: PaperclipSignInClient;

beforeEach(() => {
  paperclip = new FakePaperclip();
  client = new PaperclipSignInClient({ address: paperclip.address, fetch: paperclip.fetch });
});

/** Answers polls with `status`, as Paperclip's poll does. */
function pollAnswers(status: string): FakePaperclip {
  return paperclip.on("GET", challengePath, { body: { id: challengeId, status } });
}

verifies("agent-host.paperclip-key", () => {
  describe("the sign-in request list", () => {
    it("holds exactly start, poll and cancel, and no other key route", () => {
      expect(paperclipSignInRequests).toEqual({
        createChallenge: { method: "POST", path: "/api/cli-auth/challenges" },
        pollChallenge: { method: "GET", path: "/api/cli-auth/challenges/:challenge" },
        cancelChallenge: { method: "POST", path: "/api/cli-auth/challenges/:challenge/cancel" },
      });
      for (const path of ["/api/board-api-keys", "/api/cli-auth/challenges/c1/approve"]) {
        expect(findSignInRequest("POST", path), path).toBeUndefined();
      }
    });

    it("stays apart from the messaging list, which still can't start a sign-in", () => {
      expect(findRequest("POST", "/api/cli-auth/challenges")).toBeUndefined();
    });
  });

  describe("PaperclipSignInClient", () => {
    it("starts a challenge with the phrase in `command`, and sends no key", async () => {
      paperclip.on("POST", "/api/cli-auth/challenges", {
        status: 201,
        body: {
          id: challengeId,
          token: challengeSecret,
          boardApiToken: testKey,
          approvalPath: `/cli-auth/${challengeId}?token=${challengeSecret}`,
          expiresAt: "2026-11-24T10:21:08.462Z",
        },
      });
      const request = {
        command: "amber otter quiet lantern",
        clientName: "Halonic Studio",
        requestedAccess: "board" as const,
        requestedCompanyId: company,
      };
      const created = await client.createChallenge(request);
      expect(created).toEqual({
        id: challengeId,
        token: challengeSecret,
        boardApiToken: testKey,
        approvalPath: `/cli-auth/${challengeId}?token=${challengeSecret}`,
      });
      const [seen] = paperclip.seen;
      expect(seen?.body).toEqual(request);
      expect(seen?.headers.get("authorization")).toBeNull();
    });

    it("polls with the challenge's own secret and reads its status, sending no key", async () => {
      pollAnswers("approved");
      await expect(client.pollChallenge(challenge)).resolves.toBe("approved");
      expect(paperclip.seen[0]?.query.get("token")).toBe(challengeSecret);
      expect(paperclip.seen[0]?.headers.get("authorization")).toBeNull();
    });

    it("answers `cancelled` when the cancel goes through, sending no key", async () => {
      paperclip.on("POST", `${challengePath}/cancel`, {
        body: { status: "cancelled", cancelled: true },
      });
      await expect(client.cancelChallenge(challenge)).resolves.toBe("cancelled");
      expect(paperclip.seen[0]?.body).toEqual({ token: challengeSecret });
      expect(paperclip.seen[0]?.headers.get("authorization")).toBeNull();
    });

    it("answers `approved` when the board approved before the cancel, so the flow revokes the key", async () => {
      paperclip.on("POST", `${challengePath}/cancel`, { status: 409, body: { error: "approved" } });
      pollAnswers("approved");
      await expect(client.cancelChallenge(challenge)).resolves.toBe("approved");
      for (const seen of paperclip.seen) expect(seen.headers.get("authorization")).toBeNull();
    });

    it("throws when a refused cancel leaves the challenge pending", async () => {
      paperclip.on("POST", `${challengePath}/cancel`, { status: 500 });
      pollAnswers("pending");
      await expect(client.cancelChallenge(challenge)).rejects.toMatchObject({ reason: "refused" });
    });

    it("reads the key's owner and revokes the key through the messaging list", async () => {
      paperclip
        .on("GET", "/api/cli-auth/me", {
          body: { userId: me, companyIds: [company], source: "board_key" },
        })
        .on("POST", "/api/cli-auth/revoke-current", { body: { revoked: true } });
      await expect(client.readMe(testKey)).resolves.toEqual({ userId: me, companyIds: [company] });
      await client.revokeCurrent(testKey);
      for (const seen of paperclip.seen) {
        expect(seen.headers.get("authorization")).toBe(`Bearer ${testKey}`);
      }
    });

    it("sends only requests from the two lists, and never to `/api/board-api-keys`", async () => {
      pollAnswers("expired");
      paperclip.on("POST", `${challengePath}/cancel`, { status: 409 });
      await client.cancelChallenge(challenge);
      for (const seen of paperclip.seen) {
        const allowed =
          findSignInRequest(seen.method, seen.path) ?? findRequest(seen.method, seen.path);
        expect(allowed, `${seen.method} ${seen.path}`).toBeDefined();
        expect(seen.path).not.toContain("board-api-keys");
      }
    });

    it("refuses a redirect and an unsafe challenge ID before sending it", async () => {
      paperclip.on("GET", challengePath, {
        status: 307,
        headers: { location: `${paperclip.address}/api/board-api-keys` },
      });
      await expect(client.pollChallenge(challenge)).rejects.toMatchObject({ reason: "redirect" });
      await expect(client.pollChallenge({ id: "x/../../keys", token: "t" })).rejects.toThrow();
      expect(paperclip.seen).toHaveLength(1);
    });

    it("keeps the challenge secret and the key out of every error", async () => {
      const offline = new PaperclipSignInClient({
        address: paperclip.address,
        fetch: () => Promise.reject(new TypeError(`fetch failed: ${challengeSecret}`)),
      });
      const errors = await Promise.allSettled([
        offline.pollChallenge(challenge),
        offline.readMe(testKey),
        client.pollChallenge(challenge),
      ]);
      for (const settled of errors) {
        expect(settled.status).toBe("rejected");
        const text = String(settled.status === "rejected" ? settled.reason : "");
        expect(text).not.toContain(challengeSecret);
        expect(text).not.toContain(testKey);
      }
    });

    it("refuses plain http to anything but this computer", () => {
      expect(() => new PaperclipSignInClient({ address: "http://paperclip.acme.test" })).toThrow();
      expect(() => new PaperclipSignInClient({ address: "http://127.0.0.1:3100" })).not.toThrow();
    });
  });
});
