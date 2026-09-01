const attributes = require("./attributes");
const savoySystemsTransform = require("../../common/savoysystems.co.uk/transform");

// Phoenix publishes no event key. SU is confirmed as its subtitle flag, which
// its own listings bear out - every film carrying it is foreign-language, from
// the Almodóvar season through Mahanagar and Effi o Blaenau.
//
// BB and R stay unmapped. They are each set exactly once, on the same
// performance - "Parents & Baby Screening - The Odyssey" - so the sample is
// consistent with a baby and a relaxed flag but cannot tell which is which,
// and that screening is already read as baby-friendly from its title.
const tags = {
  audioDescription: ["AD"],
  hardOfHearing: ["CC"],
  subtitled: ["SU"],
  notes: {
    QA: "This screening will be followed by a Q&A",
  },
};

async function transform(data, sourcedEvents) {
  return savoySystemsTransform(
    attributes,
    { urlSlug: "PhoenixCinemaLondon.dll", tags },
    data,
    sourcedEvents,
  );
}

module.exports = transform;
