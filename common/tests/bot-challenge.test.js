const {
  classifyFetchResponse,
  classifyPageRequest,
  classifyPlaywrightResponse,
  describeClassification,
  isBotChallengeFetchResponse,
  isSiteGroundChallengeFetchResponse,
} = require("../bot-challenge");

// SiteGround's challenge as stanleyarts.org served it: a 202, so `ok`, with a
// meta refresh to the captcha in place of the page.
const siteGroundChallenge = () =>
  new Response(
    '<html><head><meta http-equiv="refresh" content="0;/.well-known/sgcaptcha/?r=%2F"></meta></head></html>',
    { status: 202, headers: { "sg-captcha": "challenge" } },
  );

describe("isSiteGroundChallengeFetchResponse", () => {
  it("recognises a SiteGround challenge, which fetch counts as ok", () => {
    const response = siteGroundChallenge();
    expect(response.ok).toBe(true);
    expect(isSiteGroundChallengeFetchResponse(response)).toBe(true);
  });

  it("does not flag an ordinary page", () => {
    expect(
      isSiteGroundChallengeFetchResponse(new Response("<html></html>")),
    ).toBe(false);
  });

  it("is not read as a Cloudflare challenge", () => {
    expect(isBotChallengeFetchResponse(siteGroundChallenge())).toBe(false);
  });

  it("copes with no response", () => {
    expect(isSiteGroundChallengeFetchResponse(undefined)).toBe(false);
  });
});

describe("classifyFetchResponse", () => {
  const classify = (status, body, headers = {}) =>
    classifyFetchResponse(new Response(body, { status, headers }), body);

  it.each([
    ["cf-mitigated", "challenge", "cloudflare"],
    ["sg-captcha", "challenge", "siteground"],
    ["cdn-challenge", "true", "bunny-shield"],
  ])("trusts %s for %s", (header, value, vendor) => {
    expect(classify(403, "", { [header]: value })).toEqual({
      kind: "challenge",
      vendor,
      via: header,
      status: 403,
    });
  });

  it("recognises a SiteGround challenge even though it is a 202", () => {
    expect(classify(202, "", { "sg-captcha": "challenge" })).toMatchObject({
      vendor: "siteground",
      status: 202,
    });
  });

  it("falls back on the challenge copy of a refused page", () => {
    expect(classify(403, "<title>Just a moment...</title>")).toEqual({
      kind: "challenge",
      vendor: null,
      via: "response-text",
      status: 403,
    });
  });

  // Cloudflare's block page carries "Attention Required" too.
  it("reads a block page as a block, not a challenge", () => {
    expect(
      classify(
        403,
        "<title>Attention Required! | Cloudflare</title> Sorry, you have been blocked",
      ),
    ).toMatchObject({ kind: "block", via: "response-text" });
  });

  it("never judges a good page on its text", () => {
    expect(classify(200, "<h1>Just a Moment (2026)</h1>")).toBeNull();
  });

  it("does not flag an ordinary error", () => {
    expect(classify(404, "Not found")).toBeNull();
  });

  it("copes with a response whose body was not read", () => {
    expect(classify(403, undefined)).toBeNull();
  });
});

describe("classifyPlaywrightResponse", () => {
  const playwrightResponse = (status, headers = {}) => ({
    status: () => status,
    headers: () => headers,
  });

  it("trusts cf-mitigated on a navigation response", () => {
    expect(
      classifyPlaywrightResponse(
        playwrightResponse(403, { "cf-mitigated": "challenge" }),
        "",
      ),
    ).toMatchObject({ kind: "challenge", vendor: "cloudflare" });
  });

  it("falls back on the page text when there was no response", () => {
    expect(
      classifyPlaywrightResponse(null, "<title>Just a moment...</title>"),
    ).toMatchObject({ kind: "challenge", via: "response-text", status: 0 });
  });
});

describe("classifyPageRequest", () => {
  it("reads the headers a call from inside a page hands back", () => {
    expect(
      classifyPageRequest({
        status: 403,
        headers: { "cdn-challenge": "true" },
        body: "",
      }),
    ).toMatchObject({ vendor: "bunny-shield" });
  });
});

describe("describeClassification", () => {
  it("names the kind, vendor, signal and status", () => {
    expect(
      describeClassification({
        kind: "challenge",
        vendor: "cloudflare",
        via: "cf-mitigated",
        status: 403,
      }),
    ).toBe("403 challenge (cloudflare, via cf-mitigated)");
  });

  it("says when the vendor is unknown", () => {
    expect(
      describeClassification({
        kind: "block",
        vendor: null,
        via: "response-text",
        status: 403,
      }),
    ).toBe("403 block (unknown vendor, via response-text)");
  });
});
