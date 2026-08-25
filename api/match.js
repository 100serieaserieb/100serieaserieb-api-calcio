const {
  getCompetition
} = require("../lib/competitions");

const {
  getMatchSummary
} = require("../lib/espn");

const {
  normalizeTeamName
} = require("../lib/teams");

const { DateTime } = require("luxon");

function formatLineup(lineup) {
  if (!lineup) {
    return null;
  }

  return lineup;
}

function formatEvent(event) {
  if (!event) {
    return null;
  }

  return {
    id: event.id || null,
    type: event.type || null,
    text: event.text || null,
    clock: event.clock?.displayValue || null,
    period: event.period?.displayValue || null,
    team: event.team?.displayName
      ? normalizeTeamName(event.team.displayName)
      : null,
    athlete: event.athletes?.[0]?.displayName || null
  };
}

module.exports = async (req, res) => {
  try {
    const competitionId =
      req.query.competition;

    const eventId =
      req.query.id;

    if (!competitionId) {
      return res.status(400).json({
        success: false,
        error:
          "Parametro competition obbligatorio"
      });
    }

    if (!eventId) {
      return res.status(400).json({
        success: false,
        error:
          "Parametro id obbligatorio"
      });
    }

    const competition =
      getCompetition(competitionId);

    if (!competition) {
      return res.status(404).json({
        success: false,
        error:
          "Competizione non trovata"
      });
    }

    if (!competition.espnLeague) {
      return res.status(400).json({
        success: false,
        error:
          "Codice ESPN della competizione non configurato"
      });
    }

    const summary =
      await getMatchSummary(
        competition.espnLeague,
        eventId
      );

    const header =
      summary.header || {};

    const competitionInfo =
      header.competitions?.[0];

    const competitors =
      competitionInfo?.competitors || [];

    const home =
      competitors.find(
        team => team.homeAway === "home"
      );

    const away =
      competitors.find(
        team => team.homeAway === "away"
      );

    let dateTime = null;

    if (header.date) {
      dateTime =
        DateTime.fromISO(
          header.date,
          { zone: "utc" }
        ).setZone("Europe/Rome");
    }

    const events =
      (summary.keyEvents || [])
        .map(formatEvent)
        .filter(Boolean);

    const plays =
      (summary.plays || [])
        .map(formatEvent)
        .filter(Boolean);

    const allEvents = [
      ...events,
      ...plays
    ];

    return res.status(200).json({
      success: true,

      source: "ESPN",

      timezone: "Europe/Rome",

      competition: {
        id: competition.id,
        name: competition.name,
        espnLeague:
          competition.espnLeague
      },

      match: {
        id: eventId,

        date: dateTime
          ? dateTime.toFormat("dd/MM/yyyy")
          : null,

        time: dateTime
          ? dateTime.toFormat("HH:mm")
          : null,

        home: {
          name:
            normalizeTeamName(
              home?.team?.displayName
            ),
          score:
            home?.score ?? "-",
          logo:
            home?.team?.logo || null
        },

        away: {
          name:
            normalizeTeamName(
              away?.team?.displayName
            ),
          score:
            away?.score ?? "-",
          logo:
            away?.team?.logo || null
        },

        status: {
          state:
            competitionInfo?.status?.type
              ?.state ||
            header.competitions?.[0]
              ?.status?.type?.state ||
            null,

          name:
            competitionInfo?.status?.type
              ?.name || null,

          description:
            competitionInfo?.status?.type
              ?.description || null,

          detail:
            competitionInfo?.status?.type
              ?.detail || null,

          completed:
            competitionInfo?.status?.type
              ?.completed || false
        }
      },

      events: allEvents,

      lineups:
        summary.rosters ||
        summary.lineups ||
        null
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
