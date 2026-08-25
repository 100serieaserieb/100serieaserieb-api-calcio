const ESPN_BASE_URL =
  "https://site.api.espn.com/apis/site/v2/sports/soccer";

async function fetchESPN(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "100SerieASerieB-API/1.0",
    },
  });

  const text =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `ESPN error ${response.status}: ${text.slice(0, 300)}`
    );
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      "ESPN ha restituito una risposta non JSON."
    );
  }
}

async function getScoreboard(
  league,
  date = null
) {
  let url =
    `${ESPN_BASE_URL}/${encodeURIComponent(
      league
    )}/scoreboard`;

  if (date) {
    url +=
      `?dates=${encodeURIComponent(
        String(date).replace(/-/g, "")
      )}`;
  }

  return fetchESPN(url);
}

async function getMatchSummary(
  league,
  eventId
) {
  if (!league || !eventId) {
    throw new Error(
      "League o eventId mancanti."
    );
  }

  const url =
    `${ESPN_BASE_URL}/${encodeURIComponent(
      league
    )}/summary?event=${encodeURIComponent(
      eventId
    )}`;

  return fetchESPN(url);
}

module.exports = {
  getScoreboard,
  getMatchSummary,
};
