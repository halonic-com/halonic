import { readFile, stat } from "node:fs/promises";
import { isPlainObject } from "@halonicjs/std";
import { cappedAnswer } from "./answer-cap.ts";
import type { CodingTool } from "./coding-tool.ts";
import { allowedPath, type ToolFolders } from "./folders.ts";
import { FileWalk, type WalkedFile } from "./search/file-walk.ts";
import { optionalText, refuseUnknownArguments, ToolRefusal } from "./tool-input.ts";

/** The map's limits (HAL-16737, plan section 5). */
const limits = { packages: 200, sourceFiles: 12, folders: 40, packageFileBytes: 1024 * 1024 };

/** A test or spec file, which the map leaves out of a package's source files. */
const testFile = /\.(test|spec)\.|\.test-helper\./;

/** One package the map shows. */
interface MappedPackage {
  /** Its folder, relative to the working folder; `.` for the working folder. */
  readonly folder: string;
  readonly name: string;
  readonly sourceFiles: string[];
}

const description =
  "One-call map of the working folder: its packages (each folder with a package.json), their names and main source files, " +
  "so you know where things live without listing folders step by step.";

/**
 * `repo_map` (requirement `coding-tools.repo-map`): the packages in a folder
 * of the working folder, each with its name and first source files; for a
 * folder without packages, its folders and how many files each holds.
 */
export function repoMapTool(folders: ToolFolders): CodingTool {
  return {
    definition: {
      name: "repo_map",
      description,
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: {
            type: "string",
            description: "A folder to map; the whole working folder by default.",
          },
        },
      },
    },
    readOnly: true,
    async run(args) {
      refuseUnknownArguments(args, ["path"]);
      const start = await allowedPath(
        optionalText(args, "path", 4_096) ?? ".",
        folders,
        "working-folder",
      );
      if (!(await stat(start.real)).isDirectory()) {
        throw new ToolRefusal(`'${start.shown}' is a file; repo_map maps a folder.`);
      }
      const walk = new FileWalk(folders);
      const files: WalkedFile[] = [];
      for await (const file of walk.files(start.real)) files.push(file);
      const packages = await packagesIn(files);
      const map = packages.length > 0 ? packageMap(packages) : folderMap(files, start.shown);
      const note = walk.stoppedEarly
        ? "\n(the folder has too many files; map a smaller one with path)"
        : "";
      return cappedAnswer(`${map}${note}`, "map a smaller folder with path");
    },
  };
}

/** The packages among the files, with their source files, in folder order. */
async function packagesIn(files: readonly WalkedFile[]): Promise<MappedPackage[]> {
  const packageFiles = files.filter(
    (file) => file.path === "package.json" || file.path.endsWith("/package.json"),
  );
  const packages: MappedPackage[] = [];
  for (const file of packageFiles.slice(0, limits.packages)) {
    const folder = file.path === "package.json" ? "." : file.path.slice(0, -"/package.json".length);
    const sourceFolder = folder === "." ? "src/" : `${folder}/src/`;
    const sourceFiles = files
      .filter((source) => source.path.startsWith(sourceFolder) && !testFile.test(source.path))
      .slice(0, limits.sourceFiles)
      .map((source) => source.path.slice(sourceFolder.length - "src/".length));
    packages.push({ folder, name: await packageName(file.real), sourceFiles });
  }
  return packages;
}

/** The `name` in a package.json, or `""` when it has none or can't be read. */
async function packageName(real: string): Promise<string> {
  try {
    if ((await stat(real)).size > limits.packageFileBytes) return "";
    const parsed: unknown = JSON.parse(await readFile(real, "utf8"));
    return isPlainObject(parsed) && typeof parsed["name"] === "string" ? parsed["name"] : "";
  } catch {
    // Not JSON, or gone meanwhile: the package is still shown, by its folder.
    return "";
  }
}

function packageMap(packages: readonly MappedPackage[]): string {
  const more =
    packages.length >= limits.packages ? `\n(only the first ${limits.packages} packages)` : "";
  const rows = packages.map((mapped) => {
    const title = mapped.name === "" ? mapped.folder : `${mapped.folder}  ${mapped.name}`;
    return [title, ...mapped.sourceFiles.map((file) => `    ${file}`)].join("\n");
  });
  return `${rows.join("\n")}${more}`;
}

/** For a folder with no packages: its folders, each with how many files it holds, and its own files. */
function folderMap(files: readonly WalkedFile[], start: string): string {
  const prefix = start === "." ? "" : `${start}/`;
  const counts = new Map<string, number>();
  const own: string[] = [];
  for (const file of files) {
    const rest = file.path.slice(prefix.length);
    const slash = rest.indexOf("/");
    if (slash === -1) own.push(rest);
    else counts.set(rest.slice(0, slash), (counts.get(rest.slice(0, slash)) ?? 0) + 1);
  }
  const folderRows = [...counts]
    .slice(0, limits.folders)
    .map(([name, count]) => `${prefix}${name}/  (${count} files)`);
  const fileRows = own.slice(0, limits.folders).map((name) => `${prefix}${name}`);
  const rows = [...folderRows, ...fileRows];
  return rows.length === 0
    ? "(no files)"
    : `No package.json here. Folders and files:\n${rows.join("\n")}`;
}
