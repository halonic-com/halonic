import type { DeployedVersion, DeployFailure } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { deployMessages } from "../messages/deploy.ts";
import { plainText } from "../messages/phrase.ts";
import { errorDocument, printError } from "../print-error.ts";
import { deployFailure } from "./deploy-failure.ts";

const version1: DeployedVersion = {
  number: 1,
  id: "v1",
  commit: "3f9c2e1",
  halonicVersion: "0.3.1",
  liveSince: undefined,
};

function failure(fields: Partial<DeployFailure> & Pick<DeployFailure, "message">): DeployFailure {
  const { message, ...rest } = fields;
  return Object.assign(new Error(message), {
    name: "DeployFailure",
    kind: "conflict" as const,
    code: "deploy-locked" as const,
    fix: undefined,
    ...rest,
  });
}

function printed(error: unknown): string[] {
  const lines: string[] = [];
  printError(deployFailure(error, "web"), (line) => lines.push(plainText(line)), {
    action: deployMessages.action("web"),
  });
  return lines;
}

verifies("cli.deploy-output", () => {
  it("says which version is still live after a lock taken over, with the target's fix", () => {
    const lost = failure({
      message: "Another deploy took over while this one was running, so this one stopped.",
      fix: "Run halonic deploy again once the other deploy has finished.",
      live: version1,
      stoppedAfter: { step: "upload", version: 2, files: 41, secrets: 2 },
    });
    expect(printed(lost)).toEqual([
      "✕ Couldn't deploy web: another deploy took over while this one was running, so this one stopped. Version 1 is still live.",
      "  It stopped after uploading version 2.",
      "  Run halonic deploy again once the other deploy has finished.",
    ]);
  });

  it("says nothing is live yet on a first deploy, and runs again when the target gives no fix", () => {
    const lost = failure({ message: "This deploy lost its hold, so it stopped.", live: "none" });
    expect(printed(lost)).toEqual([
      "✕ Couldn't deploy web: this deploy lost its hold, so it stopped. Nothing is live on web yet.",
      "  Run halonic deploy again.",
    ]);
  });

  it("names the step a stopped deploy stopped after, with the stop's fix", () => {
    const stopped = failure({
      message: "Stopped.",
      code: "stopped",
      live: version1,
      stoppedAfter: {
        step: "create",
        resource: { kind: "database", name: "acme-data" },
      },
    });
    expect(printed(stopped).slice(1)).toEqual([
      "  It stopped after creating the D1 database acme-data.",
      "  Run halonic deploy web again to finish. It picks up what's already there.",
    ]);
  });

  it("passes on live and stoppedAfter in --json", () => {
    const stoppedAfter = { step: "database" as const, changes: 2, first: false };
    const lost = failure({ message: "Lost.", live: version1, stoppedAfter });
    const { error } = errorDocument(deployFailure(lost, "web"));
    expect(error).toMatchObject({
      kind: "conflict",
      code: "deploy-locked",
      message: "Lost. Version 1 is still live.",
      fix: "Run halonic deploy again.",
      live: version1,
      stoppedAfter,
    });
  });

  it("adds a full stop to a reason that has none before saying what still serves", () => {
    const lost = failure({
      message: "This deploy lost its hold on web, so it stopped: fetch failed",
      live: version1,
    });
    expect(printed(lost)[0]).toBe(
      "✕ Couldn't deploy web: this deploy lost its hold on web, so it stopped: fetch failed. Version 1 is still live.",
    );
  });

  it("never names making a version live next to an older version still live", () => {
    const lost = failure({
      message: "Lost.",
      live: version1,
      stoppedAfter: { step: "switch", version: 2 },
    });
    expect(printed(lost)).toEqual([
      "✕ Couldn't deploy web: Lost. Version 1 is still live.",
      "  Run halonic deploy again.",
    ]);
  });

  it("gives back a failure that doesn't say what still serves", () => {
    const locked = failure({ message: "A deploy of web by sam@example.com is still running." });
    expect(deployFailure(locked, "web")).toBe(locked);
    const plain = new Error("boom");
    expect(deployFailure(plain, "web")).toBe(plain);
  });
});
