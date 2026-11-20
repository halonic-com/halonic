import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { lastSeenRefreshMs, PairedPhones } from "./paired-phones.ts";
import type { PairingPhone } from "./pairing-types.ts";
import type { PrivateFile } from "./private-file.ts";
import { ManualTime, settled } from "./remote-time.test-helper.ts";

/** A file in memory that counts its writes, and can be told to fail them. */
class MemoryFile implements PrivateFile {
  text: string | undefined;
  writes = 0;
  failing = false;

  async read(): Promise<string | undefined> {
    return this.text;
  }

  async write(text: string): Promise<void> {
    if (this.failing) throw new Error("the disk is full");
    this.writes += 1;
    this.text = text;
  }
}

const phone = (name: string, keyByte: number): PairingPhone => ({
  publicKey: new Uint8Array(32).fill(keyByte),
  name,
  platform: "android",
});

async function store(file = new MemoryFile()) {
  const time = new ManualTime();
  const logged: string[] = [];
  const phones = await PairedPhones.open({ file, time, log: (text) => logged.push(text) });
  return { file, time, logged, phones };
}

verifies("agent-host.remote-paired-phones", () => {
  describe("PairedPhones: the list", () => {
    it("starts empty without a file, and keeps public data only", async () => {
      const { file, time, phones } = await store();
      expect(phones.phones).toEqual([]);
      const added = await phones.add(phone("Pixel 8", 1));
      expect(added).toEqual({
        id: expect.stringMatching(/^[A-Za-z0-9_-]{22}$/),
        name: "Pixel 8",
        platform: "android",
        pairedAt: time.now().toISOString(),
        connected: false,
      });
      const saved = JSON.parse(file.text ?? "");
      expect(Object.keys(saved.phones[0]).sort()).toEqual(
        ["id", "name", "pairedAt", "platform", "publicKey"].sort(),
      );
      expect(saved.phones[0].publicKey).toBe(Buffer.alloc(32, 1).toString("base64url"));
    });

    it("names a phone with a paired phone's name (2), (3), and renames nothing paired again", async () => {
      const { phones } = await store();
      await phones.add(phone("Pixel 8", 1));
      expect((await phones.add(phone("Pixel 8", 2))).name).toBe("Pixel 8 (2)");
      expect((await phones.add(phone("Pixel 8", 3))).name).toBe("Pixel 8 (3)");
      expect((await phones.add(phone("Pixel 8", 1))).name).toBe("Pixel 8");
      expect(phones.phones.map((paired) => paired.name)).toEqual([
        "Pixel 8 (2)",
        "Pixel 8 (3)",
        "Pixel 8",
      ]);
    });

    it("reads back what it wrote, and finds a phone by its key", async () => {
      const { file, phones } = await store();
      const added = await phones.add(phone("Pixel 8", 1));
      const reopened = await PairedPhones.open({ file, time: new ManualTime(), log: () => {} });
      expect(reopened.phones).toEqual([added]);
      expect(reopened.find(new Uint8Array(32).fill(1))?.id).toBe(added.id);
      expect(reopened.find(new Uint8Array(32).fill(2))).toBeUndefined();
    });

    it("refuses a damaged file rather than read it as no phone", async () => {
      const { file, phones } = await store();
      await phones.add(phone("Pixel 8", 1));
      const good = JSON.parse(file.text ?? "");
      const damaged = [
        "not json",
        JSON.stringify({ version: 2, phones: [] }),
        JSON.stringify({
          version: 1,
          phones: [{ ...good.phones[0], id: "AAAAAAAAAAAAAAAAAAAAAA" }],
        }),
        JSON.stringify({ version: 1, phones: [{ ...good.phones[0], publicKey: "short" }] }),
        JSON.stringify({ version: 1, phones: [{ ...good.phones[0], platform: "web" }] }),
        JSON.stringify({ version: 1, phones: [{ ...good.phones[0], lastSeenAt: "soon" }] }),
      ];
      for (const text of damaged) {
        const open = PairedPhones.open({
          file: Object.assign(new MemoryFile(), { text }),
          time: new ManualTime(),
          log: () => {},
        });
        await expect(open).rejects.toThrow("paired phones file");
      }
    });

    it("tells its listeners about every change until they stop", async () => {
      const { phones } = await store();
      let changes = 0;
      const stop = phones.onChange(() => {
        changes += 1;
      });
      await phones.add(phone("Pixel 8", 1));
      stop();
      await phones.add(phone("Galaxy S24", 2));
      expect(changes).toBe(1);
    });

    it("keeps a phone's name cleaned of what could fake the dialog, and cut to 64 bytes", async () => {
      const { phones } = await store();
      const rightToLeft = String.fromCodePoint(0x202e);
      expect((await phones.add(phone(`Pixel${rightToLeft} 8\n`, 1))).name).toBe("Pixel 8");
      expect((await phones.add(phone("p".repeat(100), 2))).name).toBe("p".repeat(64));
      expect((await phones.add(phone(`${rightToLeft}\t`, 3))).name).toBe("Phone");
    });

    it("saves a change when a listener throws, and says why", async () => {
      const { file, logged, phones } = await store();
      phones.onChange(() => {
        throw new Error("the window is gone");
      });
      await phones.add(phone("Pixel 8", 1));
      expect(JSON.parse(file.text ?? "").phones).toHaveLength(1);
      expect(logged).toEqual(["A paired phones listener failed: Error: the window is gone\n"]);
    });
  });

  describe("PairedPhones: sessions and last seen", () => {
    it("counts a phone as connected while a session is open, and writes last seen when it ends", async () => {
      const { time, phones } = await store();
      const { id } = await phones.add(phone("Pixel 8", 1));
      const session = phones.connect(id, () => {});
      expect(phones.phones[0]).toMatchObject({ connected: true });
      expect(phones.phones[0]?.lastSeenAt).toBeUndefined();
      await time.advance(30_000);
      await session.end();
      await session.end();
      expect(phones.phones[0]).toMatchObject({
        connected: false,
        lastSeenAt: time.now().toISOString(),
      });
    });

    it("refreshes last seen every minute while a session is open, and stops after", async () => {
      const { file, time, phones } = await store();
      const { id } = await phones.add(phone("Pixel 8", 1));
      const session = phones.connect(id, () => {});
      const writes = file.writes;
      await time.advance(lastSeenRefreshMs);
      expect(phones.phones[0]?.lastSeenAt).toBe(time.now().toISOString());
      expect(file.writes).toBe(writes + 1);
      await session.end();
      await time.advance(5 * lastSeenRefreshMs);
      expect(file.writes).toBe(writes + 2);
    });

    it("refreshes once a minute for a phone that connects again, not once per connection", async () => {
      const { file, time, phones } = await store();
      const { id } = await phones.add(phone("Pixel 8", 1));
      await phones.connect(id, () => {}).end();
      await time.advance(20_000);
      phones.connect(id, () => {});
      const writes = file.writes;
      await time.advance(40_000);
      expect(file.writes).toBe(writes);
      await time.advance(20_000);
      expect(file.writes).toBe(writes + 1);
    });

    it("says why when a refresh can't be saved, and keeps the session", async () => {
      const { file, time, logged, phones } = await store();
      const { id } = await phones.add(phone("Pixel 8", 1));
      phones.connect(id, () => {});
      file.failing = true;
      await time.advance(lastSeenRefreshMs);
      expect(logged).toEqual([
        "A paired phone's last seen couldn't be saved: Error: the disk is full\n",
      ]);
      expect(phones.phones[0]?.connected).toBe(true);
    });

    it("refuses a session for a phone that isn't paired", async () => {
      const { phones } = await store();
      expect(() => phones.connect("not-a-phone", () => {})).toThrow("No paired phone");
    });
  });

  describe("PairedPhones: revoke", () => {
    it("unpairs a phone and cuts its sessions at once, and ignores an id that isn't paired", async () => {
      const { file, phones } = await store();
      const pixel = await phones.add(phone("Pixel 8", 1));
      const galaxy = await phones.add(phone("Galaxy S24", 2));
      const cut: string[] = [];
      const session = phones.connect(pixel.id, () => cut.push("pixel"));
      phones.connect(galaxy.id, () => cut.push("galaxy"));
      await phones.revoke(pixel.id);
      expect(cut).toEqual(["pixel"]);
      const writes = file.writes;
      await phones.revoke(pixel.id);
      await phones.revoke("not-a-phone");
      await session.end();
      expect(file.writes).toBe(writes);
      expect(phones.phones.map((paired) => paired.name)).toEqual(["Galaxy S24"]);
      expect(phones.find(new Uint8Array(32).fill(1))).toBeUndefined();
    });

    it("unpairs every phone and cuts every session with Revoke all", async () => {
      const { file, phones } = await store();
      const pixel = await phones.add(phone("Pixel 8", 1));
      const galaxy = await phones.add(phone("Galaxy S24", 2));
      const cut: string[] = [];
      phones.connect(pixel.id, () => cut.push("pixel"));
      phones.connect(galaxy.id, () => cut.push("galaxy"));
      await phones.revokeAll();
      expect(cut.sort()).toEqual(["galaxy", "pixel"]);
      expect(phones.phones).toEqual([]);
      expect(JSON.parse(file.text ?? "").phones).toEqual([]);
      const writes = file.writes;
      await phones.revokeAll();
      expect(file.writes).toBe(writes);
    });

    it("unpairs a phone and cuts its other sessions when one cut throws", async () => {
      const { file, logged, phones } = await store();
      const pixel = await phones.add(phone("Pixel 8", 1));
      const cut: string[] = [];
      phones.connect(pixel.id, () => {
        throw new Error("the connection is gone");
      });
      phones.connect(pixel.id, () => cut.push("second"));
      await phones.revoke(pixel.id);
      expect(cut).toEqual(["second"]);
      expect(phones.phones).toEqual([]);
      expect(JSON.parse(file.text ?? "").phones).toEqual([]);
      expect(logged).toEqual([
        "A revoked phone's session couldn't be cut cleanly: Error: the connection is gone\n",
      ]);
    });

    it("unpairs every phone and cuts every other session with Revoke all when one cut throws", async () => {
      const { file, phones } = await store();
      const pixel = await phones.add(phone("Pixel 8", 1));
      const galaxy = await phones.add(phone("Galaxy S24", 2));
      const cut: string[] = [];
      phones.connect(pixel.id, () => {
        throw new Error("the connection is gone");
      });
      phones.connect(galaxy.id, () => cut.push("galaxy"));
      await phones.revokeAll();
      expect(cut).toEqual(["galaxy"]);
      expect(phones.phones).toEqual([]);
      expect(JSON.parse(file.text ?? "").phones).toEqual([]);
    });

    it("cuts and leaves out a revoked phone even when the file can't be written", async () => {
      const { file, phones } = await store();
      const pixel = await phones.add(phone("Pixel 8", 1));
      await phones.add(phone("Galaxy S24", 2));
      let cut = false;
      phones.connect(pixel.id, () => {
        cut = true;
      });
      file.failing = true;
      await expect(phones.revoke(pixel.id)).rejects.toThrow("the disk is full");
      expect(cut).toBe(true);
      expect(phones.find(new Uint8Array(32).fill(1))).toBeUndefined();
      file.failing = false;
      await phones.add(phone("Pixel 7", 3));
      await settled();
      const names = JSON.parse(file.text ?? "").phones.map((saved: { name: string }) => saved.name);
      expect(names).toEqual(["Galaxy S24", "Pixel 7"]);
    });
  });
});
