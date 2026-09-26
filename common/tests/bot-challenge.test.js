const {
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
