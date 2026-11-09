import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  type ConnectorStateRecord,
  connectorState,
  testingHintWindowMs,
} from "./connector-state.ts";
import { readRefreshAnswer } from "./refresh-answer.ts";

const lastSignInAt = "2026-11-01T12:00:00.000Z";
const signedInMs = Date.parse(lastSignInAt);
const day = 24 * 60 * 60 * 1000;

/** A personal account's app that was never ticked "In production". */
const personalInTesting: ConnectorStateRecord = {
  accountType: "personal",
  inProductionTickedAt: null,
  lastSignInAt,
  projectId: "acme-mail",
  refreshRefused: null,
};

const signInRefused = { kind: "signInRefused" } as const;

/** The time `ms` after the last sign-in. */
function afterSignIn(ms: number): Date {
  return new Date(signedInMs + ms);
}

verifies("google-setup.connector-state", () => {
  describe("a refused sign-in (invalid_grant)", () => {
    it("needs sign-in again at step 7, keeping the client ID and secret", () => {
      expect(connectorState(personalInTesting, signInRefused, afterSignIn(2 * day))).toEqual({
        kind: "needs-sign-in-again",
        testingHint: false,
        reopenAt: ["sign-in"],
      });
    });

    it("leads with the Testing hint and opens Publish first, 7 days after sign-in", () => {
      expect(connectorState(personalInTesting, signInRefused, afterSignIn(7 * day))).toEqual({
        kind: "needs-sign-in-again",
        testingHint: true,
        reopenAt: ["consent", "sign-in"],
      });
    });

    it("gives the hint on both edges of the 6½ to 7½ day window and not a millisecond outside", () => {
      const hint = (ms: number) =>
        connectorState(personalInTesting, signInRefused, afterSignIn(ms));

      expect(hint(testingHintWindowMs.from)).toMatchObject({ testingHint: true });
      expect(hint(testingHintWindowMs.to)).toMatchObject({ testingHint: true });
      expect(hint(testingHintWindowMs.from - 1)).toMatchObject({ testingHint: false });
      expect(hint(testingHintWindowMs.to + 1)).toMatchObject({ testingHint: false });
      expect(testingHintWindowMs).toEqual({ from: 6.5 * day, to: 7.5 * day });
    });

    it("gives no hint when the user ticked In production: the timing is then a coincidence", () => {
      const ticked = { ...personalInTesting, inProductionTickedAt: "2026-10-30T09:00:00.000Z" };

      expect(connectorState(ticked, signInRefused, afterSignIn(7 * day))).toMatchObject({
        testingHint: false,
        reopenAt: ["sign-in"],
      });
    });

    it("gives no hint to a Workspace account, whose Internal app never has the In production tick", () => {
      const workspace = { ...personalInTesting, accountType: "workspace" } as const;

      expect(connectorState(workspace, signInRefused, afterSignIn(7 * day))).toMatchObject({
        testingHint: false,
        reopenAt: ["sign-in"],
      });
    });

    it("gives no hint when the record has no sign-in time", () => {
      const neverSignedIn = { ...personalInTesting, lastSignInAt: null };

      expect(connectorState(neverSignedIn, signInRefused, afterSignIn(7 * day))).toMatchObject({
        testingHint: false,
      });
    });
  });

  it("needs a new secret at step 6 for a refused client (invalid_client)", () => {
    expect(connectorState(personalInTesting, { kind: "clientRefused" }, afterSignIn(day))).toEqual({
      kind: "needs-new-secret",
      clientGone: false,
      reopenAt: ["credentials"],
    });
  });

  describe("an API switched off during a run", () => {
    const now = afterSignIn(day);

    it("reopens at step 2 with the Enable link in the record's project", () => {
      const problem = {
        kind: "apiDisabled",
        api: "gmail.googleapis.com",
        project: "123456789012",
      } as const;

      expect(connectorState(personalInTesting, problem, now)).toEqual({
        kind: "api-off",
        api: "gmail.googleapis.com",
        project: "acme-mail",
        enableUrl:
          "https://console.cloud.google.com/apis/library/gmail.googleapis.com?project=acme-mail",
        reopenAt: ["apis"],
      });
    });

    it("uses Google's project number when the record has no project ID", () => {
      const noProject = { ...personalInTesting, projectId: null };
      const problem = {
        kind: "apiDisabled",
        api: "gmail.googleapis.com",
        project: "123456789012",
      } as const;

      expect(connectorState(noProject, problem, now)).toMatchObject({
        project: "123456789012",
        enableUrl:
          "https://console.cloud.google.com/apis/library/gmail.googleapis.com?project=123456789012",
      });
    });

    it("has no link when Google didn't name the API as <name>.googleapis.com, and no project it can't trust", () => {
      const noProject = { ...personalInTesting, projectId: null };

      for (const api of [undefined, "gmail", "evil.example.com/gmail.googleapis.com"]) {
        const state = connectorState(
          noProject,
          { kind: "apiDisabled", ...(api === undefined ? {} : { api }), project: "x?y=1" },
          now,
        );
        expect(state).toEqual({ kind: "api-off", reopenAt: ["apis"] });
      }
    });
  });

  it("holds no token, secret or text from Google when made from a refused refresh", () => {
    const fakeRefreshToken = "fake-refresh-token";
    const fakeSecret = "GOCSPX-fake-client-secret";
    const answers = [
      { error: "invalid_grant", error_description: `token ${fakeRefreshToken}` },
      { error: "invalid_client", error_description: `secret ${fakeSecret}` },
    ];

    for (const json of answers) {
      const refusal = readRefreshAnswer({ status: 400, json });
      if (refusal.kind !== "signInRefused" && refusal.kind !== "clientRefused") {
        throw new Error(`expected a refusal, got ${refusal.kind}`);
      }
      const state = JSON.stringify(connectorState(personalInTesting, refusal, afterSignIn(day)));
      expect(state).not.toContain(fakeRefreshToken);
      expect(state).not.toContain(fakeSecret);
      expect(state).not.toContain("token ");
    }
  });
});
