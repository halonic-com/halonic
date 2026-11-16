import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { ChangesList } from "./changes-list.ts";
import { fakeSource, settle } from "./source.test-helper.ts";

verifies("source-control.share-address", () => {
  describe("ChangesList.addShareAddress", () => {
    it("adds an address, trimmed, and reads again so the folder has a remote", async () => {
      const fake = fakeSource({ kind: "ready", changes: [] });
      const list = new ChangesList(fake.source);
      await settle();
      expect(await list.addShareAddress(" git@github.com:acme/agents.git ")).toBeUndefined();
      expect(fake.remotes).toEqual(["git@github.com:acme/agents.git"]);
      expect(list.state.hasRemote).toBe(true);
    });

    it("refuses an address that isn't one of the three forms without asking git", async () => {
      const fake = fakeSource({ kind: "ready", changes: [] });
      const list = new ChangesList(fake.source);
      await settle();
      expect(await list.addShareAddress("/srv/agents.git")).toContain("Enter a git address");
      expect(await list.addShareAddress("   ")).toContain("Enter a git address");
      expect(fake.remotes).toEqual([]);
    });

    it("gives git's reason when it refuses the address, and the folder has no remote", async () => {
      const fake = fakeSource({ kind: "ready", changes: [] });
      fake.failRemote(new KindedError("unavailable", "Git didn't accept this address."));
      const list = new ChangesList(fake.source);
      await settle();
      expect(await list.addShareAddress("https://github.com/acme/agents.git")).toBe(
        "Git didn't accept this address.",
      );
      expect(list.state.hasRemote).toBe(false);
    });

    it("reads the folder again when git refuses, so a remote added elsewhere shows", async () => {
      const fake = fakeSource({ kind: "ready", changes: [] });
      fake.failRemote(new KindedError("unavailable", "Remote origin already exists."));
      const list = new ChangesList(fake.source);
      await settle();
      expect(list.state.hasRemote).toBe(false);
      fake.setRemote(true);
      await list.addShareAddress("https://github.com/acme/agents.git");
      expect(list.state.hasRemote).toBe(true);
    });
  });
});
