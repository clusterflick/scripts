const fs = require("node:fs").promises;
const os = require("node:os");
const path = require("node:path");
const { writeJSON, readJSON } = require("../utils");

describe("writeJSON", () => {
  let directory;

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "write-json-"));
  });

  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });

  const filePathFor = (name) => path.join(directory, name);

  test("writes readable JSON to the given path", async () => {
    const filePath = filePathFor("data.json");
    await writeJSON(filePath, { b: 2, a: 1 });

    expect(await readJSON(filePath)).toEqual({ a: 1, b: 2 });
  });

  test("leaves no temporary files behind", async () => {
    await writeJSON(filePathFor("data.json"), { a: 1 });

    expect(await fs.readdir(directory)).toEqual(["data.json"]);
  });

  test("replaces an existing file rather than appending to it", async () => {
    const filePath = filePathFor("data.json");
    await writeJSON(filePath, { first: "write" });
    await writeJSON(filePath, { second: "write" });

    expect(await readJSON(filePath)).toEqual({ second: "write" });
  });

  // The failure this guards against: a timed-out retrieve attempt is left
  // running and races the next attempt writing the same path, so the file is
  // read mid-write and truncated at a chunk boundary.
  test("never exposes a partial file while a concurrent write is in flight", async () => {
    const filePath = filePathFor("data.json");
    const large = {
      pages: Array.from({ length: 20000 }, (_, i) => `page-${i}`),
    };
    await writeJSON(filePath, large);
    const expectedSize = (await fs.stat(filePath)).size;

    // Race several writers against readers of the same path, mirroring two
    // pipeline attempts writing while an artifact upload reads.
    const sizesSeen = [];
    const readers = Array.from({ length: 40 }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      sizesSeen.push((await fs.stat(filePath)).size);
    });
    const writers = Array.from({ length: 5 }, () => writeJSON(filePath, large));
    await Promise.all([...writers, ...readers]);

    // Every observed size is the complete file - never a truncated prefix.
    expect(sizesSeen).toHaveLength(40);
    expect([...new Set(sizesSeen)]).toEqual([expectedSize]);
    expect(await readJSON(filePath)).toEqual(large);
  });

  test("cleans up its temporary file when the write fails", async () => {
    const unwritable = filePathFor("missing-directory/data.json");

    await expect(writeJSON(unwritable, { a: 1 })).rejects.toThrow();
    expect(await fs.readdir(directory)).toEqual([]);
  });
});
