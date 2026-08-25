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

function getRomeDateTime(date) {
  if (!date) {
    return null;
  }

  const parsed = DateTime.fromISO(date, {
    zone: "utc"
  });

  if (!parsed.isValid) {
    return null;
  }

  return parsed.setZone("Europe/Rome");
}

function getCompetitor(competitors, side) {
  return competitors.find(
    competitor => competitor.homeAway === side
  ) || null;
}

function formatEvent(event) {
  if (!event) {
    return null;
  }

  return {
    id: event.id || null,

    type:
      event.type?.text ||
      event.type?.id ||
      event.type ||
      null,

    text: event.text || null,

    clock:
      event.clock?.displayValue ||
      null,

    period:
      event.period?.displayValue ||
      null,

    team:
      event.team?.displayName
        ? normalizeTeamName(
            event.team.displayName
          )
        : null,

    athlete:
      event.athletes?.[0]?.displayName ||
      null
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
      header.competitions?.[0] || null;

    const competitors =
      competitionInfo?.competitors || [];

    const home =
      getCompetitor(
        competitors,
        "home"
      );

    const away =
      getCompetitor(
        competitors,
        "away"
      );

    /*
     * ESPN può fornire la data
     * in punti diversi del summary.
     */

    const matchDate =
      header.date ||
      competitionInfo?.date ||
      home?.date ||
      null;

    const dateTime =
      getRomeDateTime(matchDate);

    /*
     * Recuperiamo i loghi direttamente
     * dalla struttura ESPN.
     */

    const homeLogo =
      home?.team?.logos?.[0]?.href ||
      home?.team?.logo ||
      null;

    const awayLogo =
      away?.team?.logos?.[0]?.href ||
      away?.team?.logo ||
      null;

    /*
     * Eventi disponibili nel summary.
     */

    const rawEvents = [
      ...(summary.keyEvents || []),
      ...(summary.plays || [])
    ];

    const events =
      rawEvents
        .map(formatEvent)
        .filter(Boolean);

    /*
     * Le formazioni verranno elaborate
     * quando ESPN le rende disponibili.
     *
     * Formato finale:
     *
     * 4-3-3
     *
     * Giocatore
     * Giocatore
     * Giocatore
     */

    const lineups = null;

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
          ? dateTime.toFormat(
              "dd/MM/yyyy"
            )
          : null,

        time: dateTime
          ? dateTime.toFormat(
              "HH:mm"
            )
          : null,

        home: {
          name:
            normalizeTeamName(
              home?.team?.displayName
            ),

          score:
            home?.score ?? "-",

          logo:
            homeLogo
        },

        away: {
          name:
            normalizeTeamName(
              away?.team?.displayName
            ),

          score:
            away?.score ?? "-",

          logo:
            awayLogo
        },

        status: {
          state:
            competitionInfo
              ?.status
              ?.type
              ?.state ||
            null,

          name:
            competitionInfo
              ?.status
              ?.type
              ?.name ||
            null,

          description:
            competitionInfo
              ?.status
              ?.type
              ?.description ||
            null,

          detail:
            competitionInfo
              ?.status
              ?.type
              ?.detail ||
            null,

          clock:
            competitionInfo
              ?.status
              ?.displayClock ||
            null,

          completed:
            competitionInfo
              ?.status
              ?.type
              ?.completed ||
            false
        }
      },

      events,

      lineups
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
