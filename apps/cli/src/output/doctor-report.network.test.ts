import {
  type DiskLine,
  type DoctorReport,
  doctorSummary,
  type NetworkLine,
  type SandboxLine,
} from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { plainText } from "../messages/phrase.ts";
import { type DoctorFacts, doctorReportLines } from "./doctor-report.ts";

const gb = 1024 ** 3;
const facts: DoctorFacts = {
  version: "0.1.0",
  system: "Linux x64",
  sandboxKind: "bubblewrap",
  signInShell: "sh",
};
const sandboxReady: SandboxLine = {
  check: "sandbox",
  status: "ok",
  capabilities: { files: "shared", strength: "os" },
};
const diskFree: DiskLine = {
  check: "disk",
  status: "ok",
  freeBytes: 48 * gb,
  data: { bytes: 1.4 * gb, runLogBytes: 1.1 * gb, complete: true },
  problem: null,
};

/** The printed report with this Network line between a ready sandbox and free disk. */
function printed(network: NetworkLine): string[] {
  const report: DoctorReport = {
    sandbox: sandboxReady,
    network,
    disk: diskFree,
    summary: doctorSummary([sandboxReady, network, diskFree]),
  };
  return doctorReportLines(report, facts).map(plainText);
}

/** The lines of the one check whose line starts with `label`, after its mark. */
function check(lines: readonly string[], label: string): string[] {
  const start = lines.findIndex((line) => line.slice(2).startsWith(label));
  const end = lines.findIndex((line, index) => index > start && !line.startsWith(" "));
  return lines.slice(start, end);
}

verifies("cli.doctor-network", () => {
  it("says which variable holds a proxy that isn't http://, before Disk", () => {
    const lines = printed({
      check: "network",
      status: "warning",
      problem: "proxy-not-http",
      variable: "HTTPS_PROXY",
      scheme: "https",
    });

    expect(lines.slice(3, 5)).toEqual([
      "! Network     HTTPS_PROXY is an https:// proxy; Halonic only uses http:// proxies",
      "✓ Disk        48 GB free · Halonic uses 1.4 GB (run logs 1.1 GB)",
    ]);
    expect(lines.at(-1)).toBe("No problems. 1 warning.");
  });

  it("says a socks5:// proxy, and gives the setting's own reason for any other problem", () => {
    const socks = printed({
      check: "network",
      status: "warning",
      problem: "proxy-not-http",
      variable: "https_proxy",
      scheme: "socks5",
    });
    const unusable = printed({
      check: "network",
      status: "warning",
      problem: "proxy-unusable",
      variable: "HTTPS_PROXY",
      reason: "The proxy setting for proxy.corp uses port 0.",
    });

    expect(check(socks, "Network")).toEqual([
      "! Network     https_proxy is a socks5:// proxy; Halonic only uses http:// proxies",
    ]);
    expect(check(unusable, "Network")).toEqual([
      "! Network     HTTPS_PROXY is set, and Halonic can't use it.",
      "              The proxy setting for proxy.corp uses port 0.",
    ]);
  });
});
