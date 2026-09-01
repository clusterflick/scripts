const attributes = require("./attributes");
const savoySystemsTransform = require("../../common/savoysystems.co.uk/transform");

// PP (Pink Palace), CM (Classic Matinee) and RF name programme strands rather
// than anything about access, so they are left unmapped.
const tags = {
  hardOfHearing: ["HoH"],
  babyFriendly: ["FF", "CB"], // Family Flicks, Carers + Baby
  relaxed: ["RS"],
  notes: {
    QA: "This screening will be followed by a Q&A",
    SP: "Special Event",
    NoAds: "No Ads or Trailers",
  },
};

async function transform(data, sourcedEvents) {
  return savoySystemsTransform(
    attributes,
    { urlSlug: "Rio.dll", tags },
    data,
    sourcedEvents,
  );
}

module.exports = transform;
