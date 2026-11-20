import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { defaultHub, defaultHubPath, defaultHubText, loadWorkspace, placeOf } from "./index.ts";
import { MemoryStore } from "./test/memory-store.ts";

verifies("workspace.default-hub", () => {
  it("is the hub `default`, named Default, in hubs/default/hub.yaml", () => {
    expect(defaultHub).toEqual({ id: "default", name: "Default" });
    expect(defaultHubPath).toBe("hubs/default/hub.yaml");
    expect(placeOf(defaultHubPath)).toMatchObject({ kind: "hub", hub: "default" });
    expect(defaultHubText()).toBe("id: default\nname: Default\n");
  });

  it("loads as a hub with no issue next to a workspace.yaml", async () => {
    const store = new MemoryStore();
    await store.write("workspace.yaml", "id: acme\nname: Acme\n");
    await store.write(defaultHubPath, defaultHubText());

    const workspace = await loadWorkspace(store);

    expect(workspace.issues).toEqual([]);
    const hub = workspace.files.find((file) => file.path === defaultHubPath);
    expect(hub?.kind).toBe("hub");
  });
});
