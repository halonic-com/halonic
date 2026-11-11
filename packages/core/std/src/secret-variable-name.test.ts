import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { isSecretVariableName } from "./secret-variable-name.ts";

verifies("std.secret-variable-name", () => {
  it("counts a name with a secret word, in any case and either way of splitting", () => {
    for (const name of [
      "ANTHROPIC_API_KEY",
      "GITHUB_TOKEN",
      "NODE_AUTH_TOKEN",
      "npm_config__authToken",
      "apiKey",
      "AWS_SECRET_ACCESS_KEY",
      "DB_PASSWORD",
      "session-cookie",
    ]) {
      expect(isSecretVariableName(name)).toBe(true);
    }
  });

  it("doesn't count a secret word inside another word", () => {
    for (const name of [
      "KEYMAP",
      "AUTHOR",
      "TOKENIZER_PATH",
      "AWS_PROFILE",
      "PATH",
      "KUBECONFIG",
    ]) {
      expect(isSecretVariableName(name)).toBe(false);
    }
  });
});
