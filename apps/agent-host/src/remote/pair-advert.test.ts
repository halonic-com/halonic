import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { queryFor, readResponse } from "./dns-message.test-helper.ts";
import { dnsTypes } from "./dns-message.ts";
import { type MulticastSocket, PairAdvert, pairServiceName } from "./pair-advert.ts";

/** A socket that keeps what it sent and lets a test deliver datagrams. */
class FakeSocket implements MulticastSocket {
  sent: Uint8Array[] = [];
  closed = false;
  failing = false;
  #handler: ((message: Uint8Array, from: string) => void) | undefined;

  async send(message: Uint8Array): Promise<void> {
    if (this.failing) throw new Error("the network is unreachable");
    this.sent.push(message);
  }

  onMessage(handler: (message: Uint8Array, from: string) => void): void {
    this.#handler = handler;
  }

  async close(): Promise<void> {
    this.closed = true;
    this.#handler = undefined;
  }

  /** Delivers a datagram, by default from a phone on the interface's subnet. */
  deliver(message: Uint8Array, from = "192.168.1.33"): void {
    this.#handler?.(message, from);
  }
}

const lan = { address: "192.168.1.20", netmask: "255.255.255.0" };
const desk = { hostName: "Tim's laptop", port: 4100, lan };

/** An open that waits until the test lets it finish, counting the sockets it opened. */
function heldOpen() {
  const sockets: FakeSocket[] = [];
  const pending: Array<() => void> = [];
  const open = () =>
    new Promise<MulticastSocket>((resolve) => {
      const socket = new FakeSocket();
      sockets.push(socket);
      pending.push(() => resolve(socket));
    });
  const finish = async () => {
    for (const resolve of pending.splice(0)) resolve();
    await new Promise((resolve) => setImmediate(resolve));
  };
  return { open, sockets, finish };
}

/**
 * An advert on a fake socket and a fake clock, with the wait between
 * announcements held until `gapOver`, which also moves the clock on a second.
 */
function advertOnFakeSocket(open?: (on: typeof lan) => Promise<MulticastSocket>) {
  const socket = new FakeSocket();
  const logged: string[] = [];
  let time = 0;
  // The gap may end before the advert starts waiting for it, so the wait checks first.
  let gapEnded = false;
  let endGap: () => void = () => {
    gapEnded = true;
  };
  const gapOver = () => {
    time += 1_000;
    endGap();
  };
  const advert = new PairAdvert({
    open: open ?? (async () => socket),
    now: () => time,
    wait: () => {
      if (gapEnded) return Promise.resolve();
      return new Promise((resolve) => {
        endGap = () => {
          gapEnded = true;
          resolve();
        };
      });
    },
    randomBytes: (length) => new Uint8Array(length).fill(0xab),
    log: (text) => logged.push(text),
  });
  const later = (ms: number) => {
    time += ms;
  };
  return { advert, socket, logged, gapOver, later };
}

/** Lets the advert's socket open and its first announcement go out. */
const settled = () => new Promise((resolve) => setImmediate(resolve));

const instance = `halonic-abababababababab.${pairServiceName}`;

verifies("agent-host.remote-pair-advert", () => {
  describe("PairAdvert", () => {
    it("announces the service twice, a second apart, with the host's name as its only TXT entry", async () => {
      const { advert, socket, gapOver } = advertOnFakeSocket();
      const started = advert.start(desk);
      await settled();
      expect(socket.sent).toHaveLength(1);
      gapOver();
      await started;
      expect(socket.sent).toHaveLength(2);
      const { records } = readResponse(socket.sent[0] ?? new Uint8Array());
      expect(records.map(({ type, name, data, port }) => ({ type, name, data, port }))).toEqual([
        { type: dnsTypes.PTR, name: pairServiceName, data: instance, port: undefined },
        { type: dnsTypes.SRV, name: instance, data: "halonic-abababababababab.local", port: 4100 },
        { type: dnsTypes.TXT, name: instance, data: "name=Tim's laptop", port: undefined },
        {
          type: dnsTypes.A,
          name: "halonic-abababababababab.local",
          data: "192.168.1.20",
          port: undefined,
        },
      ]);
      expect(records.every((record) => record.ttl === 120)).toBe(true);
    });

    it("answers a phone's PTR query for the service with every record, and nothing else", async () => {
      const { advert, socket, gapOver, later } = advertOnFakeSocket();
      const started = advert.start(desk);
      gapOver();
      await started;
      later(1_000);
      socket.deliver(queryFor("_googlecast._tcp.local", dnsTypes.PTR));
      socket.deliver(queryFor(pairServiceName, dnsTypes.A));
      socket.deliver(queryFor(pairServiceName, dnsTypes.ANY));
      socket.deliver(queryFor(instance, dnsTypes.ANY));
      socket.deliver(queryFor(instance, dnsTypes.SRV));
      expect(socket.sent).toHaveLength(2);
      socket.deliver(queryFor(pairServiceName, dnsTypes.PTR));
      const answer = readResponse(socket.sent[2] ?? new Uint8Array()).records;
      expect(answer.map((record) => `${record.section} ${record.type}`)).toEqual([
        "answer 12",
        "additional 33",
        "additional 16",
        "additional 1",
      ]);
      expect(socket.sent).toHaveLength(3);
    });

    it("answers at most once a second, counting the announcements, however many ask", async () => {
      const { advert, socket, gapOver, later } = advertOnFakeSocket();
      const started = advert.start(desk);
      gapOver();
      await started;
      socket.deliver(queryFor(pairServiceName, dnsTypes.PTR));
      expect(socket.sent).toHaveLength(2);
      later(1_000);
      for (let query = 0; query < 1000; query += 1) {
        socket.deliver(queryFor(pairServiceName, dnsTypes.PTR));
      }
      expect(socket.sent).toHaveLength(3);
      later(999);
      socket.deliver(queryFor(pairServiceName, dnsTypes.PTR));
      expect(socket.sent).toHaveLength(3);
      later(1);
      socket.deliver(queryFor(pairServiceName, dnsTypes.PTR));
      expect(socket.sent).toHaveLength(4);
    });

    it("sends the same bytes for every answer, whatever the query held", async () => {
      const { advert, socket, gapOver, later } = advertOnFakeSocket();
      const started = advert.start(desk);
      gapOver();
      await started;
      later(1_000);
      socket.deliver(queryFor(pairServiceName, dnsTypes.PTR));
      later(1_000);
      socket.deliver(queryFor("_HALONIC-PAIR._tcp.local", dnsTypes.PTR, true));
      expect(socket.sent[3]).toEqual(socket.sent[2]);
    });

    it("opens no socket when its records can't be written, and says why", async () => {
      let opened = 0;
      const { advert, logged } = advertOnFakeSocket(async () => {
        opened += 1;
        return new FakeSocket();
      });
      await advert.start({ ...desk, lan: { address: "fe80::1", netmask: "255.255.255.0" } });
      await advert.start({ ...desk, lan: { ...lan, netmask: "255.0.255.0" } });
      await advert.start({ ...desk, lan: { ...lan, netmask: "0.0.0.0" } });
      expect(opened).toBe(0);
      expect(logged).toHaveLength(3);
      for (const line of logged) {
        expect(line).toMatch(/^Phones on this Wi-Fi won't list this computer: RangeError/);
      }
      await advert.stop();
    });

    it("says goodbye and closes the socket when it stops, and announces nothing after", async () => {
      const { advert, socket, gapOver } = advertOnFakeSocket();
      const started = advert.start(desk);
      await settled();
      await advert.stop();
      gapOver();
      await started;
      expect(socket.sent).toHaveLength(2);
      const goodbye = readResponse(socket.sent[1] ?? new Uint8Array()).records;
      expect(goodbye.every((record) => record.ttl === 0)).toBe(true);
      expect(socket.closed).toBe(true);
      await advert.stop();
    });

    it("puts the host's name in TXT as the phone may show it", async () => {
      const { advert, socket } = advertOnFakeSocket();
      void advert.start({ ...desk, hostName: `Desk${String.fromCodePoint(0x202e)}kseD` });
      await settled();
      const txt = readResponse(socket.sent[0] ?? new Uint8Array()).records[2];
      expect(txt?.data).toBe("name=DeskkseD");
    });

    it("starts once while it runs", async () => {
      let opened = 0;
      const socket = new FakeSocket();
      const { advert } = advertOnFakeSocket(async () => {
        opened += 1;
        return socket;
      });
      void advert.start(desk);
      await settled();
      await advert.start(desk);
      expect(opened).toBe(1);
    });

    it("says why when the socket can't open or a datagram can't be sent, and goes on", async () => {
      const refused = advertOnFakeSocket(async () => {
        throw new Error("port 5353 is taken");
      });
      await refused.advert.start(desk);
      expect(refused.logged).toEqual([
        "Phones on this Wi-Fi won't list this computer: Error: port 5353 is taken\n",
      ]);
      await refused.advert.stop();

      const { advert, socket, logged } = advertOnFakeSocket();
      socket.failing = true;
      void advert.start(desk);
      await new Promise((resolve) => setImmediate(resolve));
      expect(logged).toEqual([
        "An advertisement for phones on this Wi-Fi wasn't sent: Error: the network is unreachable\n",
      ]);
    });

    it("opens its socket on the phone's interface and answers only addresses on its subnet", async () => {
      const socket = new FakeSocket();
      const opened: (typeof lan)[] = [];
      const { advert, gapOver, later } = advertOnFakeSocket(async (on) => {
        opened.push(on);
        return socket;
      });
      const started = advert.start(desk);
      gapOver();
      await started;
      expect(opened).toEqual([lan]);
      later(1_000);
      for (const from of ["10.0.0.5", "192.168.2.33", "172.17.0.1", "::1", "fe80::1", "nonsense"]) {
        socket.deliver(queryFor(pairServiceName, dnsTypes.PTR), from);
      }
      expect(socket.sent).toHaveLength(2);
      socket.deliver(queryFor(pairServiceName, dnsTypes.PTR), "192.168.1.254");
      expect(socket.sent).toHaveLength(3);
    });

    it("leaves no socket open when it stops while the socket opens", async () => {
      const { open, sockets, finish } = heldOpen();
      const { advert } = advertOnFakeSocket(open);
      const started = advert.start(desk);
      const stopped = advert.stop();
      await finish();
      await Promise.all([started, stopped]);
      expect(sockets).toHaveLength(1);
      expect(sockets[0]?.closed).toBe(true);
      expect(sockets[0]?.sent).toEqual([]);
      sockets[0]?.deliver(queryFor(pairServiceName, dnsTypes.PTR));
      expect(sockets[0]?.sent).toEqual([]);
    });

    it("opens one socket for two starts, and a new one for a start after a stop", async () => {
      const { open, sockets, finish } = heldOpen();
      const { advert, gapOver } = advertOnFakeSocket(open);
      const first = advert.start(desk);
      const second = advert.start(desk);
      await finish();
      gapOver();
      await Promise.all([first, second]);
      expect(sockets).toHaveLength(1);
      await advert.stop();
      expect(sockets[0]?.closed).toBe(true);
      const third = advert.start(desk);
      await finish();
      await third;
      expect(sockets).toHaveLength(2);
      expect(sockets[1]?.closed).toBe(false);
      await advert.stop();
      expect(sockets[1]?.closed).toBe(true);
    });
  });
});
