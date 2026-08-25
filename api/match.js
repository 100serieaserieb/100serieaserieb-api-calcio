const { getCompetition } = require("../lib/competitions");
const { getMatchSummary } = require("../lib/espn");
const { normalizeTeamName } = require("../lib/teams");
const { DateTime } = require("luxon");

function getRomeDateTime(date) {
  if (!date) return null;

  const parsed = DateTime.fromISO(date, {
    zone: "utc"
  });

  if (!parsed.isValid) return null;

  return parsed.setZone("Europe/Rome");
}

function getCompetitor(competitors, side) {
  if (!Array.isArray(competitors)) return null;

  return competitors.find(
    item => item.homeAway === side
  ) || null;
}

function getEventType(event) {
  if (!event) return "";

  if (typeof event.type === "string") {
    return event.type;
  }

  if (event.type && typeof event.type === "object") {
    return (
      event.type.text ||
      event.type.name ||
      event.type.id ||
      ""
    );
  }

  return "";
}

function getPlayerFromText(text) {
  if (!text) return null;

  const match = text.match(
    /^([^(]+)\s*\(/
  );

  if (!match) return null;

  return match[1].trim();
}

function getAssistFromText(text) {
  if (!text) return null;

  const match = text.match(
    /Assisted by ([^.]+?)(?:\s+with|\s+following|\.|$)/
  );

  return match ? match[1].trim() : null;
}

function parseEvent(event) {
  if (!event) return null;

  const type = getEventType(event);
  const text =
    typeof event.text === "string"
      ? event.text
      : "";

  const lowerType =
    type.toLowerCase();

  const result = {
    id: event.id || null,
    type: type || null,
    minute: event.clock || null,
    team:
      typeof event.team === "string"
        ? normalizeTeamName(event.team)
        : event.team?.displayName
          ? normalizeTeamName(
              event.team.displayName
            )
          : null,
    player: null,
    assist: null,
    text: text || null
  };

  if (lowerType.includes("goal")) {
    result.player =
      getPlayerFromText(text);

    result.assist =
      getAssistFromText(text);

    return result;
  }

  if (lowerType.includes("yellow")) {
    result.player =
      getPlayerFromText(text);

    return result;
  }

  if (lowerType.includes("red")) {
    result.player =
      getPlayerFromText(text);

    return result;
  }

  return result;
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
          "Codice ESPN non configurato"
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

    const date =
      header.date ||
      competitionInfo?.date ||
      null;

    const dateTime =
      getRomeDateTime(date);

    const homeLogo =
      home?.team?.logos?.[0]?.href ||
      home?.team?.logo ||
      null;

    const awayLogo =
      away?.team?.logos?.[0]?.href ||
      away?.team?.logo ||
      null;

    const rawEvents = [
      ...(Array.isArray(summary.keyEvents)
        ? summary.keyEvents
        : []),
      ...(Array.isArray(summary.plays)
        ? summary.plays
        : [])
    ];

    const events =
      rawEvents
        .map(parseEvent)
        .filter(Boolean);

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
            home?.team?.displayName
              ? normalizeTeamName(
                  home.team.displayName
                )
              : null,

          score:
            home?.score ?? "-",

          logo:
            homeLogo
        },

        away: {
          name:
            away?.team?.displayName
              ? normalizeTeamName(
                  away.team.displayName
                )
              : null,

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
              ?.state || null,

          name:
            competitionInfo
              ?.status
              ?.type
              ?.name || null,

          description:
            competitionInfo
              ?.status
              ?.type
              ?.description || null,

          detail:
            competitionInfo
              ?.status
              ?.type
              ?.detail || null,

          clock:
            competitionInfo
              ?.status
              ?.displayClock || null,

          completed:
            competitionInfo
              ?.status
              ?.type
              ?.completed || false
        }
      },

      events,

      lineups: null
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
