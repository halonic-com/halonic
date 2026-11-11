# app.connector-base-env

- Status: active
- Since: 0.1.0
- Source: HAL-6266 (follow-up to HAL-6257, option 2: a local connector program gets only a small base of the app's environment plus what its connector declares; design on HAL-6266); the official MCP SDKs' `getDefaultEnvironment`

The app shall tell a launcher which of the app's own environment variables a local connector program gets without its connector naming them: `PATH`, `HOME`, `USER`, `LOGNAME`, `SHELL`, `TERM`, `TMPDIR`, `TEMP`, `TMP`, `LANG`, `LANGUAGE`, `TZ`, every name starting with `LC_`, `XDG_CONFIG_HOME`, `XDG_CACHE_HOME`, `XDG_DATA_HOME` and `XDG_STATE_HOME`; the person's machine settings `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY` and `NO_PROXY` in upper or lower case, `NODE_EXTRA_CA_CERTS`, `SSL_CERT_FILE`, `SSL_CERT_DIR`, `REQUESTS_CA_BUNDLE`, `CURL_CA_BUNDLE`, `LD_LIBRARY_PATH` and `DYLD_LIBRARY_PATH`; and on Windows also `APPDATA`, `COMSPEC`, `HOMEDRIVE`, `HOMEPATH`, `LOCALAPPDATA`, `PATHEXT`, `PROCESSOR_ARCHITECTURE`, `PROGRAMDATA`, `PROGRAMFILES`, `PROGRAMFILES(X86)`, `PROGRAMW6432`, `SYSTEMDRIVE`, `SYSTEMROOT`, `USERNAME`, `USERPROFILE` and `WINDIR`, each matched in any letter case there. It shall leave out every other variable, `NODE_TLS_REJECT_UNAUTHORIZED`, `LD_PRELOAD` and `DYLD_INSERT_LIBRARIES` included, a variable without a value, and a value that starts with `()`.

## Examples

- Given the app's environment `PATH`, `HOME`, `LC_CTYPE`, `HTTPS_PROXY`, `ANTHROPIC_API_KEY` and `GITHUB_TOKEN` on Linux,
  when its base is taken,
  then it holds `PATH`, `HOME`, `LC_CTYPE` and `HTTPS_PROXY`, with their values, and no key.
- Given `Path`, `SystemRoot` and `OPENAI_API_KEY` on Windows,
  when its base is taken,
  then it holds `Path` and `SystemRoot`, as written, and not the key.
- Given `NODE_TLS_REJECT_UNAUTHORIZED`, `LD_PRELOAD` and `SHELL` set to `() { evil; }`,
  when the base is taken,
  then it holds none of them.
