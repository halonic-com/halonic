import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type ConnectorStateRecord, connectorState } from "./connector-state.ts";
import { readRefreshAnswer } from "./refresh-answer.ts";
import { weeklyEndWindowMs } from "./weekly-sign-in.ts";

const lastSignInAt = "2026-11-01T12:00:00.000Z";
const signedInMs = Date.parse(lastSignInAt);
const day = 24 * 60 * 60 * 1000;

/** A personal account's app in *Testing*, as step 3 sets it up. */
const personalInTesting: ConnectorStateRecord = {
  accountType: "personal",
  inProductionTickedAt: null,
  personalApp: { publishing: "testing", testUserTickedAt: lastSignInAt, sharedApp: false },
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
        weeklyEnd: false,
        reopenAt: ["sign-in"],
      });
    });

    it("is the weekly end 7 days after the sign-in of a Testing app, still at step 7 only", () => {
      expect(connectorState(personalInTesting, signInRefused, afterSignIn(7 * day))).toEqual({
        kind: "needs-sign-in-again",
        weeklyEnd: true,
        reopenAt: ["sign-in"],
      });
    });

    it("is the weekly end on both edges of the 6½ to 7½ day window and not a millisecond outside", () => {
      const weeklyEnd = (ms: number) =>
        connectorState(personalInTesting, signInRefused, afterSignIn(ms));

      expect(weeklyEnd(weeklyEndWindowMs.from)).toMatchObject({ weeklyEnd: true });
      expect(weeklyEnd(weeklyEndWindowMs.to)).toMatchObject({ weeklyEnd: true });
      expect(weeklyEnd(weeklyEndWindowMs.from - 1)).toMatchObject({ weeklyEnd: false });
      expect(weeklyEnd(weeklyEndWindowMs.to + 1)).toMatchObject({ weeklyEnd: false });
      expect(weeklyEndWindowMs).toEqual({ from: 6.5 * day, to: 7.5 * day });
    });

    it("isn't the weekly end when the record says In production: the timing is then a coincidence", () => {
      const published = {
        ...personalInTesting,
        personalApp: { publishing: "production", testUserTickedAt: null, sharedApp: false },
      } as const;

      expect(connectorState(published, signInRefused, afterSignIn(7 * day))).toMatchObject({
        weeklyEnd: false,
        reopenAt: ["sign-in"],
      });
    });

    it("isn't the weekly end for a record from before HAL-18663 that was ticked In production", () => {
      const ticked = {
        ...personalInTesting,
        personalApp: null,
        inProductionTickedAt: "2026-10-30T09:00:00.000Z",
      };

      expect(connectorState(ticked, signInRefused, afterSignIn(7 * day))).toMatchObject({
        weeklyEnd: false,
      });
    });

    it("isn't the weekly end for a Workspace account, whose Internal app is never in Testing", () => {
      const workspace = { ...personalInTesting, accountType: "workspace" } as const;

      expect(connectorState(workspace, signInRefused, afterSignIn(7 * day))).toMatchObject({
        weeklyEnd: false,
        reopenAt: ["sign-in"],
      });
    });

    it("isn't the weekly end when the record has no sign-in time", () => {
      const neverSignedIn = { ...personalInTesting, lastSignInAt: null };

      expect(connectorState(neverSignedIn, signInRefused, afterSignIn(7 * day))).toMatchObject({
        weeklyEnd: false,
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
