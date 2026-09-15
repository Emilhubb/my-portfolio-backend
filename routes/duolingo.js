const express = require("express");

const router = express.Router();

let cachedData = null;
let cacheExpiresAt = 0;

const ONE_HOUR = 60 * 60 * 1000;

router.get("/", async (req, res, next) => {
  try {
    const now = Date.now();

    if (cachedData && now < cacheExpiresAt) {
      return res.json(cachedData);
    }

    const username = process.env.DUOLINGO_USERNAME;

    if (!username) {
      return res.status(500).json({
        success: false,
        error: "DUOLINGO_USERNAME is not set",
      });
    }

    const duolingoURL = new URL(
      "https://android-api-cf.duolingo.com/2017-06-30/users",
    );

    duolingoURL.searchParams.set("username", username);

    const response = await fetch(duolingoURL, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Duolingo API status: ${response.status}`);
    }

    const data = await response.json();

    cachedData = data;
    cacheExpiresAt = now + ONE_HOUR;

    res.setHeader(
      "Cache-Control",
      "public, max-age=300, stale-while-revalidate=3600",
    );

    return res.json(data);
  } catch (error) {
    console.error("Duolingo API error:", error);
    next(error);
  }
});

module.exports = router;