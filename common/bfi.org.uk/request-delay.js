// Pace page fetches to stay under BFI's request throttle, which otherwise slams
// roughly every 7th rapid request with a ~2min penalty. Measured floor: 5s
// still trips it, 8s is clear - so keep spacing at ~7s+. The throttle covers
// every whatson.bfi.org.uk site, festivals included.
// A fixed interval is itself a detectable signature, so jitter each wait across
// a band centred on 10s (8s-12s) - keeps the known-clear 8s floor while
// breaking up the regular cadence.
const REQUEST_DELAY_MIN_MS = 8000;
const REQUEST_DELAY_MAX_MS = 12000;

const jitteredDelay = () =>
  REQUEST_DELAY_MIN_MS +
  Math.floor(Math.random() * (REQUEST_DELAY_MAX_MS - REQUEST_DELAY_MIN_MS + 1));

module.exports = { jitteredDelay };
