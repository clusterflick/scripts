const attributes = require("./attributes");
const savoySystemsTransform = require("../../common/savoysystems.co.uk/transform");

// Phoenix publishes no event key, so BB, R and SU are left unmapped rather than
// guessed at - SU is set on 12 of 104 performances and looks like a subtitling
// flag, but "looks like" is not what an access claim should rest on.
const tags = {
  audioDescription: ["AD"],
  hardOfHearing: ["CC"],
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
