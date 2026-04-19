import { z } from "zod";
import { getRows, appendRow } from "../googleSheets.js";
import axios from "axios";
import https from "https";

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const TAB_NAME = "Food";
const GMAPS_API_KEY = process.env.GMAPS_API_KEY;
const REFERENCE_LAT = parseFloat(process.env.REFERENCE_LAT);
const REFERENCE_LNG = parseFloat(process.env.REFERENCE_LNG);

// --- Helper Functions from skills/add_place/add.js ---

async function resolveShortLink(url) {
  return new Promise((resolve) => {
    const req = https.request(
      url,
      { method: "HEAD", headers: { "User-Agent": "Mozilla/5.0" } },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          resolveShortLink(res.headers.location).then(resolve);
        } else {
          resolve(res.headers.location || url);
        }
      }
    );
    req.on("error", () => resolve(null));
    req.end();
  });
}

function extractCoords(url) {
  if (!url) return null;
  let m = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  m = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  return null;
}

function extractPlaceName(url) {
  if (!url) return null;
  const m = url.match(/\/maps\/place\/([^\/@]+)/);
  if (!m) return null;
  return decodeURIComponent(m[1].replace(/\+/g, " "));
}

async function coordsFromPlaceName(placeName) {
  try {
    const resp = await axios.get("https://maps.googleapis.com/maps/api/geocode/json", {
      params: { address: placeName, key: GMAPS_API_KEY },
      timeout: 10000,
    });
    const result = resp.data.results?.[0];
    if (result) {
      const { lat, lng } = result.geometry.location;
      return { lat, lng };
    }
  } catch (err) {}
  return null;
}

async function getDistancesBatch(origin, destinations) {
  const url = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";
  const body = {
    origins: [{ waypoint: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } } }],
    destinations: destinations.map(({ lat, lng }) => ({
      waypoint: { location: { latLng: { latitude: lat, longitude: lng } } },
    })),
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_UNAWARE",
  };
  const resp = await axios.post(url, body, {
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GMAPS_API_KEY,
      "X-Goog-FieldMask": "originIndex,destinationIndex,distanceMeters,duration,status",
    },
    timeout: 30000,
  });
  return Array.isArray(resp.data) ? resp.data : [];
}

function parseDurationSecs(duration) {
  if (!duration) return null;
  if (typeof duration === "string") {
    const m = duration.match(/(\d+)s/);
    return m ? parseInt(m[1]) : null;
  }
  if (typeof duration === "object") {
    return duration.seconds ? parseInt(duration.seconds) : null;
  }
  return null;
}

// --- Tool Definitions ---

export const tools = {
  recommend_place: {
    description: "Fetches a list of places to eat from the tracker. Call this to give recommendations based on user preferences.",
    parameters: z.object({
      preference: z.string().optional().describe("User's preference like 'Sleman city' or 'Spicy food'"),
    }),
    execute: async () => {
      const rows = await getRows(SPREADSHEET_ID, TAB_NAME);
      // Limit to first 20 rows to avoid blowing up context window
      return rows.slice(0, 3);
    },
  },
  add_place: {
    description: "Adds a new place to the tracker using a name, city, and Google Maps link. It will automatically calculate distance and travel time.",
    parameters: z.object({
      name: z.string().describe("Name of the place"),
      city: z.string().describe("City where the place is located"),
      link: z.string().describe("Google Maps URL (supports short links)"),
    }),
    execute: async ({ name, city, link }) => {
      const fullUrl = await resolveShortLink(link);
      let c = extractCoords(fullUrl);

      if (!c) {
        const placeName = extractPlaceName(fullUrl);
        if (placeName) {
          c = await coordsFromPlaceName(placeName);
        }
      }

      let distKm = null;
      let travelMin = null;

      if (c) {
        const origin = { lat: REFERENCE_LAT, lng: REFERENCE_LNG };
        const apiResults = await getDistancesBatch(origin, [c]);
        const res = apiResults[0];
        if (res && (!res.status || res.status.code === 0)) {
          distKm = res.distanceMeters ? +(res.distanceMeters / 1000).toFixed(2) : null;
          const secs = parseDurationSecs(res.duration);
          travelMin = secs ? +(secs / 60).toFixed(1) : null;
        }
      }

      const row = [name, city, link, distKm, travelMin, ""];
      await appendRow(SPREADSHEET_ID, TAB_NAME, row);

      return { success: true, entry: { name, city, distKm, travelMin } };
    },
  },
};
