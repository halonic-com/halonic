import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { queryFor, readResponse } from "./dns-message.test-helper.ts";
import {
  dnsMaxMessageBytes,
  dnsMaxQuestions,
  dnsTypes,
  readQuestions,
  writeResponse,
} from "./dns-message.ts";

/** A query's header with `count` questions, then `body` as it is. */
function query(count: number, body: readonly number[], flags = 0): Uint8Array {
  return Uint8Array.from([
    0,
    0,
    flags >> 8,
    flags & 0xff,
    count >> 8,
    count & 0xff,
    0,
    0,
    0,
    0,
    0,
    0,
    ...body,
  ]);
}

/** One question for `labels`, of `type` and `questionClass`, written whole. */
function question(
  labels: readonly string[],
  type: number = dnsTypes.PTR,
  questionClass = 1,
): number[] {
  const name = labels.flatMap((label) => [label.length, ...new TextEncoder().encode(label)]);
  return [...name, 0, type >> 8, type & 0xff, questionClass >> 8, questionClass & 0xff];
}

const service = ["_halonic-pair", "_tcp", "local"];

/**
 * A query whose last name follows 16 pointers when it points at the ninth
 * question's name, or 17 when at that question's type. The first question
 * is written whole; each next one is a pointer back, and its type field is
 * itself a pointer to its own name, so every hop points further back.
 */
function pointerChain(lastPointsAt: "name" | "type"): Uint8Array {
  const body = question(service);
  let previous = 12;
  let previousType = 12;
  for (let index = 0; index < 8; index += 1) {
    const start = 12 + body.length;
    body.push(0xc0, index === 0 ? previous : previousType, 0xc0, start, 0, 1);
    previous = start;
    previousType = start + 2;
  }
  body.push(0xc0, lastPointsAt === "name" ? previous : previousType, 0, 12, 0, 1);
  return query(10, body);
}

/** Numbers from a fixed seed, so the sweep below is the same on every run. */
function seededBytes(seed: number): (length: number) => Uint8Array {
  let state = seed;
  return (length) =>
    Uint8Array.from({ length }, () => {
      state = (state * 1_103_515_245 + 12_345) % 2 ** 31;
      return state >> 16;
    });
}

verifies("agent-host.remote-pair-advert", () => {
  describe("readQuestions", () => {
    it("reads a query's questions, lower case, following a compression pointer", () => {
      expect(readQuestions(queryFor("_Halonic-Pair._tcp.local", dnsTypes.PTR, true))).toEqual([
        { name: "_halonic-pair._tcp.local", type: dnsTypes.PTR },
        { name: "_halonic-pair._tcp.local", type: dnsTypes.PTR },
      ]);
    });

    it("reads nothing from a response, a short message or a cut-off question", () => {
      const query = queryFor("_halonic-pair._tcp.local", dnsTypes.PTR);
      const response = Uint8Array.from(query);
      response[2] = 0x84;
      expect(readQuestions(response)).toEqual([]);
      expect(readQuestions(query.subarray(0, 11))).toEqual([]);
      expect(readQuestions(query.subarray(0, query.length - 2))).toEqual([]);
      expect(readQuestions(query.subarray(0, 20))).toEqual([]);
    });

    it("reads nothing from a pointer that doesn't point back, or a label that runs past the end", () => {
      const loop = Uint8Array.from([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0xc0, 12, 0, 12, 0, 1]);
      expect(readQuestions(loop)).toEqual([]);
      const cut = Uint8Array.from([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0xc0]);
      expect(readQuestions(cut)).toEqual([]);
      const long = Uint8Array.from([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 64, 97]);
      expect(readQuestions(long)).toEqual([]);
    });
  });

  describe("readQuestions on what the network can send", () => {
    it("reads a query of 16 questions, and nothing from one that claims 17", () => {
      const sixteen = Array.from({ length: dnsMaxQuestions }, () => question(service)).flat();
      expect(readQuestions(query(dnsMaxQuestions, sixteen))).toHaveLength(dnsMaxQuestions);
      expect(readQuestions(query(dnsMaxQuestions + 1, sixteen))).toEqual([]);
      expect(readQuestions(query(0xffff, question(service)))).toEqual([]);
    });

    it("reads nothing from another opcode, another class, or a message over 9000 bytes", () => {
      expect(readQuestions(query(1, question(service), 0x2000))).toEqual([]);
      expect(readQuestions(query(1, question(service, dnsTypes.PTR, 3)))).toEqual([]);
      expect(readQuestions(query(1, question(service, dnsTypes.PTR, 0x8001)))).toEqual([
        { name: "_halonic-pair._tcp.local", type: dnsTypes.PTR },
      ]);
      const padded = [...question(service), ...new Array(dnsMaxMessageBytes).fill(0)];
      expect(readQuestions(query(1, padded))).toEqual([]);
    });

    it("reads nothing from a name over 255 bytes or a label that isn't UTF-8", () => {
      const label = "a".repeat(63);
      expect(readQuestions(query(1, question([label, label, label, "a".repeat(61)])))).toHaveLength(
        1,
      );
      expect(readQuestions(query(1, question([label, label, label, "a".repeat(62)])))).toEqual([]);
      const notUtf8 = [2, 0xc3, 0x28, 0, 0, 12, 0, 1];
      expect(readQuestions(query(1, notUtf8))).toEqual([]);
    });

    it("follows at most 16 pointers, each further back, and reads nothing from a loop", () => {
      expect(readQuestions(pointerChain("name"))).toHaveLength(10);
      expect(readQuestions(pointerChain("type"))).toEqual([]);
      const forward = query(1, [0xc0, 20, 0, 12, 0, 1, 0, 0, 1, 97, 0]);
      expect(readQuestions(forward)).toEqual([]);
    });

    it("reads every cut-off copy of a query as nothing, without throwing", () => {
      const whole = query(2, [...question(service), ...question(["acme", "local"], dnsTypes.A)]);
      for (let length = 0; length < whole.length; length += 1) {
        expect(readQuestions(whole.subarray(0, length)), `${length} bytes`).toEqual([]);
      }
      expect(readQuestions(whole)).toHaveLength(2);
    });

    it("never throws on random bytes or a query with random bytes changed, and reads only names", () => {
      const random = seededBytes(7);
      const whole = query(1, question(service));
      for (let round = 0; round < 2000; round += 1) {
        const [length = 0] = random(1);
        const noise = random(length);
        const changed = Uint8Array.from(whole);
        const [at = 0, value = 0] = random(2);
        changed[at % changed.length] = value;
        for (const message of [noise, changed]) {
          for (const read of readQuestions(message)) {
            expect(typeof read.name).toBe("string");
            expect(read.type).toBeLessThanOrEqual(0xffff);
          }
        }
      }
    });
  });

  describe("writeResponse", () => {
    it("writes an authoritative response with its answers, then its additionals", () => {
      const message = writeResponse(
        [
          {
            type: "PTR",
            name: "_halonic-pair._tcp.local",
            ttl: 120,
            unique: false,
            target: "a._halonic-pair._tcp.local",
          },
        ],
        [
          {
            type: "SRV",
            name: "a._halonic-pair._tcp.local",
            ttl: 120,
            unique: true,
            port: 4100,
            target: "a.local",
          },
          {
            type: "TXT",
            name: "a._halonic-pair._tcp.local",
            ttl: 0,
            unique: true,
            entries: ["name=Desk"],
          },
          { type: "A", name: "a.local", ttl: 120, unique: true, address: "192.168.1.20" },
        ],
      );
      const { flags, records } = readResponse(message);
      expect(flags).toBe(0x8400);
      expect(records).toEqual([
        {
          section: "answer",
          name: "_halonic-pair._tcp.local",
          type: 12,
          cacheFlush: false,
          ttl: 120,
          data: "a._halonic-pair._tcp.local",
        },
        {
          section: "additional",
          name: "a._halonic-pair._tcp.local",
          type: 33,
          cacheFlush: true,
          ttl: 120,
          data: "a.local",
          port: 4100,
        },
        {
          section: "additional",
          name: "a._halonic-pair._tcp.local",
          type: 16,
          cacheFlush: true,
          ttl: 0,
          data: "name=Desk",
        },
        {
          section: "additional",
          name: "a.local",
          type: 1,
          cacheFlush: true,
          ttl: 120,
          data: "192.168.1.20",
        },
      ]);
    });

    it("refuses a label over 63 bytes, a TXT entry over 255 and an address that isn't IPv4", () => {
      const base = { name: "a.local", ttl: 120, unique: true } as const;
      expect(() =>
        writeResponse([{ ...base, type: "PTR", target: `${"x".repeat(64)}.local` }]),
      ).toThrow("63");
      expect(() => writeResponse([{ ...base, type: "TXT", entries: ["x".repeat(256)] }])).toThrow(
        "255",
      );
      expect(() => writeResponse([{ ...base, type: "A", address: "fe80::1" }])).toThrow("IPv4");
      expect(() => writeResponse([{ ...base, type: "A", address: "192.168.1.256" }])).toThrow(
        "IPv4",
      );
    });
  });
});
