/** @jest-environment setup-polly-jest/jest-environment-node */
const { setupPolly, setupCacheMock } = require("../../../common/test-utils");
const { attributes, findEvents } = require("..");

const isRecording = false;

jest.mock("../../../common/cache");
setupCacheMock(__dirname, "2025-01-24");

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
