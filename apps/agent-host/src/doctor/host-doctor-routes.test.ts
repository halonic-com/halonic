import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type HostDoctorPlaces, hostDoctorRoutes } from "./host-doctor-routes.ts";

const trustStore = {
  get: async () => null,
  grant: async () => {},
  revoke: async () => {},
  list: async () => [],
};

const places: HostDoctorPlaces = {
  version: "0.1.0",
  profile: { platform: "linux", root: "/data/halonic" },
  trustStore,
  workspaceRoots: [],
  sandbox: {
    check: async () => ({ ok: true, reason: null, missing: [] }),
    capabilities: () => ({ files: "shared", strength: "os" }),
  },
  harnesses: [],
  onWsl: false,
  ownPorts: () => [],
  log: () => {},
};

verifies("agent-host.doctor-route", () => {
  it("serves the doctor route only with a profile folder", () => {
    expect(hostDoctorRoutes(places).map((route) => `${route.method} ${route.path}`)).toEqual([
      "POST /v1/doctor",
    ]);
    expect(hostDoctorRoutes({ ...places, profile: undefined, trustStore: undefined })).toEqual([]);
  });
});
