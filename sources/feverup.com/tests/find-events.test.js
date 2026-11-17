const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const findEvents = require("../find-events");
const { attributes: ica } = require("../../../cinemas/ica.art");
const { attributes: barbican } = require("../../../cinemas/barbican.org.uk");

const sessionPage = (...startTimes) => ({
  level: {
    items: [
      {
        level: {
          items: startTimes.map((startsAt) => ({
            value: { starts_at_iso: startsAt, ends_at_iso: startsAt },
          })),
        },
      },
    ],
  },
});

const place = (id, cinema) => ({
  id,
  name: cinema.name,
  latitude: cinema.geo.lat,
  longitude: cinema.geo.lon,
  address: cinema.address,
});

let directory;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "feverup-"));
  fs.mkdirSync(path.join(directory, "retrieved-data"));
  jest.spyOn(process, "cwd").mockReturnValue(directory);
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});

const writeRetrieved = (data) =>
  fs.writeFileSync(
    path.join(directory, "retrieved-data", "feverup.com"),
    JSON.stringify(data),
  );

describe("findEvents", () => {
  // Sessions are retrieved per place, so a plan at two venues we hold carries
  // both venues' dates. Each venue is given only its own.
  it("gives each venue only the sessions at its own place", async () => {
    writeRetrieved({
      planDetails: {
        101: {
          id: 101,
          name: "Heat",
          description: "A film screening",
          places: [place(1, ica), place(2, barbican)],
        },
      },
      sessionPages: {
        101: {
          "1:2026-12-01": sessionPage("2026-12-01T19:00:00+00:00"),
          "2:2026-12-02": sessionPage("2026-12-02T20:00:00+00:00"),
        },
      },
    });

    const atIca = await findEvents(ica);
    const atBarbican = await findEvents(barbican);

    expect(atIca).toHaveLength(1);
    expect(atIca[0].performances.map(({ time }) => time)).toEqual([
      new Date("2026-12-01T19:00:00Z").getTime(),
    ]);
    expect(atBarbican).toHaveLength(1);
    expect(atBarbican[0].performances.map(({ time }) => time)).toEqual([
      new Date("2026-12-02T20:00:00Z").getTime(),
    ]);
  });

  it("skips a plan with no sessions at the venue's place", async () => {
    writeRetrieved({
      planDetails: {
        101: {
          id: 101,
          name: "Heat",
          description: "A film screening",
          places: [place(1, ica), place(2, barbican)],
        },
      },
      sessionPages: {
        101: { "2:2026-12-02": sessionPage("2026-12-02T20:00:00+00:00") },
      },
    });

    expect(await findEvents(ica)).toEqual([]);
  });
});
