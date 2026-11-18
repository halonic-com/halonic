/**
 * The Android libraries' part of THIRD-PARTY-NOTICES.txt (HAL-12585). Pure
 * functions: `cli/sbom.ts` reads the file the app's Gradle task writes.
 *
 * The Gradle task lists every library of the release runtime classpath with
 * the licences its POM names, the `third_party_licenses.txt` its AAR
 * carries, if any, and the `META-INF/NOTICE` files of its JAR (HAL-12776). A POM names a licence in words, so `gradle.names` in
 * `licences.json` maps those words to SPDX IDs, and the ID must be on the
 * `shipped` list. Google's ML Kit and Play services libraries are under
 * Google's own terms, not an open-source licence: each one is named in
 * `gradle.proprietary` with the terms its POM must name, and a decision note
 * says why we ship it.
 */
import type { NoticeEntry } from "./sbom.ts";

/** One licence as a POM names it. */
export interface PomLicence {
  readonly name: string;
  readonly url?: string | null;
}

/** One library of the release runtime classpath, as the Gradle task writes it. */
export interface GradleArtifact {
  readonly group: string;
  readonly name: string;
  readonly version: string;
  /** The licences of its POM, or of the nearest parent POM that names any. */
  readonly licences: readonly PomLicence[];
  /** The `third_party_licenses.txt` its AAR carries, verbatim. */
  readonly embedded?: string | null;
  /**
   * Its `META-INF/NOTICE*` files, verbatim: Apache-2.0 section 4(d) asks us
   * to pass them on with the library (HAL-12776).
   */
  readonly notices?: readonly string[] | null;
}

/** The file the Gradle task writes. */
export interface GradleLicences {
  readonly artifacts: readonly GradleArtifact[];
}

/** A library shipped under its maker's own terms, accepted by a decision note. */
export interface ProprietaryArtifact {
  /** `group:name`, any version. */
  readonly artifact: string;
  /** The licence name its POM must give. */
  readonly terms: string;
  readonly url: string;
  /** The task that accepted it. */
  readonly task: string;
}

/** The `gradle` part of `licences.json`. */
export interface GradlePolicy {
  /** A POM licence name → its SPDX ID. */
  readonly names: Readonly<Record<string, string>>;
  readonly proprietary: readonly ProprietaryArtifact[];
}

/** What `gradleNoticeEntries` needs besides the Gradle file. */
export interface GradleRules {
  readonly policy: GradlePolicy;
  /** The SPDX IDs allowed in shipped code. */
  readonly allowed: ReadonlySet<string>;
  /** The stored text of a licence, or `undefined` when none is stored. */
  readonly text: (spdx: string) => string | undefined;
}

type Found = { entry: NoticeEntry } | { problems: string[] };

function proprietaryEntry(artifact: GradleArtifact, terms: ProprietaryArtifact): Found {
  const label = `${artifact.group}:${artifact.name}@${artifact.version}`;
  const named = artifact.licences.map((licence) => licence.name);
  if (named.length === 0 || named.some((name) => name !== terms.terms)) {
    return {
      problems: [
        `${label} names ${named.length === 0 ? "no licence" : `"${named.join('", "')}"`} in its POM, but licences.json accepts it only under "${terms.terms}": check the new terms before you change the entry`,
      ],
    };
  }
  return {
    entry: {
      name: `${artifact.group}:${artifact.name}`,
      versions: [artifact.version],
      licence: `${terms.terms} (not open source)`,
      homepage: terms.url,
      texts: [
        `${artifact.group}:${artifact.name} is not open-source software. It is distributed under the ${terms.terms}: ${terms.url}`,
        ...embeddedTexts(artifact),
      ],
    },
  };
}

/** The texts the library itself carries: its AAR's licence list, then its NOTICE files. */
function embeddedTexts(artifact: GradleArtifact): string[] {
  return [artifact.embedded, ...(artifact.notices ?? [])]
    .map((text) => text?.trim() ?? "")
    .filter((text) => text !== "");
}

function openEntry(artifact: GradleArtifact, rules: GradleRules): Found {
  const label = `${artifact.group}:${artifact.name}@${artifact.version}`;
  if (artifact.licences.length === 0) {
    return { problems: [`${label} names no licence in its POM or a parent POM`] };
  }
  const problems: string[] = [];
  const ids: string[] = [];
  for (const licence of artifact.licences) {
    const id = rules.policy.names[licence.name];
    if (id === undefined) {
      problems.push(
        `${label} is under "${licence.name}", which "gradle.names" in tooling/check/licences.json doesn't map to an SPDX ID`,
      );
    } else if (!rules.allowed.has(id)) {
      problems.push(`${label} is under ${id}, which isn't allowed in shipped code`);
    } else {
      ids.push(id);
    }
  }
  const unique = [...new Set(ids)];
  const texts: string[] = [];
  for (const id of unique) {
    const text = rules.text(id);
    if (text === undefined) {
      problems.push(
        `${label} is under ${id}, but tooling/check/licence-texts/${id}.txt is missing: add the licence's full text there`,
      );
    } else {
      texts.push(text);
    }
  }
  if (problems.length > 0) {
    return { problems };
  }
  return {
    entry: {
      name: `${artifact.group}:${artifact.name}`,
      versions: [artifact.version],
      // A POM that lists several licences gives no operator, so each one is checked and named.
      licence: unique.join(" AND "),
      texts: [...texts, ...embeddedTexts(artifact)],
    },
  };
}

/**
 * The notice entries of the Android libraries, and what is wrong with any of
 * them. Every licence a POM names must be allowed, since a POM doesn't say
 * whether several mean "and" or "or". An empty list is a problem too: the
 * release classpath is never empty, so the Gradle task went wrong.
 */
export function gradleNoticeEntries(
  file: GradleLicences,
  rules: GradleRules,
): { entries: NoticeEntry[]; problems: string[] } {
  const entries: NoticeEntry[] = [];
  const problems: string[] = [];
  if (file.artifacts.length === 0) {
    problems.push("the Gradle licence file lists no libraries: the Gradle task found nothing");
  }
  for (const artifact of file.artifacts) {
    const terms = rules.policy.proprietary.find(
      (entry) => entry.artifact === `${artifact.group}:${artifact.name}`,
    );
    const found =
      terms === undefined ? openEntry(artifact, rules) : proprietaryEntry(artifact, terms);
    if ("entry" in found) {
      entries.push(found.entry);
    } else {
      problems.push(...found.problems);
    }
  }
  return { entries, problems };
}

/** What is wrong with the `gradle` part of `licences.json` itself. */
export function gradlePolicyProblems(policy: GradlePolicy, allowed: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  for (const [name, id] of Object.entries(policy.names)) {
    if (!allowed.has(id)) {
      problems.push(
        `tooling/check/licences.json: "gradle.names" maps "${name}" to ${id}, which isn't on the shipped list`,
      );
    }
  }
  for (const entry of policy.proprietary) {
    const missing = (["artifact", "terms", "url", "task"] as const).filter(
      (field) => typeof entry[field] !== "string" || entry[field] === "",
    );
    if (missing.length > 0 || !/^[^:\s]+:[^:\s]+$/.test(entry.artifact)) {
      problems.push(
        `tooling/check/licences.json: the proprietary entry "${String(entry.artifact)}" needs "group:name", terms, url and task`,
      );
    }
  }
  return problems;
}
