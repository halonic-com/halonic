import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  accessNotConfiguredJson,
  fakeProjectNumber,
  googleErrorJson,
  serviceDisabledJson,
  userContent,
} from "./check-answer.test-helper.ts";
import { readGoogleCheckAnswer } from "./check-answer.ts";
import { atlasService, ledgerService } from "./services.test-helper.ts";

const ledgerEnablePage = "https://console.cloud.google.com/apis/library/ledger.googleapis.com";

verifies("google-setup.check-api-off", () => {
  it("reads Google's full answer: the API, its name from the sheet and the project number", () => {
    expect(
      readGoogleCheckAnswer({ status: 403, json: serviceDisabledJson() }, ledgerService),
    ).toEqual({
      kind: "apiOff",
      api: "ledger.googleapis.com",
      apiName: "Ledger API",
      project: fakeProjectNumber,
      enableUrl: `${ledgerEnablePage}?project=${fakeProjectNumber}`,
    });
  });

  it("prefers the project ID from the setup, and ignores one that isn't valid", () => {
    const json = serviceDisabledJson();

    const withId = readGoogleCheckAnswer({ status: 403, json }, ledgerService, "halonic-x1");
    const withTypo = readGoogleCheckAnswer({ status: 403, json }, ledgerService, "Halonic X");

    expect(withId).toMatchObject({
      project: "halonic-x1",
      enableUrl: `${ledgerEnablePage}?project=halonic-x1`,
    });
    expect(withTypo).toMatchObject({ project: fakeProjectNumber });
  });

  it("gives apiOff with no other field for the older accessNotConfigured alone", () => {
    expect(
      readGoogleCheckAnswer({ status: 403, json: accessNotConfiguredJson() }, ledgerService),
    ).toEqual({ kind: "apiOff" });
  });

  it("keeps no API and no link when metadata.service isn't an API the service's sheet lists", () => {
    for (const service of [
      "other.googleapis.com",
      "evil.example.com",
      "ledger.googleapis.com.example.com",
      "LEDGER.googleapis.com",
      42,
      userContent,
    ]) {
      const json = serviceDisabledJson({ service });

      const result = readGoogleCheckAnswer({ status: 403, json }, ledgerService);

      expect(result).toEqual({ kind: "apiOff", project: fakeProjectNumber });
    }
  });

  it("keeps no project when consumer isn't a project number", () => {
    for (const consumer of [
      "123456789012",
      "projects/halonic-x1",
      "projects/../evil",
      `projects/${userContent}`,
      `projects/${"1".repeat(21)}`,
      {},
    ]) {
      const json = serviceDisabledJson({ consumer });

      const result = readGoogleCheckAnswer({ status: 403, json }, ledgerService);

      expect(result).not.toHaveProperty("project");
      expect(result).toMatchObject({ enableUrl: ledgerEnablePage });
    }
  });

  it("keeps no text from the answer that only has the shape of a host or a project", () => {
    const secretLike = "fake-secret-0000000001";
    const json = serviceDisabledJson({
      service: `${secretLike}.googleapis.com`,
      consumer: `projects/${secretLike}`,
    });

    const result = readGoogleCheckAnswer({ status: 403, json }, ledgerService);

    expect(result).toEqual({ kind: "apiOff" });
    expect(JSON.stringify(result)).not.toContain(secretLike);
  });

  it("reads an ErrorInfo with an odd reason or metadata as saying nothing", () => {
    const oddInfo = {
      "@type": "type.googleapis.com/google.rpc.ErrorInfo",
      reason: userContent,
      metadata: `service=ledger.googleapis.com ${userContent}`,
    };
    const json = {
      error: { errors: [{ reason: "accessNotConfigured" }], details: [oddInfo, "odd"] },
    };

    expect(readGoogleCheckAnswer({ status: 403, json }, ledgerService)).toEqual({ kind: "apiOff" });
  });

  it("needs a 403: the same body with another status is checkFailed", () => {
    expect(
      readGoogleCheckAnswer({ status: 400, json: serviceDisabledJson() }, atlasService),
    ).toEqual({ kind: "checkFailed", status: 400, reason: "SERVICE_DISABLED" });
  });

  it("keeps none of Google's free text", () => {
    const result = JSON.stringify(
      readGoogleCheckAnswer({ status: 403, json: serviceDisabledJson() }, ledgerService),
    );

    expect(result).not.toContain("alex@example.com");
    expect(result).not.toContain("Holiday");
    expect(result).not.toContain("console.developers.google.com");
  });
});

verifies("google-setup.check-result", () => {
  it("gives works for any 2xx status, whatever the body", () => {
    expect(readGoogleCheckAnswer({ status: 200, json: { id: "me" } }, ledgerService)).toEqual({
      kind: "works",
    });
    expect(readGoogleCheckAnswer({ status: 204, json: undefined }, ledgerService)).toEqual({
      kind: "works",
    });
  });

  describe("any other status", () => {
    it("keeps the status and Google's reason code", () => {
      const json = googleErrorJson(429, "rateLimitExceeded");

      expect(readGoogleCheckAnswer({ status: 429, json }, ledgerService)).toEqual({
        kind: "checkFailed",
        status: 429,
        reason: "rateLimitExceeded",
      });
    });

    it("gives a 403 that doesn't say the API is off as checkFailed", () => {
      const json = googleErrorJson(403, "insufficientPermissions");

      expect(readGoogleCheckAnswer({ status: 403, json }, ledgerService)).toEqual({
        kind: "checkFailed",
        status: 403,
        reason: "insufficientPermissions",
      });
    });

    it("keeps no reason for a body that isn't Google's error JSON", () => {
      for (const json of [undefined, null, "<html>Bad gateway</html>", [], { error: "x" }, 42]) {
        expect(readGoogleCheckAnswer({ status: 502, json }, ledgerService)).toEqual({
          kind: "checkFailed",
          status: 502,
        });
      }
    });

    it("keeps no reason that isn't a single word", () => {
      for (const reason of [userContent, { message: userContent }, "", "a".repeat(65)]) {
        const json = googleErrorJson(401, reason);

        expect(readGoogleCheckAnswer({ status: 401, json }, ledgerService)).toEqual({
          kind: "checkFailed",
          status: 401,
        });
      }
    });

    it("skips an odd errors entry and reads the next one", () => {
      const json = {
        error: { errors: [{ reason: { message: userContent } }, "odd", { reason: "authError" }] },
      };

      expect(readGoogleCheckAnswer({ status: 401, json }, ledgerService)).toEqual({
        kind: "checkFailed",
        status: 401,
        reason: "authError",
      });
    });
  });
});
