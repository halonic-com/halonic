/**
 * The tab item that shows a workspace file in the code editor: the Files feature's item kind
 * (`file`) and hub part (`workspace`), which the Library's Open as file uses too.
 */
export const fileItemOf = (path: string) => ({ kind: "file", hub: "workspace", id: path });
