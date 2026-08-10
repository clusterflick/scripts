const { parse } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");
const { getId } = require("../../common/utils");
const { id } = require("./attributes");

const parseDate = (dateString) => {
  const parsedDate = parse(dateString, "EEEE dd.MM.yy @ h:mm aaa", new Date(), {
    locale: enGB,
  });

  // It's unexpected to not find a parsable date, so throw
  if (isNaN(parsedDate.getTime())) throw new Error("Unable to parse date");

  return parsedDate;
};

// One cache entry per page, so a run interrupted part-way through the film
// pages resumes rather than re-fetching what it already has - which matters
// when every page costs a humanized browser load. The hash keeps the key
// unique; the trailing slug keeps the cache directory readable.
const getCacheKey = (url) => {
  const slug = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "home";
  return `${id}-${getId(url)}-${slug}`;
};

module.exports = {
  parseDate,
  getCacheKey,
};
