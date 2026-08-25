const BASE_URL =
  "https://site.api.espn.com/apis/site/v2/sports/soccer";

async function fetchESPN(league, resource, params = {}) {
  const url = new URL(`${BASE_URL}/${league}/${resource}`);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `ESPN API error: ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}

async function getScoreboard(league, date = null) {
  const params = {};

  if (date) {
    params.dates = date;
  }

  return fetchESPN(league, "scoreboard", params);
}

async function getMatchSummary(league, eventId) {
  return fetchESPN(league, "summary", {
    event: eventId
  });
}

module.exports = {
  fetchESPN,
  getScoreboard,
  getMatchSummary
};
