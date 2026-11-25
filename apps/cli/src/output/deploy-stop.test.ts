import type { DeployedVersion, DeployFailure, DeployStep } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { deployMessages } from "../messages/deploy.ts";
import { plainText } from "../messages/phrase.ts";
import { type DeployStopFacts, deployStopped } from "./deploy-stop.ts";

const version1: DeployedVersion = {
  number: 1,
  id: "v1",
  commit: "3f9c2e1",
  halonicVersion: "0.3.1",
  liveSince: undefined,
};

const fix = "  Run halonic deploy web again to finish. It picks up what's already there.";

/** The target's `stopped` failure, as a stop of the request's signal throws it. */
function stopped(live: DeployedVersion | "none", stoppedAfter?: DeployStep): DeployFailure {
  return Object.assign(new Error("The deploy was interrupted."), {
    name: "DeployFailure",
    kind: "conflict" as const,
    code: "stopped" as const,
    fix: undefined,
    live,
    ...(stoppedAfter === undefined ? {} : { stoppedAfter }),
  });
}

function linesOf(error: unknown, facts: Partial<DeployStopFacts> = {}): string[] | undefined {
  const result = deployStopped(error, {
    deployment: "web",
    running: undefined,
    changed: true,
    databaseChanges: undefined,
    ...facts,
  });
  return result?.lines?.map((line) => plainText(line));
}

const upload2: DeployStep = { step: "upload", version: 2, files: 41, secrets: 2 };

verifies("cli.deploy-output", () => {
  describe("a stop says the 3.7 lines, never the Couldn't shape (C787 row 1)", () => {
    it("names the upload it stopped after and the version still live", () => {
      expect(linesOf(stopped(version1, upload2))).toEqual([
        "Stopped after uploading version 2. Version 1 is still live.",
        fix,
      ]);
    });

    it("names what it created last", () => {
      const created: DeployStep = {
        step: "create",
        resource: { kind: "database", name: "acme-data" },
      };
      expect(linesOf(stopped(version1, created))).toEqual([
        "Stopped after creating the D1 database acme-data. Version 1 is still live.",
        fix,
      ]);
    });

    it("counts the database changes made of those planned", () => {
      const database: DeployStep = { step: "database", changes: 1, first: false };
      expect(linesOf(stopped(version1, database), { databaseChanges: 2 })).toEqual([
        "Stopped after 1 of 2 database changes. Version 1 is still live.",
        fix,
      ]);
    });

    it("says a version stopped in its self-test is uploaded but not live", () => {
      const running: DeployStep = { step: "self-test", version: 2 };
      expect(linesOf(stopped(version1, upload2), { running })).toEqual([
        "Stopped. Version 2 is uploaded but not live. Version 1 is still live.",
      ]);
    });

    it("says nothing changed on Cloudflare when it stopped before any step finished", () => {
      const aborted = new DOMException("This operation was aborted", "AbortError");
      expect(linesOf(aborted, { changed: false })).toEqual([
        "Stopped. Nothing changed on Cloudflare.",
      ]);
      expect(linesOf(stopped(version1))).toEqual(["Stopped. Nothing changed on Cloudflare."]);
    });

    it("on a first deploy says nothing is live yet and keeps the answers, before the fix", () => {
      const upload1: DeployStep = { step: "upload", version: 1, files: 41, secrets: 2 };
      expect(linesOf(stopped("none", upload1))).toEqual([
        "Stopped after uploading version 1. Nothing is live on web yet.",
        "  Your answers are kept. Run halonic deploy web again to finish. It picks up what's already there.",
      ]);
      const running: DeployStep = { step: "self-test", version: 1 };
      expect(linesOf(stopped("none", upload1), { running })).toEqual([
        "Stopped. Version 1 is uploaded but not live. Nothing is live on web yet.",
        "  Your answers are kept.",
      ]);
    });

    it("never says interrupted, job or Couldn't", () => {
      const all = [
        linesOf(stopped(version1, upload2)),
        linesOf(stopped(version1, upload2), { running: { step: "self-test", version: 2 } }),
        linesOf(stopped("none", upload2)),
      ]
        .flat()
        .join("\n");
      expect(all).not.toMatch(/interrupted|job|Couldn't|✕/u);
    });

    it("passes on live and stoppedAfter in --json", () => {
      const result = deployStopped(stopped(version1, upload2), {
        deployment: "web",
        running: undefined,
        changed: true,
        databaseChanges: undefined,
      });
      expect(result?.json).toEqual({ deployment: "web", live: version1, stoppedAfter: upload2 });
    });
  });

  it("says only Stopped. when something changed and it can't say what still serves", () => {
    const result = deployStopped(new Error("fetch failed"), {
      deployment: "web",
      running: undefined,
      changed: true,
      databaseChanges: undefined,
    });
    expect(result).toBeUndefined();
  });

  it("never names making a version live next to an older version still live (C787 row 3)", () => {
    expect(linesOf(stopped(version1, { step: "switch", version: 2 }))).toBeUndefined();
  });

  it("adds a full stop to a reason without one before what still serves (C787 row 2)", () => {
    const line = deployMessages.failedWhileLive(
      "This deploy lost its hold on web, so it stopped: fetch failed",
      "Version 1 is still live.",
    );
    expect(plainText(line.phrase)).toBe(
      "This deploy lost its hold on web, so it stopped: fetch failed. Version 1 is still live.",
    );
  });
});
