import { readFileSync, writeFileSync } from "node:fs";

// GeoNames PK.zip country dump, CC BY 4.0.
// https://www.geonames.org/export/ | https://creativecommons.org/licenses/by/4.0/
// Run with the extracted PK.txt: node scripts/generate-pakistan-cities.mjs path/to/PK.txt
const regions = new Map([
  ["02", "Balochistan"],
  ["03", "Khyber Pakhtunkhwa"],
  ["04", "Punjab"],
  ["05", "Sindh"],
  ["06", "Azad Jammu and Kashmir"],
  ["07", "Gilgit-Baltistan"],
  ["08", "Islamabad Capital Territory"],
]);
const settlements = new Map();
for (const line of readFileSync(process.argv[2], "utf8").split(/\r?\n/)) {
  const [, name, asciiName, , , , featureClass, featureCode, country, , regionCode, , , , population] = line.split("\t");
  const region = regions.get(regionCode);
  const city = (asciiName || name)?.trim();
  if (country !== "PK" || featureClass !== "P" || !region || !city ||
      ["PPLH", "PPLQ", "PPLW", "PPLX"].includes(featureCode) || city.includes(",") || city.length > 80) continue;
  const key = JSON.stringify([city, region]);
  const rank = Number(population) || 0;
  if (rank > (settlements.get(key) ?? -1)) settlements.set(key, rank);
}
const entries = [...settlements].sort(([a, aRank], [b, bRank]) => bRank - aRank || a.localeCompare(b, "en"));
const representedRegions = new Set(entries.map(([key]) => JSON.parse(key)[1]));
if (representedRegions.size !== regions.size || entries.length < 1000) {
  throw new Error("The GeoNames input is missing Pakistani populated places.");
}
writeFileSync(new URL("../src/data/pakistan-cities.json", import.meta.url),
  "[\n" + entries.map(([key]) => "  " + key).join(",\n") + "\n]\n");
console.log("Wrote " + entries.length + " distinct settlement and region pairs.");
