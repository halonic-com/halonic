// The module hook: one more layer behind the loader's static import checks
// and the fence (design HAL-958, section 5, attack case A34). Once the hook is
// in place, every import and require the integration makes must stay inside
// its folder. Node's own modules (`node:fs`, `fs`, `node:module` and so no
// `createRequire`), `data:` and `blob:` URLs, other packages and `../` out of
// the folder are refused, even where Node's permission layer is off. The
// runner's entry, `main.ts`, puts it in place.

import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";

/** The one package an integration may import by name. It must still resolve inside the folder. */
export const allowedPackage = "zod";

/** Whether an import may go ahead, before or after Node resolves it. */
export type ImportCheck = { allowed: true } | { allowed: false; reason: string };

const allowed: ImportCheck = { allowed: true };

/** The extension Node loads as a native add-on. */
const nativeAddonExtension = ".node";

/** The integration's folder as a file URL that ends in `/`, so a prefix test can't match a sibling. */
export function folderUrl(folder: string): string {
  const href = pathToFileURL(folder).href;
  return href.endsWith("/") ? href : `${href}/`;
}

/**
 * Checks an import as the integration wrote it, before Node resolves it, so a
 * path out of the folder is refused without Node ever looking at it.
 * `parentUrl` is the importing module's URL, if there is one.
 */
export function checkSpecifier(
  specifier: string,
  parentUrl: string | undefined,
  folder: string,
): ImportCheck {
  if (specifier === allowedPackage || specifier.startsWith(`${allowedPackage}/`)) return allowed;
  const written = writtenUrl(specifier, parentUrl);
  if (written === undefined) {
    return refused(`"${specifier}" is not a file in the integration's folder or ${allowedPackage}`);
  }
  return checkResolved(written, folder);
}

/**
 * Checks where Node resolved an import: it must be a file inside the folder,
 * and not a native add-on (`.node`), whose native code would get past every
 * layer once loaded.
 */
export function checkResolved(url: string, folder: string): ImportCheck {
  if (!url.startsWith("file:")) return refused(`${schemeOf(url)} imports are not allowed`);
  if (!url.startsWith(folderUrl(folder))) {
    return refused(`${url} is outside the integration's folder`);
  }
  if (new URL(url).pathname.endsWith(nativeAddonExtension)) {
    return refused(`${url} is a native add-on`);
  }
  return allowed;
}

/**
 * Puts the hook in place for this process. Call it once, before the
 * integration's module is imported. The runner's entry also removes
 * `process.getBuiltinModule`, which hands out Node's modules without an import.
 *
 * `folder` must be the folder's real path, with no symlink in it: Node
 * resolves a module to its real path, so through a symlink the hook would
 * refuse the integration's own files.
 *
 * @throws {Error} later, from the import or require, for a module the hook refuses
 */
export function fenceModules(folder: string): void {
  registerHooks({
    resolve(specifier, context, nextResolve) {
      throwIfRefused(checkSpecifier(specifier, context.parentURL, folder));
      const resolved = nextResolve(specifier, context);
      throwIfRefused(checkResolved(resolved.url, folder));
      return resolved;
    },
  });
}

/** The URL a relative, absolute or `file:` specifier names, or undefined for any other kind. */
function writtenUrl(specifier: string, parentUrl: string | undefined): string | undefined {
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    return parentUrl === undefined ? undefined : new URL(specifier, parentUrl).href;
  }
  if (specifier.startsWith("/")) return pathToFileURL(specifier).href;
  if (URL.canParse(specifier)) return new URL(specifier).href;
  return undefined;
}

function schemeOf(url: string): string {
  return URL.canParse(url) ? new URL(url).protocol : url;
}

function refused(reason: string): ImportCheck {
  return { allowed: false, reason };
}

function throwIfRefused(check: ImportCheck): void {
  if (!check.allowed) throw new Error(`The runner refused an import: ${check.reason}.`);
}
