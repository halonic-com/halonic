import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { findSecretShape } from "./secret-shape.ts";

// Fake key bodies, built while the test runs, so this file holds no
// secret-shaped text for the leak guard or `gitleaks` to find.
const alphabet = "Q7x2Lm9Kp4Rt8Vw3Zc6Nb5Hj1Fd0GsYa";

/** A varied run of letters and digits of the given length. */
function body(length: number): string {
  return alphabet.repeat(Math.ceil(length / alphabet.length)).slice(0, length);
}

/** A run of digits of the given length. */
function digits(length: number): string {
  return "1234567890".repeat(Math.ceil(length / 10)).slice(0, length);
}

verifies("std.secret-shape", () => {
  describe("finds each format, in the length the provider hands out", () => {
    it.each([
      ["an OpenAI project key", `sk-proj-${body(48)}_${body(20)}`, "ai-provider-key"],
      ["an older OpenAI key", `sk-${body(48)}`, "ai-provider-key"],
      ["an Anthropic key", `sk-ant-api03-${body(40)}-${body(40)}AA`, "ai-provider-key"],
      ["a Google OAuth client secret", `GOCSPX-${body(28)}`, "google-client-secret"],
      ["a Google API key", `AIza${body(35)}`, "google-api-key"],
      ["a GitHub classic token", `ghp_${body(36)}`, "github-token"],
      ["a GitHub fine-grained token", `github_pat_${body(22)}_${body(59)}`, "github-token"],
      ["a Slack bot token", `xoxb-${digits(10)}-${digits(13)}-${body(24)}`, "slack-token"],
    ])("%s", (_name, key, shape) => {
      expect(findSecretShape(key)).toBe(shape);
    });
  });

  it("finds a key anywhere in a message", () => {
    const key = `sk-ant-${body(40)}`;
    expect(findSecretShape(`here is my key: ${key}, use it`)).toBe("ai-provider-key");
    expect(findSecretShape(`line one\n${key}`)).toBe("ai-provider-key");
    expect(findSecretShape(`ANTHROPIC_API_KEY=${key}`)).toBe("ai-provider-key");
    expect(findSecretShape(`"${key}"`)).toBe("ai-provider-key");
    expect(findSecretShape(`(${key})`)).toBe("ai-provider-key");
  });

  it("finds exactly 16 characters after the prefix, not 15", () => {
    expect(findSecretShape(`sk-${body(16)}`)).toBe("ai-provider-key");
    expect(findSecretShape(`sk-${body(15)}`)).toBeUndefined();
    expect(findSecretShape(`GOCSPX-${body(16)}`)).toBe("google-client-secret");
    expect(findSecretShape(`GOCSPX-${body(15)}`)).toBeUndefined();
  });

  it("finds a key with a digit or a capital letter, not one with only lowercase", () => {
    expect(findSecretShape(`GOCSPX-${"abcdefgh".repeat(3)}Q`)).toBe("google-client-secret");
    expect(findSecretShape(`GOCSPX-${"abcdefgh".repeat(3)}7`)).toBe("google-client-secret");
    expect(findSecretShape(`GOCSPX-${"abcdefgh".repeat(3)}`)).toBeUndefined();
  });

  it("answers with the kind that comes first in the text", () => {
    const google = `GOCSPX-${body(28)}`;
    const github = `ghp_${body(36)}`;
    expect(findSecretShape(`${google} and ${github}`)).toBe("google-client-secret");
    expect(findSecretShape(`${github} and ${google}`)).toBe("github-token");
  });

  describe("ignores near misses", () => {
    it.each([
      ["an empty message", ""],
      ["sk-learn", "sk-learn"],
      ["sk-learn in a sentence", "we use sk-learn and pandas for this"],
      ["a long slug", "sk-learn-tutorial-for-beginners"],
      ["a long slug in a sentence", "see sk-video-processing for that"],
      ["a long slug with underscores", "sk-learn_pipeline_example"],
      ["a digit after the slug ends", "sk-learn-tutorial-for-beginners 2"],
      ["a prefix named in a sentence", "Google secrets start with GOCSPX- and keys with AIza."],
      ["a prefix inside a longer word", `task-${body(20)}`],
      ["a prefix after a letter", `xGOCSPX-${body(28)}`],
      ["a prefix after an underscore", `my_ghp_${body(36)}`],
      ["a prefix after a hyphen", `pre-sk-${body(20)}`],
      ["a prefix in the wrong case", `gocspx-${body(28)}`],
      ["a cut-short key", `AIza${body(15)}`],
      ["a space after the prefix", `sk- ${body(20)}`],
      ["a Google client ID", "1234-abc.apps.googleusercontent.com"],
    ])("%s", (_name, text) => {
      expect(findSecretShape(text)).toBeUndefined();
    });
  });

  it("answers with the kind only, never the key", () => {
    const key = `sk-proj-${body(48)}`;
    const answer = findSecretShape(`my key is ${key}`);
    expect(answer).toBe("ai-provider-key");
    expect(JSON.stringify(answer)).not.toContain(body(16));
  });
});
