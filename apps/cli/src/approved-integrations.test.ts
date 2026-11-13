import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TrustGrant } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { approvedIntegrations } from "./approved-integrations.ts";

const mailSheet = `id: mail
version: 0.1.0
kit: 1
provides: [connector]
hosts: [{ fromSetting: mail_url, class: private }]
tools:
  - { name: send_email, description: Sends an email., risk: send, noun: { one: email, many: emails }, untrusted: false }
`;

const grant: TrustGrant = { location: "/trusted/acme", fingerprint: "hfp1:0000" };

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-approved-integrations-"));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

verifies("workspace.declared-tools", () => {
  describe("approvedIntegrations", () => {
    it("passes no integration list to a run without a trust grant", async () => {
      // The folder isn't read at all: a path that holds nothing would also give none.
      expect(await approvedIntegrations(null, "/nowhere/acme")).toBeUndefined();
    });

    it("passes the integrations of the workspace to a run with a trust grant", async () => {
      await mkdir(join(folder, "integrations/mail"), { recursive: true });
      await writeFile(join(folder, "integrations/mail/integration.yaml"), mailSheet);
      const integrations = await approvedIntegrations(grant, folder);
      expect(integrations?.map((integration) => integration.folder)).toEqual(["integrations/mail"]);
      expect(integrations?.[0]?.sheet.tools?.[0]?.noun).toEqual({ one: "email", many: "emails" });
    });
  });
});
