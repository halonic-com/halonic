import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakeDisk } from "./fake-folder.test-helper.ts";
import { isFolderAccessError } from "./folder-access.ts";
import type { FolderPicker } from "./handles.ts";
import { browserFolderPicker, openLocalFolder } from "./open-folder.ts";

/** A picker that fails as the browser does, with a `DOMException` of this name. */
function failingPicker(name: string): FolderPicker {
  return async () => {
    throw new DOMException("The picker failed.", name);
  };
}

verifies("fs-web.open-local-folder", () => {
  describe("openLocalFolder", () => {
    it("opens the folder the person picks, for reading and writing", async () => {
      const disk = new FakeDisk({ "workspace.yaml": "id: acme\n" });
      const asked: unknown[] = [];
      const result = await openLocalFolder({
        picker: async (options) => {
          asked.push(options);
          return disk.root;
        },
      });
      expect(asked).toEqual([{ mode: "readwrite" }]);
      expect(result.status).toBe("opened");
      if (result.status !== "opened") return;
      expect(result.store.location).toBe("browser:acme");
      expect(await result.store.read("workspace.yaml")).toBe("id: acme\n");
    });

    it("opens nothing, without an error, when the person cancels", async () => {
      expect(await openLocalFolder({ picker: failingPicker("AbortError") })).toEqual({
        status: "cancelled",
      });
    });

    it("says the browser can't open a folder when it has no picker", async () => {
      expect(await openLocalFolder({ picker: null })).toEqual({ status: "not-supported" });
    });

    it("turns the browser's refusal to show the picker into a FolderAccessError", async () => {
      const error = await openLocalFolder({ picker: failingPicker("SecurityError") }).catch(
        (reason: unknown) => reason,
      );
      expect(isFolderAccessError(error)).toBe(true);
    });

    it("lets any other failure go on as it is", async () => {
      await expect(openLocalFolder({ picker: failingPicker("TypeError") })).rejects.toMatchObject({
        name: "TypeError",
      });
    });
  });

  describe("browserFolderPicker", () => {
    it("finds showDirectoryPicker, called on the scope it belongs to", async () => {
      const disk = new FakeDisk({});
      const scope = {
        showDirectoryPicker(this: unknown) {
          expect(this).toBe(scope);
          return Promise.resolve(disk.root);
        },
      };
      const picker = browserFolderPicker(scope);
      expect(await picker?.({ mode: "readwrite" })).toBe(disk.root);
    });

    it("finds none where the browser has none, as in Firefox and Safari", () => {
      expect(browserFolderPicker({})).toBeNull();
      expect(browserFolderPicker({ showDirectoryPicker: "not a function" })).toBeNull();
      // Node, where these tests run, has none either.
      expect(browserFolderPicker()).toBeNull();
    });
  });
});
