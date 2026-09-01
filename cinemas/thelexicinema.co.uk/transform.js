const attributes = require("./attributes");
const savoySystemsTransform = require("../../common/savoysystems.co.uk/transform");

// Codes the Lexi does not use, or whose meaning it does not publish, are left
// out: BHS (Black History Studies), BR (Summer Nights in Brazil), LS, OC, PR,
// SL (Spotlight) and WA (Women of Almodóvar) name programme strands rather than
// anything about access.
const tags = {
  audioDescription: ["AD"],
  hardOfHearing: ["HOH"],
  subtitled: ["HOH"],
  babyFriendly: ["BF", "FF"], // Baby-Friendly Screenings, Family Fun
  relaxed: ["RS"],
  notes: {
    QA: "This screening will be followed by a Q&A",
    AS: "Accessible screening",
    TP: "Talking Pictures: A friendly film discussion group for seniors",
  },
};

async function transform(data, sourcedEvents) {
  return savoySystemsTransform(
    attributes,
    { urlSlug: "TheLexiCinema.dll", tags },
    data,
    sourcedEvents,
  );
}

module.exports = transform;
