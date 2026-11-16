import { createShell, type WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { ConnectorStatusHostService } from "./connector-status-host.ts";
import { libraryFeature } from "./feature.ts";
import { LibraryItemsHostService } from "./library-items-host.ts";
import { LibraryTabMemoryService } from "./library-tab-memory.ts";
import { takeNewConnectorRequests } from "./new-connector-request.ts";

verifies("library.new-connector", () => {
  it("library.new-connector opens the Library and asks it for New connector with nothing filled in", () => {
    const shell = createShell({
      features: [libraryFeature],
      hostServices: [ConnectorStatusHostService, LibraryItemsHostService, LibraryTabMemoryService],
    });
    const places: unknown[] = [];
    const context = {
      openPlace: (place: unknown) => places.push(place),
    } as unknown as WorkspaceContext;
    void shell.contributions.commands.get("library.new-connector")?.run(context);
    const requests: unknown[] = [];
    takeNewConnectorRequests((request) => requests.push(request))();
    expect(places).toEqual(["library"]);
    expect(requests).toEqual([{}]);
  });
});
