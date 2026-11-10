import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { isPackageManagerVariable } from "./pin-overrides.ts";

verifies("app.package-manager-variable", () => {
  it("counts the package-manager and language variables, in any case", () => {
    for (const name of [
      "NODE_OPTIONS",
      "node_path",
      "PythonPath",
      "npm_config_registry",
      "NPM_CONFIG_USERCONFIG",
      "COREPACK_HOME",
      "uv_index_url",
      "PIP_INDEX_URL",
      "PIPX_HOME",
    ]) {
      expect(isPackageManagerVariable(name)).toBe(true);
    }
  });

  it("doesn't count the person's proxy, certificate, preload, config home or program lookup", () => {
    for (const name of [
      "HTTPS_PROXY",
      "NODE_EXTRA_CA_CERTS",
      "SSL_CERT_FILE",
      "LD_PRELOAD",
      "PATH",
      "HOME",
      "NODE_ENV",
    ]) {
      expect(isPackageManagerVariable(name)).toBe(false);
    }
  });
});
