/** A button that has only an icon, by its name. */
export const buttonLabelled = (page: HTMLElement, name: string) =>
  page.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`) ?? undefined;

/** The name the workflow page's header shows as its title, after the kind, where the host can't rename. */
export const shownName = (page: HTMLElement) =>
  page.querySelector("h1")?.lastElementChild?.textContent;
