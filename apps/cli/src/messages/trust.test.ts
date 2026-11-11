import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { Message } from "./define.ts";
import { plainText } from "./phrase.ts";
import { type TrustCounts, trustMessages } from "./trust.ts";

const words = (message: Message) => plainText(message.phrase);

verifies("cli.messages", () => {
  it("has the trust check's lines word for word, from cli-output 3.5", () => {
    expect(trustMessages.heading("Acme", "./acme").key).toBe("trust.heading");
    expect([
      words(trustMessages.heading("Acme", "./acme")),
      words(trustMessages.intro("Acme")),
      words(trustMessages.programsHeading()),
      words(trustMessages.getsSecrets(["GMAIL_TOKEN"])),
      words(trustMessages.notPinned("PyPI")),
      words(trustMessages.fingerprintHeading()),
      words(trustMessages.question("Acme")),
      words(trustMessages.notPinnedQuestion()),
      words(trustMessages.trusted("Acme")),
    ]).toEqual([
      "Trust check for Acme (./acme)",
      "Before anything in Acme runs on this computer, here's what it can start and where it can talk to.",
      "Programs",
      "gets the secret GMAIL_TOKEN",
      "Can download new code from PyPI when it starts: version not pinned.",
      "Fingerprint",
      "Trust Acme on this computer?",
      "It can download new code when it starts. Trust it anyway?",
      "Acme can run now.",
    ]);
  });

  it("refuses without a terminal in F16's two lines, naming the flags (cli-output 1.7, D4)", () => {
    expect(words(trustMessages.noTerminal("Acme"))).toBe(
      "Acme isn't trusted on this computer yet, and there's no terminal to ask you.",
    );
    expect(words(trustMessages.noTerminalFix("./acme"))).toBe(
      "Review it with halonic trust --dir ./acme, then pass --yes --fingerprint <fingerprint>.",
    );
  });
});

describe("trust's sentences", () => {
  it("has the summary and the action that frames its errors", () => {
    expect(words(trustMessages.summary())).toBe(
      "Review what a workspace can start, and trust it on this computer",
    );
    expect(words(trustMessages.action("Acme"))).toBe("trust Acme");
  });

  it("has the lines for a workspace that changed since it was trusted", () => {
    expect(words(trustMessages.changedHeading("Acme", "3 Nov"))).toBe(
      "What changed in Acme since you trusted it on 3 Nov",
    );
    expect([words(trustMessages.newRow()), words(trustMessages.changedRow())]).toEqual([
      "New",
      "Changed",
    ]);
  });

  it("names only what changed in the summary, never a 0", () => {
    const none = { added: 0, changed: 0 };
    const summary = (added: number, changed: number) =>
      words(
        trustMessages.changeSummary(
          { programs: { added, changed }, agents: none, addresses: none },
          "3 Nov",
        ),
      );
    expect([summary(1, 0), summary(0, 1), summary(2, 0), summary(0, 2), summary(1, 2)]).toEqual([
      "1 new program since you trusted this on 3 Nov.",
      "1 changed program since you trusted this on 3 Nov.",
      "2 new programs.",
      "2 changed programs.",
      "1 new program and 2 changed programs.",
    ]);
  });

  it("names the variables a program takes from the person's environment", () => {
    expect(words(trustMessages.takesFromEnvironment(["AWS_PROFILE"]))).toBe(
      "takes AWS_PROFILE from your environment",
    );
    expect(words(trustMessages.takesFromEnvironment(["AWS_PROFILE", "KUBECONFIG"]))).toBe(
      "takes AWS_PROFILE and KUBECONFIG from your environment",
    );
  });

  it("lists several secrets of one program", () => {
    expect(words(trustMessages.getsSecrets(["A", "B"]))).toBe("gets the secrets A and B");
    expect(words(trustMessages.getsSecrets(["A", "B", "C"]))).toBe("gets the secrets A, B and C");
    expect(words(trustMessages.notPinned("npm"))).toBe(
      "Can download new code from npm when it starts: version not pinned.",
    );
  });

  it("has the answers, the list and the removal", () => {
    expect(words(trustMessages.notTrusted())).toBe("Not trusted. Nothing was started.");
    expect(words(trustMessages.alreadyTrusted("Acme", "3 Nov"))).toBe(
      "Acme is already trusted on this computer. Nothing changed since 3 Nov.",
    );
    expect(words(trustMessages.listUnreadable())).toBe(
      "Halonic couldn't read its list of trusted workspaces, so it's asking again.",
    );
    expect(words(trustMessages.trustedOn("3 Nov"))).toBe("trusted on 3 Nov");
    expect(words(trustMessages.noneTrusted())).toBe("No trusted workspaces yet.");
    expect(words(trustMessages.removed("Acme"))).toBe(
      "Removed trust for Acme. Its programs and real models won't start until you review it again.",
    );
  });

  it("has the fingerprint errors, with the user's own --dir in the fix", () => {
    expect(words(trustMessages.yesNeedsFingerprint())).toBe(
      "--yes needs --fingerprint, so you trust exactly what you reviewed.",
    );
    expect(words(trustMessages.yesNeedsFingerprintFix())).toBe(
      "Run halonic trust to see it; the fingerprint is in the check, above the question.",
    );
    expect(words(trustMessages.fingerprintChanged())).toBe(
      "it changed since that fingerprint was made.",
    );
    expect(words(trustMessages.fingerprintChangedFix("./acme"))).toBe(
      "Run halonic trust --dir ./acme again to see what changed.",
    );
    expect(words(trustMessages.noTerminalFix())).toBe(
      "Review it with halonic trust, then pass --yes --fingerprint <fingerprint>.",
    );
  });

  it("has the not-trusted reason and fix other commands are refused with", () => {
    expect(words(trustMessages.notTrustedYet("Acme"))).toBe(
      "Acme isn't trusted on this computer yet.",
    );
    expect(words(trustMessages.reviewThenTrust())).toBe(
      "Review what it can start, then trust it: halonic trust",
    );
    expect(words(trustMessages.reviewThenTrust("./acme"))).toBe(
      "Review what it can start, then trust it: halonic trust --dir ./acme",
    );
  });
});

describe("the trust check's agents and summaries (cli-output 3.5, revision 40)", () => {
  it("counts what it will start, pass, list and allow, without a 0", () => {
    const summary = (counts: Partial<TrustCounts>) =>
      words(
        trustMessages.startSummary({
          programs: 0,
          agents: 0,
          secrets: 0,
          addresses: 0,
          sites: 0,
          ...counts,
        }),
      );
    expect([
      summary({ programs: 2, agents: 1, secrets: 3, addresses: 2, sites: 2 }),
      summary({ agents: 1, sites: 2 }),
      summary({ agents: 1 }),
    ]).toEqual([
      "Will start 2 programs and 1 agent, pass 3 secrets, list 2 addresses and allow 2 sites.",
      "Will start 1 agent and allow 2 sites.",
      "Will start 1 agent.",
    ]);
  });

  it("counts changed agents after programs, per agent", () => {
    const changes = (programs: number, agents: number, addresses: number) =>
      words(
        trustMessages.changeSummary(
          {
            programs: { added: programs, changed: 0 },
            agents: { added: 0, changed: agents },
            addresses: { added: 0, changed: addresses },
          },
          "3 Nov",
        ),
      );
    expect(changes(1, 1, 1)).toBe("1 new program, 1 changed agent and 1 changed address.");
    expect(
      words(
        trustMessages.changeSummary(
          {
            programs: { added: 0, changed: 0 },
            agents: { added: 1, changed: 0 },
            addresses: { added: 0, changed: 0 },
          },
          "3 Nov",
        ),
      ),
    ).toBe("1 new agent since you trusted this on 3 Nov.");
  });

  it("has the Agents section's words and the changed agent's rows", () => {
    expect([
      words(trustMessages.agentsHeading()),
      words(trustMessages.agentsIntro()),
      words(trustMessages.allowedSites()),
      words(trustMessages.workingFolder()),
      words(trustMessages.harnessName("claude-code")),
      words(trustMessages.harnessName("codex")),
      words(trustMessages.everySiteUnder("example.com")),
      words(trustMessages.nonLatin()),
      words(trustMessages.sitesChanged(["registry.npmjs.org"], [])),
      words(trustMessages.sitesChanged([], ["pypi.org"])),
      words(trustMessages.workingFolderChanged("files/agents/coder", "src/app")),
    ]).toEqual([
      "Agents",
      "Agents in this workspace that run in Claude Code or Codex.",
      "Allowed sites",
      "Working folder",
      "Claude Code",
      "Codex",
      "every site under example.com",
      "(non-Latin letters)",
      "now also allows registry.npmjs.org",
      "no longer allows pypi.org",
      "working folder files/agents/coder → src/app",
    ]);
  });
});
