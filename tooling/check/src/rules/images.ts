import type { CheckContext } from "../lib/context.ts";
import {
  type DockerInstruction,
  isDockerfile,
  readDockerInstructions,
  toInstruction,
  words,
} from "../lib/dockerfile.ts";
import type { ApprovedImage } from "../lib/image-list.ts";
import { Report } from "../lib/problems.ts";

const guide =
  "Only the board approves a new image artifact or a version bump. See docs/guides/dependencies.md.";

/** Dockerfiles in these folders must be listed; `infra/` and `.github/` are not covered yet. */
const coveredFolder = "packages/";

/**
 * Downloads and installs in a `RUN` line that bypass the checksums. `npm install --offline` only
 * unpacks tarballs an `ADD --checksum` already fetched, so it is allowed. This list catches
 * mistakes, not a determined author: a reviewer still reads every `RUN`.
 */
const fetchingCommands: readonly { readonly pattern: RegExp; readonly name: string }[] = [
  { pattern: /\bcurl\b/, name: "curl" },
  { pattern: /\bwget\b/, name: "wget" },
  { pattern: /\b(pnpm|yarn|bun)\s+(add|install|i|dlx)\b/, name: "pnpm, yarn or bun install" },
  { pattern: /\bnpx\b|\bnpm\s+(exec|x)\b/, name: "npx or npm exec" },
  { pattern: /\bpip[0-9.]*\s+install\b/, name: "pip install" },
  { pattern: /\bgit\s+(clone|fetch|pull)\b/, name: "git clone" },
  { pattern: /\bapk\s+add\b/, name: "apk add" },
  { pattern: /\bdpkg\s+(-i|--install)\b/, name: "dpkg -i" },
  { pattern: /\b(gem|cargo)\s+install\b/, name: "gem or cargo install" },
  { pattern: /\bgo\s+(install|get)\b/, name: "go install" },
];
const npmInstall = /\bnpm\s+(install|i|ci|add)\b([^&|;]*)/g;
/** Flags that undo `--offline` when they come with it. */
const onlineFlags = new Set(["--no-offline", "--offline=false", "--prefer-online"]);
const aptInstall = /\bapt(?:-get)?\s+install\b([^&|;]*)/g;

/**
 * Checks every Dockerfile under `packages/` against the `images` section of `dependencies.json`: the base
 * image is pinned by digest, every remote `ADD` is checksummed and listed by URL and sha256, every listed
 * artifact is still used, and no `RUN` line fetches anything around the checksums.
 */
export function checkImages(context: CheckContext): Report {
  const report = new Report("images");
  const { images } = context.dependencyList;
  for (const file of context.files) {
    if (!file.startsWith(coveredFolder) || !isDockerfile(file)) {
      continue;
    }
    const approved = Object.hasOwn(images, file) ? images[file] : undefined;
    if (approved === undefined) {
      report.error(
        file,
        `This Dockerfile has no entry under "images" in ${context.dependencyListPath}. Add one keyed by "${file}", with its base image and every artifact it downloads. ${guide}`,
      );
      continue;
    }
    checkDockerfile(report, file, readDockerInstructions(context.read(file)), approved);
  }
  for (const file of Object.keys(images)) {
    if (!context.files.includes(file)) {
      report.error(
        context.dependencyListPath,
        `images["${file}"] names a Dockerfile that doesn't exist. Remove the entry, or fix its path.`,
      );
    }
  }
  return report;
}

function checkDockerfile(
  report: Report,
  file: string,
  instructions: readonly DockerInstruction[],
  approved: ApprovedImage,
): void {
  const stages = new Set<string>();
  const used = new Set<string>();
  for (const found of instructions) {
    const instruction = unwrapOnBuild(found);
    checkFromOtherImage(report, file, instruction, stages);
    if (instruction.keyword === "FROM") {
      checkFrom(report, file, instruction, approved, stages);
    } else if (instruction.keyword === "ADD") {
      const name = checkAdd(report, file, instruction, approved);
      if (name !== undefined) used.add(name);
    } else if (instruction.keyword === "RUN") {
      checkRun(report, file, instruction, approved);
    }
  }
  for (const name of Object.keys(approved.artifacts)) {
    if (!used.has(name)) {
      report.error(
        file,
        `images["${file}"].artifacts["${name}"] is listed but this Dockerfile doesn't download it. Remove the stale entry from dependencies.json.`,
      );
    }
  }
}

/** `ONBUILD RUN …` runs in an image built on this one; check it as the instruction it wraps. */
function unwrapOnBuild(instruction: DockerInstruction): DockerInstruction {
  if (instruction.keyword !== "ONBUILD") {
    return instruction;
  }
  return toInstruction(instruction.argument, instruction.line) ?? instruction;
}

/**
 * `COPY --from=` and `RUN --mount=…,from=` may name only an earlier stage, by name or number:
 * naming an image would pull it unpinned and unlisted.
 */
function checkFromOtherImage(
  report: Report,
  file: string,
  instruction: DockerInstruction,
  stages: ReadonlySet<string>,
): void {
  const sources = [
    ...instruction.argument.matchAll(/(?:^|\s)--from=(\S+)/g),
    ...instruction.argument.matchAll(/--mount=\S*?\bfrom=([^,\s]+)/g),
  ].map((match) => match[1] ?? "");
  for (const source of sources) {
    if (!stages.has(source)) {
      report.error(
        file,
        `${instruction.keyword} takes files from "${source}", which is not an earlier stage of this Dockerfile. Name a stage (FROM … AS <name>); an image named here is pulled unpinned and unlisted.`,
        instruction.line,
      );
    }
  }
}

function checkFrom(
  report: Report,
  file: string,
  instruction: DockerInstruction,
  approved: ApprovedImage,
  stages: Set<string>,
): void {
  const parts = words(instruction.argument).filter((word) => !word.startsWith("--"));
  const image = parts[0] ?? "";
  // A later stage built on an earlier one carries no image of its own.
  const onEarlierStage = stages.has(image);
  // Stages count from 0, and `--from=` may name one by its number.
  stages.add(String([...stages].filter((stage) => /^\d+$/.test(stage)).length));
  if (parts[1]?.toUpperCase() === "AS" && parts[2] !== undefined) {
    stages.add(parts[2]);
  }
  if (onEarlierStage) {
    return;
  }
  if (!image.includes("@sha256:")) {
    report.error(
      file,
      `FROM ${image} has no digest. Pin it as name:tag@sha256:<digest>, and set the same reference as images["${file}"].base.image.`,
      instruction.line,
    );
    return;
  }
  if (image !== approved.base.image) {
    report.error(
      file,
      `FROM ${image} is not the approved base image ${approved.base.image}. Use that one, or change images["${file}"].base with the board's approval. ${guide}`,
      instruction.line,
    );
  }
}

/** Checks one `ADD` and returns the name of the artifact it matches, if any. */
function checkAdd(
  report: Report,
  file: string,
  instruction: DockerInstruction,
  approved: ApprovedImage,
): string | undefined {
  const parts = words(instruction.argument);
  const sources = parts.filter((word) => !word.startsWith("--")).slice(0, -1);
  const remote = sources.filter((source) => /^(https?|git):\/\/|^git@/.test(source));
  if (remote.length === 0) {
    return undefined;
  }
  const checksum = parts
    .find((word) => word.startsWith("--checksum="))
    ?.slice("--checksum=".length);
  if (checksum === undefined || !checksum.startsWith("sha256:") || remote.length > 1) {
    report.error(
      file,
      `ADD ${remote.join(" ")} has no --checksum=sha256:<hash>. Download one file per ADD and give its sha256, so the build fails on a changed file.`,
      instruction.line,
    );
    return undefined;
  }
  const url = remote[0] ?? "";
  const sha256 = checksum.slice("sha256:".length);
  const byUrl = Object.entries(approved.artifacts).find(([, artifact]) => artifact.url === url);
  if (byUrl === undefined) {
    report.error(
      file,
      `ADD ${url} is not listed. Add it under images["${file}"].artifacts with its version, sha256, url, reason and approvedOn. ${guide}`,
      instruction.line,
    );
    return undefined;
  }
  const [name, artifact] = byUrl;
  if (artifact.sha256 !== sha256) {
    report.error(
      file,
      `ADD ${url} has sha256 ${sha256}, but images["${file}"].artifacts["${name}"] lists ${artifact.sha256}. Check which one is right; a new file at the same URL needs the board's approval. ${guide}`,
      instruction.line,
    );
  }
  if (!url.includes(artifact.version)) {
    report.error(
      file,
      `ADD ${url} doesn't contain version ${artifact.version} from images["${file}"].artifacts["${name}"]. Keep the URL and the version in step.`,
      instruction.line,
    );
  }
  return name;
}

function checkRun(
  report: Report,
  file: string,
  instruction: DockerInstruction,
  approved: ApprovedImage,
): void {
  const command = instruction.argument;
  const found = fetchingCommands
    .filter(({ pattern }) => pattern.test(command))
    .map(({ name }) => name);
  for (const match of command.matchAll(npmInstall)) {
    const flags = words(match[2] ?? "");
    if (!flags.includes("--offline") || flags.some((flag) => onlineFlags.has(flag))) {
      found.push("npm install without --offline");
    }
  }
  for (const name of found) {
    report.error(
      file,
      `RUN uses ${name}, which fetches files no checksum covers. Download each file with ADD --checksum=sha256:<hash> and list it under images["${file}"].artifacts.`,
      instruction.line,
    );
  }
  const allowed = new Set(approved.aptPackages.map((entry) => entry.name));
  for (const match of command.matchAll(aptInstall)) {
    for (const name of words(match[1] ?? "").filter((word) => !word.startsWith("-"))) {
      if (!allowed.has(name)) {
        report.error(
          file,
          `RUN installs the Debian package "${name}", which images["${file}"].aptPackages doesn't list. Add it with a reason, or leave it out if the base image has what you need.`,
          instruction.line,
        );
      }
    }
  }
}
