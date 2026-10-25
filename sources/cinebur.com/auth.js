require("dotenv").config();
const { fetchJson } = require("../../common/utils");
const { API_KEY } = require("./firestore");

/**
 * Sign in to Cinebur's Firebase project and return an ID token.
 *
 * Cinebur has no web listings - its app reads Firestore directly, and the
 * rules refuse anyone not signed in - so the source reads as a dedicated
 * account of ours. Kept in its own module so the tests can stand it in on
 * replay: the request body carries the password, and recordings are public.
 */
async function signIn() {
  const { CINEBUR_EMAIL: email, CINEBUR_PASSWORD: password } = process.env;
  if (!email || !password) {
    throw new Error(
      "CINEBUR_EMAIL and CINEBUR_PASSWORD are not set - required by the Cinebur source",
    );
  }

  const { idToken } = await fetchJson(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  return idToken;
}

module.exports = { signIn };
