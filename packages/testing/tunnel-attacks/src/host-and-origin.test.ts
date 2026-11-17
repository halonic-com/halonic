import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { openTunnelRig } from "./tunnel-rig.ts";
import type { HandshakeOptions } from "./wire-client.ts";

verifies("tunnel-attacks.host-and-origin", () => {
  /** The status line of the gateway's answer to a handshake that comes through the forwarder. */
  async function statusOf(
    options: (rig: { port: number; name: string }) => HandshakeOptions,
    rigOptions: Parameters<typeof openTunnelRig>[0] = {},
  ): Promise<string> {
    const rig = await openTunnelRig(rigOptions);
    try {
      const client = rig.client();
      const status = await client.handshake(
        rig.forwarderPort,
        options({ port: rig.gateway.port, name: rig.tunnelName }),
      );
      expect(rig.source.calls).toEqual([]);
      return status;
    } finally {
      await rig.stop();
    }
  }

  describe("DNS rebinding and a Host the attacker chooses", () => {
    it("refuses a name the attacker owns, also one that starts with a loopback name", async () => {
      for (const host of [
        "evil.example",
        "evil.example:80",
        "attacker.example",
        "127.0.0.1.evil.example",
        "localhost.evil.example",
        "evil-localhost",
        "0.0.0.0",
        "[::1]",
        "2130706433",
        "0x7f.0.0.1",
        "127.1",
      ]) {
        expect(
          await statusOf(({ port }) => ({ host: host.includes(":") ? host : `${host}:${port}` })),
          host,
        ).toContain("421");
        expect(await statusOf(() => ({ host })), host).toContain("421");
      }
    });

    it("refuses a Host with user information, a trailing dot or label, a path or another port", async () => {
      for (const make of [
        (port: number) => `evil.example@127.0.0.1:${port}`,
        (port: number) => `127.0.0.1:${port}@evil.example`,
        (port: number) => `127.0.0.1.:${port}`,
        (port: number) => `localhost.:${port}`,
        (port: number) => `127.0.0.1:${port}.evil.example`,
        (port: number) => `127.0.0.1:${port}/`,
        (port: number) => `127.0.0.1:${port + 1}`,
        (port: number) => `127.0.0.1:0${port}`,
        (port: number) => `127.0.0.1:${port}:${port}`,
      ]) {
        const status = await statusOf(({ port }) => ({ host: make(port) }));
        expect(status, make(0)).not.toContain("101");
      }
    });

    it("gives no WebSocket to a request with no Host or with a forwarded Host only", async () => {
      expect(await statusOf(() => ({ host: null }))).not.toContain("101");
      expect(
        await statusOf(({ name }) => ({
          host: "evil.example",
          headers: [`X-Forwarded-Host: ${name}`, `Forwarded: host=${name}`],
        })),
      ).toContain("421");
    });

    // Open gap (task HAL-5687 keeps the note): the gateway reads the first of two Host lines and
    // never sees the second, so a hop that reads the other one disagrees with it. RFC 9112 asks for a
    // 400. It passes while the gap is open and fails when the gateway closes it; then change it to `it`.
    it.fails("gives no WebSocket to a request with two Host lines", async () => {
      expect(
        await statusOf(({ port }) => ({
          host: `127.0.0.1:${port}`,
          headers: ["Host: evil.example"],
        })),
      ).not.toContain("101");
    });

    it("gives no WebSocket to a request whose target names another host", async () => {
      for (const target of [
        "http://evil.example/v1/gateway",
        "ws://evil.example/v1/gateway",
        "//evil.example/v1/gateway",
        "/v1/gateway/../health",
        "/v1/gateway%2f..",
        "/v1/gateway/",
        "/V1/GATEWAY",
      ]) {
        expect(await statusOf(({ name }) => ({ host: name, target })), target).not.toContain("101");
      }
    });

    it("lets a phone in only by a tunnel name that is listed, in any case, and on no other port", async () => {
      expect(await statusOf(({ name }) => ({ host: name }), { listTunnelName: false })).toContain(
        "421",
      );
      expect(await statusOf(({ name }) => ({ host: name }))).toContain("101");
      expect(await statusOf(({ name }) => ({ host: name.toUpperCase() }))).toContain("101");
      expect(await statusOf(({ name }) => ({ host: `${name}:443` }))).toContain("421");
      expect(await statusOf(({ name }) => ({ host: `x.${name}` }))).toContain("421");
    });
  });

  describe("Origin", () => {
    it("refuses a request with an Origin of any kind, even the gateway's own or the tunnel's", async () => {
      for (const origin of [
        "https://evil.example",
        "null",
        "file://",
        "",
        "http://127.0.0.1",
        "https://gateway-1.fake-tunnel.invalid",
        "chrome-extension://abc",
      ]) {
        const status = await statusOf(({ name }) => ({
          host: name,
          headers: [`Origin: ${origin}`],
        }));
        expect(status, origin).toContain("403");
      }
    });

    it("refuses an Origin sent in an odd case or twice", async () => {
      expect(
        await statusOf(({ name }) => ({ host: name, headers: ["oRiGiN: https://evil.example"] })),
      ).toContain("403");
      expect(
        await statusOf(({ name }) => ({
          host: name,
          headers: ["Origin: https://a.example", "Origin: https://b.example"],
        })),
      ).not.toContain("101");
    });

    it("sends no CORS header to any request, so a web page can't read an answer", async () => {
      const rig = await openTunnelRig();
      try {
        const client = rig.client();
        client.write(
          `OPTIONS /v1/gateway HTTP/1.1\r\nHost: ${rig.tunnelName}\r\nOrigin: https://evil.example\r\nAccess-Control-Request-Method: GET\r\n\r\n`,
        );
        const answer = await client.until((text) => text.includes("\r\n\r\n"));
        expect(answer.split("\r\n")[0]).toContain("404");
        expect(answer.toLowerCase()).not.toContain("access-control");
      } finally {
        await rig.stop();
      }
    });
  });
});
