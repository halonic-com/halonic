import { codeEndReasons, pairingEndReasons, phonePlatforms, tunnelReasons } from "@halonicjs/ports";
import { s } from "@halonicjs/schema-kit";

const tunnelStatusSchema = s.union([
  s.object({ state: s.enum(["starting", "ready"] as const), at: s.string() }).strict(),
  s
    .object({
      state: s.enum(["degraded", "down"] as const),
      reason: s.enum(tunnelReasons),
      at: s.string(),
    })
    .strict(),
]);

const pairedPhoneSchema = s
  .object({
    id: s.string(),
    name: s.string(),
    platform: s.enum(phonePlatforms),
    pairedAt: s.string(),
    lastSeenAt: s.string().optional(),
    connected: s.boolean(),
  })
  .strict();

/** One line of `GET /v1/remote/state`: a `RemoteState`. */
export const remoteStateSchema = s
  .object({
    available: s.boolean(),
    on: s.boolean(),
    tunnelProviderId: s.string(),
    tunnel: tunnelStatusSchema,
    allowRiskyRemotely: s.boolean(),
    phones: s.array(pairedPhoneSchema),
    pairing: s.boolean(),
  })
  .strict();

/** The first line of `POST /v1/remote/pairing`: the id the host gave the pairing. */
export const pairingOpenedSchema = s
  .object({ type: s.literal("opened"), pairing: s.string().min(1) })
  .strict();

const endedWithoutTunnel = pairingEndReasons.filter((reason) => reason !== "tunnel-down");

/** Each later line of `POST /v1/remote/pairing`: a `PairingEvent`. */
export const pairingEventSchema = s.union([
  s
    .object({
      type: s.literal("code"),
      code: s.string(),
      qr: s.string(),
      hostName: s.string(),
      expiresAt: s.string(),
    })
    .strict(),
  s
    .object({
      type: s.literal("check"),
      checkCode: s.string(),
      phoneName: s.string(),
      platform: s.enum(phonePlatforms),
      allowBy: s.string(),
    })
    .strict(),
  s.object({ type: s.literal("code-ended"), reason: s.enum(codeEndReasons) }).strict(),
  s.object({ type: s.literal("paired"), phone: pairedPhoneSchema }).strict(),
  s.object({ type: s.literal("ended"), reason: s.enum(endedWithoutTunnel) }).strict(),
  s
    .object({
      type: s.literal("ended"),
      reason: s.literal("tunnel-down"),
      tunnelReason: s.enum(tunnelReasons),
    })
    .strict(),
]);
