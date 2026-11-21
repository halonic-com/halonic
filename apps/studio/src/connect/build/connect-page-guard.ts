import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { metaPolicies, policyProblems } from "./page-policy.ts";

/**
 * The most the connect page may take on disk, in bytes (D7 design, section 4, HAL-15159). With
 * React, the whole kit and its theme it is about 400 KB; the desktop Studio is 3.5 MB. Raising the
 * limit is a change for Liam to approve, not a quiet edit here.
 */
export const connectPageMaxBytes = 800_000;

/** Code the Android app must never ship: it belongs to the desktop Studio (`studio.connect.bundle`). */
interface ShutOut {
  /** What the code is, for the build's error. */
  readonly what: string;
  /** Whether a module id, with `/` separators, is part of it. */
  readonly holds: (id: string) => boolean;
}

const shutOut: readonly ShutOut[] = [
  {
    what: "the desktop Studio shell (@halonicjs/studio-shell)",
    holds: (id) => id.includes("/packages/studio/shell/"),
  },
  { what: "the engine (@halonicjs/engine)", holds: (id) => id.includes("/packages/core/engine/") },
  { what: "an adapter", holds: (id) => id.includes("/packages/adapters/") },
  {
    what: "the code editor",
    holds: (id) =>
      id.includes("/packages/studio/code-editor/") ||
      id.includes("/node_modules/@codemirror/") ||
      id.includes("/node_modules/@lezer/"),
  },
  {
    what: "a desktop Studio feature",
    holds: (id) =>
      id.includes("/packages/studio/features/") &&
      !id.includes("/packages/studio/features/remote/src/phone/"),
  },
];

/**
 * Says what of the desktop Studio the page takes in: one sentence for each kind of code, with how
 * many of its modules came in and the first of them.
 *
 * @param moduleIds - the ids of every module in the page's chunks, as the bundler gives them
 */
export function shutOutProblems(moduleIds: Iterable<string>): string[] {
  const found = new Map<ShutOut, string[]>();
  for (const rawId of moduleIds) {
    const id = rawId.replaceAll("\\", "/");
    const rule = shutOut.find((candidate) => candidate.holds(id));
    if (rule !== undefined) found.set(rule, [...(found.get(rule) ?? []), id]);
  }
  return [...found].map(([rule, ids]) => {
    const modules = ids.length === 1 ? "1 module" : `${ids.length} modules`;
    return `The connect page takes in ${rule.what} (${modules}, first ${fromRepo(ids[0] ?? "")}).`;
  });
}

/** A module id from the repo's folders on (`packages/…`, `node_modules/…`), so errors stay short. */
function fromRepo(id: string): string {
  const start = Math.max(id.lastIndexOf("/packages/"), id.lastIndexOf("/node_modules/"));
  return start < 0 ? id : id.slice(start + 1);
}

/**
 * Says whether the built page is over {@link connectPageMaxBytes}.
 *
 * @param bytes - the size of every file in the built page's folder, added up
 */
export function sizeProblems(bytes: number): string[] {
  if (bytes <= connectPageMaxBytes) return [];
  const kilobytes = (value: number): string => `${Math.ceil(value / 1000)} KB`;
  return [
    `The connect page is ${kilobytes(bytes)} on disk, over its limit of ${kilobytes(connectPageMaxBytes)} (HAL-15159). ` +
      "Find what grew it; raising the limit needs Liam's approval.",
  ];
}

/**
 * Says what is wrong with the built page's `<meta>` policy: there must be exactly one, and it must
 * be the connect page's policy (`studio.connect.no-network`).
 *
 * @param html - the built `connect.html`
 */
export function builtPolicyProblems(html: string): string[] {
  const policies = metaPolicies(html);
  if (policies.length !== 1) {
    return [
      `connect.html has ${policies.length} content security policy tags; it should have exactly one.`,
    ];
  }
  return policyProblems(policies[0] ?? "", { scriptHashes: false }).map(
    (problem) => `connect.html: ${problem}`,
  );
}

/** Every file's size under a folder, added up. */
export function folderBytes(folder: string): number {
  let bytes = 0;
  for (const entry of readdirSync(folder, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) bytes += statSync(join(entry.parentPath, entry.name)).size;
  }
  return bytes;
}

/** One file the build wrote; only a chunk of script lists the modules in it. */
interface WrittenFile {
  readonly type: string;
  readonly moduleIds?: readonly string[];
}

/**
 * The part of a Vite plugin the guard is. It is written out here rather than taken from Vite,
 * because only tests and config files may import Vite (`pnpm check`, layers); `vite.config.ts`
 * checks that it fits.
 */
export interface ConnectPageGuardPlugin {
  readonly name: string;
  readonly apply: "build";
  /** Runs once the build has written every file. */
  writeBundle(
    options: { readonly dir?: string },
    bundle: Readonly<Record<string, WrittenFile>>,
  ): void;
}

/**
 * Fails the connect page's build when the page takes in the desktop Studio, grows past its size
 * limit, or loses its content security policy (`studio.connect.bundle`, `studio.connect.no-network`).
 * It reads what was really written, after the build, so the Android job and every other build of
 * the page check the same files the APK ships.
 */
export function connectPageGuard(): ConnectPageGuardPlugin {
  return {
    name: "halonic:connect-page-guard",
    apply: "build",
    writeBundle(options, bundle) {
      const folder = options.dir;
      if (folder === undefined)
        throw new Error("The connect page guard needs the build's output folder.");
      const moduleIds = Object.values(bundle).flatMap((file) =>
        file.type === "chunk" ? (file.moduleIds ?? []) : [],
      );
      const problems = [
        ...shutOutProblems(moduleIds),
        ...builtPolicyProblems(readFileSync(join(folder, "connect.html"), "utf8")),
        ...sizeProblems(folderBytes(folder)),
      ];
      if (problems.length > 0) {
        throw new Error(
          `The connect page can't ship in the Android app:\n- ${problems.join("\n- ")}`,
        );
      }
    },
  };
}
