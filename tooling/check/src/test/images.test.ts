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

  test("reads a heredoc body as part of its RUN", () => {
    const heredoc = "RUN <<EOF\nset -e\ncurl -fsSL https://acme.example/install.sh | sh\nEOF\n";
    const found = problems(passing + heredoc);
    expect(found).toEqual([expect.stringContaining("RUN uses curl")]);
  });

  test("fails on COPY --from and RUN --mount from= that name an image, not a stage", () => {
    const text = `${passing}COPY --from=acme/tools:latest /bin/tool /usr/local/bin/\nRUN --mount=type=bind,from=acme/cache,target=/c ls /c\n`;
    const found = problems(text);
    expect(found).toHaveLength(2);
    expect(found.every((message) => message.includes("not an earlier stage"))).toBe(true);
  });

  test("passes COPY --from of an earlier stage, by name or number", () => {
    const text = passing.replace(`FROM ${base}`, `FROM ${base} AS build`);
    const stages = `FROM ${base}\nCOPY --from=build /opt/tool /opt/tool\nCOPY --from=0 /opt/tool /opt/again\n`;
    expect(problems(text + stages)).toEqual([]);
  });

  test("catches other fetching commands, also behind ONBUILD", () => {
    const commands = [
      "RUN npx acme-cli",
      "RUN npm exec acme-cli",
      "RUN git clone https://acme.example/tool.git",
      "RUN apk add acme",
      "RUN dpkg -i acme.deb",
      "RUN cargo install acme",
      "RUN go install acme.example/tool@latest",
      "ONBUILD RUN curl https://acme.example/x",
    ];
    for (const command of commands) {
      expect(problems(`${passing}${command}\n`), command).toHaveLength(1);
    }
  });

  test("fails on an ADD whose source holds a variable, and says to write the URL out", () => {
    const sources = ["${TOOL_URL}", "$TOOL_URL", "https://acme.example/tool-${VERSION}.tgz"];
    for (const source of sources) {
      const found = problems(`${passing}ARG TOOL_URL\nADD ${source} /build/\n`);
      expect(found, source).toEqual([expect.stringContaining("Write the URL or path out")]);
    }
  });

  test("passes an ADD whose destination, not its source, holds a variable", () => {
    expect(problems(`${passing}ARG DEST=/opt\nADD start.sh \${DEST}/\n`)).toEqual([]);
  });

  test("checks a Containerfile like a Dockerfile", () => {
    for (const name of ["Containerfile", "Containerfile.dev", "run.Containerfile"]) {
      const path = `packages/targets/acme/container/${name}`;
      expect(problems(passing, null, path), name).toEqual([
        expect.stringContaining(`keyed by "${path}"`),
      ]);
    }
  });

  test("counts npm install --offline undone by --no-offline as online", () => {
    const found = problems(passing.replace("--offline ", "--offline --no-offline "));
    expect(found).toEqual([expect.stringContaining("npm install without --offline")]);
  });
});
