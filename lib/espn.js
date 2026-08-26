const ESPN_BASE_URL =
  "https://site.api.espn.com/apis/site/v2/sports/soccer";

/* =========================================================
   RICHIESTA A ESPN
========================================================= */

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

/* =========================================================
   SCOREBOARD - SINGOLA DATA
========================================================= */

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

/* =========================================================
   SCOREBOARD - INTERVALLO DATE
   GIOVEDÌ → MARTEDÌ
========================================================= */

async function getScoreboardRange(
  league,
  startDate,
  endDate
) {
  const start =
    String(startDate).replaceAll("-", "");

  const end =
    String(endDate).replaceAll("-", "");

  const url =
    `${ESPN_BASE_URL}/${league}/scoreboard` +
    `?dates=${start}-${end}`;

  return fetchESPN(url);
}

/* =========================================================
   DETTAGLIO PARTITA
========================================================= */

async function getMatchSummary(
  league,
  eventId
) {
  const url =
    `${ESPN_BASE_URL}/${league}/summary` +
    `?event=${encodeURIComponent(eventId)}`;

  return fetchESPN(url);
}

/* =========================================================
   EXPORT
========================================================= */

module.exports = {
  getScoreboard,
  getScoreboardRange,
  getMatchSummary,
};
