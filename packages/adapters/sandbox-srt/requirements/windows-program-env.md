# sandbox-srt.windows-program-env

- Status: active
- Since: unreleased
- Source: HAL-5398, HAL-3779 (design section 3)

The sandbox-srt adapter shall, on Windows, give the program `npm_config_cache` set to an `npm-cache` folder in the session's temp folder, unless the profile names one (in any case), and, when the session reaches the network, `JAVA_TOOL_OPTIONS` that starts with `-javaagent:` and a copy of srt's JVM agent in the session's temp folder, followed by the profile's own `JAVA_TOOL_OPTIONS`, never when the copy failed or its path has a space, and make that copy only after removing whatever is at its path and only as a new file, so a link left there is never written through. On macOS and Linux it sets neither: srt sets `JAVA_TOOL_OPTIONS` there itself.

## Decision

The design (HAL-3779, section 3) asked for `-Dhttps.proxyHost` and `-Dhttps.proxyPort`. srt 0.0.82's proxy wants a token in `Proxy-Authorization`, which a JVM doesn't send from system properties, so Java would get a 407. srt ships an agent that reads its proxy variables, token included, and uses it on macOS and Linux, but not on Windows. Halonic sets it there. The copy in the temp folder is readable by the sandbox account without a grant, wherever Halonic is installed; a program can replace it, but only for its own JVMs. Java on a path with a space and the Schannel tools stay under the `schannel-tls-fails` limit.

- Decided by: Mateo (HAL-5398, 18 Nov); review: Liam

## Examples

- Given a Windows profile that reaches the network and no `JAVA_TOOL_OPTIONS`,
  when a session opens,
  then the program gets `JAVA_TOOL_OPTIONS=-javaagent:<temp folder>\srt-proxy-agent.jar` and `npm_config_cache=<temp folder>\npm-cache`.
- Given a profile with `NPM_CONFIG_CACHE` set,
  when a Windows session opens,
  then the program's npm cache is the profile's.
- Given a link at the agent's path in the temp folder,
  when the agent is copied,
  then the link is gone and the file it led to is unchanged.
