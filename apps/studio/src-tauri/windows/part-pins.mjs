// The pins of the sandbox parts (HAL-20591, plan on HAL-20583): the WSL
// runtime and the WSL image become release assets of their own, and the
// installer carries one pin file per part, halonic-runtime.json and
// halonic-wsl.json, each { version, sha256, size, url }. The runtime's pin
// also carries minRuntime, the lowest runtime the app starts the host on
// (min-runtime.json, raised by a release whose runtime carries a fence or
// security fix). A pin is as trusted as the installer around it; the url only
// says where to fetch, so it must be on the allow-list below, which is the
// app's own.
//
// The release workflows run it with the runner's own Node:
//   node part-pins.mjs pin runtime <dir> <repo> <tag>
//     adds url and minRuntime to <dir>/halonic-runtime.json, which
//     runtime-archive.sh wrote.
//   node part-pins.mjs pin image <dir> <repo> <tag> <image version>
//     writes <dir>/halonic-wsl.json for the image build.sh wrote.
//   node part-pins.mjs check <pin> <archive>
//     fails unless the pin is well formed, its url is allowed and the
//     archive is the one it pins (build-installer.ps1 -PinParts).
//   node part-pins.mjs publish <dist> <repo> <tag> <runtime dir> <image dir>
//     copies each part into <dist> under its asset name, checks it against
//     its pin, adds it to <dist>/SHA256SUMS and prints "<asset> <size>".

import { createHash } from "node:crypto";
import {
  appendFileSync,
  copyFileSync,
  createReadStream,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { argv, exit, stdout } from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

/** The repositories whose releases may hold a part, as the app allows them. */
export const releaseRepos = ["halonic-com/halonic", "halonic-com/halonic-preview"];

/** Each part: its archive and pin as the builds name them, and its asset's prefix. */
export const parts = {
  runtime: {
    archive: "halonic-runtime.tar.gz",
    pin: "halonic-runtime.json",
    asset: "halonic-runtime",
  },
  image: { archive: "halonic-wsl.tar.gz", pin: "halonic-wsl.json", asset: "halonic-wsl" },
};

// GitHub renames an asset whose name has other characters (a runtime
// version's `+` among them), which would leave the pin's url pointing at
// nothing, so anything else becomes `-`.
const assetCharacters = /[^0-9A-Za-z._-]/g;
const tagPattern = /^[0-9A-Za-z._+-]+$/;
const assetPattern = /^[0-9A-Za-z._-]+$/;

/** The asset name of a part's archive on a release: `halonic-runtime-<version>.tar.gz`. */
export function assetName(part, version) {
  return `${parts[part].asset}-${String(version).replace(assetCharacters, "-")}.tar.gz`;
}

/** The url of an asset on a release of `repo`. */
export function assetUrl(repo, tag, asset) {
  return `https://github.com/${repo}/releases/download/${tag}/${asset}`;
}

/**
 * Why `url` isn't allowed as a part's address, or null when it is: https on
 * port 443, no user name, github.com, under one of the two release paths, as
 * `<tag>/<asset>`, written as the URL parser writes it back, so nothing is
 * normalised away.
 */
export function pinUrlProblem(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return `'${url}' isn't a URL`;
  }
  if (parsed.protocol !== "https:") return `'${url}' isn't https`;
  if (parsed.port !== "") return `'${url}' isn't on port 443`;
  if (parsed.username !== "" || parsed.password !== "") return `'${url}' has a user name`;
  if (parsed.hostname !== "github.com") return `'${url}' isn't on github.com`;
  if (parsed.search !== "" || parsed.hash !== "" || parsed.href !== url) {
    return `'${url}' isn't written as a plain release address`;
  }
  const repo = releaseRepos.find((name) =>
    parsed.pathname.startsWith(`/${name}/releases/download/`),
  );
  if (repo === undefined) return `'${url}' isn't under a Halonic release`;
  const [tag, asset, ...rest] = parsed.pathname
    .slice(`/${repo}/releases/download/`.length)
    .split("/");
  const fileName = asset ?? "";
  if (
    rest.length > 0 ||
    !tagPattern.test(tag ?? "") ||
    !assetPattern.test(fileName) ||
    /^\.+$/.test(fileName)
  ) {
    return `'${url}' isn't <tag>/<asset> on a release`;
  }
  return null;
}

/** The problems with a pin's fields; empty when it is well formed and its url allowed. */
export function pinProblems(pin, part) {
  const problems = [];
  if (typeof pin?.version !== "string" || pin.version === "") problems.push("no version");
  if (typeof pin?.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(pin.sha256))
    problems.push("no lowercase SHA-256");
  if (!Number.isSafeInteger(pin?.size) || pin.size <= 0) problems.push("no size above zero");
  const urlProblem = typeof pin?.url === "string" ? pinUrlProblem(pin.url) : "no url";
  if (urlProblem !== null) problems.push(urlProblem);
  if (part === "runtime" && (typeof pin?.minRuntime !== "string" || pin.minRuntime === "")) {
    problems.push("no minRuntime");
  }
  return problems;
}

/** A file's SHA-256 and size, read as a stream: the image is about 100 MB. */
export async function fileDigest(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return { sha256: hash.digest("hex"), size: statSync(file).size };
}

/** Throws unless `file` has the SHA-256 and size `pin` gives. */
async function assertPinned(file, pin, label) {
  const { sha256, size } = await fileDigest(file);
  if (sha256 !== pin.sha256 || size !== pin.size) {
    throw new Error(
      `${label}: the pin says ${pin.sha256} (${pin.size} bytes), ${file} is ${sha256} (${size} bytes)`,
    );
  }
}

/** Throws with every problem of a pin. */
function assertWellFormed(pin, part, label) {
  const problems = pinProblems(pin, part);
  if (problems.length > 0) throw new Error(`${label}: ${problems.join("; ")}`);
}

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value)}\n`);

/** The runtime floor this app is built with. */
export function minRuntime() {
  const floor = readJson(fileURLToPath(new URL("min-runtime.json", import.meta.url))).minRuntime;
  if (typeof floor !== "string" || floor === "")
    throw new Error("min-runtime.json has no minRuntime");
  return floor;
}

/** Adds the url and the floor to the runtime's manifest, after checking it pins the archive. */
export async function pinRuntime(dir, repo, tag) {
  const file = join(dir, parts.runtime.pin);
  const { version, sha256, size } = readJson(file);
  const pin = {
    version,
    sha256,
    size,
    url: assetUrl(repo, tag, assetName("runtime", version)),
    minRuntime: minRuntime(),
  };
  assertWellFormed(pin, "runtime", parts.runtime.pin);
  await assertPinned(join(dir, parts.runtime.archive), pin, parts.runtime.pin);
  writeJson(file, pin);
  return pin;
}

/** Writes the image's pin, after checking the SHA-256 build.sh wrote in sizes.json. */
export async function pinImage(dir, repo, tag, imageVersion) {
  const archive = join(dir, parts.image.archive);
  const { sha256, size } = await fileDigest(archive);
  const built = readJson(join(dir, "sizes.json")).sha256;
  if (built !== sha256) throw new Error(`sizes.json pins ${built}, ${archive} is ${sha256}`);
  const version = String(imageVersion).trim();
  const pin = { version, sha256, size, url: assetUrl(repo, tag, assetName("image", version)) };
  assertWellFormed(pin, "image", parts.image.pin);
  writeJson(join(dir, parts.image.pin), pin);
  return pin;
}

/** Fails unless `pinFile` is a well-formed, allowed pin of `archive`. */
export async function checkPin(pinFile, archive) {
  const part = pinFile.endsWith(parts.image.pin) ? "image" : "runtime";
  const pin = readJson(pinFile);
  assertWellFormed(pin, part, pinFile);
  await assertPinned(archive, pin, pinFile);
  return pin;
}

/**
 * Copies both parts into `dist` under their asset names, after checking each
 * pin points at exactly that asset on this release and each copy is the
 * pinned file, and adds them to SHA256SUMS, only once both passed. Returns
 * the assets and sizes.
 */
export async function publishParts(dist, repo, tag, dirs) {
  const published = [];
  for (const [part, dir] of Object.entries(dirs)) {
    const label = parts[part].pin;
    const pin = readJson(join(dir, label));
    assertWellFormed(pin, part, label);
    const asset = assetName(part, pin.version);
    const expected = assetUrl(repo, tag, asset);
    if (pin.url !== expected)
      throw new Error(`${label}: the pin's url is ${pin.url}, this release's asset is ${expected}`);
    const target = join(dist, asset);
    copyFileSync(join(dir, parts[part].archive), target);
    await assertPinned(target, pin, label);
    published.push({ asset, size: pin.size, sha256: pin.sha256 });
  }
  const lines = published.map(({ asset, sha256 }) => `${sha256}  ${asset}\n`).join("");
  appendFileSync(join(dist, "SHA256SUMS"), lines);
  return published.map(({ asset, size }) => ({ asset, size }));
}

/** The command line: one of the commands at the top of this file. */
async function main(args) {
  const [command, ...rest] = args;
  if (command === "pin" && rest[0] === "runtime" && rest.length === 4) {
    stdout.write(`${JSON.stringify(await pinRuntime(rest[1], rest[2], rest[3]))}\n`);
  } else if (command === "pin" && rest[0] === "image" && rest.length === 5) {
    stdout.write(`${JSON.stringify(await pinImage(rest[1], rest[2], rest[3], rest[4]))}\n`);
  } else if (command === "check" && rest.length === 2) {
    const pin = await checkPin(rest[0], rest[1]);
    stdout.write(`${rest[0]}: pins ${pin.version}, ${pin.sha256}, at ${pin.url}\n`);
  } else if (command === "publish" && rest.length === 5) {
    const [dist, repo, tag, runtime, image] = rest;
    for (const { asset, size } of await publishParts(dist, repo, tag, { runtime, image }))
      stdout.write(`${asset} ${size}\n`);
  } else {
    console.error(
      "usage: node part-pins.mjs pin runtime|image … | check <pin> <archive> | publish <dist> <repo> <tag> <runtime dir> <image dir>",
    );
    exit(2);
  }
}

if (import.meta.url === pathToFileURL(argv[1] ?? "").href) {
  main(argv.slice(2)).catch((error) => {
    console.error(`part-pins: ${error.message}`);
    exit(1);
  });
}
