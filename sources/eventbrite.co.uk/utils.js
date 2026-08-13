const { parse } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");
const { basicNormalize, sanitizeRichText } = require("../../common/utils");

function parseDate(date) {
  return parse(date, "yyyy-MM-dd'T'HH:mm", new Date(), {
    locale: enGB,
  });
}

function getEventDescription(details) {
  if (!details) return "";

  const context =
    details.components?.eventDescription || details.props?.pageProps?.context;

  // Bail if we can't traverse down to get the right context data
  if (!context || context === details) return "";

  return (
    context.structuredContent?.modules
      .filter(({ type }) => basicNormalize(type) === "text")
      .map(({ text }) => sanitizeRichText(text))
      .join("\n\n")
      .replace(/\n\n+/gi, "\n\n") || ""
  );
}

module.exports = {
  parseDate,
  getEventDescription,
};
