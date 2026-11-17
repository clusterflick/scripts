const { attributes, retrieve, findEvents } = require("..");
const { readJSON } = require("../../../common/utils");

jest.mock("../../../common/utils", () => ({
  ...jest.requireActual("../../../common/utils"),
  readJSON: jest.fn(),
}));

// TEMPORARY: retrieve is stubbed to the empty state while the site's host drops
// connections from the self-hosted runners - see `../retrieve.js`. Revert this
// file alongside it to restore the recorded tests.
describe(attributes.name, () => {
  it("retrieves the empty state without a request", async () => {
    const fetchSpy = jest.spyOn(global, "fetch");
    const { movieListPages } = await retrieve();

    expect(movieListPages).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();

    readJSON.mockImplementation(() => ({ movieListPages }));
    const output = await findEvents({
      name: "The People's Letters Bookshop",
      alternativeNames: [],
    });
    expect(output).toHaveLength(0);
  });
});
