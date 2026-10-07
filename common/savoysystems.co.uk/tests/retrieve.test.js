const { fetchText } = require("../../../common/utils");
const retrieve = require("../retrieve");

jest.mock("../../../common/utils", () => ({
  ...jest.requireActual("../../../common/utils"),
  fetchText: jest.fn(),
}));

const listUrl = "https://example.com/Venue.dll/WhatsOn";
const pageUrl = (id) => `${listUrl}?f=${id}`;
const listPage = (ids) =>
  `<script>\n var Events = ${JSON.stringify({
    Events: ids.map((ID) => ({ ID, Title: `Film ${ID}`, URL: pageUrl(ID) })),
  })}\n</script>`;

const httpError = (status) => {
  const error = new Error(`Failed to fetch - ${status}`);
  error.status = status;
  return error;
};

describe("savoysystems.co.uk retrieve", () => {
  beforeEach(() => {
    fetchText.mockReset();
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("skips a movie page that returns 500 and keeps the rest", async () => {
    fetchText.mockImplementation(async (url) => {
      if (url === listUrl) return listPage([1, 2, 3]);
      if (url === pageUrl(2)) throw httpError(500);
      return `page ${url}`;
    });

    const { movieListPage, moviePages } = await retrieve({ url: listUrl });

    expect(movieListPage.Events).toHaveLength(3);
    expect(moviePages).toEqual({
      1: `page ${pageUrl(1)}`,
      3: `page ${pageUrl(3)}`,
    });
  });

  it.each([404, 503])("throws when a movie page returns %i", async (status) => {
    fetchText.mockImplementation(async (url) => {
      if (url === listUrl) return listPage([1, 2]);
      if (url === pageUrl(2)) throw httpError(status);
      return `page ${url}`;
    });

    await expect(retrieve({ url: listUrl })).rejects.toMatchObject({ status });
  });

  it("throws when the listing page returns 500", async () => {
    fetchText.mockRejectedValue(httpError(500));

    await expect(retrieve({ url: listUrl })).rejects.toMatchObject({
      status: 500,
    });
  });
});
