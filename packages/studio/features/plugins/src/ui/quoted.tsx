/**
 * A plugin's own text in quotes, as every description of a plugin shows (checklist 1, D 2). The
 * text is in `<bdi>`, so right-to-left text can't move the quotes or the words after it.
 */
export function Quoted({ text }: { readonly text: string }) {
  return (
    <>
      “<bdi>{text}</bdi>”
    </>
  );
}
