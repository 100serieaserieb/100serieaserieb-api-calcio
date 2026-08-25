const ESPN_BASE_URL =
  "https://site.api.espn.com/apis/site/v2/sports/soccer";

async function fetchESPN(url) {
  console.log("ESPN REQUEST:", url);

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "100SerieASerieB-API/1.0"
    }
  });

  const text = await response.text();

  if (!response.ok) {
    console.error(
      "ESPN ERROR:",
      response.status,
      text
    );

    throw new Error(
      `ESPN error ${response.status}: ${response.statusText}`
    );
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      "ESPN ha restituito una risposta non JSON"
    );
  }
}

async function getScoreboard(
  league,
  date = null
) {
  let url =
    `${ESPN_BASE_URL}/${league}/scoreboard`;

  if (date) {
    const cleanDate =
      String(date)
        .replaceAll("-", "")
        .trim();

    url += `?dates=${encodeURIComponent(
      cleanDate
    )}`;
  }

  return fetchESPN(url);
}

async function getMatchSummary(
  league,
  eventId
) {
  if (!eventId) {
    throw new Error(
      "ESPN event ID mancante"
    );
  }

  const url =
    `${ESPN_BASE_URL}/${league}/summary?event=${encodeURIComponent(
      String(eventId)
    )}`;

  return fetchESPN(url);
}

module.exports = {
  getScoreboard,
  getMatchSummary
};
