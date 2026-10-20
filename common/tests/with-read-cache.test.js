const fs = require("node:fs").promises;
const os = require("node:os");
const path = require("node:path");
const { withReadCache, memoiseOnData, readJSON } = require("../utils");

describe("withReadCache", () => {
  let filePath;

  beforeEach(async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "read-cache-"));
    filePath = path.join(directory, "data.json");
    await fs.writeFile(filePath, JSON.stringify({ version: 1 }));
  });

  afterEach(async () => {
    await fs.rm(path.dirname(filePath), { recursive: true, force: true });
  });

  test("parses a file once and hands every reader the same object", async () => {
    await withReadCache(async () => {
      const first = await readJSON(filePath);
      await fs.writeFile(filePath, JSON.stringify({ version: 2 }));
      const second = await readJSON(filePath);

      expect(second).toBe(first);
      expect(second).toEqual({ version: 1 });
    });
  });

  test("reads afresh once the scope has ended", async () => {
    await withReadCache(() => readJSON(filePath));
    await fs.writeFile(filePath, JSON.stringify({ version: 2 }));

    expect(await readJSON(filePath)).toEqual({ version: 2 });
  });

  test("ends the scope when the work throws", async () => {
    await expect(
      withReadCache(async () => {
        await readJSON(filePath);
        throw new Error("failed");
      }),
    ).rejects.toThrow("failed");
    await fs.writeFile(filePath, JSON.stringify({ version: 2 }));

    expect(await readJSON(filePath)).toEqual({ version: 2 });
  });

  // A missing file is how a source learns it has no data this run; caching
  // must not turn that into a value or lose the error code.
  test("passes a missing file's error to every reader", async () => {
    const missing = path.join(path.dirname(filePath), "missing.json");
    await withReadCache(async () => {
      await expect(readJSON(missing)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(readJSON(missing)).rejects.toMatchObject({ code: "ENOENT" });
    });
  });

  test("does not nest", async () => {
    await withReadCache(async () => {
      await expect(withReadCache(async () => {})).rejects.toThrow(
        "withReadCache does not nest",
      );
    });
  });
});

describe("memoiseOnData", () => {
  let filePath;

  beforeEach(async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "memoise-"));
    filePath = path.join(directory, "data.json");
    await fs.writeFile(filePath, JSON.stringify({ pages: ["a", "b"] }));
  });

  afterEach(async () => {
    await fs.rm(path.dirname(filePath), { recursive: true, force: true });
  });

  test("runs once for data shared by withReadCache", async () => {
    const parse = jest.fn((data) =>
      data.pages.map((page) => page.toUpperCase()),
    );
    const parsePages = memoiseOnData(parse);

    await withReadCache(async () => {
      const first = parsePages(await readJSON(filePath));
      const second = parsePages(await readJSON(filePath));

      expect(second).toBe(first);
      expect(first).toEqual(["A", "B"]);
    });
    expect(parse).toHaveBeenCalledTimes(1);
  });

  // What keeps a transform unchanged: each read outside the cache is a fresh
  // object, so a change on disk between reads is always seen.
  test("runs again for each fresh read", async () => {
    const parse = jest.fn((data) => data.pages.length);
    const countPages = memoiseOnData(parse);

    expect(countPages(await readJSON(filePath))).toBe(2);
    await fs.writeFile(filePath, JSON.stringify({ pages: ["a"] }));
    expect(countPages(await readJSON(filePath))).toBe(1);
    expect(parse).toHaveBeenCalledTimes(2);
  });

  test("passes any further arguments through", () => {
    const parse = memoiseOnData((data, prefix) => `${prefix}${data.id}`);

    expect(parse({ id: 1 }, "venue-")).toBe("venue-1");
  });

  test("does not keep a result for a call that threw", () => {
    const parse = jest
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("failed");
      })
      .mockImplementationOnce(() => "parsed");
    const parseData = memoiseOnData(parse);
    const data = {};

    expect(() => parseData(data)).toThrow("failed");
    expect(parseData(data)).toBe("parsed");
  });
});
