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
 * Makes a signed API request
 * @param {string} endpoint - API endpoint (without base URL)
 * @param {Object} options - Request options
 * @returns {Promise<Object>} API response
 */
async function fetchSignedJson(apiKey, url, body, options = {}) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = generateSignature(body, apiKey, timestamp);
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
    signature,
    timestamp,
  };

  const fetchOptions = {
    method: options.method || "POST",
    headers,
    body: JSON.stringify(body),
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
};
