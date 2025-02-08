/** @jest-environment setup-polly-jest/jest-environment-node */
const { setupPolly } = require("../../../common/test-utils");
const { readJSON } = require("../../../common/utils");
const { attributes, findEvents } = require("..");

const isRecording = false;

jest.mock("../../../common/utils", () => ({
  ...jest.requireActual("../../../common/utils"),
  readJSON: jest.fn(),
}));
readJSON.mockImplementation(() => {
  const path = require("node:path");
  const dataPath = path.join(
    __dirname,
    "__manual-recordings__",
    "eventbrite.co.uk-london-screening-page-2025-01-24",
  );
  return jest.requireActual("../../../common/utils").readJSON(dataPath);
});

const cinema = {
  name: "Genesis Cinema",
  geo: { lat: 51.52128726645794, lon: -0.051143457671891594 },
};

describe(attributes.name, () => {
  setupPolly(isRecording, __dirname);
  jest.useFakeTimers().setSystemTime(new Date("2025-01-24"));

  it(
    "find-events",
    async () => {
      const output = await findEvents(cinema);
      const data = JSON.parse(JSON.stringify(output));

      // Make sure the data looks roughly correct
      expect(data).toHaveLength(8);
      expect(data).toMatchSnapshot();
    },
    isRecording ? 120_000 : undefined,
  );
});
