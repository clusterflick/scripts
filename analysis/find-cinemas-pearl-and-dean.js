const cheerio = require("cheerio");
const { decode } = require("html-entities");
const { dailyCache } = require("../common/cache");
const { fetchText, basicNormalize } = require("../common/utils");
const { isInLondon } = require("./utils");
const { getAllCinemaAttributes } = require("../cinemas");

const pendingCinemas = [
  "Lumiere Romford",
  "The Exchange",
  "Irish Cultural Centre",
  "Pushkin House",
  "Austrian Cultural Forum",
  "Hammond Theatre",
  "The Frontline Club",
  "The Nickel",
  "Roof East Rooftop Cinema Club",
];

const closedCinemas = [
  // Independent cinemas
  "Throwley Yard Cinema",
  "Ealing Project",
  "Catford Mews",
  "Sidcup Storyteller",
  "Showcase Newham",
  "Brent Cross Drive In",
  "Deptford Cinema Telegraph Hill Centre",
  "Boleyn Cinema",
  "Kino Bermondsey",
  "Alexandra Palace Drive In",
  "Bussey Building Rooftop Cinema Club",
  // Empire
  "Empire Walthamstow",
  "Empire Haymarket",
  "Empire Sutton",
  // Picturehouses
  "Stratford Picturehouse",
  "Bromley Picturehouse",
  "Fulham Road Picturehouse",
  // Odeon
  "ODEON Covent Garden",
  "ODEON Surrey Quays",
];

const normalize = (name) =>
  name
    .replace("picturehouse – ", "")
    .replace("cineworld cinema ", "cineworld ")
    .replace("omniplex cinema ", "omniplex ")
    .replace("odeon bfi ", "bfi ")
    .replace(" – ", " ")
    .replace(" - ", " ")
    .replace("’", "'")
    .replace("'", "")
    .replace(/ ealing$/, "")
    .replace(" london", "")
    .replace(/\([^)]+\)/g, "")
    .trim();

async function findCinemasPearlAndDean() {
  const mainPage = await dailyCache(`pearlanddean-cinemas`, () =>
    fetchText("https://www.pearlanddean.com/cinemas/"),
  );
  const $ = cheerio.load(mainPage);

  const cinemaList = $("ul.cinema-map__address-list li")
    .map((i, el) => {
      const name = $(el).data("title");
      const latitude = $(el).data("latitude");
      const longitude = $(el).data("longitude");
      const url = $(el).find("a").attr("href");
      return { name, latitude, longitude, url };
    })
    .get();

  const londonCinemas = [];
  for (let { name, latitude, longitude, url } of cinemaList) {
    if (await isInLondon(latitude, longitude)) {
      londonCinemas.push({ name, latitude, longitude, url });
    }
  }

  const allCinemaAttributes = getAllCinemaAttributes();
  const knownCinemaNameMapping = allCinemaAttributes.reduce(
    (mapping, cinema) => {
      const allNames = [cinema.name, ...(cinema.alternativeNames || [])];
      allNames.forEach((name) => {
        mapping[normalize(basicNormalize(name))] = cinema;
        mapping[normalize(basicNormalize(`${name} Cinema`))] = cinema;
      });
      return mapping;
    },
    {},
  );

  const excludedCinemas = []
    .concat(pendingCinemas)
    .concat(closedCinemas)
    .reduce(
      (mapping, name) => ({ ...mapping, [basicNormalize(name)]: true }),
      {},
    );

  let count = 0;
  londonCinemas.forEach(({ name, url }) => {
    name = decode(name);
    const normalizedName = normalize(basicNormalize(name));
    const isKnown =
      !!knownCinemaNameMapping[normalizedName] ||
      !!excludedCinemas[normalizedName];
    if (!isKnown) {
      count++;
      console.log(`${count}. ${name} [${url}]`);
    }
  });
}

findCinemasPearlAndDean();
