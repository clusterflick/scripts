const Ajv = require("ajv");
const addFormats = require("ajv-formats");
const schema = require("../../schema.json");

function validateAgainstSchema(data) {
  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  if (!validate(data)) {
    throw new Error("Error validating output data", { cause: validate.errors });
  }
}

module.exports = validateAgainstSchema;
