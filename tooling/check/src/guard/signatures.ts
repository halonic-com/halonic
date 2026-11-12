import { createHash, createPublicKey, type KeyObject, sign, verify } from "node:crypto";
import { posix } from "node:path";
import { expectedRequirementId, isRequirementFile } from "../lib/requirements.ts";
import { isSourceFile, isTestFile } from "../lib/source-paths.ts";
import type { DecisionKind } from "./decision-notes.ts";

/**
 * Signed decision notes (HAL-1337). An approver signs a note offline with
 * their Ed25519 key, and the guard checks the signature against the keys
 * the merge base's `tooling/check/approvers.json` pins for the note's kind.
 * No network, no token: fork pull requests are checked the same way.
 *
 * The signature is one header line of the note, or two for a change to the
 * guard's trust roots, which needs two different guardians:
 *
 * ```markdown
 * - Signature: ed25519:sha256:<key ID>:<base64 signature>
 * ```
 *
 * It signs {@link signedText}: the repo, the pull request number, the kind,
 * the note's sha256 without that line, and the git object IDs at the pull
 * request's head of everything the note covers. So it can't be moved to
 * another pull request, and editing the note or a covered file after
 * signing breaks it. Editing anything else, or rebasing, doesn't.
 */

/** The first line of every signed text, so no other signature passes as a decision. */
export const signedTextTag = "halonic-decision-v1";

/** Where the merge base pins the approvers' public keys. */
export const approversFile = "tooling/check/approvers.json";

const signaturePrefix = "- Signature:";
const signaturePattern = /^ed25519:(sha256:[A-Za-z0-9_-]{43}):([A-Za-z0-9+/]{86}==)$/;

/** Reads files and object IDs at a commit, from git's objects only. */
export interface GitObjects {
  /** Whether the repo has this commit, so a missing one isn't read as missing files. */
  hasCommit(commit: string): boolean;
  /** The blob or tree ID of `path` at `commit`, or undefined when it's missing. */
  objectId(commit: string, path: string): string | undefined;
  /** Every file at `commit`. */
  listFiles(commit: string): readonly string[];
  /** A file's text at `commit`, or undefined when it's missing. */
  readFile(commit: string, path: string): string | undefined;
}

/** One `- Signature:` line of a note. */
export interface NoteSignature {
  readonly keyId: string;
  readonly signature: string;
}

/** The most signature lines a note has: the two guardians of a trust-root change. */
export const maxSignatures = 2;

/** A note split into its signatures and the exact text they cover. */
export type SplitNote =
  | {
      readonly ok: true;
      /** The note's signature lines, in order: one, or up to {@link maxSignatures}. */
      readonly signatures: readonly NoteSignature[];
      /** The note without its signature lines. */
      readonly unsigned: string;
    }
  | { readonly ok: false; readonly reason: string };

/**
 * Finds the note's signature lines, in the header: the `- ` fields
 * between the heading and the first paragraph or heading. Every one is
 * removed from the text they sign, so a second signer doesn't change it.
 */
export function splitSignature(text: string): SplitNote {
  if (text.includes("\r")) {
    return { ok: false, reason: "the note has a carriage return; save it with LF line endings" };
  }
  const lines = text.split("\n");
  const at = lines.flatMap((line, index) => (/^\s*-\s*Signature\s*:/.test(line) ? [index] : []));
  if (at.length === 0) {
    return { ok: false, reason: "the note has no signature line; ask the approver to sign it" };
  }
  if (at.length > maxSignatures) {
    return { ok: false, reason: `the note has more than ${maxSignatures} signature lines` };
  }
  const firstProse = lines.findIndex((line, i) => i > 0 && /^[^-\s]/.test(line));
  const signatures: NoteSignature[] = [];
  for (const index of at) {
    if (index === 0 || (firstProse !== -1 && index > firstProse)) {
      return { ok: false, reason: "the signature line isn't in the note's header" };
    }
    const line = lines[index] ?? "";
    const match = line.startsWith(signaturePrefix)
      ? signaturePattern.exec(line.slice(signaturePrefix.length).trim())
      : null;
    if (match === null) {
      return {
        ok: false,
        reason: 'the signature line isn\'t "- Signature: ed25519:<key ID>:<base64>"',
      };
    }
    signatures.push({ keyId: match[1] ?? "", signature: match[2] ?? "" });
  }
  const unsigned = lines.filter((_line, i) => !at.includes(i)).join("\n");
  return { ok: true, signatures, unsigned };
}

/** What a signature binds a note to. */
export interface SignedFacts {
  /** `owner/name` of the repo the pull request merges into. */
  readonly repo: string;
  readonly pr: number;
  readonly kind: DecisionKind;
  /** The note without its signature line. */
  readonly unsigned: string;
  /** Each covered path with its object ID at the pull request's head, or `missing`. */
  readonly objects: ReadonlyMap<string, string>;
}

/** The exact text an approver signs: one field per line, paths sorted. */
export function signedText(facts: SignedFacts): string {
  const note = createHash("sha256").update(facts.unsigned, "utf8").digest("hex");
  const objects = [...facts.objects]
    .sort(([a], [b]) => (a < b ? -1 : Number(a > b)))
    .map(([path, id]) => `object ${id} ${path}`);
  return [
    signedTextTag,
    `repo ${facts.repo}`,
    `pr ${facts.pr}`,
    `kind ${facts.kind}`,
    `note ${note}`,
    ...objects,
    "",
  ].join("\n");
}

/**
 * The paths whose contents a note's signature covers: each Covers path as
 * written, each covered requirement ID's file at the head (or, if the
 * head deleted it, at the merge base), and each test file at the head that
 * names a covered ID as a quoted string, so removing or editing a test the
 * note excuses breaks the signature. An entry is a path when it has a
 * `/` or names a file at the head or the base, as `turbo.json` does.
 */
export function coveredPaths(
  covers: readonly string[],
  git: GitObjects,
  head: string,
  base: string,
): readonly string[] {
  const paths = new Set<string>();
  const isPath = (entry: string): boolean =>
    entry.includes("/") ||
    git.objectId(head, entry) !== undefined ||
    git.objectId(base, entry) !== undefined;
  const ids = covers.filter((entry) => !isPath(entry));
  for (const entry of covers.filter(isPath)) {
    paths.add(entry.replace(/\/$/, ""));
  }
  if (ids.length > 0) {
    const files = requirementFilesById(git.listFiles(head));
    const baseFiles = requirementFilesById(git.listFiles(base));
    for (const id of ids) {
      const file = files.get(id) ?? baseFiles.get(id);
      paths.add(file ?? `requirement:${id}`);
    }
    for (const file of testFilesVerifying(ids, git, head)) {
      paths.add(file);
    }
  }
  return [...paths];
}

/**
 * The test files at `head` that name one of the IDs as a quoted string.
 * That is every file that can call `verifies()` with the ID, found without
 * the TypeScript parser: the guard-notes job runs without an install, so
 * nothing it reaches may load an npm package (HAL-5613). A file that only
 * quotes the ID, say in a comment, is covered too, which is the safe side.
 */
function testFilesVerifying(ids: readonly string[], git: GitObjects, head: string): string[] {
  const quoted = ids.flatMap((id) => [`"${id}"`, `'${id}'`, `\`${id}\``]);
  const files: string[] = [];
  for (const file of git.listFiles(head).filter((f) => isSourceFile(f) && isTestFile(f))) {
    const text = git.readFile(head, file);
    if (text !== undefined && quoted.some((id) => text.includes(id))) {
      files.push(file);
    }
  }
  return files;
}

/** The object ID at `head` of each covered path, `missing` when it's gone. */
export function coveredObjects(
  paths: readonly string[],
  git: GitObjects,
  head: string,
): ReadonlyMap<string, string> {
  return new Map(paths.map((path) => [path, git.objectId(head, path) ?? "missing"]));
}

function requirementFilesById(files: readonly string[]): Map<string, string> {
  const packages = new Set(
    files.filter((file) => posix.basename(file) === "package.json").map(posix.dirname),
  );
  const byId = new Map<string, string>();
  for (const file of files.filter(isRequirementFile)) {
    let directory = posix.dirname(file);
    while (directory !== "." && !packages.has(directory)) {
      directory = posix.dirname(directory);
    }
    if (directory !== ".") {
      byId.set(expectedRequirementId(file, directory), file);
    }
  }
  return byId;
}

/** One pinned approver key. */
export interface ApproverKey {
  readonly id: string;
  /** Who holds it, for people reading the file. */
  readonly holder: string;
  readonly key: KeyObject;
}

/**
 * The pinned keys per kind, from the merge base's `approvers.json`, and the
 * guardians: the keys that together approve a change to the guard's trust
 * roots. A file with no `guardians` list has the `internal` keys as its
 * guardians, which is how the list can be introduced by the one key there is.
 */
export type Approvers = Readonly<Record<DecisionKind, readonly ApproverKey[]>> & {
  readonly guardians: readonly ApproverKey[];
};

/** The key ID Paperclip gives an Ed25519 public key: `sha256:` and the base64url SPKI hash. */
export function keyIdOf(key: KeyObject): string {
  const spki = key.export({ type: "spki", format: "der" });
  return `sha256:${createHash("sha256").update(spki).digest("base64url")}`;
}

/** Parses `approvers.json`. Throws when a key is malformed or its ID isn't its fingerprint. */
export function parseApprovers(text: string): Approvers {
  const json = JSON.parse(text) as Record<string, unknown>;
  const read = (name: string): ApproverKey[] => {
    const entries = json[name];
    if (!Array.isArray(entries)) {
      throw new Error(`${approversFile}: "${name}" must be a list`);
    }
    return entries.map((entry: { id?: unknown; holder?: unknown; publicKey?: unknown }) => {
      const key = createPublicKey(String(entry.publicKey));
      if (key.asymmetricKeyType !== "ed25519" || keyIdOf(key) !== entry.id) {
        throw new Error(`${approversFile}: ${String(entry.id)} isn't the ID of its Ed25519 key`);
      }
      return { id: entry.id, holder: String(entry.holder), key };
    });
  };
  const internal = read("internal");
  return {
    "user-visible": read("user-visible"),
    internal,
    guardians: json["guardians"] === undefined ? internal : read("guardians"),
  };
}

/** Whether a signature by the key with this ID, pinned for this kind, signs `text`. */
export function verifySigned(
  text: string,
  keyId: string,
  signature: string,
  kind: DecisionKind,
  approvers: Approvers,
):
  | { readonly ok: true; readonly holder: string }
  | { readonly ok: false; readonly reason: string } {
  const pinned = approvers[kind].find((approver) => approver.id === keyId);
  if (pinned === undefined) {
    const other = kind === "internal" ? "user-visible" : "internal";
    return {
      ok: false,
      reason: approvers[other].some((approver) => approver.id === keyId)
        ? `the key ${keyId} may only sign ${other} notes`
        : `the key ${keyId} isn't in the merge base's ${approversFile}`,
    };
  }
  const valid = verify(
    null,
    Buffer.from(text, "utf8"),
    pinned.key,
    Buffer.from(signature, "base64"),
  );
  return valid
    ? { ok: true, holder: pinned.holder }
    : {
        ok: false,
        reason:
          "the signature doesn't match: the note, a covered file or the pull request changed after signing",
      };
}

/**
 * Whether `signatures` are enough guardians' signatures over `text`: as
 * many different pinned guardians as the list has, up to two. The same key
 * twice counts once, and a key that isn't a guardian doesn't count.
 */
export function verifyGuardians(
  text: string,
  signatures: readonly NoteSignature[],
  approvers: Approvers,
):
  | { readonly ok: true; readonly holders: readonly string[] }
  | { readonly ok: false; readonly reason: string } {
  const needed = Math.min(maxSignatures, approvers.guardians.length);
  if (needed === 0) {
    return { ok: false, reason: `the merge base's ${approversFile} pins no guardian` };
  }
  const holders = new Map<string, string>();
  for (const { keyId, signature } of signatures) {
    const guardian = approvers.guardians.find((each) => each.id === keyId);
    if (guardian === undefined) {
      return {
        ok: false,
        reason: `the key ${keyId} isn't a guardian in the merge base's ${approversFile}`,
      };
    }
    if (!verify(null, Buffer.from(text, "utf8"), guardian.key, Buffer.from(signature, "base64"))) {
      return {
        ok: false,
        reason:
          "a signature doesn't match: the note, a covered file or the pull request changed after signing",
      };
    }
    holders.set(keyId, guardian.holder);
  }
  return holders.size >= needed
    ? { ok: true, holders: [...holders.values()] }
    : {
        ok: false,
        reason: `a change to the guard's trust roots needs ${needed} different guardians' signatures; it has ${holders.size}`,
      };
}

/** Signs `text` with a PEM private key, as `pnpm decision sign` does. */
export function signatureLine(text: string, privateKeyPem: string): string {
  const signature = sign(null, Buffer.from(text, "utf8"), privateKeyPem).toString("base64");
  return `${signaturePrefix} ed25519:${keyIdOf(createPublicKey(privateKeyPem))}:${signature}`;
}
