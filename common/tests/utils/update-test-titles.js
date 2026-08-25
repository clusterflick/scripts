const fs = require("fs");
const path = require("path");
const normalizeTitle = require("../../normalize-title");
const { isNonFilmEvent } = require("../../is-non-film-event");
const { isPrivateHire, isOnline } = require("../../utils");

// The pipeline drops these before a title ever reaches a listing, so a title
// the matchers reject is not one normalisation has to get right. Applied to the
// existing entries too, otherwise a title added before its matcher existed
// would be carried forward for ever.
const isNormalizableTitle = (title) =>
  !isNonFilmEvent({ title }) && !isPrivateHire(title) && !isOnline(title);

const titles = new Set();

const existingDataPath = path.join(__dirname, "..", "test-titles.json");
JSON.parse(fs.readFileSync(existingDataPath, "utf8")).forEach(
  ({ input: title }) => {
    if (!isNormalizableTitle(title)) return;
    titles.add(title);
  },
);

const newDataPath = path.join(__dirname, "..", "..", "..", "transformed-data");
const files = fs.readdirSync(newDataPath);
files.forEach((file) => {
  const filePath = path.join(newDataPath, file);
  JSON.parse(fs.readFileSync(filePath, "utf8")).forEach(({ title }) => {
    if (!isNormalizableTitle(title)) return;
    titles.add(title);
  });
});

const updatedData = Array.from(titles).map((title) => ({
  input: title,
  output: normalizeTitle(title),
}));
const updatedContent = `${JSON.stringify(updatedData, null, 2)}\n`;
fs.writeFileSync(existingDataPath, updatedContent);
