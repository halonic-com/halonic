import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { build, type InlineConfig, type Rolldown, type UserConfig } from "vite";
import { afterEach, beforeEach, expect, it } from "vitest";
import viteConfig from "../../vite.config.ts";

// Vitest runs each package's tests from the package folder.
const shellFolder = join(process.cwd(), "src-tauri");

const notice = "/*! @license MPL-2.0 acme-suffixes, https://mozilla.org/MPL/2.0/ */";

let folder = "";

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "studio-licence-"));
  writeFileSync(
    join(folder, "entry.js"),
    `${notice}\n// an ordinary comment\nexport const suffixes = ["acme", "example"];\n`,
  );
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

/** The app's Vite config for one mode, as `vite build` resolves it. */
function appConfig(mode: string): UserConfig {
  if (typeof viteConfig !== "function") throw new Error("vite.config.ts should export a function");
  return viteConfig({ mode, command: "build", isSsrBuild: false, isPreview: false }) as UserConfig;
}

/** Builds the fixture minified, with the output settings of `config`, and returns the built script. */
async function builtScript(config: UserConfig): Promise<string> {
  const fixture: InlineConfig = {
    configFile: false,
    logLevel: "silent",
    root: folder,
    plugins: [],
    build: {
      write: false,
      minify: true,
      lib: { entry: join(folder, "entry.js"), formats: ["es"], fileName: "entry" },
      // Only the output settings: the app's own pages and plugins aren't part of the fixture.
      rolldownOptions: { output: config.build?.rolldownOptions?.output ?? {} },
    },
  };
  const result = await build(fixture);
  const outputs = (Array.isArray(result) ? result : [result]) as Rolldown.RolldownOutput[];
  const chunk = outputs.flatMap((output) => output.output).find((file) => file.type === "chunk");
  if (chunk === undefined) throw new Error("the build wrote no script");
  return chunk.code;
}

/** The files the Windows installer copies next to the app: source path to installed name. */
function installerResources(): Record<string, string> {
  const config = JSON.parse(
    readFileSync(join(shellFolder, "tauri.installer.conf.json"), "utf8"),
  ) as { bundle?: { resources?: Record<string, string> } };
  return config.bundle?.resources ?? {};
}

verifies("studio.licence-notices", () => {
  it("drops the licence comment when a plain minified build is used, so the check below means something", async () => {
    const code = await builtScript({});
    expect(code).not.toContain("@license MPL-2.0");
  });

  it.each(["studio", "production"])(
    "keeps the licence comment and drops the others in the %s build",
    async (mode) => {
      const code = await builtScript(appConfig(mode));
      expect(code).toContain(notice);
      expect(code).not.toContain("an ordinary comment");
    },
  );

  it("installs the repo's LICENSE and NOTICE next to the app on Windows", () => {
    const resources = installerResources();
    for (const name of ["LICENSE", "NOTICE"]) {
      const source = Object.keys(resources).find((path) => resources[path] === name);
      expect(source, name).toBeDefined();
      expect(resolve(shellFolder, source ?? ""), name).toBe(resolve(process.cwd(), "../..", name));
      expect(existsSync(resolve(shellFolder, source ?? "")), name).toBe(true);
    }
  });
});

verifies("studio.installer-third-party-notices", () => {
  const script = () => readFileSync(join(shellFolder, "windows/build-installer.ps1"), "utf8");

  it("installs THIRD-PARTY-NOTICES.txt from src-tauri/legal next to the app", () => {
    const resources = installerResources();
    const source = Object.keys(resources).find(
      (path) => resources[path] === "THIRD-PARTY-NOTICES.txt",
    );
    expect(source).toBe("legal/THIRD-PARTY-NOTICES.txt");
  });

  it("writes the notices into src-tauri/legal before it builds the installer", () => {
    const text = script();
    expect(text).toContain("$legal = Join-Path $shell 'legal'");
    const sbom = text.indexOf("pnpm check:sbom");
    expect(sbom).toBeGreaterThan(-1);
    const call = text.slice(sbom, text.indexOf("\n", sbom));
    expect(call).toContain("--notices");
    expect(call).toContain("--out $legal");
    expect(call).toContain("--cargo apps/studio/src-tauri --cargo-target $triple");
    expect(sbom).toBeLessThan(text.indexOf("pnpm exec tauri build"));
  });

  it("appends the Microsoft runtime notice after check:sbom and before it builds the installer", () => {
    const text = script();
    const sbom = text.indexOf("pnpm check:sbom");
    const append = text.indexOf("vcruntime-notice.txt");
    expect(append).toBeGreaterThan(sbom);
    expect(append).toBeLessThan(text.indexOf("pnpm exec tauri build"));
    expect(text).toContain("Add-Content $notices");
  });

  it("names the pinned runtime version in the notice", () => {
    const pin = JSON.parse(readFileSync(join(shellFolder, "windows/vcruntime.json"), "utf8")) as {
      redistributable: { version: string };
    };
    const notice = readFileSync(join(shellFolder, "windows/vcruntime-notice.txt"), "utf8");
    expect(pin.redistributable.version).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    expect(notice).toContain(`version ${pin.redistributable.version}`);
  });

  it("stops the fetch for any target but x64, and the installer script passes its own", () => {
    const fetch = readFileSync(join(shellFolder, "windows/fetch-vcruntime.ps1"), "utf8");
    expect(fetch).toContain("[string]$Target = 'x86_64-pc-windows-msvc'");
    expect(fetch).toMatch(/if \(\$Target -ne 'x86_64-pc-windows-msvc'\) \{\s+throw/);
    expect(script()).toContain("fetch-vcruntime.ps1') -Target $triple");
  });

  it("keeps the generated folder out of git", () => {
    const ignored = readFileSync(resolve(process.cwd(), "../../.gitignore"), "utf8").split("\n");
    expect(ignored).toContain("apps/studio/src-tauri/legal/");
  });
});

verifies("studio.installer-licence-page", () => {
  const template = () => readFileSync(join(shellFolder, "windows/installer.nsi"), "utf8");
  const windowsFile = (name: string) => readFileSync(join(shellFolder, "windows", name), "utf8");
  /** The text of one NSIS function, from its `Function` line to its `FunctionEnd`. */
  const nsisFunction = (name: string) => {
    const text = template();
    const start = text.indexOf(`Function ${name}\n`);
    expect(start, name).toBeGreaterThan(-1);
    return text.slice(start, text.indexOf("FunctionEnd", start));
  };

  it("pins Microsoft's license.rtf of the same redistributable, and the fetch writes it unchanged", () => {
    const pin = JSON.parse(windowsFile("vcruntime.json")) as {
      licence?: { name?: string; sha256?: string };
    };
    expect(pin.licence?.name).toBe("license.rtf");
    expect(pin.licence?.sha256).toMatch(/^[0-9a-f]{64}$/);
    const fetch = windowsFile("fetch-vcruntime.ps1");
    expect(fetch).toContain("-ne $pin.licence.sha256");
    expect(fetch).toContain("$licenceOut = Join-Path $bin 'vcruntime-licence.rtf'");
    expect(fetch).toContain("Copy-Item $licence $licenceOut -Force");
  });

  it("has no licence text of its own and no unconditional runtime resource", () => {
    const config = JSON.parse(
      readFileSync(join(shellFolder, "tauri.installer.conf.json"), "utf8"),
    ) as { bundle?: { licenseFile?: string } };
    expect(config.bundle?.licenseFile).toBeUndefined();
    expect(Object.keys(installerResources()).join("\n")).not.toContain("vcruntime140");
    expect(existsSync(join(shellFolder, "windows/licence.txt"))).toBe(false);
  });

  it("gives NSIS the fetched runtime and licence, and shows that licence on the page", () => {
    const script = windowsFile("build-installer.ps1");
    expect(script).toContain("$env:HALONIC_VCRUNTIME = Join-Path $bin 'vcruntime140.dll'");
    expect(script).toContain(
      "$env:HALONIC_VCRUNTIME_LICENCE = Join-Path $bin 'vcruntime-licence.rtf'",
    );
    const text = template();
    expect(text).toContain('!define VCRUNTIMELICENCE "$%HALONIC_VCRUNTIME_LICENCE%"');
    expect(text).toContain('!insertmacro MUI_PAGE_LICENSE "${VCRUNTIMELICENCE}"');
  });

  it("shows the page after the install page and before the steps", () => {
    const text = template();
    const licence = text.indexOf("!insertmacro MUI_PAGE_LICENSE");
    expect(licence).toBeGreaterThan(text.indexOf("Page custom PageInstall PageInstallLeave"));
    expect(licence).toBeLessThan(text.indexOf("!insertmacro MUI_PAGE_INSTFILES"));
    const pre = text.lastIndexOf("!define MUI_PAGE_CUSTOMFUNCTION_PRE", licence);
    expect(text.slice(pre, text.indexOf("\n", pre))).toContain("SkipLicence");
  });

  it("skips the page unless the sandbox box is ticked, and for passive and update installs", () => {
    const body = nsisFunction("SkipLicence");
    for (const condition of [
      "$PassiveMode = 1",
      "$UpdateMode = 1",
      "$SandboxState != ${BST_CHECKED}",
    ]) {
      expect(body).toContain(condition);
    }
    expect(body).toContain("Abort");
  });

  it("copies the runtime only for the sandbox step, and the uninstaller deletes it", () => {
    const text = template();
    const copy = text.indexOf('File /a "/oname=vcruntime140.dll.pinned" "${VCRUNTIME}"');
    expect(copy).toBeGreaterThan(text.indexOf("Section Install"));
    const condition = text.slice(text.lastIndexOf("${If}", copy), copy);
    expect(condition).toContain("${If} $SandboxState == ${BST_CHECKED}");
    expect(condition).toContain('${OrIf} ${FileExists} "$INSTDIR\\vcruntime140.dll.pinned"');
    expect(text.slice(text.indexOf("Section Uninstall"))).toContain(
      'Delete "$INSTDIR\\vcruntime140.dll.pinned"',
    );
  });

  it("says Next on the install page while the sandbox box is ticked", () => {
    const body = nsisFunction("PageInstallButton");
    expect(body).toContain('StrCpy $1 "&Install"');
    expect(body).toContain('${IfThen} $0 == ${BST_CHECKED} ${|} StrCpy $1 "&Next >" ${|}');
    expect(nsisFunction("PageInstall")).toContain("Call PageInstallButton");
  });

  it("walks both paths in the installer job", () => {
    const walk = windowsFile("screenshot-installer.ps1");
    const agree = walk.indexOf("Wait-Button $h 'I &Agree'");
    expect(agree).toBeGreaterThan(walk.indexOf("Save-Picture $h '0-install'"));
    expect(walk).toContain("'MICROSOFT VISUAL C++ 2015 - 2022 RUNTIME'");
    expect(walk).toContain("if ($text -eq 'I &Agree')");
    expect(walk).toContain("$found = Runtime-Files");
    expect(walk).toContain("Back from the licence page ticked the desktop shortcut box again");
    const job = readFileSync(resolve(process.cwd(), "../../.github/workflows/ci.yml"), "utf8");
    expect(job).toContain("windows/screenshot-installer.ps1 -Setup");
    expect(job).toContain("windows/screenshot-installer.ps1 -NoSandbox -Setup");
  });
});
