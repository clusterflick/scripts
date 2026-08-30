const crypto = require("crypto");

/**
 * Generates a signature for the API request
 * @param {Object} body - The request body object
 * @param {string} apiKey - The API key
 * @param {string} timestamp - Unix timestamp as string
 * @returns {string} The HMAC-SHA256 signature in hex format
 */
function generateSignature(body, apiKey, timestamp) {
  // Parse and sort the body object by keys
  const sortedBody = Object.keys(body)
    .sort()
    .reduce((result, key) => {
      result[key] = body[key];
      return result;
    }, {});

  // Convert to JSON string and remove special characters
  let dataString = JSON.stringify(sortedBody);

  // Remove special characters (matching the original regex)
  dataString = dataString.replace(
    /[áéíóúüñ¿¡ÁÉÍÓÚÜÑāčēģīķļņšūžĀČĒĢĪĶĻŅŠŪŽ£€ğĞ]/g,
    "",
  );

  // Create HMAC key by concatenating apiKey and timestamp
  const hmacKey = apiKey + timestamp;

  // Generate HMAC-SHA256 signature
  const hmac = crypto.createHmac("sha256", hmacKey);
  hmac.update(dataString);
  const signature = hmac.digest("hex");

  return signature;
}

/**
 * Builds the signed POST options for an API call. Shared with the health probe,
 * which makes the same calls through `probeJson` rather than `fetch` and would
 * otherwise be a second place for the signing scheme to drift.
 * @param {string} apiKey - The API key
 * @param {Object} body - The request body object
 * @param {Object} headers - Additional headers
 * @returns {Object} Fetch options
 */
function signedPostOptions(apiKey, body, headers = {}) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  return {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
      signature: generateSignature(body, apiKey, timestamp),
      timestamp,
    },
    body: JSON.stringify(body),
  };
}

// The endpoint every widget call goes to, whatever the widget.
const apiUrlFor = (apiDomain) => `${apiDomain}/api_v3/cms_widget/index`;

// The calendar's list of dates on sale, and the list of films on sale
// independent of any date. Shared for the same reason the signing is: the probe
// makes both of these calls and a widget id drifting apart between the two
// callers would be silent.
const getDatesQueryBody = (cinema_location_id, url_key = "") => ({
  api: "dates",
  sales_channel_id: 1,
  cinema_location_id,
  page_number: "1",
  url_key,
  widget_id: "movie_calendar",
  calendar_date_picker_option: "1",
});

const getNowShowingQueryBody = (cinema_location_id) => ({
  api: "list",
  sales_channel_id: 1,
  cinema_location_id,
  widget_id: "now_showing_list",
  has_limit: 0,
  per_page: 100,
  page_number: 1,
  url_key: "",
});

const getDatesFrom = (page) =>
  (page.data?.dates ?? []).map(({ session_start_date }) => session_start_date);

/**
 * Makes a signed API request
 * @param {string} endpoint - API endpoint (without base URL)
 * @param {Object} options - Request options
 * @returns {Promise<Object>} API response
 */
async function fetchSignedJson(apiKey, url, body, options = {}) {
  const fetchOptions = {
    ...signedPostOptions(apiKey, body, options.headers),
    ...options,
  };

  try {
    const response = await fetch(url, fetchOptions);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Request failed");
    }

    return data;
  } catch (error) {
    console.error("API request error:", error);
    throw error;
  }
}

module.exports = {
  fetchSignedJson,
  signedPostOptions,
  apiUrlFor,
  getDatesQueryBody,
  getNowShowingQueryBody,
  getDatesFrom,
};
