const attributes = require("./attributes");
const savoySystemsTransform = require("../../common/savoysystems.co.uk/transform");

// Codes are from the "Event Key" ActOne publishes on its What's On page.
// Deliberately unmapped: C1 (ClassicOne Cinema) and FP (Footprints) name
// programme strands; RR (Rerelease), RS (Restoration), DB (Dubbed) and ES (EOS,
// its Exhibition On Screen strand) describe the print or the programme rather
// than access; FF is "Family Friendly" here, which is not the parent-and-baby
// screening `babyFriendly` records. Note that RS is a Restoration at ActOne and
// a Relaxed Screening at the Lexi and the Rio - the same code, a different
// meaning, which is why these maps are per venue.
const tags = {
  audioDescription: ["AD"], // Audio Described
  hardOfHearing: ["CC"], // Captions
  subtitled: ["SB"], // Subtitled
  babyFriendly: ["CB"], // Carers & Babies
  relaxed: ["SF"], // SEND Friendly
  notes: {
    QA: "This screening will be followed by a Q&A",
    NA: "No Ads or Trailers",
  },
};

async function transform(data, sourcedEvents) {
  return savoySystemsTransform(
    attributes,
    { urlSlug: "ActOneCinema.dll", tags },
    data,
    sourcedEvents,
  );
}

module.exports = transform;
