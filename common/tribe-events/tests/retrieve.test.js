const { retrievePaginatedListView } = require("../retrieve");

const domain = "https://venue.example";
const initialPageUrl = `${domain}/events/list/`;
const buildParams = (page, { tvn1 }) =>
  `u=%2Fevents%2Flist%2Fpage%2F${page}%2F&tvn1=${tvn1}`;

const listingPage = `<html><body><script data-js='tribe-events-view-nonce-data' type='application/json'>{"tvn1":"abc","tvn2":""}</script></body></html>`;
const view = (html) => JSON.stringify({ html });
const withEvents = view(`<script type="application/ld+json">[]</script>`);
const empty = view("<p>No events</p>");

const served = (body, { status = 200, headers = {} } = {}) =>
  new Response(body, { status, headers });

// What SiteGround serves in place of the page: a 202 - which `fetch` counts as
// ok - carrying a meta refresh to its captcha. Trimmed from the response
// stanleyarts.org gave a plain request on 2026-10-09.
const challenge = () =>
  served(
    `<html><head><meta http-equiv="refresh" content="0;/.well-known/sgcaptcha/?r=%2Fevents%2Flist%2F"></meta></head></html>`,
    { status: 202, headers: { "sg-captcha": "challenge" } },
  );

describe("retrievePaginatedListView", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("walks the list view until a page has no events", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(served(listingPage))
      .mockResolvedValueOnce(served(withEvents))
      .mockResolvedValueOnce(served(withEvents))
      .mockResolvedValueOnce(served(empty));

    const { movieListPages } = await retrievePaginatedListView({
      domain,
      initialPageUrl,
      buildParams,
    });

    expect(movieListPages).toHaveLength(2);
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      `${domain}/wp-json/tribe/views/v2/html?u=%2Fevents%2Flist%2Fpage%2F1%2F&tvn1=abc`,
      {},
    );
  });

  it("names a SiteGround challenge on the listing page rather than a missing nonce", async () => {
    global.fetch = jest.fn().mockResolvedValue(challenge());

    const error = await retrievePaginatedListView({
      domain,
      initialPageUrl,
      buildParams,
    }).catch((e) => e);

    expect(error.message).toBe(
      `Failed to fetch ${initialPageUrl} - 202  (SiteGround bot challenge)`,
    );
    expect(error.siteGroundChallenge).toBe(true);
  });

  it("names a SiteGround challenge on a view request", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(served(listingPage))
      .mockResolvedValueOnce(challenge());

    await expect(
      retrievePaginatedListView({ domain, initialPageUrl, buildParams }),
    ).rejects.toMatchObject({ siteGroundChallenge: true });
  });

  it("fails on any other refusal without marking it a challenge", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(served("Not found", { status: 404 }));

    const error = await retrievePaginatedListView({
      domain,
      initialPageUrl,
      buildParams,
    }).catch((e) => e);

    expect(error.status).toBe(404);
    expect(error.siteGroundChallenge).toBeUndefined();
  });

  it("makes every request through the transport it is given", async () => {
    const transport = {
      text: jest
        .fn()
        .mockResolvedValueOnce(listingPage)
        .mockResolvedValueOnce(withEvents)
        .mockResolvedValueOnce(empty),
    };
    global.fetch = jest.fn();

    const { movieListPages } = await retrievePaginatedListView({
      domain,
      initialPageUrl,
      buildParams,
      transport,
    });

    expect(movieListPages).toHaveLength(1);
    expect(transport.text).toHaveBeenCalledTimes(3);
    expect(transport.text).toHaveBeenNthCalledWith(1, initialPageUrl);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
