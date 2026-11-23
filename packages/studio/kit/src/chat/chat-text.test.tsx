// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { ChatMessage } from "./chat-message.tsx";
import { ChatText } from "./chat-text.tsx";

afterEach(() => {
  unmountAll();
});

verifies("kit.chat-message", () => {
  it("shows bold text without its stars", () => {
    const { container } = render(<ChatText>{"I added **morning-sort**."}</ChatText>);
    expect(container.textContent).toBe("I added morning-sort.");
    const bold = container.querySelector("strong") as HTMLElement;
    expect(bold.textContent).toBe("morning-sort");
    expect(bold.className).toContain("font-semibold");
  });

  it("shows a link as its words and its address, with nothing that opens", () => {
    const { container } = render(<ChatText>{"See the [guide](https://example.com)."}</ChatText>);
    expect(container.textContent).toBe("See the guide (https://example.com).");
    expect(container.querySelector("a, [href], [title], [onclick], button")).toBeNull();
    const address = container.querySelector("bdi") as HTMLElement;
    expect(address.getAttribute("dir")).toBe("ltr");
    expect(address.parentElement?.className).toContain("text-fg-muted");
  });

  it("shows a link whose words are its address once", () => {
    const { container } = render(
      <ChatText>{"[https://example.com](https://example.com)"}</ChatText>,
    );
    expect(container.textContent).toBe("https://example.com");
  });

  it("shows HTML and images as written, and loads nothing", () => {
    const source = '<img src="x" onerror="alert(1)"> and ![x](https://example.com/x.png)';
    const { container } = render(<ChatText>{source}</ChatText>);
    expect(container.textContent).toBe(source);
    expect(container.querySelector("img, script, a, iframe, [src], [onerror]")).toBeNull();
  });

  it("draws only its own elements, with no link, whatever the model writes", () => {
    const source = [
      "<script>alert(1)</script> <a href='javascript:alert(1)'>x</a> <iframe src=x></iframe>",
      '[x](javascript:alert(1)) [<b>x</b>](https://example.com/"onmouseover=alert(1))',
      "# **bold** _em_ `code`",
      "> quote [x](https://example.com/a)",
      "- item\n2. item",
      "```\n<b style='color:red'>raw</b>",
    ].join("\n\n");
    const { container } = render(<ChatText>{source}</ChatText>);
    const own = new Set([
      ...["div", "p", "blockquote", "pre", "ul", "ol", "li"],
      ...["strong", "em", "code", "span", "bdi"],
    ]);
    const found = [...container.querySelectorAll("*")].flatMap((element) => [
      ...(own.has(element.tagName.toLowerCase()) ? [] : [element.tagName]),
      ...[...element.attributes]
        .map(({ name }) => name)
        .filter((name) => !["class", "dir", "start"].includes(name)),
    ]);
    expect(found).toEqual([]);
  });

  it("shows a code block that wraps rather than scrolls", () => {
    const { container } = render(<ChatText>{"```yaml\ncron: 0 8 * * 1-5\n```"}</ChatText>);
    const code = container.querySelector("pre") as HTMLElement;
    expect(code.textContent).toBe("cron: 0 8 * * 1-5");
    expect(code.className).toContain("whitespace-pre-wrap");
    expect(code.className).not.toContain("overflow");
  });

  it("shows inline code in mono on a soft fill", () => {
    const { container } = render(<ChatText>{"It runs at `0 8 * * 1-5`."}</ChatText>);
    const code = container.querySelector("code") as HTMLElement;
    expect(code.textContent).toBe("0 8 * * 1-5");
    expect(code.className).toContain("font-mono");
    expect(code.className).toContain("bg-surface-muted");
  });

  it("keeps the number an ordered list starts at", () => {
    const { container } = render(<ChatText>{"3. third\n4. fourth"}</ChatText>);
    const list = container.querySelector("ol") as HTMLElement;
    expect(list.getAttribute("start")).toBe("3");
    expect([...list.querySelectorAll("li")].map((item) => item.textContent)).toEqual([
      "third",
      "fourth",
    ]);
  });

  it("shows a heading as a bold line, not a heading", () => {
    const { container } = render(<ChatText>{"# Done\nAll set."}</ChatText>);
    expect(container.querySelector("h1, h2, h3, h4, h5, h6")).toBeNull();
    const line = container.querySelector("p") as HTMLElement;
    expect(line.textContent).toBe("Done");
    expect(line.className).toContain("font-semibold");
  });

  it("puts paragraphs apart and keeps a line break inside one", () => {
    const { container } = render(<ChatText>{"One\nTwo\n\nThree"}</ChatText>);
    const text = container.firstElementChild as HTMLElement;
    expect(text.tagName).toBe("DIV");
    expect(text.className).toContain("gap-3");
    expect([...text.querySelectorAll("p")].map((paragraph) => paragraph.textContent)).toEqual([
      "One\nTwo",
      "Three",
    ]);
  });
});

verifies("kit.chat-reply-busy", () => {
  it("marks a reply busy only while it is being written", () => {
    const reply = (busy?: boolean) =>
      render(
        <ChatMessage from="reply" heading="Sorter said" busy={busy}>
          <ChatText>It's about</ChatText>
        </ChatMessage>,
      ).container.firstElementChild as HTMLElement;
    expect(reply(true).getAttribute("aria-busy")).toBe("true");
    expect(reply(false).hasAttribute("aria-busy")).toBe(false);
    expect(reply().hasAttribute("aria-busy")).toBe(false);
  });
});
