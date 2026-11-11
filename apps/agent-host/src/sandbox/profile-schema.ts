import { isAbsolute } from "node:path";
import type { SandboxProfile } from "@halonicjs/ports";
import { type Schema, s } from "@halonicjs/schema-kit";

/**
 * The `Sandbox` port's profile is a plain type, because Halonic builds it in
 * process. Over loopback it arrives as data, so the host checks it here before
 * the sandbox sees it (the port asks this of an adapter that takes one from
 * outside). Every path must be absolute in this computer's notation.
 */
export const absolutePath = s
  .string()
  .min(1)
  .refine((path) => isAbsolute(path), { message: "must be an absolute path" });

const bridge = s.discriminatedUnion("kind", [
  s
    .object({
      kind: s.literal("loopback"),
      host: s.string().min(1),
      port: s.number().int().min(1).max(65_535),
    })
    .strict(),
  s
    .object({
      kind: s.literal("socket"),
      name: s.string().min(1),
      socketPath: absolutePath,
    })
    .strict(),
]);

/**
 * The longest time limit a timer can hold: Node fires a `setTimeout` of more
 * than 2^31 - 1 ms (about 24.8 days) after 1 ms, which would end the session
 * at once.
 */
export const maxTimeLimitMs = 2_147_483_647;

export const sandboxProfileSchema: Schema<SandboxProfile> = s
  .object({
    workingFolder: absolutePath,
    tempFolder: absolutePath,
    settingsFolder: absolutePath.nullable(),
    readOnlyPaths: s.array(absolutePath),
    deniedPaths: s.array(absolutePath),
    reopenedPaths: s.array(absolutePath).optional(),
    env: s.record(s.string(), s.string()),
    network: s
      .object({
        // Never optional: a missing bridge must not mean "the whole network".
        bridge: bridge.nullable(),
        allowedSites: s.array(s.string().min(1)),
      })
      .strict(),
    timeLimitMs: s.number().int().positive().max(maxTimeLimitMs),
    keyStore: s.enum(["allowed", "denied"]).exactOptional(),
  })
  .strict();
