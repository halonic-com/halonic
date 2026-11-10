// Phase 5 verdict probes (HAL-3776), part 1: the native-srt network gaps the
// spike of windows-spike-probe.mjs leaves open, and the agent tools it did not
// try. DNS and WebDAV as more traffic a system service makes for the program;
// token switches to a token that may connect (its own, another user's, a
// deny-only one); Java, Go, OpenSSL curl, git clone and dotnet restore.
// Part 2 (WSL, SMB, kept grants) is windows-isolation-probe.mjs. Report-only:
// results go to the job summary and to windows-verdict-results.json.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import { createKit } from "./windows-probe-kit.mjs";

const kit = await createKit("verdict");
const { work, secret, port, canary, inSrt, outsideSrt, record, tail, lastJson } = kit;

// ---- A1: more traffic that a system service makes for the program ----------
{
  // A fresh name outside the allow list: if it resolves, the DNS Client service
  // carried a query for the sandbox, and data can leave in the query name. A
  // random label under nip.io (wildcard, answers 127.0.0.1) can't come from the
  // cache, and the sandbox asks first.
  const name = "DNS lookup of a name outside the allow list (DNS Client service)";
  const lookup = (host) =>
    `powershell -NoProfile -Command "[Net.Dns]::GetHostAddresses('${host}') | Select-Object -First 1 | ForEach-Object { 'resolved ' + $_ }"`;
  const fresh = () => `h${Math.random().toString(36).slice(2, 12)}.127.0.0.1.nip.io`;
  const inside = await inSrt(lookup(fresh()));
  const control = await outsideSrt(lookup(fresh()));
  if (!control.out.includes("resolved")) {
    record(
      "A1 service traffic",
      name,
      "INCONCLUSIVE",
      `control did not resolve: ${tail(control.err || control.out)}`,
    );
  } else if (inside.out.includes("resolved")) {
    record(
      "A1 service traffic",
      name,
      "FAIL",
      `resolves inside srt (${tail(inside.out)}); the query name is a channel out`,
    );
  } else {
    record("A1 service traffic", name, "PASS", tail(inside.err || inside.out));
  }
  const webdavName = "WebDAV path \\\\127.0.0.1@port\\x (WebClient service)";
  const webdav = await outsideSrt(
    `powershell -NoProfile -Command "Start-Service WebClient; (Get-Service WebClient).Status"`,
  );
  if (webdav.out.includes("Running")) {
    const command = `cmd /c type \\\\127.0.0.1@${port}\\dav\\x.txt`;
    await kit.canaryProbe(
      "A1 service traffic",
      webdavName,
      command,
      "The WebClient service opens the connection.",
    );
  } else {
    record(
      "A1 service traffic",
      webdavName,
      "NOT-TESTABLE",
      `no WebClient service: ${tail(webdav.err || webdav.out)}`,
    );
  }
}

// ---- A2/A3: token switches before a socket or a file open -----------------
// The probe is copied into the work folder: the sandbox account may not read
// the checkout.
const tokenPs = kit.script(
  "tokens.ps1",
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "windows-token-probe.ps1"), "utf8"),
);
function tokenVerdict(control, controlReached, inside, reached) {
  const leak = reached > 0 || inside.file === "read";
  const controlConnects = control?.net === "reached" && controlReached > 0;
  // No switch inside srt: this way is closed, if the switch works outside.
  if (inside.switch?.startsWith("no")) return control?.net === "reached" ? "PASS" : "INCONCLUSIVE";
  if (leak) return "FAIL";
  return controlConnects ? "PASS" : "INCONCLUSIVE";
}
for (const [group, mode, label] of [
  ["A2 token switch", "self", "thread impersonates its own token (ImpersonateSelf)"],
  ["A2 token switch", "steal", "thread takes another user's token from a running process"],
  ["A3 deny-only token", "deny-user", "restricted token, user SID deny-only"],
  ["A3 deny-only token", "deny-all", "restricted token, user and all group SIDs deny-only"],
]) {
  const command = `powershell -NoProfile -ExecutionPolicy Bypass -File "${tokenPs}" -Mode ${mode} -Port ${port} -File "${secret}"`;
  const controlBefore = canary.connections;
  const control = lastJson((await outsideSrt(command)).out);
  const controlReached = canary.connections - controlBefore;
  const before = canary.connections;
  const raw = await inSrt(command);
  const reached = canary.connections - before;
  const inside = lastJson(raw.out);
  const ctl = `control: ${JSON.stringify(control)}, ${controlReached} connection(s)`;
  if (!inside) {
    record(
      group,
      label,
      "INCONCLUSIVE",
      `probe did not run inside srt: ${tail(raw.err || raw.out)}. ${ctl}`,
    );
  } else {
    const detail = `inside: ${JSON.stringify(inside)}, ${reached} connection(s). ${ctl}`;
    record(group, label, tokenVerdict(control, controlReached, inside, reached), detail);
  }
}

// ---- B: agent tools the spike did not try ---------------------------------
const java = kit.script(
  "Fetch.java",
  `public class Fetch { public static void main(String[] a) throws Exception {
  var c = java.net.http.HttpClient.newHttpClient();
  var r = c.send(java.net.http.HttpRequest.newBuilder(java.net.URI.create("https://example.com")).build(), java.net.http.HttpResponse.BodyHandlers.discarding());
  System.exit(r.statusCode() == 200 ? 0 : 1); } }
`,
);
const goDir = kit.dir("go-fetch");
writeFileSync(
  join(goDir, "fetch.go"),
  `package main\nimport ("net/http"; "os")\nfunc main() { r, err := http.Get("https://example.com"); if err != nil || r.StatusCode != 200 { os.Exit(1) } }\n`,
);
const dotnetMajor = kit.outsideSync("dotnet", ["--version"]).trim().split(".")[0];
const project = (tag) => {
  const path = join(work, `restore-${tag}`);
  mkdirSync(path, { recursive: true });
  writeFileSync(
    join(path, "p.csproj"),
    `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net${dotnetMajor}.0</TargetFramework></PropertyGroup><ItemGroup><PackageReference Include="Newtonsoft.Json" Version="13.0.3" /></ItemGroup></Project>`,
  );
  return path;
};
const msysCurl = win32.join(process.env.SystemDrive ?? "", "\\msys64", "usr", "bin", "curl.exe");
const tools = [
  ["Java HttpClient", () => `java "${java}"`],
  [
    "Go net/http (go run)",
    (t) =>
      `set GOCACHE=${join(work, `gocache-${t}`)}&& set GOTELEMETRY=off&& go run "${join(goDir, "fetch.go")}"`,
  ],
  ["OpenSSL curl (MSYS2)", () => `"${msysCurl}" -sS -f -m 20 -o NUL https://example.com`],
  [
    "git clone over HTTPS",
    (t) =>
      `git clone -q --depth 1 https://github.com/octocat/Hello-World.git "${join(work, `clone-${t}`)}"`,
  ],
  [
    "dotnet restore from nuget.org",
    (t) =>
      `set DOTNET_CLI_HOME=${join(work, `dn-${t}`)}&& set NUGET_PACKAGES=${join(work, `nuget-${t}`)}&& set DOTNET_CLI_TELEMETRY_OPTOUT=1&& dotnet restore "${project(t)}"`,
  ],
];
for (const [name, command] of tools) {
  const control = await outsideSrt(command("control"));
  if (control.code !== 0) {
    const detail = `control outside srt failed (exit ${control.code}): ${tail(control.err || control.out)}`;
    record("B tools", name, "INCONCLUSIVE", detail);
    continue;
  }
  const inside = await inSrt(command("srt"));
  if (inside.code === 0) record("B tools", name, "PASS", "works inside srt");
  else
    record(
      "B tools",
      name,
      "FAIL",
      `breaks inside srt (exit ${inside.code}): ${tail(inside.err || inside.out)}`,
    );
}

kit.finish(
  "Native srt on Windows: verdict probes, network and tools (HAL-3776)",
  "windows-verdict-results.json",
);
