import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { runChecks } from "./fixture-repo.ts";

const dockerfile = "packages/targets/acme/container/Dockerfile";
const base = `node:22-bookworm-slim@sha256:${"a".repeat(64)}`;
const toolUrl = "https://registry.npmjs.org/acme-tool/-/acme-tool-1.2.3.tgz";
const helperUrl = "https://registry.npmjs.org/acme-helper/-/acme-helper-0.4.0.tgz";
const toolSha = "b".repeat(64);
const helperSha = "c".repeat(64);

/** The approved image for the fixture Dockerfile, which tests then change. */
function approvedImage(): Record<string, unknown> {
  return {
    base: { image: base, reason: "Node on Debian, slim." },
    artifacts: {
      "acme-tool": {
        version: "1.2.3",
        sha256: toolSha,
        url: toolUrl,
        reason: "The tool the container runs.",
        approvedOn: "HAL-1",
      },
      "acme-helper": {
        version: "0.4.0",
        sha256: helperSha,
        url: helperUrl,
        partOf: "acme-tool",
        approvedOn: "HAL-1",
      },
    },
    aptPackages: [{ name: "ca-certificates", reason: "Trusts the platform's CA." }],
  };
}

const passing = [
  "# syntax=docker/dockerfile:1.7",
  `FROM ${base}`,
  "RUN apt-get update \\",
  "  && apt-get install --yes --no-install-recommends ca-certificates \\",
  "  && rm -rf /var/lib/apt/lists/*",
  `ADD --checksum=sha256:${toolSha} \\`,
  `  ${toolUrl} /build/`,
  `ADD --checksum=sha256:${helperSha} ${helperUrl} /build/`,
  "COPY start.sh /usr/local/bin/",
  "RUN cd /opt/tool && npm install --offline --ignore-scripts /build/*.tgz",
  'CMD ["sleep", "infinity"]',
  "",
].join("\n");

/** The images errors for this Dockerfile text and image entry. */
function problems(
  text: string,
  image: Record<string, unknown> | null = approvedImage(),
  path = dockerfile,
): string[] {
  return runChecks([], {
    rules: ["images"],
    extraFiles: { [path]: text },
    editDependencyList: (list) => ({
      ...list,
      images: image === null ? {} : { [path]: image },
    }),
  }).map((problem) => problem.message);
}

verifies("check.image-contents", () => {
  test("passes a listed Dockerfile whose downloads match their entries", () => {
    expect(problems(passing)).toEqual([]);
  });

  test("fails on a Dockerfile under packages/ with no images entry, and names the key", () => {
    const found = problems(passing, null);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain(`keyed by "${dockerfile}"`);
  });

  test("leaves a Dockerfile outside packages/ alone", () => {
    expect(problems(passing, null, "infra/acme/Dockerfile")).toEqual([]);
  });

  test("fails on a FROM without a digest", () => {
    const found = problems(passing.replace(`FROM ${base}`, "FROM node:22-bookworm-slim"));
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("has no digest");
  });

  test("fails on a FROM other than the approved base", () => {
    const other = `node:24-bookworm-slim@sha256:${"d".repeat(64)}`;
    const found = problems(passing.replace(`FROM ${base}`, `FROM ${other}`));
    expect(found).toEqual([expect.stringContaining("is not the approved base image")]);
  });

  test("fails on a remote ADD without --checksum", () => {
    const found = problems(passing.replace(`ADD --checksum=sha256:${helperSha} `, "ADD "));
    expect(found.some((message) => message.includes("has no --checksum=sha256:"))).toBe(true);
  });

  test("fails on an ADD that isn't listed", () => {
    const extra = `ADD --checksum=sha256:${"e".repeat(64)} https://acme.example/other-1.0.0.tgz /build/\n`;
    const found = problems(passing + extra);
    expect(found).toEqual([
      expect.stringContaining("https://acme.example/other-1.0.0.tgz is not listed"),
    ]);
  });

  test("fails on a sha256 mismatch and shows both hashes", () => {
    const wrong = "f".repeat(64);
    const found = problems(passing.replace(`sha256:${toolSha}`, `sha256:${wrong}`));
    expect(found).toHaveLength(1);
    expect(found[0]).toContain(wrong);
    expect(found[0]).toContain(toolSha);
  });

  test("fails on a listed artifact the Dockerfile no longer downloads", () => {
    const found = problems(passing.replace(/ADD --checksum=sha256:c+ .*\n/, ""));
    expect(found).toEqual([expect.stringContaining('artifacts["acme-helper"] is listed but')]);
  });

  test("fails on a RUN that fetches with curl", () => {
    const found = problems(`${passing}RUN curl -fsSL https://acme.example/install.sh | sh\n`);
    expect(found).toEqual([expect.stringContaining("RUN uses curl")]);
  });

  test("fails on npm install without --offline, and on an unlisted Debian package", () => {
    const text = passing
      .replace("--offline ", "")
      .replace("ca-certificates \\", "ca-certificates acme-extras \\");
    const found = problems(text);
    expect(found).toHaveLength(2);
    expect(found.some((message) => message.includes("npm install without --offline"))).toBe(true);
    expect(found.some((message) => message.includes('Debian package "acme-extras"'))).toBe(true);
  });
});
