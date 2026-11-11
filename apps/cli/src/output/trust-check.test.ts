import type { TrustCheck } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import type {
  AgentTrustContent,
  ConnectorTrustContent,
  IntegrationTrustContent,
  TrustChanges,
} from "@halonicjs/workspace";
import { expect, it } from "vitest";
import { plainText } from "../messages/phrase.ts";
import { shownDate, trustCheckLines } from "./trust-check.ts";

const facts = { name: "Acme", folder: "./acme" };
const fingerprint = "hfp1:c9b6e22b01f6cd3d69165343778b05c2f2c0c4e472d4d4eadeb6d073f5bc61ca";
// Noon UTC, so the day is 3 Nov in every time zone the tests run in.
const trustedAt = "2026-11-03T12:00:00.000Z";

const program = (
  id: string,
  command: string,
  args: string[],
  secretEnv = {},
): ConnectorTrustContent => ({
  id,
  transport: "stdio",
  settings: { command, args, cwd: ".", env: {}, secretEnv },
  tools: { approve: [] },
});
const mail = program("mail-mcp", "npx", ["@acme/mail-mcp", "2.3.1"], {
  GMAIL_TOKEN: "‹secret GMAIL_TOKEN›",
});
const notes = program("notes-mcp", "uvx", ["notes-server"]);
const coder: AgentTrustContent = {
  id: "coder",
  harness: "claude-code",
  allowedSites: ["pypi.org", "registry.npmjs.org"],
  workingFolder: "src/app",
};
const current = { fingerprint, unpinned: ["mail-mcp", "notes-mcp"] };
const content = { connectors: [mail, notes], agents: [coder] };

/** What every local integration's trust content has besides its id and addresses. */
const integrationBase = {
  folder: "integrations/my-crm",
  provides: ["connector"],
  hosts: {},
  secrets: [],
  googleScopes: [],
  tools: {},
  needs: [],
  code: "sha256:00",
};

const crm: IntegrationTrustContent = {
  id: "my-crm",
  ...integrationBase,
  addresses: {
    CRM_URL: "https://crm.example.com/",
    REPORTS_URL: null,
    WEBHOOK: "‹refused: the URL has user info›",
  },
};
const noChanges = { added: [], changed: [], removed: [], unchanged: 0 };

const lines = (check: TrustCheck) => trustCheckLines(check, facts).map(plainText);

verifies("cli.trust-check", () => {
  it("prints a new workspace's check as cli-output 3.5's example", () => {
    expect(lines({ status: "new", content, ...current })).toEqual([
      "Trust check for Acme (./acme)",
      "Before anything in Acme runs on this computer, here's what it can start and where it can talk to.",
      "Will start 2 programs and 1 agent, pass 1 secret and allow 2 sites.",
      "",
      "Programs",
      "  mail-mcp      npx @acme/mail-mcp 2.3.1 · gets the secret GMAIL_TOKEN",
      "                ! Can download new code from npm when it starts: version not pinned.",
      "  notes-mcp     uvx notes-server",
      "                ! Can download new code from PyPI when it starts: version not pinned.",
      "",
      "Agents",
      "  Agents in this workspace that run in Claude Code or Codex.",
      "  coder         Claude Code",
      "                Allowed sites    pypi.org",
      "                                 registry.npmjs.org",
      "                Working folder   src/app",
      "",
      "Fingerprint",
      `  ${fingerprint}`,
    ]);
  });

  it("lists addresses after agents, notes wildcard and non-Latin sites, and leaves out empty sections", () => {
    const inbox: ConnectorTrustContent = {
      id: "inbox",
      transport: "http",
      settings: { url: "https://mail.example.com/mcp", headers: {} },
      secret: "‹secret INBOX_KEY›",
      tools: { approve: [] },
    };
    const reader: AgentTrustContent = {
      id: "reader",
      harness: "codex",
      allowedSites: ["*.example.com", "xn--bcher-kva.example"],
    };
    const check: TrustCheck = {
      status: "new",
      content: { connectors: [inbox], agents: [reader] },
      fingerprint,
      unpinned: [],
    };
    expect(lines(check).slice(2)).toEqual([
      "Will start 1 agent, pass 1 secret, list 1 address and allow 2 sites.",
      "",
      "Agents",
      "  Agents in this workspace that run in Claude Code or Codex.",
      "  reader        Codex",
      "                Allowed sites   *.example.com · every site under example.com",
      "                                xn--bcher-kva.example · (non-Latin letters)",
      "",
      "Addresses",
      "  inbox         https://mail.example.com/mcp · gets the secret INBOX_KEY",
      "",
      "Fingerprint",
      `  ${fingerprint}`,
    ]);
  });

  it("starts with the ! line when the list of trusted workspaces can't be read", () => {
    const check: TrustCheck = {
      status: "unreadable",
      content,
      ...current,
      error: new Error("bad"),
    };
    expect(lines(check)[0]).toBe(
      "! Halonic couldn't read its list of trusted workspaces, so it's asking again.",
    );
  });

  it("shows only what changed since it was trusted, one Changed row per agent field", () => {
    const changes: TrustChanges = {
      added: [notes],
      changed: [{ id: "mail-mcp", before: mail, after: mail, fields: ["settings"] }],
      removed: [],
      unchanged: 0,
      agents: {
        added: [],
        changed: [
          {
            id: "coder",
            before: { id: "coder", harness: "claude-code", allowedSites: ["pypi.org"] },
            after: { ...coder, harness: "codex", allowedSites: ["registry.npmjs.org"] },
            fields: ["allowedSites", "harness", "workingFolder"],
          },
        ],
        removed: [],
        unchanged: 0,
      },
      integrations: noChanges,
      onlyRemoves: false,
    };
    expect(lines({ status: "changed", content, ...current, changes, trustedAt })).toEqual([
      "What changed in Acme since you trusted it on 3 Nov",
      "1 new program, 1 changed program and 1 changed agent.",
      "",
      "Programs",
      "  notes-mcp     uvx notes-server   New",
      "                ! Can download new code from PyPI when it starts: version not pinned.",
      "  mail-mcp      npx @acme/mail-mcp 2.3.1 · gets the secret GMAIL_TOKEN   Changed",
      "                ! Can download new code from npm when it starts: version not pinned.",
      "",
      "Agents",
      "  Agents in this workspace that run in Claude Code or Codex.",
      "  coder         Claude Code → Codex   Changed",
      "  coder         now also allows registry.npmjs.org, no longer allows pypi.org   Changed",
      "  coder         working folder files/agents/coder → src/app   Changed",
      "",
      "Fingerprint",
      `  ${fingerprint}`,
    ]);
  });

  it("lists a local integration's setting addresses under Addresses, one line each", () => {
    const check: TrustCheck = {
      status: "new",
      content: { connectors: [], integrations: [crm] },
      fingerprint,
      unpinned: [],
    };
    expect(lines(check).slice(2)).toEqual([
      "Will list 3 addresses.",
      "",
      "Addresses",
      "  my-crm        CRM_URL       https://crm.example.com/",
      "                REPORTS_URL   not set",
      "                WEBHOOK       can't be used: the URL has user info",
      "",
      "Fingerprint",
      `  ${fingerprint}`,
    ]);
  });

  it("shows a changed setting address as one changed address", () => {
    const before = {
      id: "my-crm",
      ...integrationBase,
      addresses: { CRM_URL: "https://old.example.com/" },
    };
    const after = {
      id: "my-crm",
      ...integrationBase,
      addresses: { CRM_URL: "https://crm.example.com/" },
    };
    const changes: TrustChanges = {
      ...noChanges,
      agents: noChanges,
      integrations: {
        ...noChanges,
        changed: [{ id: "my-crm", before, after, fields: ["addresses"] }],
      },
      onlyRemoves: false,
    };
    const check: TrustCheck = {
      status: "changed",
      content: { connectors: [], integrations: [after] },
      ...current,
      changes,
      trustedAt,
    };
    expect(lines(check).slice(0, 4)).toEqual([
      "What changed in Acme since you trusted it on 3 Nov",
      "1 changed address since you trusted this on 3 Nov.",
      "",
      "Addresses",
    ]);
    expect(lines(check)[4]).toBe("  my-crm        CRM_URL   https://crm.example.com/   Changed");
  });

  it("leaves out the change summary when there is nothing to name", () => {
    const changes: TrustChanges = {
      ...noChanges,
      removed: [notes],
      agents: noChanges,
      integrations: noChanges,
      onlyRemoves: true,
    };
    const check: TrustCheck = { status: "changed", content, ...current, changes, trustedAt };
    expect(lines(check)).toEqual([
      "What changed in Acme since you trusted it on 3 Nov",
      "",
      "Fingerprint",
      `  ${fingerprint}`,
    ]);
  });

  it("says a trusted workspace is already trusted, with the date, and nothing else", () => {
    const grant = { location: "acme", fingerprint };
    const shrunk = { connectors: [], agents: [], integrations: [] };
    expect(lines({ status: "trusted", content, ...current, grant, shrunk, trustedAt })).toEqual([
      "✓ Acme is already trusted on this computer. Nothing changed since 3 Nov.",
    ]);
  });

  it("never shortens the fingerprint", () => {
    const shown = lines({ status: "new", content, ...current });
    expect(shown.some((line) => line.includes("…"))).toBe(false);
    expect(shown.at(-1)?.trim()).toMatch(/^hfp1:[0-9a-f]{64}$/);
  });

  it("writes dates as day and short month", () => {
    expect(shownDate(trustedAt)).toBe("3 Nov");
  });
});
