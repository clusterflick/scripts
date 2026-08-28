const { retrieveExperienceDetail } = require("../beyonk");

const ORGANISATION_ID = "2wopiy2m";
const EXPERIENCE_ID = "ob5fifhm";

// Beyonk ships its server data as JSON inside a script tag, wrapped in a
// fetch-response envelope whose `body` is itself a JSON string
const embed = (payload) =>
  `<script type="application/json" data-sveltekit-fetched>${JSON.stringify({
    status: 200,
    statusText: "OK",
    headers: {},
    body: JSON.stringify(payload),
  })}</script>`;

const served = (body) => ({
  ok: true,
  status: 200,
  statusText: "OK",
  headers: new Headers(),
  text: async () => body,
});

const detailPage = embed({
  id: EXPERIENCE_ID,
  title: "Zero for Conduct",
  pricing: { tickets: [{ id: "tk_1", name: "Adult" }] },
});

// What the detail URL answers with once the experience has no dates on it: a
// 303 to the checkout's own error route, which `fetch` follows, so the page
// that comes back is the error page. Trimmed from the response Beyonk served
// for experience ob5fifhm on 2026-08-28, keeping the two places the route
// names itself - the layout's echo of the landed URL, and the route data.
const noSchedulesPage = `<div>We're sorry! No dates are currently scheduled for this experience.</div>
<script>
  kit.start(app, element, {
    data: [{type:"data",data:{cfg:{srcUrl:"https://checkout.beyonk.com/${ORGANISATION_ID}/form/error/no-schedules?source=portal&experience=${EXPERIENCE_ID}"}},uses:{}},{type:"data",data:{reason:"no-schedules",experience:"${EXPERIENCE_ID}"},uses:{}}]
  });
</script>`;

describe("retrieveExperienceDetail", () => {
  afterEach(() => {
    global.fetch = undefined;
  });

  it("reads the detail off an experience that is on sale", async () => {
    global.fetch = jest.fn().mockResolvedValue(served(detailPage));

    await expect(
      retrieveExperienceDetail(ORGANISATION_ID, EXPERIENCE_ID),
    ).resolves.toMatchObject({
      id: EXPERIENCE_ID,
      title: "Zero for Conduct",
    });
  });

  it("reports no detail for an experience with no dates scheduled", async () => {
    // The error page answers 200, so without this the venue's whole retrieve
    // fails on an experience whose run is simply over
    global.fetch = jest.fn().mockResolvedValue(served(noSchedulesPage));

    await expect(
      retrieveExperienceDetail(ORGANISATION_ID, EXPERIENCE_ID),
    ).resolves.toBeUndefined();
  });

  it("still fails on a detail page it can no longer read", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(served("<html><body>Tickets</body></html>"));

    await expect(
      retrieveExperienceDetail(ORGANISATION_ID, EXPERIENCE_ID),
    ).rejects.toThrow(`No detail for experience ${EXPERIENCE_ID}`);
  });
});
