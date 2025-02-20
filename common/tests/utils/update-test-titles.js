const fs = require("fs");
const path = require("path");
const normalizeTitle = require("../../normalize-title");

const titles = new Set();

const existingDataPath = path.join(__dirname, "..", "test-titles.json");
JSON.parse(fs.readFileSync(existingDataPath, "utf8")).forEach(
  ({ input: title }) => {
    titles.add(title);
  },
);

const newDataPath = path.join(__dirname, "..", "..", "..", "transformed-data");
const files = fs.readdirSync(newDataPath);
files.forEach((file) => {
  const filePath = path.join(newDataPath, file);
  JSON.parse(fs.readFileSync(filePath, "utf8")).forEach(({ title }) => {
    titles.add(title);
  });
});

const updatedData = Array.from(titles).map((title) => ({
  input: title,
  output: normalizeTitle(title),
}));
const updatedContent = JSON.stringify(updatedData, null, 2);
fs.writeFileSync(existingDataPath, updatedContent);
