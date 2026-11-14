import type { ItemViewProps } from "@halonicjs/studio-shell";
import { aliasIntro, aliasTitle } from "./alias-text.ts";

/**
 * An alias's tab (`models.aliases.list`): its title and what an alias is. The fields land in the
 * next change.
 *
 * @example
 * <AliasTab item={{ kind: "model-alias", hub: "local", id: "smart" }} context={context} />
 */
export function AliasTab({ item }: ItemViewProps) {
  return (
    <div className="flex w-full flex-col gap-3 px-6 py-5">
      <h1 className="text-title">{aliasTitle(item.id)}</h1>
      <p>{aliasIntro(item.id)}</p>
    </div>
  );
}
