const { isQueuePage } = require("../queue-page");
const { probeText, probeJson } = require("../health-probe");

const queued = (body) => ({
  ok: true,
  status: 200,
  statusText: "OK",
  // What `fetch` reports after following the 302 into the waiting room.
  url: "https://bfi.queue-it.net/?c=bfi&e=onsale&t=https%3A%2F%2Fwhatson.bfi.org.uk",
  headers: new Headers(),
  text: async () => body,
});

describe("isQueuePage", () => {
  it("recognises a waiting room by the host it is served from", () => {
    expect(
      isQueuePage("https://bfi.queue-it.net/?c=bfi&e=onsale&t=https%3A%2F%2Fx"),
    ).toBe(true);
  });

  it("does not call a protected site's own page a waiting room", () => {
    expect(isQueuePage("https://whatson.bfi.org.uk/Online/default.asp")).toBe(
      false,
    );
  });

  it("is not fooled by a lookalike host", () => {
    expect(isQueuePage("https://queue-it.net.example.com/")).toBe(false);
  });

  it("concludes nothing from a navigation that never landed", () => {
    expect(isQueuePage("about:blank")).toBe(false);
    expect(isQueuePage(undefined)).toBe(false);
  });
});

describe("a probe redirected into a waiting room", () => {
  afterEach(() => {
    global.fetch = undefined;
  });

  it("records the source being busy rather than reading the queue page as content", async () => {
    // The waiting room answers 200, so without this the probe hands its caller
    // a queue page to parse and reports the parse failure as our bug.
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        queued("<html><body>You are now in line</body></html>"),
      );

    await expect(probeText("https://whatson.bfi.org.uk")).rejects.toMatchObject(
      { reason: { kind: "source-queue", status: 200 } },
    );
  });

  it("does the same for a probe expecting JSON", async () => {
    global.fetch = jest.fn().mockResolvedValue(queued("<html>queue</html>"));

    await expect(probeJson("https://www.myvue.com/api")).rejects.toMatchObject({
      reason: { kind: "source-queue" },
    });
  });
});
