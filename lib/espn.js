const ESPN_BASE_URL =
  "https://site.api.espn.com/apis/site/v2/sports/soccer";

async function fetchESPN(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `ESPN error ${response.status}: ${response.statusText}`
    );
  }

  return response.json();
}

async function getScoreboard(league, date = null) {
  let url =
    `${ESPN_BASE_URL}/${league}/scoreboard`;

  if (date) {
    url += `?dates=${date}`;
  }

  return fetchESPN(url);
}

async function getMatchSummary(league, eventId) {
  const url =
    `${ESPN_BASE_URL}/${league}/summary?event=${eventId}`;

  return fetchESPN(url);
}

module.exports = {
  getScoreboard,
  getMatchSummary
};
