const { cache, dailyCache } = require("../cache");

// Cache keys are built from scraped values, so a bad extraction can hand the
// cache a whole paragraph. Storing that throws ENAMETOOLONG from deep inside
// fs, which is why these check the guard rejects the key up front instead -
// and why it must not truncate, since two long keys would then collide on one
// file and serve each other's data.

const shouldNotRun = () => {
  throw new Error("retrieve should not be called for an unstorable key");
};

describe("cache", () => {
  it("refuses a key too long to store", async () => {
    await expect(cache("a".repeat(300), shouldNotRun)).rejects.toThrow(
      /300 bytes, over the 255 byte filename limit/,
    );
  });

  it("counts bytes rather than characters", async () => {
    // 130 accented characters are only 130 characters but 260 bytes
    await expect(cache("é".repeat(130), shouldNotRun)).rejects.toThrow(
      /260 bytes/,
    );
  });

  it("counts the suffix a daily cache appends", async () => {
    // 250 characters is storable on its own, but not once dated
    await expect(dailyCache("a".repeat(250), shouldNotRun)).rejects.toThrow(
      /261 bytes/,
    );
  });

  it("names the start of the key so the caller can be found", async () => {
    await expect(
      cache(`moviedb-search-person-${"a".repeat(300)}`, shouldNotRun),
    ).rejects.toThrow(/Key begins: "moviedb-search-person-a+"/);
  });
});
