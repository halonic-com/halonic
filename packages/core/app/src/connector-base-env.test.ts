import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { connectorBaseEnv } from "./connector-base-env.ts";

verifies("app.connector-base-env", () => {
  it("keeps the program lookup, home, locale and proxy, and leaves out every key", () => {
    const env = {
      PATH: "/usr/bin",
      HOME: "ada-home",
      LC_CTYPE: "en_US.UTF-8",
      HTTPS_PROXY: "http://proxy.acme.test:3128",
      no_proxy: "localhost",
      ANTHROPIC_API_KEY: "sk-ant-test",
      GITHUB_TOKEN: "ghp_test",
      UNSET: undefined,
    };
    expect(connectorBaseEnv(env, "linux")).toEqual({
      PATH: "/usr/bin",
      HOME: "ada-home",
      LC_CTYPE: "en_US.UTF-8",
      HTTPS_PROXY: "http://proxy.acme.test:3128",
      no_proxy: "localhost",
    });
  });

  it("matches a name in any letter case on Windows, keeping it as written", () => {
    const env = { Path: "windows-folder", SystemRoot: "windows-folder", OPENAI_API_KEY: "sk-test" };
    expect(connectorBaseEnv(env, "win32")).toEqual({
      Path: "windows-folder",
      SystemRoot: "windows-folder",
    });
  });

  it("matches a name only as written elsewhere, and the Windows names only on Windows", () => {
    const env = { Path: "/usr/bin", SYSTEMROOT: "windows-folder", Https_Proxy: "http://p.test" };
    expect(connectorBaseEnv(env, "darwin")).toEqual({});
  });

  it("leaves out what turns checks off, loads code first, or is a bash function", () => {
    const env = {
      NODE_TLS_REJECT_UNAUTHORIZED: "0",
      LD_PRELOAD: "evil.so",
      DYLD_INSERT_LIBRARIES: "evil.dylib",
      SHELL: "() { evil; }",
    };
    expect(connectorBaseEnv(env, "linux")).toEqual({});
  });
});
