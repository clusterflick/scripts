const { assertSelector } = require("../utils");

describe("assertSelector", () => {
  let log;

  beforeEach(() => {
    log = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    log.mockRestore();
  });

  it("passes quietly when the selector is found", () => {
    assertSelector('<body class="single-venue"></body>', "body.single-venue");
    expect(log).not.toHaveBeenCalled();
  });

  it("logs what the page was before throwing", () => {
    const html = `<html><head><title>Site maintenance</title></head>
      <body class="maintenance">
        <h1>Back soon</h1>
        <p>We are   making improvements.</p>
        <script>window.dataLayer = [];</script>
        <style>h1 { color: red; }</style>
      </body></html>`;

    expect(() => assertSelector(html, "body.single-venue")).toThrow(
      'Expected "body.single-venue" not found',
    );
    const [output] = log.mock.calls[0];
    expect(output).toContain("Title: Site maintenance");
    expect(output).toContain('Body: <body class="maintenance">');
    expect(output).toContain("Text: Back soon We are making improvements.");
    expect(output).not.toContain("dataLayer");
    expect(output).not.toContain("color: red");
  });

  it("truncates long page text", () => {
    const html = `<body><p>${"word ".repeat(200)}</p></body>`;

    expect(() => assertSelector(html, ".missing")).toThrow();
    const [output] = log.mock.calls[0];
    expect(output).toContain("... [truncated]");
    expect(output.length).toBeLessThan(800);
  });

  it("falls back to the raw content when there is no page text", () => {
    const xml = "<venues><venue><shows></shows></venue></venues>";

    expect(() =>
      assertSelector(xml, "venues > venue > shows > show"),
    ).toThrow();
    const [output] = log.mock.calls[0];
    expect(output).toContain(xml);
  });

  it("keeps a custom error message", () => {
    expect(() => assertSelector("<body></body>", ".x", "Custom")).toThrow(
      "Custom",
    );
  });
});
