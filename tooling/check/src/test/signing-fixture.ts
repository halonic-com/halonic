import { createHash, generateKeyPairSync, type KeyObject } from "node:crypto";
import { type GitObjects, keyIdOf } from "../guard/signatures.ts";

export type Files = Readonly<Record<string, string>>;

/** Commits as plain file maps; object IDs are content hashes, folders hash their files. */
export function fakeGit(commits: Readonly<Record<string, Files>>): GitObjects {
  const hash = (text: string): string => createHash("sha1").update(text).digest("hex");
  return {
    hasCommit: (commit) => commit in commits,
    listFiles: (commit) => Object.keys(commits[commit] ?? {}),
    readFile: (commit, path) => commits[commit]?.[path],
    objectId: (commit, path) => {
      const files = commits[commit] ?? {};
      const file = files[path];
      if (file !== undefined) {
        return hash(file);
      }
      const inside = Object.keys(files).filter((name) => name.startsWith(`${path}/`));
      return inside.length === 0
        ? undefined
        : hash(
            inside
              .sort()
              .map((name) => name + files[name])
              .join(),
          );
    },
  };
}

export function keyPair(): { publicKey: KeyObject; privatePem: string } {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return { publicKey, privatePem: privateKey.export({ type: "pkcs8", format: "pem" }).toString() };
}

export function approvers(entries: {
  internal?: KeyObject[];
  "user-visible"?: KeyObject[];
}): string {
  const list = (keys: KeyObject[] = []) =>
    keys.map((key) => ({
      id: keyIdOf(key),
      holder: "test",
      publicKey: key.export({ type: "spki", format: "pem" }).toString(),
    }));
  return JSON.stringify({
    internal: list(entries.internal),
    "user-visible": list(entries["user-visible"]),
  });
}
