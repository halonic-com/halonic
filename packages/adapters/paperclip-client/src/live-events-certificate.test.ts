import { once } from "node:events";
import type { AddressInfo } from "node:net";
import tls from "node:tls";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { company, testKey } from "./acme-data.test-helper.ts";
import { upgradeSocket } from "./live-socket.ts";
import { selfSignedCertificate, type TestCertificate } from "./test-certificate.test-helper.ts";

/** A TLS server on 127.0.0.1 that counts every byte that reaches it once a handshake succeeded. */
async function tlsServer(certificate: TestCertificate) {
  let bytes = 0;
  const server = tls.createServer(
    { cert: certificate.certificate, key: certificate.privateKey },
    (socket) =>
      socket.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
      }),
  );
  // A client that refuses the certificate ends the handshake; the server only hears that.
  server.on("tlsClientError", () => {});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  return {
    url: new URL(`wss://127.0.0.1:${port}/api/companies/${company}/events/ws`),
    bytes: () => bytes,
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

const stops: (() => Promise<void> | void)[] = [];

afterEach(async () => {
  for (const stop of stops.splice(0).reverse()) await stop();
});

verifies("paperclip-client.live-events", () => {
  describe("certificate checks", () => {
    it("answers offline to an untrusted self-signed certificate, and sends it nothing", async () => {
      const server = await tlsServer(selfSignedCertificate({ ipv4: ["127.0.0.1"] }));
      stops.push(server.stop);
      const opened: unknown[] = [];

      const answer = await upgradeSocket(server.url, `Bearer ${testKey}`, (upgraded) =>
        opened.push(upgraded),
      );

      expect(answer).toEqual({ kind: "failed", failure: "offline" });
      expect(opened).toEqual([]);
      expect(server.bytes()).toBe(0);
    });

    it("answers offline to a trusted certificate for another name, and sends it nothing", async () => {
      const elsewhere = selfSignedCertificate({ names: ["paperclip.acme.example"] });
      const before = tls.getCACertificates("default");
      tls.setDefaultCACertificates([...before, elsewhere.certificate]);
      stops.push(() => tls.setDefaultCACertificates(before));
      const server = await tlsServer(elsewhere);
      stops.push(server.stop);
      const opened: unknown[] = [];

      const answer = await upgradeSocket(server.url, `Bearer ${testKey}`, (upgraded) =>
        opened.push(upgraded),
      );

      expect(answer).toEqual({ kind: "failed", failure: "offline" });
      expect(opened).toEqual([]);
      expect(server.bytes()).toBe(0);
    });

    it("sends the upgrade to a trusted certificate for the address, so the server above could have seen it", async () => {
      const trusted = selfSignedCertificate({ ipv4: ["127.0.0.1"] });
      const before = tls.getCACertificates("default");
      tls.setDefaultCACertificates([...before, trusted.certificate]);
      stops.push(() => tls.setDefaultCACertificates(before));
      const server = await tlsServer(trusted);
      stops.push(server.stop);

      const answer = await upgradeSocket(server.url, `Bearer ${testKey}`, () => {}, 200);

      // The server never answers, so the upgrade times out after its request arrived.
      expect(answer).toEqual({ kind: "failed", failure: "offline" });
      expect(server.bytes()).toBeGreaterThan(0);
    });
  });
});
