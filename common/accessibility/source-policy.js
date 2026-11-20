/**
 * Which sources an accessibility fact may come from, and how far each is
 * trusted. This is the source policy table from docs/venue-accessibility.md in code:
 * add a host here before a record uses it.
 *
 * It fails closed. A host this file doesn't know is an error rather than a
 * tier, so a new source is a decision someone made rather than something a
 * researcher or an LLM slipped in. The excluded list exists only to give a
 * clearer message for the sources we've already decided against.
 *
 * Hosts are compared exactly (after dropping a leading "www."), never by
 * registrable domain: www1.picturehouses.com is an old mirror of the chain's
 * site and must not pass as picturehouses.com.
 */

const stripWww = (host) => host.toLowerCase().replace(/^www\./, "");

const hostOf = (url) => stripWww(new URL(url).hostname);

/**
 * Hosts that publish a venue's own information besides the domain and url in
 * its attributes: the chain's site where the listings come from somewhere
 * else, or a help desk the chain hosts its access guides on. Keyed by venue id
 * prefix, so "everymancinema.com" covers every Everyman.
 */
const OWN_HOSTS = {
  "bfi.org.uk": ["bfi.org.uk"],
  "everymancinema.com": ["everymanmedia.freshdesk.com"],
  "olympiccinema.com": ["olympicstudios.com"],
};

/**
 * Tier 2: independent access guides and listings that publish facts about the
 * venue itself. Shown with their date on the page.
 *
 * Euan's Guide is split by path: its venue information is tier 2, its reviews
 * are tier 3 (below).
 */
const TIER_2_HOSTS = [
  "accessable.co.uk",
  "changing-places.uk",
  "accesscard.online",
  "euansguide.com",
  // Council Local Offer pages, one host per council as they're used.
  "hackneylocaloffer.co.uk",
];

/**
 * Tier 3: worth recording as the last report we found, never a published
 * status. Each entry is a host and an optional path test.
 */
const TIER_3 = [{ host: "euansguide.com", path: /\/reviews(\/|$)/ }];

const EXCLUDED_HOSTS = [
  "tagvenue.com",
  "hirespace.com",
  "tripadvisor.co.uk",
  "tripadvisor.com",
  "grokipedia.com",
  "www1.picturehouses.com",
];

/**
 * The hosts that count as the venue's own site (tier 1) for one venue.
 *
 * @param {object} attributes - The venue's attributes
 * @returns {Set<string>}
 */
function getOwnHosts(attributes) {
  const hosts = new Set([hostOf(attributes.domain), hostOf(attributes.url)]);
  for (const [prefix, extra] of Object.entries(OWN_HOSTS)) {
    if (attributes.id === prefix || attributes.id.startsWith(`${prefix}-`)) {
      extra.forEach((host) => hosts.add(stripWww(host)));
    }
  }
  return hosts;
}

/**
 * The most a source can be trusted for this venue under the policy.
 *
 * @param {string} url - The source's address
 * @param {object} attributes - The venue's attributes
 * @returns {{ tier: 1|2|3 } | { excluded: true } | { unknown: true }}
 */
function classifySource(url, attributes) {
  const parsed = new URL(url);
  const rawHost = parsed.hostname.toLowerCase();
  const host = stripWww(rawHost);

  if (EXCLUDED_HOSTS.includes(rawHost) || EXCLUDED_HOSTS.includes(host)) {
    return { excluded: true };
  }
  if (getOwnHosts(attributes).has(host)) return { tier: 1 };
  if (
    TIER_3.some(
      (rule) =>
        rule.host === host && (!rule.path || rule.path.test(parsed.pathname)),
    )
  ) {
    return { tier: 3 };
  }
  if (TIER_2_HOSTS.includes(host)) return { tier: 2 };
  return { unknown: true };
}

/**
 * Why a source can't be used at the tier it was given, or null if it can.
 *
 * A source may be declared less trusted than the policy allows - a researcher
 * who used a Euan's Guide venue page for something only its reviews said is
 * right to call it tier 3 - but never more.
 *
 * @param {string} url - The source's address
 * @param {number} declaredTier - The tier the record gives it
 * @param {object} attributes - The venue's attributes
 * @returns {string|null}
 */
function checkSourceTier(url, declaredTier, attributes) {
  const result = classifySource(url, attributes);
  if (result.excluded) return `${hostOf(url)} is an excluded source`;
  if (result.unknown) {
    return `${hostOf(url)} isn't in the source policy; add it to common/accessibility/source-policy.js before using it`;
  }
  if (declaredTier < result.tier) {
    return `${hostOf(url)} is tier ${result.tier} at most, not tier ${declaredTier}`;
  }
  return null;
}

module.exports = {
  classifySource,
  checkSourceTier,
  getOwnHosts,
  hostOf,
};
