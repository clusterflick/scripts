const withLocalNetworkRetry = require("../local-network");
const { LocalNetworkError } = withLocalNetworkRetry;

describe("withLocalNetworkRetry", () => {
  const ok = { venue: "myvue.com-islington", counts: { films: 12 } };
  const offline = {
    venue: "myvue.com-islington",
    reason: { kind: "probe-error", message: "fetch failed" },
  };
  const challenged = {
    venue: "myvue.com-islington",
    reason: { kind: "bot-challenge", via: "cf-mitigated", status: 403 },
  };

  // A network that answers each check from the list in turn, then stays on the
  // last answer.
  const networkSequence = (...answers) => {
    const checkNetwork = jest.fn(async () =>
      answers.length > 1 ? answers.shift() : answers[0],
    );
    return checkNetwork;
  };

  const run = (runProbe, checkNetwork) =>
    withLocalNetworkRetry(runProbe, {
      checkNetwork,
      wait: async () => {},
      recheckIntervalMs: 30_000,
    });

  beforeEach(() => jest.spyOn(console, "log").mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it("returns a healthy probe's rows without checking the network", async () => {
    const checkNetwork = networkSequence(true);
    const runProbe = jest.fn(async () => [ok]);

    await expect(run(runProbe, checkNetwork)).resolves.toEqual([ok]);
    expect(runProbe).toHaveBeenCalledTimes(1);
    expect(checkNetwork).not.toHaveBeenCalled();
  });

  it("leaves a source's own answer alone", async () => {
    // A challenge is the source answering, so the network was up.
    const checkNetwork = networkSequence(false);
    const runProbe = jest.fn(async () => [challenged]);

    await expect(run(runProbe, checkNetwork)).resolves.toEqual([challenged]);
    expect(checkNetwork).not.toHaveBeenCalled();
  });

  it("records a probe error as it is when the runner is online", async () => {
    // The source can't be reached and the rest of the internet can, so the
    // failure is the source's and is worth a row.
    const checkNetwork = networkSequence(true);
    const runProbe = jest.fn(async () => [offline]);

    await expect(run(runProbe, checkNetwork)).resolves.toEqual([offline]);
    expect(runProbe).toHaveBeenCalledTimes(1);
  });

  it("probes again once the runner's network comes back", async () => {
    // Down when the probe fails, down on the first recheck, then back.
    const checkNetwork = networkSequence(false, false, true);
    const runProbe = jest
      .fn()
      .mockResolvedValueOnce([offline])
      .mockResolvedValueOnce([ok]);

    await expect(run(runProbe, checkNetwork)).resolves.toEqual([ok]);
    expect(runProbe).toHaveBeenCalledTimes(2);
  });

  it("writes nothing if the network never comes back", async () => {
    const checkNetwork = networkSequence(false);
    const runProbe = jest.fn(async () => [offline]);

    await expect(run(runProbe, checkNetwork)).rejects.toThrow(
      LocalNetworkError,
    );
    expect(runProbe).toHaveBeenCalledTimes(1);
  });

  it("gives up if the network keeps dropping out mid-probe", async () => {
    // Back each time it is rechecked, gone each time the probe fails.
    const answers = [];
    const checkNetwork = jest.fn(async () => answers.shift());
    const runProbe = jest.fn(async () => {
      answers.push(false, true);
      return [offline];
    });

    await expect(run(runProbe, checkNetwork)).rejects.toThrow(
      LocalNetworkError,
    );
    expect(runProbe).toHaveBeenCalledTimes(3);
  });
});
