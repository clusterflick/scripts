const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

jest.mock("../../../cinemas", () => ({
  getAllCinemaNames: jest.fn(),
  getCinema: jest.fn(),
  getCinemaAttributes: jest.fn(),
}));
jest.mock("../../../sources", () => ({
  getAllSourceNames: jest.fn(),
  getSourceFindEvents: jest.fn(),
}));

const cinemas = require("../../../cinemas");
const sources = require("../../../sources");
const { readJSON } = require("../../../common/utils");
const {
  checkRetrievedData,
  NEEDS_SOURCED_EVENTS,
} = require("../check-retrieved-data");

let directory;

const writeRetrieved = (location, data) =>
  fs.writeFileSync(
    path.join(directory, "retrieved-data", location),
    JSON.stringify(data),
  );

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "check-retrieved-"));
  fs.mkdirSync(path.join(directory, "retrieved-data"));
  jest.spyOn(process, "cwd").mockReturnValue(directory);
  jest.spyOn(console, "log").mockImplementation(() => {});

  cinemas.getAllCinemaNames.mockReturnValue(["venue-a", "venue-b"]);
  cinemas.getCinemaAttributes.mockImplementation((id) => ({ id }));
  sources.getAllSourceNames.mockReturnValue(["a-source"]);
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});

describe("checkRetrievedData", () => {
  describe("a venue", () => {
    it("passes when its transform reads what was retrieved", async () => {
      const transform = jest.fn().mockResolvedValue([{}, {}]);
      cinemas.getCinema.mockReturnValue({ transform });
      writeRetrieved("venue-a", { movieListPage: "<html/>" });

      await expect(checkRetrievedData("venue-a")).resolves.toEqual({
        checked: true,
        movies: 2,
      });
      // With no sourced events: a venue's retrieve has none
      expect(transform).toHaveBeenCalledWith({ movieListPage: "<html/>" }, {});
    });

    // What the Royal Albert Hall's retrieve stored on 17th November 2026
    it("throws what its transform throws", async () => {
      cinemas.getCinema.mockReturnValue({
        transform: jest
          .fn()
          .mockRejectedValue(
            new Error("No movies found - the page structure may have changed"),
          ),
      });
      writeRetrieved("venue-a", []);

      await expect(checkRetrievedData("venue-a")).rejects.toThrow(
        "No movies found - the page structure may have changed",
      );
    });

    // The transform reads the file, not what the retrieve returned
    it("reads the data back from disk", async () => {
      const transform = jest.fn().mockResolvedValue([]);
      cinemas.getCinema.mockReturnValue({ transform });
      fs.writeFileSync(
        path.join(directory, "retrieved-data", "venue-a"),
        '{"kept":1}',
      );

      await checkRetrievedData("venue-a");
      expect(transform).toHaveBeenCalledWith({ kept: 1 }, {});
    });

    it("skips a venue whose transform needs a source's data", async () => {
      const [location] = Object.keys(NEEDS_SOURCED_EVENTS);
      const transform = jest.fn();
      cinemas.getCinema.mockReturnValue({ transform });

      await expect(checkRetrievedData(location)).resolves.toEqual({
        checked: false,
      });
      expect(transform).not.toHaveBeenCalled();
    });
  });

  describe("a source", () => {
    it("runs its findEvents for every cinema", async () => {
      const findEvents = jest
        .fn()
        .mockResolvedValueOnce([{}])
        .mockResolvedValueOnce([{}, {}]);
      sources.getSourceFindEvents.mockReturnValue(findEvents);

      await expect(checkRetrievedData("a-source")).resolves.toEqual({
        checked: true,
        events: 3,
      });
      expect(findEvents.mock.calls).toEqual([
        [{ id: "venue-a" }],
        [{ id: "venue-b" }],
      ]);
    });

    // What Ticket Tailor's retrieve stored on 17th November 2026
    it("throws when its findEvents throws for any cinema", async () => {
      sources.getSourceFindEvents.mockReturnValue(
        jest
          .fn()
          .mockResolvedValueOnce([])
          .mockRejectedValueOnce(
            new Error(
              'Unable to parse start date from date text: "Fri 27 Nov 2026, Multiple times"',
            ),
          ),
      );

      await expect(checkRetrievedData("a-source")).rejects.toThrow(
        "Unable to parse start date",
      );
    });

    it("parses the source's file once for every cinema", async () => {
      writeRetrieved("a-source", { events: [] });
      const parsed = [];
      sources.getSourceFindEvents.mockReturnValue(async () => {
        parsed.push(
          await readJSON(path.join(directory, "retrieved-data", "a-source")),
        );
        return [];
      });

      await checkRetrievedData("a-source");
      expect(parsed).toHaveLength(2);
      expect(parsed[0]).toBe(parsed[1]);
    });
  });
});
