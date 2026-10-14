const Ajv = require("ajv");
const addFormats = require("ajv-formats");
const { getAllCinemaAttributes } = require("../../cinemas");

// The file is written by hand, so it is checked strictly: a field that is
// misspelt or out of place is an error, not something to quietly ignore.
const schema = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["name", "url", "events"],
    properties: {
      name: { type: "string", minLength: 1 },
      url: { type: "string", format: "uri" },
      events: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "title", "venue", "start", "url"],
          properties: {
            // Becomes the showingId, so it has to stay the same if the event
            // is edited - date the id rather than numbering it.
            id: { type: "string", minLength: 1 },
            // The whole title the festival displays, as for any transform.
            title: { type: "string", minLength: 1 },
            // The id of the venue in cinemas/ - written by hand, so there is
            // no need to match on name and location the way scraped sources do.
            venue: { type: "string", minLength: 1 },
            // London local time with no offset, as the festival prints it.
            start: {
              type: "string",
              pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$",
            },
            url: { type: "string", format: "uri" },
            description: { type: "string", minLength: 1 },
            notes: { type: "string", minLength: 1 },
            // Each film on the bill, for a programme of shorts or a double
            // bill - what the shorts and multiple-movies stages read.
            films: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["title"],
                properties: {
                  title: { type: "string", minLength: 1 },
                  directors: {
                    type: "array",
                    items: { type: "string", minLength: 1 },
                  },
                  year: { type: "integer", minimum: 1880, maximum: 2100 },
                },
              },
            },
          },
        },
      },
    },
  },
};

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile(schema);

function validateFestivals(festivals) {
  if (!validate(festivals)) {
    throw new Error("Hosted festivals file does not match its schema", {
      cause: validate.errors,
    });
  }

  const venueIds = new Set(getAllCinemaAttributes().map(({ id }) => id));

  const eventIds = new Set();
  for (const festival of festivals) {
    for (const event of festival.events) {
      if (eventIds.has(event.id)) {
        throw new Error(
          `Hosted festivals file repeats the event id "${event.id}"`,
        );
      }
      eventIds.add(event.id);

      if (!venueIds.has(event.venue)) {
        throw new Error(
          `Hosted festivals event "${event.id}" names an unknown venue "${event.venue}"`,
        );
      }
    }
  }
}

module.exports = validateFestivals;
