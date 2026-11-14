import { defineFeature } from "@halonicjs/studio-shell";
import { ALIAS_KIND, ALIAS_KIND_LABEL, aliasTitle } from "./aliases/alias-text.ts";
import { ModelsFilesService } from "./api.ts";

/**
 * The Models feature: providers, aliases, API keys, budget, the "Prices and
 * budget" step and the spend line. Each part registers here as it lands; the
 * interface other features use is in `api.ts`. So far it adds the **Models**
 * section of the workspace page with the alias list (`models.aliases.list`)
 * and the alias tab.
 */
export const modelsFeature = defineFeature({
  id: "models",
  title: "Models",
  needs: [ModelsFilesService],
  register(studio) {
    studio.itemKinds.add({
      kind: ALIAS_KIND,
      label: ALIAS_KIND_LABEL,
      icon: "settings",
      open: { view: "AliasTab", load: () => import("./aliases/alias-tab.tsx") },
      tab: { describe: (item) => ({ label: aliasTitle(item.id) }), exists: () => true },
    });
    studio.itemPage.addSection({
      on: "workspace",
      id: "models",
      order: 20,
      view: "ModelsSection",
      load: () => import("./aliases/models-section.tsx"),
    });
  },
});
