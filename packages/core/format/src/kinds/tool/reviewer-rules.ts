// The path rules `github.pull-request` uses to say which role reviews a pull
// request (HAL-18289, HAL-18292). They pick a role, never a person: the
// snapshot's routing says who covers each role, so a change of who covers it
// needs no change here. The rules only read paths and sizes; what the author
// declares (a security or release PR) and who wrote it route on top of them.
import { type Infer, s } from "@halonicjs/schema-kit";

/** A role the rules may name: the review roles of the routing. */
const reviewRole = s.enum(["routine-reviewer", "second-reviewer", "code-reviewer"]);

/** Whether `source` compiles as a JavaScript regular expression. */
function compiles(source: string): boolean {
  try {
    new RegExp(source);
    return true;
  } catch {
    return false;
  }
}

/**
 * A regular expression, written as its source, such as `\.md$`. Regexes, not
 * labels like `tests`, so every reader of the file matches the same paths.
 */
const pattern = s
  .string()
  .min(1)
  .max(200)
  .refine(compiles, "write a JavaScript regular expression, such as '\\.md$'");

const paths = s.array(s.string().min(1).max(300)).max(100).default([]);
const patterns = s.array(pattern).max(30).default([]);
const maxLines = s.number().int().min(1);

/**
 * A tighter line limit for some folders, such as an engine's kernel: more
 * changed lines than `max` in files under `folders` escalate.
 */
const FolderLineLimit = s.object({ folders: paths, max: maxLines }).strict();

/**
 * A narrower role for some of the pull requests that stay with `default`,
 * such as a review-only agent's: they go to `role` unless a path is under
 * one of `folders` or matches one of `patterns`.
 */
const NarrowerRole = s.object({ role: reviewRole, folders: paths, patterns: patterns }).strict();

/**
 * One repository's rules. A pull request goes to `escalateTo` when any rule
 * fires, to `narrowTo.role` when none does and `narrowTo` lets it, and to
 * `default` otherwise.
 */
export const RepositoryReviewerRules = s
  .object({
    /** The role a pull request goes to when no rule fires. */
    default: reviewRole,
    /** The role a pull request goes to when one does. */
    escalateTo: reviewRole,
    /** Exact paths, such as `pnpm-lock.yaml`. */
    files: paths,
    /** Folder prefixes, such as `.github/`. */
    folders: paths,
    /** Words that escalate a path holding one, in any case. */
    words: s.array(s.string().min(1).max(40)).max(30).default([]),
    /** Paths the word rule skips, such as tests and Markdown. */
    wordsSkip: patterns,
    /**
     * More changed lines than `max` escalate; lines in files matching `skip`
     * don't count. `folderLimits` count only the files under their folders.
     */
    lineLimit: s
      .object({
        max: maxLines,
        skip: patterns,
        folderLimits: s.array(FolderLineLimit).max(10).default([]),
      })
      .strict()
      .optional(),
    /** Whether a `package.json` below the root escalates. */
    nestedPackageJson: s.boolean().default(false),
    /** An optional third tier below `default`. */
    narrowTo: NarrowerRole.optional(),
  })
  .strict();

/** One repository's reviewer rules, with their defaults filled in. */
export type RepositoryReviewerRules = Infer<typeof RepositoryReviewerRules>;

/** The rules for each repository, by `owner/name`. */
export const ReviewerRules = s.record(s.string(), RepositoryReviewerRules);
