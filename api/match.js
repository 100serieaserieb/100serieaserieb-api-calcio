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
  if (!date) return null;

  const parsed = DateTime.fromISO(date, {
    zone: "utc"
  });

  if (!parsed.isValid) return null;

  return parsed.setZone("Europe/Rome");
}


function getCompetitor(competitors, side) {
  return competitors.find(
    competitor => competitor.homeAway === side
  ) || null;
}


function getPlayerName(text) {
  if (!text) return null;

  const match = text.match(
    /(?:Goal![^.]*\.\s*|^)([A-ZÀ-ÖØ-Ý][^.(]+)\s*\([^)]*\)/
  );

  if (!match) return null;

  return match[1].trim();
}


function getAssist(text) {
  if (!text) return null;

  const match = text.match(
    /Assisted by ([^.]+?)(?:\s+with|\s+following|\.|$)/
  );

  return match
    ? match[1].trim()
    : null;
}


function parseEvent(event) {
  if (!event) return null;

  const text = event.text || "";
  const type = event.type || "";

  const result = {
    id: event.id || null,
    type,
    minute: event.clock || null,
    team: event.team?.displayName
      ? normalizeTeamName(event.team.displayName)
      : event.team || null,
    player: null,
    assist: null,
    playerIn: null,
    playerOut: null,
    text: text || null
  };


  /*
   * GOL
   */

  if (
    type.toLowerCase().includes("goal")
  ) {
    result.player = getPlayerName(text);
    result.assist = getAssist(text);

    return result;
  }


  /*
   * CARTELLINO GIALLO
   */

  if (
    type.toLowerCase().includes("yellow")
  ) {
    const match = text.match(
      /^([^(]+)\s*\(/
    );

    result.player = match
      ? match[1].trim()
      : null;

    return result;
  }


  /*
   * CARTELLINO ROSSO
   */

  if (
    type.toLowerCase().includes("red")
  ) {
    const match = text.match(
      /^([^(]+)\s*\(/
    );

    result.player = match
      ? match[1].trim()
      : null;

    return result;
  }


  /*
   * SOSTITUZIONE
   */

  if (
    type.toLowerCase().includes("substitution")
  ) {
    const match = text.match(
      /Substitution,\s*[^.]+\.\s*(.+?)\s+replaces\s+(.+?)(?:\.|$)/
    );

    if (match) {
      result.playerIn = match[1].trim();
      result.playerOut = match[2].trim();
    }

    return result;
  }


  /*
   * ALTRI EVENTI
   */

  return result;
}


function getLineups(summary) {

  /*
   * ESPN può fornire le formazioni
   * direttamente nella proprietà lineups.
   */

  if (
    !summary ||
    !Array.isArray(summary.lineups) ||
    summary.lineups.length === 0
  ) {
    return null;
  }


  const result = [];


  for (const lineup of summary.lineups) {

    const teamName =
      lineup.team?.displayName ||
      lineup.team?.name ||
      null;

    const formation =
      lineup.formation ||
      lineup.formationName ||
      null;

    const athletes =
      lineup.roster ||
      lineup.athletes ||
      lineup.players ||
      [];


    const players = athletes
      .map(player => {

        const athlete =
          player.athlete ||
          player.player ||
          player;

        return (
          athlete.displayName ||
          athlete.fullName ||
          athlete.name ||
          null
        );

      })
      .filter(Boolean);


    result.push({
      team: teamName
        ? normalizeTeamName(teamName)
        : null,

      formation,

      players
    });
  }


  return result.length
    ? result
    : null;
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
     * DATA
     */

    const matchDate =
      header.date ||
      competitionInfo?.date ||
      null;

    const dateTime =
      getRomeDateTime(matchDate);


    /*
     * LOGHI
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
     * EVENTI ESPN
     */

    const rawEvents = [
      ...(summary.keyEvents || []),
      ...(summary.plays || [])
    ];


    const events = rawEvents
      .map(parseEvent)
      .filter(Boolean);


    /*
     * FORMAZIONI
     */

    const lineups =
      getLineups(summary);


    /*
     * RISPOSTA
     */

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
