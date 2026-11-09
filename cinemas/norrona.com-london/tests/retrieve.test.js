jest.mock("../../../common/utils", () => ({
  ...jest.requireActual("../../../common/utils"),
  fetchText: jest.fn(),
}));
const { fetchText } = require("../../../common/utils");
const retrieve = require("../retrieve");

// The index as it answers a city it doesn't know: the value echoed back in the
// chip, and no events. Taken for London having nothing on, it would empty the
// venue's listings without a word.
const unrecognised = `<section id="result"><button class="topbar-chip"
  aria-label="Remove City: gb-london">gb-london</button></section>`;

describe("norrøna london retrieve", () => {
  it("fails when the event index doesn't recognise London", async () => {
    fetchText.mockResolvedValue(unrecognised);
    await expect(retrieve()).rejects.toThrow(
      "The event index did not recognise London",
    );
  });
});
