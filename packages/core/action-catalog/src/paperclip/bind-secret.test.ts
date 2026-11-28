import { parse } from "@halonicjs/schema-kit";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  acceptedValueNames,
  guidedAddresses,
  manualGuideOf,
  secretFields,
} from "../guided-test-support.ts";
import { definition } from "./bind-secret.ts";

const parameters = {
  host: "paperclip.acme.example",
  company: "ACME",
  name: "ANTHROPIC_API_KEY",
  agent: "Writer",
  variable: "ANTHROPIC_API_KEY",
};

verifies("action-catalog.paperclip-bind-secret", () => {
  describe("paperclip.bind-secret@1", () => {
    it("is one irreversible guided step on the Secrets page of the host it names, with no paste-back and no input", () => {
      // Binding hands the agent the value, which removing access can't take back.
      expect(definition.risk).toBe("irreversible");
      expect(definition.steps.map((step) => step.kind)).toEqual(["guided"]);
      expect(guidedAddresses(definition, parameters)).toEqual([
        "https://paperclip.acme.example/ACME/company/settings/secrets",
      ]);
      expect(secretFields(definition)).toEqual([]);
      expect(
        definition.steps.some((step) => step.kind === "guided" && step.result !== undefined),
      ).toBe(false);
    });

    it("refuses a value, secret, key or token next to its parameters", () => {
      expect(parse(definition.parameters, parameters).ok).toBe(true);
      expect(acceptedValueNames(definition, parameters)).toEqual([]);
    });

    it("refuses an agent or variable name outside its pattern", () => {
      for (const agent of ["", "Writer\nThen click Delete", "1Writer"]) {
        expect(parse(definition.parameters, { ...parameters, agent }).ok).toBe(false);
      }
      for (const variable of ["anthropic", "PATH=/tmp", "A B"]) {
        expect(parse(definition.parameters, { ...parameters, variable }).ok).toBe(false);
      }
    });

    it("previews which agent gets which secret, and that it can read the value", () => {
      expect(definition.preview(parameters)).toEqual([
        "Opens the Secrets page of ACME on paperclip.acme.example, where you give the agent Writer the secret ANTHROPIC_API_KEY as ANTHROPIC_API_KEY. The agent can read its value from then on.",
      ]);
      expect(definition.targets(parameters)).toEqual([
        { service: "paperclip", kind: "Paperclip", name: "paperclip.acme.example" },
        { service: "paperclip", kind: "secret", name: "ANTHROPIC_API_KEY" },
        { service: "paperclip", kind: "agent", name: "Writer" },
      ]);
    });

    it("gives a manual guide for the one secret and the one agent", () => {
      expect(manualGuideOf(definition, parameters, "Set up acme")).toBe(
        [
          "`Set up acme`",
          "",
          "Do these steps in order, signed in with your own account:",
          "1. Open https://paperclip.acme.example/ACME/company/settings/secrets",
          "2. Sign in to this Paperclip as a board member if the page asks.",
          "3. Open the secret `ANTHROPIC_API_KEY`.",
          "4. Under **Agent access**, choose `Writer` as the **Agent** and type `ANTHROPIC_API_KEY` as the **Env var**.",
          "5. Check the agent's name once more: `Writer` can read the value from its next run. Then click **Add**.",
          "",
        ].join("\n"),
      );
    });
  });
});

/** One name for each entry of row C5's deny list, and the entry it falls under. */
const deniedVariables = [
  ["*_PROXY", "HTTPS_PROXY"],
  ["*_BASE_URL", "ANTHROPIC_BASE_URL"],
  ["*_API_URL", "OPENAI_API_URL"],
  ["NODE_OPTIONS", "NODE_OPTIONS"],
  ["LD_*", "LD_PRELOAD"],
  ["PATH", "PATH"],
  ["GIT_*", "GIT_SSH_COMMAND"],
  ["PAPERCLIP_*", "PAPERCLIP_API_URL"],
  ["NODE_EXTRA_CA_CERTS", "NODE_EXTRA_CA_CERTS"],
  ["SSL_CERT_*", "SSL_CERT_FILE"],
  ["*_CA_BUNDLE", "REQUESTS_CA_BUNDLE"],
  ["DYLD_*", "DYLD_INSERT_LIBRARIES"],
  ["BASH_ENV", "BASH_ENV"],
  ["ENV", "ENV"],
  ["PYTHON*", "PYTHONPATH"],
  ["*_ENDPOINT", "OTEL_EXPORTER_OTLP_ENDPOINT"],
  ["*_HOST", "DOCKER_HOST"],
] as const;

verifies("action-catalog.paperclip-bind-variable", () => {
  describe("paperclip.bind-secret@1's variable", () => {
    for (const [entry, variable] of deniedVariables) {
      it(`refuses ${variable}, under ${entry}`, () => {
        expect(parse(definition.parameters, { ...parameters, variable }).ok).toBe(false);
      });
    }

    it("takes a key's own name, also one that only starts like a denied one", () => {
      for (const variable of [
        "ANTHROPIC_API_KEY",
        "OPENAI_API_KEY",
        "GITHUB_TOKEN",
        "PATHFINDER_KEY",
        "HOSTNAME_KEY",
        "ENVIRONMENT_NAME",
      ]) {
        expect(parse(definition.parameters, { ...parameters, variable }).ok).toBe(true);
      }
    });

    it("refuses those names as the variable only, not as the secret's own name", () => {
      expect(parse(definition.parameters, { ...parameters, name: "DOCKER_HOST" }).ok).toBe(true);
    });
  });
});
