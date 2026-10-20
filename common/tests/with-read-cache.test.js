const fs = require("node:fs").promises;
const os = require("node:os");
const path = require("node:path");
const { withReadCache, readJSON } = require("../utils");

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
