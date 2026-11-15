import { describe, expect, it } from "vitest";
import { allPassedText, resultText } from "./result-lines.ts";

const gmail = { service: "gmail", label: "Gmail", result: { kind: "works" } } as const;
const drive = { service: "drive", label: "Drive", result: { kind: "allowed" } } as const;

describe("resultText", () => {
  it("says a service works or is only allowed", () => {
    expect(resultText(gmail)).toEqual({ passed: true, text: "Gmail works" });
    expect(resultText(drive)).toEqual({ passed: true, text: "Drive is allowed" });
  });

  it("tells the user to tick the box they left empty", () => {
    const text = resultText({
      ...drive,
      result: { kind: "scopeNotGranted", missingScopes: ["https://example.com/drive"] },
    });
    expect(text.passed).toBe(false);
    expect(text.text).toBe("Drive: you didn't allow Drive access. Sign in again and tick Drive.");
  });

  it("names the API and project and offers the switch-on page", () => {
    const text = resultText({
      ...drive,
      result: {
        kind: "apiOff",
        api: "drive.googleapis.com",
        apiName: "Google Drive API",
        project: "halonic-x",
        enableUrl: "https://console.example.com/enable",
      },
    });
    expect(text.text).toBe("Drive: the Google Drive API is off in project halonic-x.");
    expect(text.enableUrl).toBe("https://console.example.com/enable");
  });

  it("falls back to the service name when the API isn't known", () => {
    const text = resultText({ ...drive, result: { kind: "apiOff" } });
    expect(text.text).toBe("Drive: the Drive API is off.");
    expect(text.enableUrl).toBeUndefined();
  });

  it("never repeats Google's own text for a failed check", () => {
    const text = resultText({ ...drive, result: { kind: "checkFailed", status: 429 } });
    expect(text.text).toContain("(429)");
    expect(resultText({ ...drive, result: { kind: "unreachable" } }).passed).toBe(false);
  });
});

describe("allPassedText", () => {
  it("says work for services that were checked", () => {
    expect(allPassedText("x@example.com", [gmail, { ...drive, result: { kind: "works" } }])).toBe(
      "Google is set up for x@example.com. Gmail and Drive work.",
    );
  });

  it("says allowed apart from works", () => {
    expect(allPassedText("x@example.com", [gmail, drive])).toBe(
      "Google is set up for x@example.com. Gmail works. Drive is allowed.",
    );
  });
});
