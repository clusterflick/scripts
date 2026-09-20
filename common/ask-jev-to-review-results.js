const { choice, noul, TypeSafeClient } = require("@typesafe-ai/sdk");
const { dailyLlmCache } = require("./cache");
const normalizeTitle = require("./normalize-title");
const { getId, getSearchSlug } = require("./utils");
const { recordLlmUsage } = require("./llm-usage-log");
require("dotenv").config();

// A drop-in alternative to ask-llm-to-review-results, backed by TypeSafe's Jev
// rather than an LLM. Deliberately NOT behind `callLlm`, for the same reason
// ask-jev-to-categorise is not: that contract is "system instruction + prompt
// in, parsed JSON out", and Jev's is "state + typed questions in, probability
// distributions out".
//
// The decision is "which of these TheMovieDB results is the film this listing
// is showing, if any", which is a Choice over the candidates. That is a better
// fit here than it was for categorisation, because the options are not a fixed
// taxonomy - they are the search results, and a Choice is explicitly relative:
// it settles which candidate wins, which is the question.
//
// Three differences from the LLM path that matter:
//
//  1. No self-reported confidence gate. The LLM path publishes a match on
//     `confidence >= 8`, a number the model invents about itself. Here the
//     no-match outcome is an option in the Choice (see NO_MATCH), so a listing
//     whose film is absent from the results is answered rather than
//     thresholded. Nothing in this module has a constant that had to be fitted
//     to data - which matters because there is not yet data to fit one to.
//  2. Jev cannot generate text, so there is no "reason" field. That field was
//     never consumed, but in the LLM path it did real work: the prompt makes
//     the model describe the CHOSEN result's own overview, which is what stops
//     it matching on title alone. The replacement is the per-candidate nouls
//     below, which ask that question directly instead of hoping for it.
//  3. Candidates are options, not state. The LLM path serialises the whole
//     result list into the prompt body; here each candidate is its own
//     `criteria` entry and only the listing is `state`. That is the documented
//     shape, and it keeps the state small - accuracy falls as state grows with
//     content unrelated to the decision, and the other candidates are exactly
//     that for any one of them.
//
// Every result is offered as an option, untrimmed, which for a one-word title
// means around a hundred of them - the model cannot choose a candidate it was
// not shown, and the incumbent is handed the same list, so this arm reads what
// that one reads. It is nonetheless the obvious lever: the jaggedness notes
// say to filter in code first, and ninety of those hundred are nothing like
// the listing. Trimming is a change to make for BOTH arms once the fixture can
// say what it costs, not quietly in one of them while they are being compared.

const MODEL = "jev-latest";

// The no-match option. Named rather than numbered so the label itself carries
// meaning, like every other option here.
const NO_MATCH = "none-of-these";

// Asked alongside the Choice, in the same request, and recorded rather than
// acted on. A Choice is relative and always names a winner; each noul is
// absolute and they can all be low, which is the documented way to ask "is any
// of these actually it". Both are kept so the harness can find out whether
// composing them in code beats the Choice's own no-match option - that is a
// question for measurement, not an assumption to ship. Mirrors the treatment
// of DECOMPOSED_SIGNALS in ask-jev-to-categorise.
//
// Asked only of the candidates sharing the listing's title, and capped. A
// title search returns around a hundred results, most of them nothing like
// the listing, and a noul apiece would be a hundred questions to settle a
// contest between three. The ones that share the title are the contest; the
// rest are already answered by the Choice.
const MAX_FITS_QUESTIONS = 8;

// Identified by title AND year, because the whole reason these are worth
// asking is that several candidates carry the same title - a question naming
// only the title would be asking about all of them at once.
const fitsQuestion = (result) => {
  const year = result.release_date?.slice(0, 4);
  const named = [`"${result.title}"`, year && `(${year})`]
    .filter(Boolean)
    .join(" ");
  return noul(
    `The film this cinema listing is showing is the one released as ${named}.`,
    {
      true: `The listing describes the same story, subject or event as ${named}.`,
      false: `The listing describes something else, even though ${named} carries the same title.`,
    },
  );
};

const instructions = {
  question:
    "Which of these films is the one this cinema listing is showing a screening of?",
  guidance: [
    "Judge each option by what its own overview describes. A title identical to the listing's is not by itself evidence, because several different films share a title.",
    "The listing's description is about the screening. An option matches when the film it describes is the film being screened.",
    "A film and a documentary about the making of that film are different options. The listing is showing the film unless it says otherwise.",
    "Names in the listing - a director, an actor, a character - identify the film when an option's overview or title carries the same name.",
    `Answer "${NO_MATCH}" when the film the listing describes is not among the options.`,
  ],
};

// Jev reads dates as text rather than as ordered quantities, so "1990" against
// "2025" is not a comparison it can be relied on to make. The subtraction
// happens here and each option states the result. The year is still given as
// well: it is the whole discriminator between two same-titled films, and a
// bucket like "decades ago" would collapse the two candidates it is meant to
// separate.
function describeYearGap(candidateYear, listingYear) {
  if (!candidateYear || !listingYear) return undefined;
  const gap = Number(candidateYear) - Number(listingYear);
  if (!Number.isFinite(gap)) return undefined;
  if (gap === 0) return "Released in the year the listing gives.";
  const years = Math.abs(gap) === 1 ? "year" : "years";
  return gap > 0
    ? `Released ${gap} ${years} after the year the listing gives.`
    : `Released ${Math.abs(gap)} ${years} before the year the listing gives.`;
}

const sharesTitleWith = (normalizedTitle) => (result) =>
  normalizeTitle(result.title) === normalizedTitle ||
  (!!result.original_title &&
    normalizeTitle(result.original_title) === normalizedTitle);

// A label the model can read as a name rather than as a number. Jev does
// better on semantic representations than numeric ones, and a bare
// TheMovieDB id is the latter. Code keeps the mapping back to the id.
function buildLabels(results) {
  const labels = new Map();
  const used = new Set([NO_MATCH]);

  for (const result of results) {
    const year = result.release_date?.slice(0, 4);
    const base = [getSearchSlug(result.title), year].filter(Boolean).join("-");
    // Two candidates can share a title and a year. Append the id rather than
    // dropping one: the option list has to cover every candidate, because the
    // model cannot choose one that was left out.
    const label = used.has(base) ? `${base}-${result.id}` : base;
    used.add(label);
    labels.set(label, result);
  }

  return labels;
}

function buildCriteria(labels, listingYear) {
  const criteria = {
    [NO_MATCH]: {
      what: "The film this listing is showing is not among the other options.",
      when: "No other option's overview describes the story, subject or event this listing describes - including when an option carries exactly the same title as the listing.",
    },
  };

  for (const [label, result] of labels) {
    const year = result.release_date?.slice(0, 4);
    criteria[label] = {
      title: result.title,
      ...(result.original_title &&
        result.original_title !== result.title && {
          originalTitle: result.original_title,
        }),
      ...(year && { releasedIn: year }),
      ...(describeYearGap(year, listingYear) && {
        comparedToTheListing: describeYearGap(year, listingYear),
      }),
      // An entry with no overview is still an option - leaving it out would
      // make it unchoosable - but it gets nothing to be judged on beyond its
      // title, and should lose to one that has something.
      overview: result.overview || "This entry has no description.",
    };
  }

  return criteria;
}

// Only the listing. Named fields rather than an assembled string, and empty
// ones omitted: unrelated content in the state costs accuracy.
//
// The runtime is stated, not compared. A venue's duration is often the whole
// session rather than the film, and TheMovieDB's own figure is sometimes
// wrong, so it is context for a judgement and never a rule - the same job it
// does in the LLM prompt.
//
// The venue's own title is deliberately not sent, only the normalised one, so
// this arm reads exactly what the LLM arm reads. Whether the venue's wording
// helps is worth measuring, but not at the same time as everything else.
function convertToState(movie, normalizedTitle) {
  return {
    title: normalizedTitle,
    ...(movie.overview?.year && { year: movie.overview.year }),
    ...(movie.overview?.classification && {
      classification: movie.overview.classification,
    }),
    ...(movie.overview?.duration && {
      statedRuntimeMinutes: Math.round(movie.overview.duration / 60000),
    }),
    ...(movie.matchingHints?.overview && {
      description: movie.matchingHints.overview,
    }),
  };
}

let client = null;

function getClient() {
  if (!client) {
    if (!process.env.TYPESAFE_API_KEY) {
      throw new Error(
        "TYPESAFE_API_KEY is not set - required by ask-jev-to-review-results",
      );
    }
    client = new TypeSafeClient();
  }
  return client;
}

/**
 * @param {object} movie
 * @param {object[]} results - TheMovieDB search results to choose between.
 * @param {string} normalizedTitle
 * @param {object} [options]
 * @param {boolean} [options.requireDescription] - Decline, as the LLM path
 *   does, when the listing carries no description. Kept on by default so the
 *   two arms answer the same population; the LLM needs it because without a
 *   description it invents one, which is not a failure mode Jev has. Turn it
 *   off to measure whether that guard is costing matches.
 * @returns {Promise<object>} `{ match, choice, confidence, probabilities, fits }`
 *   where `match` is the chosen result or null.
 */
module.exports = async function askJevToReviewResults(
  movie,
  results,
  normalizedTitle,
  { requireDescription = true } = {},
) {
  if (results.length === 0) return { match: null, confidence: 0 };
  if (requireDescription && !movie.matchingHints?.overview) {
    return { match: null, confidence: 0 };
  }

  const labels = buildLabels(results);
  const state = convertToState(movie, normalizedTitle);

  // Every candidate is an option; only the ones in contention get a noul.
  const contested = [...labels]
    .filter(([, result]) => sharesTitleWith(normalizedTitle)(result))
    .slice(0, MAX_FITS_QUESTIONS);

  const questions = {
    which: choice(instructions, buildCriteria(labels, movie.overview?.year)),
    ...Object.fromEntries(
      contested.map(([label, result]) => [
        `fits::${label}`,
        fitsQuestion(result),
      ]),
    ),
  };

  const cacheKey = `ask-jev-with-results-${MODEL}-${getId(JSON.stringify({ state, questions }))}`;

  let usage;

  const answers = await dailyLlmCache(cacheKey, async () => {
    console.log(` - Asking Jev to match "${movie.title}" against results`);

    const response = await getClient().systemOne({
      model: MODEL,
      state,
      questions,
    });

    usage = response.usage;
    return response.answers;
  });

  recordLlmUsage({
    cacheKeyPrefix: "ask-jev-with-results",
    provider: "typesafe",
    model: MODEL,
    cacheHit: usage === undefined,
    promptChars: JSON.stringify({ state, questions }).length,
    ...(usage && {
      promptTokens: usage.input_tokens,
      candidatesTokens: usage.output_tokens,
    }),
  });

  const { choice: label, confidence, probabilities } = answers.which;

  return {
    match: label === NO_MATCH ? null : (labels.get(label) ?? null),
    choice: label,
    confidence,
    probabilities,
    fits: Object.fromEntries(
      contested.map(([candidateLabel, result]) => [
        result.id,
        answers[`fits::${candidateLabel}`].noul,
      ]),
    ),
  };
};

module.exports.NO_MATCH = NO_MATCH;
