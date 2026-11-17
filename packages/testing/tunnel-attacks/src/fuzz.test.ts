import { parseGatewayClientMessage } from "@halonicjs/adapter-remote-gateway";
import { gatewayMaxMessageBytes } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { openTunnelRig, type TunnelRig } from "./tunnel-rig.ts";
import { op, wireFrame } from "./wire-client.ts";

const seed = Number(process.env["HALONIC_FUZZ_SEED"] ?? 20_261_117);
const parserRuns = Number(process.env["HALONIC_FUZZ_RUNS"] ?? 4_000);
const connectionRuns = Number(process.env["HALONIC_FUZZ_CONNECTIONS"] ?? 60);

/** A small seeded generator (mulberry32), so a failing run can be repeated. */
function random(start: number): () => number {
  let state = start >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

type Rand = () => number;
const pick = <T>(rand: Rand, list: readonly T[]): T => list[Math.floor(rand() * list.length)] as T;

const validMessages: readonly Record<string, unknown>[] = [
  { type: "hello", id: "h1", version: 1 },
  { type: "list-sessions", id: "l1" },
  { type: "watch", id: "w1", sessionId: "s1", afterSeq: 0 },
  { type: "unwatch", id: "u1", sessionId: "s1" },
  {
    type: "answer-approval",
    id: "a1",
    sessionId: "s1",
    approvalId: "normal1",
    decision: "approve",
  },
  { type: "answer-approval", id: "a2", sessionId: "s1", approvalId: "risky1", decision: "deny" },
  { type: "prompt", id: "p1", sessionId: "s1", text: "hello" },
];

const edgeValues: readonly unknown[] = [
  null,
  true,
  false,
  0,
  -1,
  1,
  1.5,
  2 ** 53,
  -(2 ** 53),
  "",
  " ",
  "a",
  "a-b_C9",
  "a".repeat(128),
  "a".repeat(129),
  "../x",
  "a\u0000",
  "é",
  "\ud800",
  "approve",
  "deny",
  "APPROVE",
  [],
  [1],
  {},
  { a: 1 },
  "x".repeat(10_000),
  "x".repeat(10_001),
  "hello",
  "s1",
  "risky1",
  "normal1",
];

/** One valid message with a few random changes, as bytes. */
function mutated(rand: Rand): Buffer {
  const message = structuredClone(pick(rand, validMessages)) as Record<string, unknown>;
  for (let change = 0, count = 1 + Math.floor(rand() * 3); change < count; change++) {
    const keys = Object.keys(message);
    switch (Math.floor(rand() * 5)) {
      case 0:
        delete message[pick(rand, keys)];
        break;
      case 1:
        message[pick(rand, ["x", "risk", "__proto__", "tools", "type", "id", "constructor"])] =
          pick(rand, edgeValues);
        break;
      case 2:
        message[pick(rand, keys)] = pick(rand, edgeValues);
        break;
      case 3:
        message["type"] = pick(rand, [
          "hello",
          "prompt",
          "watch",
          "shell",
          "",
          "toString",
          "hasOwnProperty",
        ]);
        break;
      default:
        message[pick(rand, keys)] = pick(rand, keys);
    }
  }
  let bytes = Buffer.from(JSON.stringify(message));
  if (rand() < 0.3 && bytes.length > 1) {
    const at = Math.floor(rand() * bytes.length);
    bytes = Buffer.from(bytes);
    bytes[at] = Math.floor(rand() * 256);
  }
  if (rand() < 0.1) bytes = bytes.subarray(0, Math.floor(rand() * bytes.length));
  return bytes;
}

/** Some bytes, from a message-like start or from nothing. */
function frameBytes(rand: Rand): { binary: boolean; bytes: Uint8Array } {
  const roll = rand();
  if (roll < 0.6) return { binary: false, bytes: mutated(rand) };
  if (roll < 0.7) return { binary: true, bytes: mutated(rand) };
  const bytes = new Uint8Array(Math.floor(rand() * 300));
  for (let at = 0; at < bytes.length; at++) bytes[at] = Math.floor(rand() * 256);
  if (roll < 0.85) return { binary: false, bytes };
  const padded = Buffer.alloc(gatewayMaxMessageBytes + Math.floor(rand() * 3) - 1, 0x20);
  return { binary: false, bytes: padded };
}

/**
 * A second reading of what a valid message is, written from the protocol's
 * words and not from the parser: the size, UTF-8, one JSON object, a known
 * type, exactly its fields, and each field in its range.
 */
function readsAsValid(bytes: Uint8Array, binary: boolean): boolean {
  if (binary || bytes.byteLength > gatewayMaxMessageBytes) return false;
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes));
  } catch {
    return false;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const fields = value as Record<string, unknown>;
  const id = (v: unknown) => typeof v === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(v);
  const words: Record<string, Record<string, (v: unknown) => boolean>> = {
    hello: { id, version: (v) => Number.isSafeInteger(v) },
    "list-sessions": { id },
    watch: { id, sessionId: id, afterSeq: (v) => Number.isSafeInteger(v) && (v as number) >= 0 },
    unwatch: { id, sessionId: id },
    "answer-approval": {
      id,
      sessionId: id,
      approvalId: id,
      decision: (v) => v === "approve" || v === "deny",
    },
    prompt: {
      id,
      sessionId: id,
      text: (v) => typeof v === "string" && v.length >= 1 && v.length <= 10_000,
    },
  };
  const type = fields["type"];
  if (typeof type !== "string" || !Object.hasOwn(words, type)) return false;
  const rules = words[type] as Record<string, (v: unknown) => boolean>;
  const names = Object.keys(fields)
    .filter((name) => name !== "type")
    .sort();
  if (names.join() !== Object.keys(rules).sort().join()) return false;
  return names.every((name) => (rules[name] as (v: unknown) => boolean)(fields[name]));
}

/** One connection that does the handshake and hello, sends a few hostile frames and goes away. */
async function hostileConnection(rig: TunnelRig, rand: Rand): Promise<void> {
  const client = rig.client();
  await client.open(rig.forwarderPort, { host: rig.tunnelName });
  client.sendJson({ type: "hello", id: "h1", version: 1 });
  for (let at = 0, count = 1 + Math.floor(rand() * 6); at < count; at++) {
    client.write(hostileBytes(rand));
  }
  await new Promise((resolve) => setTimeout(resolve, 20));
  client.end();
  await client.closed;
}

/** A text frame of a mutated message, a binary one, or raw bytes that are no frame. */
function hostileBytes(rand: Rand): Buffer {
  const roll = rand();
  if (roll < 0.7) return wireFrame(op.text, mutated(rand));
  if (roll < 0.8) return wireFrame(op.binary, mutated(rand));
  const bytes = Buffer.alloc(Math.floor(rand() * 40));
  for (let at = 0; at < bytes.length; at++) bytes[at] = Math.floor(rand() * 256);
  return bytes;
}

verifies("tunnel-attacks.fuzz", () => {
  describe(`the parser, seed ${seed}`, () => {
    it("never throws, and accepts what a second reading of the protocol accepts, unchanged", () => {
      const rand = random(seed);
      let accepted = 0;
      for (let run = 0; run < parserRuns; run++) {
        const { binary, bytes } = frameBytes(rand);
        const got = parseGatewayClientMessage({ binary, bytes });
        const label = `seed ${seed}, run ${run}`;
        expect(got.ok, label).toBe(readsAsValid(bytes, binary));
        if (got.ok) {
          accepted++;
          expect(got.message, label).toEqual(JSON.parse(Buffer.from(bytes).toString("utf8")));
        }
      }
      // A run that accepts nothing, or only that, would prove little.
      expect(accepted, `seed ${seed}`).toBeGreaterThan(parserRuns / 50);
      expect(accepted, `seed ${seed}`).toBeLessThan(parserRuns);
    });
  });

  describe(`hostile connections, seed ${seed}`, () => {
    it("leave the gateway serving, a risky approval unanswered and the source asked for protocol messages only", async () => {
      const rand = random(seed + 1);
      const rig = await openTunnelRig({ maxConnections: 64, helloTimeoutMs: 2_000 });
      try {
        const sending: Promise<void>[] = [];
        for (let run = 0; run < connectionRuns; run++) {
          sending.push(hostileConnection(rig, rand));
        }
        await Promise.all(sending);
        for (const call of rig.source.calls) {
          const label = `seed ${seed}: ${JSON.stringify(call).slice(0, 100)}`;
          expect(call.sessionId, label).toBe("s1");
          if (call.kind === "answer") expect(call.approvalId, label).not.toBe("risky1");
          if (call.kind === "prompt") expect(call.text.length, label).toBeLessThanOrEqual(10_000);
        }
        const phone = await rig.greeted();
        expect(await phone.frames(1), `seed ${seed}`).toHaveLength(1);
      } finally {
        await rig.stop();
      }
    }, 30_000);
  });
});
