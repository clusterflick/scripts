const { choice, noul, TypeSafeClient } = require("@typesafe-ai/sdk");
const { dailyLlmCache } = require("./cache");
const { getId } = require("./utils");
const { recordLlmUsage } = require("./llm-usage-log");
require("dotenv").config();

// A drop-in alternative to ask-llm-to-categorise, backed by TypeSafe's Jev
// rather than an LLM. Deliberately NOT behind `callLlm`: that contract is
// "system instruction + prompt in, parsed JSON out", and Jev's is "state +
// typed questions in, probability distributions out". Flattening the questions
// into a string to fit the existing client would throw away the distribution,
// which is the only reason to be here at all.
//
// The decision this replaces is a single Choice over the ten categories, so
// the category descriptions below are the same ones the LLM prompt carries -
// moved from prose into `criteria`, where each option gets its own entry.
//
// Two differences from the LLM path that matter:
//
//  1. Jev cannot generate text, so there is no "reason" field. That field was
//     never consumed, but it was doing real work in the LLM path - asking for
//     an explanation made the answer better. Jev has no equivalent, and the
//     replacement is decomposition: see DECOMPOSED_SIGNALS below.
//  2. `confidence` here is a calibrated 0-1 concentration of the probability
//     distribution, not a model's self-reported 0-9. The two are not
//     comparable and CONFIDENT is a placeholder until measured - see below.

const MODEL = "jev-latest";

// The LLM path gates on a self-reported `confidence > 7`, a number the prompt
// has to argue the model into producing ("score it 8 or 9 so the choice isn't
// discarded"). Jev's confidence is trained rather than asserted, so the
// threshold has to be found on our own data rather than carried across.
//
// 0.85 is a provisional value, not a calibrated one. It started at 0.9 - the
// cutoff TypeSafe's cookbook uses for classifying SEC filings - and moved once
// 11 listings showed 0.9 discarding answers worth keeping, including a film
// festival Jev called "multiple-movies" at 0.86 where the LLM had given up.
//
// Four listings is not a calibration, and the observed run-to-run jitter is
// about +/-0.05, which is the same size as the move. helpers/compare-
// categorisers.js sweeps thresholds against real listings - widen the corpus
// and let that pick the number.
const CONFIDENT = 0.85;

// Every option gets a criteria entry. Structured objects rather than bare
// strings because several categories are defined by what they exclude, and Jev
// is documented as reading negations literally - "not a comedy film screening"
// buried in a sentence is a worse signal than an explicit `excludes`.
const categoryCriteria = {
  movie: {
    description:
      "One film is the attraction. Nothing else on the bill is a film - an intro, a Q&A, a discussion or a live score does not make it a programme.",
    examples: ["A single feature screening with a director Q&A"],
  },
  "multiple-movies": {
    description:
      "Several films share the bill and at least one of them runs 80 minutes or longer.",
    examples: [
      "Double bills",
      "Marathons",
      "Trilogy days",
      "A 90-minute feature preceded by a short",
    ],
  },
  tv: {
    description:
      "Television episodes or series being screened, or material made for broadcast.",
    signals: [
      "Broadcaster names: BBC, ITV, ITN, Channel 4, Channel 5, Sky",
      "The words 'TV series', 'episode', or 'from [channel]'",
    ],
    excludes: ["A theatrical film that was later shown on television"],
  },
  shorts: {
    description:
      "Several films share the bill and none of them reaches 80 minutes, or a single film under 40 minutes shows alone. A curated programme stays shorts even when one film in it is noticeably longer than the rest, so long as that film is under 80 minutes.",
    examples: [
      "Stick Man + Superworm",
      "Oscar-nominated shorts",
      "Three films of 7, 3 and 59 minutes billed as one programme",
    ],
  },
  quiz: { description: "A quiz event." },
  comedy: {
    description: "Stand-up, an open mic, or a comedy show performed live.",
    excludes: ["A screening of a film that happens to be a comedy"],
  },
  music: {
    description:
      "A musical performance happening in the room - a live band, a DJ, an album playback, a dance event.",
    excludes: [
      "A screening of a musical film",
      "A concert film, or a relay of an opera or a ballet - the audience is watching a film, so it is a movie",
    ],
  },
  talk: {
    description: "Primarily a talk, lecture, or discussion.",
    examples: ["An evening with someone", "In conversation with someone"],
    excludes: ["A film screening that includes a Q&A - that is a movie"],
  },
  workshop: { description: "A workshop event." },
  event: {
    description:
      "A last resort for a listing with no identifiable type at all. Not a default for a listing that is merely ambiguous, and not a home for anything that fits another option above.",
  },
};

const instructions = {
  question: "What kind of event is this cinema listing?",
  guidance: [
    "Judge the primary activity of the event.",
    "A film that is discussed but not screened is a talk, not a movie.",
    "A monthly or recurring screening series shows one film per event.",
    "Multiple 'dir.' credits, or several titles each with their own year and running time, mean several films share the bill.",
    "A film under 80 minutes is not the main attraction when other films share the bill with it.",
    "A description often describes the venue's recurring strand rather than this one event, and talks about what it usually shows in the plural. Plural phrasing of that kind is not evidence that several films share this bill. Count only the films this listing actually names or numbers.",
    "Prefer the most specific option that fits over the catch-all.",
  ],
};

// The signals the LLM prompt reasons about out loud, asked directly instead.
// Jev evaluates every question in a request in parallel at no extra round trip,
// and they land on exactly the rules the jaggedness notes warn about - runtime
// arithmetic and counting - so asking each narrowly is the documented
// mitigation. Recorded rather than acted on by default: whether composing them
// in code beats the raw Choice is a question for the harness, not an
// assumption to ship. See `useDecomposedSignals`.
const DECOMPOSED_SIGNALS = {
  hasFeature: noul(
    "At least one film in this programme runs 40 minutes or longer.",
    {
      true: "A feature film is in the programme. Features typically run 80 minutes or more.",
      false:
        "Every film named runs under 40 minutes. Short films typically run 5 to 30 minutes.",
    },
  ),
  hasMultipleFeatures: noul(
    "This programme presents two or more different films that each run 40 minutes or longer.",
    {
      true: "A double bill, marathon, or several features billed together.",
      false: "One feature only, or no feature at all.",
    },
  ),
  isTelevision: noul(
    "This material was made for broadcast television rather than for cinema release.",
  ),
  isScreened: noul("A film is shown to the audience at this event.", {
    true: "A film is projected for the audience.",
    false: "A film is only discussed, referenced, or used as a theme.",
  }),
};

let client = null;

function getClient() {
  if (!client) {
    if (!process.env.TYPESAFE_API_KEY) {
      throw new Error(
        "TYPESAFE_API_KEY is not set - required by ask-jev-to-categorise",
      );
    }
    client = new TypeSafeClient();
  }
  return client;
}

// What separates "one feature" from "a programme of shorts" is how long the
// whole thing runs, and the listing usually says - but a duration is only
// useful to a model that can compare two numbers, which Jev explicitly cannot
// ("not a calculator", and better on semantic language than numeric formats).
//
// So the comparison happens here and the state carries its result as a fact
// rather than an arithmetic problem. Deliberately phrased without naming a
// category: it says how long the programme is against how long one feature
// usually is, and leaves the conclusion to the Choice.
const TYPICAL_FEATURE_MINUTES = 80;

function describeRuntime(durationMs) {
  const minutes = Math.round(durationMs / 60000);
  const comparison =
    minutes < TYPICAL_FEATURE_MINUTES
      ? `shorter than the ${TYPICAL_FEATURE_MINUTES} minutes a single feature film usually runs`
      : `as long as or longer than the ${TYPICAL_FEATURE_MINUTES} minutes a single feature film usually runs`;
  return `The whole programme runs ${minutes} minutes, ${comparison}.`;
}

// Jev takes structured state directly, so unlike convertToPrompt in
// ask-llm-to-categorise there is no string to assemble - named fields are the
// documented preference when the context has several parts. Fields are omitted
// rather than sent empty: the jaggedness notes say accuracy falls as the state
// grows with content unrelated to the decision.
function convertToState(movie) {
  return {
    title: movie.title,
    ...(movie.overview?.year && { year: movie.overview.year }),
    ...(movie.overview?.classification && {
      classification: movie.overview.classification,
    }),
    ...(movie.overview?.duration && {
      runtime: describeRuntime(movie.overview.duration),
    }),
    ...(movie.matchingHints?.overview && {
      description: movie.matchingHints.overview,
    }),
  };
}

/**
 * @param {object} movie
 * @param {object} [options]
 * @param {boolean} [options.useDecomposedSignals] - Also ask the supporting
 *   nouls. They are returned for inspection; they do not change the category.
 * @returns {Promise<object>} The movie with `category` set, and `jev` carrying
 *   the full distribution for comparison. Strip `jev` before this goes
 *   anywhere near the transform output - schema.json is additionalProperties:
 *   false and will reject it, which is the intended behaviour.
 */
async function askJevToCategorise(
  movie,
  { useDecomposedSignals = false } = {},
) {
  if (movie.category) return movie;
  if (movie.themoviedb) return { ...movie, category: "movie" };
  if (!movie.matchingHints) return { ...movie, category: "event" };

  const state = convertToState(movie);
  const questions = {
    category: choice(instructions, categoryCriteria),
    ...(useDecomposedSignals && DECOMPOSED_SIGNALS),
  };

  const cacheKey = `ask-jev-to-categorise-${MODEL}${useDecomposedSignals ? "-decomposed" : ""}-${getId(JSON.stringify({ state, questions }))}`;

  let usage;

  const answers = await dailyLlmCache(cacheKey, async () => {
    console.log(` - Asking Jev to categorise "${movie.title}"`);

    const response = await getClient().systemOne({
      model: MODEL,
      state,
      questions,
    });

    usage = response.usage;
    return response.answers;
  });

  recordLlmUsage({
    cacheKeyPrefix: "ask-jev-to-categorise",
    provider: "typesafe",
    model: MODEL,
    cacheHit: usage === undefined,
    promptChars: JSON.stringify(state).length,
    ...(usage && {
      promptTokens: usage.input_tokens,
      candidatesTokens: usage.output_tokens,
    }),
  });

  const { choice: category, confidence, probabilities } = answers.category;

  return {
    ...movie,
    category: confidence >= CONFIDENT ? category : "event",
    jev: {
      category,
      confidence,
      probabilities,
      ...(useDecomposedSignals && {
        signals: Object.fromEntries(
          Object.keys(DECOMPOSED_SIGNALS).map((key) => [
            key,
            answers[key].noul,
          ]),
        ),
      }),
    },
  };
}

module.exports = askJevToCategorise;
module.exports.CONFIDENT = CONFIDENT;
