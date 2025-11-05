const cheerio = require("cheerio");
const {
  getText,
  createOverview,
  createPerformance,
  generateShowingId,
  basicNormalize,
  getId,
} = require("../../common/utils");
const { parseDate } = require("./utils");

async function transform(attributes, { movieListPage }, sourcedEvents) {
  const $ = cheerio.load(movieListPage);

  // Find all sections that contain movie data
  // Each movie is in a section with a video-block and text-block
  const $sections = $("section.section");

  const movies = [];

  $sections.each((i, sectionEl) => {
    const $section = $(sectionEl);

    // Look for the text block that contains the movie title
    const $textBlock = $section.find(".text-block h2.heading--h3");
    if ($textBlock.length === 0) return; // Skip sections without movie titles

    const title = getText($textBlock);
    if (!title) return;

    // Get the parent text-block container for all movie details
    const $textBlockContainer = $textBlock.closest(".text-block");

    // Extract description (first paragraph after title)
    const $paragraphs = $textBlockContainer.find("p");
    const descriptionParts = [];
    let actors;
    let classification;

    $paragraphs.each((i, p) => {
      const $p = $(p);
      $p.find("br").replaceWith("\n");
      const text = getText($p);

      // Check if this paragraph contains Stars and Certification
      const starsMatch = text.match(/Stars\s+(.+?)(?:\n|$)/i);
      const certMatch = text.match(/\(Certification\s+([^)]+)\)/i);

      if (starsMatch || certMatch) {
        if (starsMatch) actors = starsMatch[1].trim();
        if (certMatch) classification = certMatch[1].trim();
      } else if (text) {
        descriptionParts.push(text);
      }
    });

    const details = descriptionParts.join("\n");

    let trailer;
    const $link = $section.find(".video-block__link");
    if ($link.length > 0) {
      const href = $link.attr("href") || "";
      const youtubeMatch = href.match(/youtube[^/]*\.com\/embed\/([^?]+)/);
      if (youtubeMatch) trailer = youtubeMatch[1];
    }

    // Find showings for this specific hotel
    const $showingLinks = $textBlockContainer.find("ul li a");
    const hotelName = basicNormalize(attributes.name)
      .replace("firmdale", "")
      .trim();

    const performances = [];
    $showingLinks.each((i, linkEl) => {
      const $link = $(linkEl);
      const linkText = getText($link);
      const url = $link.attr("href");

      // Skip performances which aren't for this venue
      if (!basicNormalize(linkText).includes(hotelName)) return;

      // Extract date from link text
      // Format: "HOTEL NAME - DAY DDth MONTH, TIME"
      const dateMatch = linkText.match(/[-–]\s*(.+)$/);
      if (dateMatch) {
        // Format date string: "SATURDAY 8TH NOVEMBER, 8PM" -> "saturday 8th november 8pm"
        const date = parseDate(basicNormalize(dateMatch[1]));
        performances.push(createPerformance({ url, date }));
      }
    });

    // Only add movie if it has showings for this hotel
    if (performances.length === 0) return;

    // Use trailer ID as primary identifier (more stable than title)
    // Fall back to normalized title if no trailer
    const id = getId(trailer || basicNormalize(title));

    movies.push({
      showingId: generateShowingId(attributes, id),
      title,
      url: `${attributes.url}#:~:text=${encodeURIComponent(title)}`,
      overview: createOverview({
        actors,
        classification,
        trailer,
      }),
      performances,
      matchingHints: { overview: details },
    });
  });

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
