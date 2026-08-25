const ESPN_BASE_URL =
  "https://site.api.espn.com/apis/site/v2/sports/soccer";

async function fetchESPN(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0",
    },
  });

  if (!response.ok) {
    throw new Error(
      `ESPN error ${response.status}: ${response.statusText}`
    );
  }

  return response.json();
}

async function getScoreboard(
  league,
  date = null
) {
  let url =
    `${ESPN_BASE_URL}/${league}/scoreboard`;

  if (date) {
    const formattedDate =
      String(date).replaceAll("-", "");

    url += `?dates=${formattedDate}`;
  }

  return fetchESPN(url);
}

async function getMatchSummary(
  league,
  eventId
) {
  const url =
    `${ESPN_BASE_URL}/${league}/summary?event=${encodeURIComponent(
      eventId
    )}`;

  return fetchESPN(url);
}

module.exports = {
  getScoreboard,
  getMatchSummary,
};
