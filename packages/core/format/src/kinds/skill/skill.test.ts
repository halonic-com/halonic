import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { parsedValue, problemsOf, summary } from "../../test/parse.ts";

const skill = (frontMatter: string, body = "\n- One idea per sentence.\n") =>
  `---\n${frontMatter}\n---\n${body}`;

verifies("format.skill-file", () => {
  it("reads the name and description and trims the body; the folder is the id", () => {
    const text = skill("name: Plain words\ndescription: Write short sentences.");
    expect(parsedValue("skill", text, "plain-words")).toEqual({
      id: "plain-words",
      name: "Plain words",
      description: "Write short sentences.",
      body: "- One idea per sentence.",
    });
  });

  it("drops other front matter keys and ignores an id in the front matter", () => {
    const text = skill("name: N\ndescription: D\nid: other\nlicense: MIT");
    expect(parsedValue("skill", text, "folder")).toEqual({
      id: "folder",
      name: "N",
      description: "D",
      body: "- One idea per sentence.",
    });
  });

  it("keeps a skill whose folder doesn't match the id pattern, as before", () => {
    expect(parsedValue("skill", skill("name: N\ndescription: D"), "Plain_Words").id).toBe(
      "Plain_Words",
    );
  });

  it("refuses a missing description at the front matter's line", () => {
    const problems = problemsOf("skill", skill("name: Plain words"), "plain-words");
    expect(summary(problems)).toEqual(["description invalid_type 2"]);
  });

  it("refuses a name that isn't text, on its own line in the file", () => {
    const problems = problemsOf("skill", skill("description: D\nname: 12"), "plain-words");
    expect(summary(problems)).toEqual(["name invalid_type 3"]);
  });

  it("refuses a file without front matter: name and description are missing", () => {
    const problems = problemsOf("skill", "# Plain words\n", "plain-words");
    expect(summary(problems)).toEqual(["name invalid_type 1", "description invalid_type 1"]);
  });

  it("reports broken front matter YAML at its line in the file, counting the opening ---", () => {
    // The unclosed list on line 2 is noticed on line 3, as the YAML library reports it.
    const [problem] = problemsOf("skill", skill("name: [Plain words\ndescription: D"), "x");
    expect(problem).toMatchObject({ source: "syntax", code: "syntax", path: [], line: 3 });
  });

  it("refuses front matter that is a list, where the front matter starts", () => {
    const problems = problemsOf("skill", skill("- name"), "plain-words");
    expect(summary(problems)).toEqual([" invalid_type 2"]);
  });
});
