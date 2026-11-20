import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { queryFor, readResponse } from "./dns-message.test-helper.ts";
import { dnsTypes, readQuestions, writeResponse } from "./dns-message.ts";

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
