const { addMonths } = require("date-fns");
const {
  retrieveExperiences,
  retrieveExperienceDetail,
  retrieveAvailability,
} = require("../../common/beyonk");
const { beyonkOrganisationId } = require("./attributes");

// Beyonk serves availability one calendar month at a time and a run can sit in
// a month with nothing either side of it - the autumn puppet show has dates in
// October and November but none in September - so every month in the window is
// asked for rather than stopping at the first empty one.
const MONTHS_AHEAD = 12;

const getMonthsToCheck = () => {
  const now = new Date();
  return Array.from({ length: MONTHS_AHEAD }, (unused, offset) => {
    const month = addMonths(now, offset);
    return { year: month.getFullYear(), month: month.getMonth() + 1 };
  });
};

async function retrieve() {
  const items = await retrieveExperiences(beyonkOrganisationId);

  const experiences = {};
  for (const item of items) {
    // The shop lists groups alongside experiences; a group is a folder of
    // other experiences and has no schedule of its own
    if (item.type !== "experience") continue;

    const detail = await retrieveExperienceDetail(
      beyonkOrganisationId,
      item.id,
    );

    // Availability is refused without a ticket quantity, so any of the
    // experience's own tickets makes the request valid
    const [ticket] = detail.pricing?.tickets || [];
    if (!ticket) {
      throw new Error(
        `No tickets found for experience ${item.id} - the response shape may have changed`,
      );
    }

    const availability = [];
    for (const { year, month } of getMonthsToCheck()) {
      availability.push(
        ...(await retrieveAvailability(item.id, ticket.id, year, month)),
      );
    }

    experiences[item.id] = { detail, availability };
  }

  return { experiences };
}

module.exports = retrieve;
