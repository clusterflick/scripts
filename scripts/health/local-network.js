const { sleep } = require("../../common/utils");

// Hosts that have nothing to do with any cinema, so failing to reach them says
// the fault is at our end. Two of them, both required to fail, so one of them
// having a bad hour doesn't get a real source outage reclassified as ours.
// GitHub is one because the runner can't take a job without it anyway.
const REFERENCE_HOSTS = ["https://github.com", "https://www.google.com"];
const REFERENCE_TIMEOUT_MS = 10_000;

// How long to wait for the network to come back before giving up on the cycle.
// The outage that prompted this (9 Oct, self-hosted runners) lasted about two
// minutes. The jobs have a 20 minute timeout, and probes queue behind this
// one in the same job.
const RECHECK_INTERVAL_MS = 30_000;
const RECHECKS = 10;

// How many times to run the probe again after the network comes back. A network
// that keeps dropping out mid-probe isn't going to produce a usable observation.
const PROBE_RETRIES = 2;

// Thrown when a probe failed because the runner was offline. There are no rows
// to write in that case: the probe never reached the source, so nothing about
// the source was observed. A gap in the series is the honest record, and the
// job goes red so we can see the cycle was lost.
class LocalNetworkError extends Error {}

// Any response at all, including an error status, means the request got out.
const canReach = async (url) => {
  try {
    await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(REFERENCE_TIMEOUT_MS),
    });
    return true;
  } catch {
    return false;
  }
};

const isNetworkUp = async () =>
  (await Promise.all(REFERENCE_HOSTS.map(canReach))).some(Boolean);

/**
 * Run a probe, and run it again if it failed because the runner was offline.
 *
 * A connect timeout to Vue looks the same from inside the probe whether Vue
 * went down or the runner did. On 9 Oct the self-hosted runners lost their
 * network for a couple of minutes and recorded every Vue and BFI venue as a
 * `probe-error`, which the venues page then listed as seventeen failing sources.
 * Those rows were about the runner, not the sources.
 *
 * So a `probe-error` row starts a check of whether we can reach the reference
 * hosts. If we can, the failure is the source's (or the probe's), and the rows
 * are returned as they are. If we can't, this waits for the network to come
 * back and runs the whole probe again, so a browser probe gets a fresh session.
 * If the network doesn't come back, it throws rather than returning rows.
 *
 * Only `probe-error` rows start the check. Every other kind is an answer the
 * source gave, which means the network was working.
 *
 * @param {() => Promise<object[]>} runProbe - Runs the probe, returns its rows
 * @param {object} [options] - Overrides for tests
 * @returns {Promise<object[]>} Rows from a probe that had a network
 */
async function withLocalNetworkRetry(
  runProbe,
  {
    checkNetwork = isNetworkUp,
    wait = sleep,
    recheckIntervalMs = RECHECK_INTERVAL_MS,
  } = {},
) {
  for (let attempt = 0; ; attempt += 1) {
    const rows = await runProbe();
    if (!rows.some(({ reason }) => reason?.kind === "probe-error")) return rows;
    if (await checkNetwork()) return rows;

    if (attempt >= PROBE_RETRIES) {
      throw new LocalNetworkError(
        `The runner lost its network during all ${attempt + 1} attempts at this probe. No rows were written, because nothing about the source was observed.`,
      );
    }

    console.log(
      ` ! - The runner can't reach ${REFERENCE_HOSTS.join(" or ")}. Waiting for its network to come back before probing again ...`,
    );
    let recovered = false;
    for (let check = 0; check < RECHECKS && !recovered; check += 1) {
      await wait(recheckIntervalMs);
      recovered = await checkNetwork();
    }
    if (!recovered) {
      throw new LocalNetworkError(
        `The runner's network was still down after ${(RECHECKS * recheckIntervalMs) / 1000}s. No rows were written, because nothing about the source was observed.`,
      );
    }
    console.log(" ! - The network is back, probing again");
  }
}

module.exports = withLocalNetworkRetry;
module.exports.LocalNetworkError = LocalNetworkError;
module.exports.isNetworkUp = isNetworkUp;
