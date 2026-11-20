const { getPageText, quoteAppearsIn, hashText } = require("../page-text");

// Shaped like a Picturehouse access page: the access copy in its own element,
// the chain's film carousel beside it, each screen's figures split by <br>.
const PAGE = `<html><head><style>.x{}</style><script>var a = 1;</script></head>
<body>
  <div class="carousel"><h3>Dune: Part Three</h3></div>
  <div class="cinimaAccessibility_div">
    <h2>ACCESSIBILITY AT PICTUREHOUSE CENTRAL</h2>
    <p>Screen 1 <br>No. of seats: 341 <br>No. of wheelchair spaces: 6</p>
    <p>Guide dogs and assistance dogs are welcome&nbsp;&ndash; it&rsquo;s fine.</p>
  </div>
</body></html>`;

describe("getPageText", () => {
  it("keeps the words and drops scripts and styles", () => {
    const text = getPageText(PAGE);
    expect(text).toContain("No. of wheelchair spaces: 6");
    expect(text).not.toContain("var a");
    expect(text).not.toContain(".x{}");
  });

  it("separates text that block elements and <br> kept apart", () => {
    expect(getPageText(PAGE)).toContain(
      "Screen 1 No. of seats: 341 No. of wheelchair spaces: 6",
    );
  });

  it("narrows to the selector, leaving the rest of the template out", () => {
    const text = getPageText(PAGE, ".cinimaAccessibility_div");
    expect(text).toContain("ACCESSIBILITY AT PICTUREHOUSE CENTRAL");
    expect(text).not.toContain("Dune");
  });

  it("throws when the selector matches anything but one element", () => {
    expect(() => getPageText(PAGE, ".missing")).toThrow(
      'Expected one element for ".missing", found 0',
    );
    expect(() => getPageText(PAGE, "p")).toThrow(
      'Expected one element for "p", found 2',
    );
  });
});

describe("quoteAppearsIn", () => {
  const text = getPageText(PAGE);

  it("finds a quote across a line break", () => {
    expect(
      quoteAppearsIn("No. of seats: 341 No. of wheelchair spaces: 6", text),
    ).toBe(true);
  });

  it("treats curly and straight quote marks, dashes and spaces alike", () => {
    expect(
      quoteAppearsIn("assistance dogs are welcome - it's   fine.", text),
    ).toBe(true);
  });

  it("doesn't find words the page doesn't say", () => {
    expect(quoteAppearsIn("No. of wheelchair spaces: 7", text)).toBe(false);
  });

  it("keeps case, since a quote is the page's own words", () => {
    expect(quoteAppearsIn("guide dogs and assistance dogs", text)).toBe(false);
  });

  it("never matches an empty quote", () => {
    expect(quoteAppearsIn("  ", text)).toBe(false);
  });
});

describe("hashText", () => {
  it("changes with the text and only with the text", () => {
    expect(hashText("a")).toBe(hashText("a"));
    expect(hashText("a")).not.toBe(hashText("b"));
  });
});
