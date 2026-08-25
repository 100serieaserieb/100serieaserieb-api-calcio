const {
  getCompetition
} = require("../lib/competitions");

const {
  getScoreboard
} = require("../lib/espn");

const {
  normalizeTeamName
} = require("../lib/teams");

const { DateTime } = require("luxon");

function formatMatch(event, competition) {
  const competitionInfo = event.competitions?.[0];

  if (!competitionInfo) {
    return null;
  }

  const homeTeam = competitionInfo.competitors?.find(
    team => team.homeAway === "home"
  );

  const awayTeam = competitionInfo.competitors?.find(
    team => team.homeAway === "away"
  );

  if (!homeTeam || !awayTeam) {
    return null;
  }

  const dateTime = DateTime.fromISO(event.date, {
    zone: "utc"
  }).setZone("Europe/Rome");

  const isStarted =
    event.status?.type?.state !== "pre";

  return {
    id: event.id,

    date: dateTime.toFormat("dd/MM/yyyy"),

    time: dateTime.toFormat("HH:mm"),

    timezone: "Europe/Rome",

    competition: {
      id: competition.id,
      name: competition.name
    },

    home: {
      name: normalizeTeamName(homeTeam.team?.displayName),
      score: isStarted ? (homeTeam.score ?? "-") : "-",
      logo: homeTeam.team?.logo || null
    },

    away: {
      name: normalizeTeamName(awayTeam.team?.displayName),
      score: isStarted ? (awayTeam.score ?? "-") : "-",
      logo: awayTeam.team?.logo || null
    },

    status: {
      state: event.status?.type?.state || null,
      name: event.status?.type?.name || null,
      description: event.status?.type?.description || null,
      detail: event.status?.type?.detail || null,
      clock: event.status?.displayClock
        ? `${event.status.displayClock}`
        : null,
      completed: event.status?.type?.completed || false
    }
  };
}

module.exports = async (req, res) => {
  try {
    const competitionId = req.query.competition;

    if (!competitionId) {
      return res.status(400).json({
        success: false,
        error: "Parametro competition obbligatorio"
      });
    }

    const competition = getCompetition(competitionId);

    if (!competition) {
      return res.status(404).json({
        success: false,
        error: "Competizione non trovata"
      });
    }

    if (!competition.espnLeague) {
      return res.status(400).json({
        success: false,
        error: "Codice ESPN della competizione non ancora configurato"
      });
    }

    const scoreboard = await getScoreboard(
      competition.espnLeague
    );

    const matches = (scoreboard.events || [])
      .map(event => formatMatch(event, competition))
      .filter(Boolean);

    return res.status(200).json({
      success: true,
      source: "ESPN",
      timezone: "Europe/Rome",
      league: competition.espnLeague,
      count: matches.length,
      matches
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
