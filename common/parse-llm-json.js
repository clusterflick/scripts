// Shared JSON parsing + repair for LLM responses, used by every provider client.
// Models occasionally wrap JSON in a markdown block or emit malformed escapes /
// truncated fields, so we try a plain parse first and then apply targeted
// corrections before giving up.
function parseLlmJson(response) {
  // Unwrap the string if it's been wrapped in a markdown block
  const jsonString = response.replace("```json", "").replace("```", "");

  try {
    return JSON.parse(jsonString);
  } catch {
    // Fall through to apply corrections
  }

  const correctedJsonString = jsonString
    // Apply corrections for malformed escape characters (perhaps due to truncation)
    .replace(/\\(?!["\\/bfnrtu]|u[0-9a-fA-F]{4})/g, "")
    // Apply corrections for hallucinated invalid additions
    .replace(/"backdrop_path": "[^,]+,\n/i, "")
    // Fix unescaped quotes within the "reason" field value
    // Match from "reason":" to the closing quote followed by , or }
    .replace(
      /"reason"\s*:\s*"(.*)"\s*([,}])/,
      (_match, reasonContent, terminator) => {
        // Escape any unescaped internal quotes (not already escaped)
        const fixed = reasonContent.replace(/(?<!\\)"/g, '\\"');
        return `"reason":"${fixed}"${terminator}`;
      },
    );

  try {
    return JSON.parse(correctedJsonString);
  } catch (e) {
    console.log("Error parsing LLM answer");
    console.log("--- Original response: -----------------------");
    console.log(response);
    console.log("--- Corrected response: ----------------------");
    console.log(correctedJsonString);
    console.log("----------------------------------------------");
    throw e;
  }
}

module.exports = { parseLlmJson };
