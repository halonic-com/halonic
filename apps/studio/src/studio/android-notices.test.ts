import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";

// Vitest runs each package's tests from the package folder.
const shellFolder = join(process.cwd(), "src-tauri");
const workflows = resolve(process.cwd(), "../../.github/workflows");

// The check is a plain script the workflow runs with the runner's own Node, so
// it has no types: imported by path, with the one function it exports typed here.
const checker = pathToFileURL(join(shellFolder, "android/check-notices.mjs")).href;
const { noticeProblems } = (await import(checker)) as {
  noticeProblems: (text: string) => string[];
};

const gradle = () => readFileSync(join(shellFolder, "gen/android/app/build.gradle.kts"), "utf8");
const workflow = (name: string) => readFileSync(join(workflows, name), "utf8");

/** The text from `start` up to the next `end` after it, or to the end of the file. */
function block(text: string, start: string, end: string): string {
  const at = text.indexOf(start);
  expect(at, start).toBeGreaterThan(-1);
  const stop = text.indexOf(end, at + start.length);
  return text.slice(at, stop === -1 ? undefined : stop);
}

const rule = "=".repeat(72);
const complete = [
  "Halonic is licensed under the following licence.",
  rule,
  "                                 Apache License\n                           Version 2.0, January 2004",
  rule,
  "Halonic, Copyright 2026 The Halonic Authors",
  rule,
  "npm packages\n------------\nacme-parser 1.0.0",
  rule,
  "Rust crates\n-----------\njni 0.22.4",
  rule,
  "Android libraries (Gradle)\n--------------------------\nandroidx.webkit:webkit 1.14.0",
  "",
].join("\n");

verifies("studio.android-third-party-notices", () => {
  it("adds the notices task to the release assets only when HALONIC_THIRD_PARTY_NOTICES is 1", () => {
    const text = gradle();
    const enabled = block(
      text,
      'environmentVariable("HALONIC_THIRD_PARTY_NOTICES").orNull == "1"',
      "\n}\n",
    );
    expect(enabled).toContain('tasks.register<ThirdPartyNoticesTask>("thirdPartyNotices")');
    expect(enabled).toContain('dependsOn("thirdPartyLicences")');
    expect(enabled).toContain('selector().withBuildType("release")');
    expect(enabled).toContain(
      "variant.sources.assets?.addGeneratedSourceDirectory(notices, ThirdPartyNoticesTask::assets)",
    );
  });

  it("lists the release runtime classpath and runs check:sbom with the Android targets", () => {
    const text = gradle();
    expect(block(text, 'tasks.register("thirdPartyLicences")', "\n}\n")).toContain(
      'configurations.getByName("universalReleaseRuntimeClasspath")',
    );
    const call = block(text, '"pnpm", "check:sbom"', "\n        )\n");
    for (const flag of [
      '"--notices"',
      '"--with-licence"',
      '"--gradle"',
      '"--cargo", "apps/studio/src-tauri"',
    ]) {
      expect(call, flag).toContain(flag);
    }
    for (const target of [
      "aarch64-linux-android",
      "armv7-linux-androideabi",
      "x86_64-linux-android",
    ]) {
      expect(call, target).toContain(`"--cargo-target", "${target}"`);
    }
    expect(text).toContain('.copyTo(assets.get().file("THIRD-PARTY-NOTICES.txt").asFile');
  });

  it("builds the bundle with the notices on and checks the bundle's asset", () => {
    const text = workflow("android-play.yml");
    const build = block(text, "- name: Build the release bundle", "\n      - ");
    expect(build).toContain('HALONIC_THIRD_PARTY_NOTICES: "1"');
    const check = block(text, "- name: Check the bundle's third-party notices", "\n      - ");
    expect(check).toContain("base/assets/THIRD-PARTY-NOTICES.txt");
    expect(check).toContain("check-notices.mjs");
    expect(text.indexOf("- name: Check the bundle's third-party notices")).toBeGreaterThan(
      text.indexOf("- name: Build the release bundle"),
    );
  });

  it("finds nothing wrong with complete notices and names each missing part", () => {
    expect(noticeProblems(complete)).toEqual([]);
    expect(
      noticeProblems(complete.replace("Android libraries (Gradle)", "Android libraries")),
    ).toEqual(['it has no "Android libraries (Gradle)" section']);
    expect(noticeProblems(complete.replace("jni 0.22.4", "serde 1.0.0"))).toEqual([
      "it lists no Android-only Rust crate (jni)",
    ]);
    expect(noticeProblems("")).toHaveLength(8);
  });

  it("attaches the notices taken out of the APK Play signed to a real release", () => {
    const play = workflow("android-play.yml");
    const apk = block(
      play,
      "- name: Take out and check the APK's third-party notices",
      "\n      - ",
    );
    expect(apk).toContain('unzip -p "$APK" assets/THIRD-PARTY-NOTICES.txt');
    expect(apk).toContain("check-notices.mjs");
    expect(play).toContain("name: android-third-party-notices");
    const release = workflow("release.yml");
    expect(release).toContain('echo "android_notices=THIRD-PARTY-NOTICES-android.txt"');
    const add = block(
      release,
      "- name: Add the APK, its notices and their checksums",
      "\n      - ",
    );
    expect(add).toContain('mv android-notices/THIRD-PARTY-NOTICES-android.txt "dist/$NOTICES"');
    expect(add).toContain('sha256sum -- "$APK" "$NOTICES" >> SHA256SUMS');
  });
});

verifies("studio.android-gradle-notices-check", () => {
  it("runs the Android job for a change to the lockfiles, the plugins or the notices check", () => {
    const ci = workflow("ci.yml");
    const area = block(ci, '"android=', '"\n');
    const pattern = new RegExp(area.slice('"android='.length));
    for (const path of [
      "apps/studio/src-tauri/Cargo.lock",
      "apps/studio/src-tauri/Cargo.toml",
      "apps/studio/src-tauri/capabilities/default.json",
      "pnpm-lock.yaml",
      "tooling/check/licences.json",
      "tooling/check/licence-texts/Apache-2.0.txt",
      "tooling/check/src/lib/gradle-notices.ts",
      "tooling/check/src/cli/sbom.ts",
    ]) {
      expect(pattern.test(path), path).toBe(true);
    }
    expect(pattern.test("tooling/check/src/lib/layers.ts")).toBe(false);
  });

  it("lists the Gradle libraries after the debug APK and checks them with check:sbom", () => {
    const ci = workflow("ci.yml");
    const job = block(ci, "\n  android:\n", "\n  docs:\n");
    const step = block(job, "- name: Licence notices (Gradle libraries)", "\n      - ");
    expect(step).toContain("./gradlew :app:thirdPartyLicences");
    expect(step).toContain("pnpm check:sbom");
    expect(step).toContain("--notices");
    expect(step).toContain(
      "--gradle apps/studio/src-tauri/gen/android/app/build/third-party/gradle-licences.json",
    );
    expect(job.indexOf("- name: Licence notices (Gradle libraries)")).toBeGreaterThan(
      job.indexOf("- name: Build the debug APK"),
    );
  });

  it("reads the NOTICE files of JARs and AARs and leaves out pom-packaged modules", () => {
    const text = gradle();
    expect(text).toContain('Regex("^META-INF/NOTICE[^/]*$", RegexOption.IGNORE_CASE)');
    const entry = block(text, "fun licenceEntry(", "\n}\n");
    expect(entry).toContain('if (packaging == "pom") {\n        return null');
    expect(entry).toContain('"notices" to (aar?.let { aarNotices(it) } ?: jar?.inputStream()');
    expect(block(text, "fun aarNotices(", "\n\n")).toContain('zip.getEntry("classes.jar")');
    expect(block(text, 'tasks.register("thirdPartyLicences")', "\n}\n")).toContain(
      "modules.mapNotNull { licenceEntry(it) }",
    );
  });
});
