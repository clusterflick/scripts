const { fetchJson } = require("../../common/utils");

// The public client key the app ships with
const API_KEY = "AIzaSyCnDGb3qAdjEjHcsjHYo2MaJ7WqAJxurNo";
const DATABASE = "projects/cinebur-ltd/databases/(default)";
const BASE_URL = `https://firestore.googleapis.com/v1/${DATABASE}/documents`;

const PAGE_SIZE = 300;

// Firestore types every value - { stringValue: "..." }, { mapValue: {...} } -
// so unwrap them into plain JSON before anything else sees them.
const decodeValue = (value) => {
  const [[type, inner]] = Object.entries(value);
  if (type === "mapValue") return decodeFields(inner.fields);
  if (type === "arrayValue") return (inner.values ?? []).map(decodeValue);
  if (type === "integerValue") return Number(inner);
  if (type === "nullValue") return null;
  return inner;
};

const decodeFields = (fields = {}) =>
  Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]),
  );

// "projects/.../documents/films/abc" -> "films/abc"
const documentPath = (reference) => reference.split("/documents/")[1];

const toRecord = (document) => ({
  path: documentPath(document.name),
  ...decodeFields(document.fields),
});

/**
 * Every document in a collection, with only the named fields.
 *
 * The mask is not an optimisation. Cinebur's rules give a signed-in user far
 * more than listings - hosts' phone numbers and balances, film fees, screening
 * room passwords - and naming the fields keeps the rest from ever being sent.
 */
async function listDocuments(idToken, collection, fields) {
  const documents = [];
  let pageToken;
  do {
    const params = new URLSearchParams({ pageSize: PAGE_SIZE });
    fields.forEach((field) => params.append("mask.fieldPaths", field));
    if (pageToken) params.set("pageToken", pageToken);

    const response = await fetchJson(`${BASE_URL}/${collection}?${params}`, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    documents.push(...(response.documents ?? []).map(toRecord));
    pageToken = response.nextPageToken;
  } while (pageToken);
  return documents;
}

/**
 * Named documents, keyed by path, with only the named fields. Throws for a
 * reference that leads nowhere rather than leaving a hole in the data.
 */
async function getDocuments(idToken, paths, fields) {
  if (paths.length === 0) return {};

  const response = await fetchJson(`${BASE_URL}:batchGet`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      documents: paths.map((path) => `${DATABASE}/documents/${path}`),
      mask: { fieldPaths: fields },
    }),
  });

  const missing = response.filter(({ missing }) => missing);
  if (missing.length > 0) {
    throw new Error(
      `Cinebur references documents that don't exist: ${missing.map(({ missing }) => documentPath(missing)).join(", ")}`,
    );
  }

  return Object.fromEntries(
    response.map(({ found }) => [documentPath(found.name), toRecord(found)]),
  );
}

module.exports = { API_KEY, documentPath, listDocuments, getDocuments };
