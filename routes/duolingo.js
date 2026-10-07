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
      console.error("Duolingo username is not configured");
      return res.status(503).json({
        success: false,
        error: "Duolingo stats are temporarily unavailable",
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
    const user = data?.users?.[0];

    if (!user || typeof user !== "object") {
      throw new Error("Duolingo response did not contain a user");
    }

    // Return only the fields rendered by the portfolio, not the provider's
    // full profile payload.
    const publicUser = {
      id: user.id,
      name: user.name,
      username: user.username,
      streak: Number(user.streak) || 0,
      streakData: user.streakData?.currentStreak?.startDate
        ? {
            currentStreak: {
              startDate: user.streakData.currentStreak.startDate,
            },
          }
        : undefined,
      courses: Array.isArray(user.courses)
        ? user.courses.map((course) => ({
            id: String(course.id),
            learningLanguage: String(course.learningLanguage ?? ""),
            title: String(course.title ?? ""),
            xp: Number(course.xp) || 0,
          }))
        : [],
      totalXp: Number(user.totalXp) || 0,
    };
    const publicData = { users: [publicUser] };

    cachedData = publicData;
    cacheExpiresAt = now + ONE_HOUR;

    res.setHeader(
      "Cache-Control",
      "public, max-age=300, stale-while-revalidate=3600",
    );

    return res.json(publicData);
  } catch (error) {
    console.error("Duolingo API error:", error);
    next(error);
  }
});

module.exports = router;
