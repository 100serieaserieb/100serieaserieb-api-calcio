const { getCompetition } = require("../lib/competitions");
const { getMatchSummary } = require("../lib/espn");
const { normalizeTeamName } = require("../lib/teams");
const { DateTime } = require("luxon");

/*
 * ==========================================
 * DATA / ORA
 * ==========================================
 */

function getRomeDateTime(date) {
  if (!date) return null;

  const parsed = DateTime.fromISO(date, {
    zone: "utc"
  });

  if (!parsed.isValid) return null;

  return parsed.setZone("Europe/Rome");
}

/*
 * ==========================================
 * COMPETITOR
 * ==========================================
 */

function getCompetitor(competitors, side) {
  if (!Array.isArray(competitors)) {
    return null;
  }

  return (
    competitors.find(
      item => item.homeAway === side
    ) || null
  );
}

/*
 * ==========================================
 * TRADUZIONE TESTI ESPN
 * ==========================================
 */

function translateEventType(type) {
  if (!type) return null;

  const value = String(type).toLowerCase();

  if (value.includes("goal")) {
    return "Gol";
  }

  if (value.includes("yellow")) {
    return "Cartellino giallo";
  }

  if (value.includes("red")) {
    return "Cartellino rosso";
  }

  if (value.includes("substitution")) {
    return "Sostituzione";
  }

  if (value.includes("kickoff")) {
    return "Inizio primo tempo";
  }

  if (value.includes("start 2nd")) {
    return "Inizio secondo tempo";
  }

  if (value.includes("halftime")) {
    return "Fine primo tempo";
  }

  if (value.includes("end regular")) {
    return "Fine partita";
  }

  if (value.includes("start delay")) {
    return "Interruzione";
  }

  if (value.includes("end delay")) {
    return "Ripresa del gioco";
  }

  return type;
}

function translateStatusState(state) {
  switch (state) {
    case "pre":
      return "programmata";

    case "in":
      return "in corso";

    case "post":
      return "terminata";

    default:
      return state || null;
  }
}

function translateStatusName(name) {
  switch (name) {
    case "STATUS_SCHEDULED":
      return "Partita programmata";

    case "STATUS_FULL_TIME":
      return "Partita terminata";

    case "STATUS_IN_PROGRESS":
      return "Partita in corso";

    case "STATUS_HALFTIME":
      return "Intervallo";

    case "STATUS_POSTPONED":
      return "Partita rinviata";

    case "STATUS_CANCELED":
      return "Partita annullata";

    default:
      return name || null;
  }
}

function translateStatusDescription(description) {
  switch (description) {
    case "Scheduled":
      return "Programmato";

    case "Full Time":
      return "Fine partita";

    case "In Progress":
      return "In corso";

    case "Halftime":
      return "Intervallo";

    case "Postponed":
      return "Rinviata";

    case "Canceled":
      return "Annullata";

    default:
      return description || null;
  }
}

function translateStatusDetail(detail) {
  if (!detail) return null;

  if (
    detail.startsWith("Fri,")
  ) {
    return "Venerdì alle " +
      extractTime(detail);
  }

  if (
    detail.startsWith("Sat,")
  ) {
    return "Sabato alle " +
      extractTime(detail);
  }

  if (
    detail.startsWith("Sun,")
  ) {
    return "Domenica alle " +
      extractTime(detail);
  }

  if (
    detail.startsWith("Mon,")
  ) {
    return "Lunedì alle " +
      extractTime(detail);
  }

  if (
    detail.startsWith("Tue,")
  ) {
    return "Martedì alle " +
      extractTime(detail);
  }

  if (
    detail.startsWith("Wed,")
  ) {
    return "Mercoledì alle " +
      extractTime(detail);
  }

  if (
    detail.startsWith("Thu,")
  ) {
    return "Giovedì alle " +
      extractTime(detail);
  }

  if (detail === "FT") {
    return "Fine partita";
  }

  return detail;
}

function extractTime(detail) {
  const match = detail.match(
    /at\s+(\d{1,2}:\d{2})/
  );

  return match
    ? match[1]
    : detail;
}

/*
 * ==========================================
 * EVENTI
 * ==========================================
 */

function getEventType(event) {
  if (!event) return "";

  if (typeof event.type === "string") {
    return event.type;
  }

  if (
    event.type &&
    typeof event.type === "object"
  ) {
    return (
      event.type.text ||
      event.type.name ||
      event.type.id ||
      ""
    );
  }

  return "";
}

function getEventMinute(event) {
  if (!event) return null;

  if (
    event.clock &&
    typeof event.clock === "object"
  ) {
    return (
      event.clock.displayValue ||
      null
    );
  }

  if (typeof event.clock === "string") {
    return event.clock;
  }

  return null;
}

function getEventText(event) {
  if (!event) return "";

  if (typeof event.text === "string") {
    return event.text;
  }

  return "";
}

/*
 * ==========================================
 * PLAYER / ASSIST
 * ==========================================
 */

function getPlayerFromText(text) {
  if (!text) return null;

  if (text.startsWith("Goal!")) {
    const goalMatch = text.match(
      /Goal![^.]*\.\s*([^()]+)\s*\(/
    );

    if (goalMatch) {
      return goalMatch[1].trim();
    }
  }

  const match = text.match(
    /^([^(]+)\s*\(/
  );

  if (!match) {
    return null;
  }

  return match[1].trim();
}

function getAssistFromText(text) {
  if (!text) return null;

  const match = text.match(
    /Assisted by ([^.]+?)(?:\s+with|\s+following|\.|$)/
  );

  if (!match) {
    return null;
  }

  return match[1].trim();
}

/*
 * ==========================================
 * TESTO EVENTO IN ITALIANO
 * ==========================================
 */

function buildItalianEventText(
  event,
  team,
  player,
  assist
) {
  const type = getEventType(event);
  const lowerType =
    type.toLowerCase();

  const minute =
    getEventMinute(event);

  const minuteText =
    minute
      ? `Al ${minute}`
      : "";

  if (lowerType.includes("goal")) {
    if (assist) {
      return `${minuteText}: gol di ${player} per ${team}, assist di ${assist}.`
        .trim();
    }

    return `${minuteText}: gol di ${player} per ${team}.`
      .trim();
  }

  if (lowerType.includes("yellow")) {
    return `${minuteText}: cartellino giallo per ${player} (${team}).`
      .trim();
  }

  if (lowerType.includes("red")) {
    return `${minuteText}: cartellino rosso per ${player} (${team}).`
      .trim();
  }

  if (lowerType.includes("substitution")) {
    const originalText =
      getEventText(event);

    const substitutionMatch =
      originalText.match(
        /Substitution,\s*[^.]+\.\s*(.+?) replaces (.+?)(?:\.| because|$)/i
      );

    if (substitutionMatch) {
      const incoming =
        substitutionMatch[1].trim();

      const outgoing =
        substitutionMatch[2].trim();

      return `${minuteText}: ${incoming} entra al posto di ${outgoing} per ${team}.`
        .trim();
    }

    return `${minuteText}: sostituzione per ${team}.`
      .trim();
  }

  if (lowerType.includes("kickoff")) {
    return "Inizio del primo tempo.";
  }

  if (lowerType.includes("start 2nd")) {
    return "Inizio del secondo tempo.";
  }

  if (lowerType.includes("halftime")) {
    return "Fine del primo tempo.";
  }

  if (lowerType.includes("end regular")) {
    return "Fine della partita.";
  }

  if (lowerType.includes("start delay")) {
    const originalText =
      getEventText(event);

    const injuryMatch =
      originalText.match(
        /because of an injury\s+(.+?)\s+\((.+?)\)/i
      );

    if (injuryMatch) {
      return `${minuteText}: gioco interrotto per un infortunio a ${injuryMatch[1]} (${injuryMatch[2]}).`
        .trim();
    }

    return `${minuteText}: gioco momentaneamente interrotto.`
      .trim();
  }

  if (lowerType.includes("end delay")) {
    return `${minuteText}: gioco ripreso.`
      .trim();
  }

  return null;
}

function parseEvent(event) {
  if (!event) {
    return null;
  }

  const type =
    getEventType(event);

  const originalText =
    getEventText(event);

  const lowerType =
    type.toLowerCase();

  const team =
    typeof event.team === "string"
      ? normalizeTeamName(event.team)
      : event.team?.displayName
        ? normalizeTeamName(
            event.team.displayName
          )
        : null;

  let player = null;
  let assist = null;

  if (
    lowerType.includes("goal")
  ) {
    player =
      getPlayerFromText(
        originalText
      );

    assist =
      getAssistFromText(
        originalText
      );
  }

  if (
    lowerType.includes("yellow") ||
    lowerType.includes("red")
  ) {
    player =
      getPlayerFromText(
        originalText
      );
  }

  const italianText =
    buildItalianEventText(
      event,
      team,
      player,
      assist
    );

  return {
    id:
      event.id || null,

    type:
      translateEventType(type),

    minute:
      getEventMinute(event),

    team,

    player,

    assist,

    text:
      italianText
  };
}

/*
 * ==========================================
 * FORMAZIONI
 * ==========================================
 */

/*
 * Estrae il cognome.
 *
 * Esempi:
 * "Lautaro Martínez" -> "Martínez"
 * "Nicolò Barella" -> "Barella"
 * "Rafael Leão" -> "Leão"
 *
 * Se ESPN restituisce già soltanto il cognome,
 * viene mantenuto così.
 */

function getSurname(name) {
  if (!name) return null;

  const clean =
    String(name)
      .trim()
      .replace(/\s+/g, " ");

  if (!clean) return null;

  const parts =
    clean.split(" ");

  return parts[parts.length - 1];
}

/*
 * Cerca una formazione all'interno
 * dei vari possibili formati restituiti
 * da ESPN.
 */

function findTeamLineup(
  summary,
  competitor,
  side
) {
  const teamId =
    competitor?.team?.id
      ? String(competitor.team.id)
      : null;

  const teamName =
    competitor?.team?.displayName
      ? competitor.team.displayName
      : null;

  const sources = [
    summary?.rosters,
    summary?.lineups,
    summary?.teams,
    summary?.header?.rosters,
    summary?.header?.lineups
  ];

  for (const source of sources) {
    if (!Array.isArray(source)) {
      continue;
    }

    const found =
      source.find(item => {
        const itemTeamId =
          item?.team?.id ||
          item?.teamId ||
          item?.id;

        const itemTeamName =
          item?.team?.displayName ||
          item?.team?.name ||
          item?.displayName ||
          item?.name;

        const itemSide =
          item?.homeAway ||
          item?.side;

        if (
          teamId &&
          itemTeamId &&
          String(itemTeamId) === teamId
        ) {
          return true;
        }

        if (
          teamName &&
          itemTeamName &&
          String(itemTeamName)
            .toLowerCase() ===
            String(teamName)
              .toLowerCase()
        ) {
          return true;
        }

        if (
          itemSide &&
          itemSide === side
        ) {
          return true;
        }

        return false;
      });

    if (found) {
      return found;
    }
  }

  return null;
}

/*
 * Estrae i giocatori dalla formazione.
 */

function extractLineupPlayers(lineup) {
  if (!lineup) {
    return [];
  }

  const possibleArrays = [
    lineup?.athletes,
    lineup?.players,
    lineup?.roster,
    lineup?.starters,
    lineup?.formation?.athletes
  ];

  let players = null;

  for (const array of possibleArrays) {
    if (Array.isArray(array)) {
      players = array;
      break;
    }
  }

  if (!players) {
    return [];
  }

  return players
    .map(player => {
      const name =
        player?.athlete?.displayName ||
        player?.athlete?.fullName ||
        player?.athlete?.name ||
        player?.displayName ||
        player?.fullName ||
        player?.name ||
        null;

      return getSurname(name);
    })
    .filter(Boolean);
}

/*
 * Estrae il modulo.
 */

function extractFormation(lineup) {
  if (!lineup) {
    return null;
  }

  return (
    lineup?.formation ||
    lineup?.formationText ||
    lineup?.tacticalFormation ||
    lineup?.displayFormation ||
    lineup?.formation?.displayName ||
    lineup?.formation?.text ||
    null
  );
}

/*
 * Costruisce la formazione finale.
 */

function buildLineup(
  summary,
  competitor,
  side
) {
  const lineup =
    findTeamLineup(
      summary,
      competitor,
      side
    );

  if (!lineup) {
    return null;
  }

  return {
    formation:
      extractFormation(lineup),

    players:
      extractLineupPlayers(lineup)
  };
}

/*
 * ==========================================
 * API
 * ==========================================
 */

module.exports = async (req, res) => {
  try {
    const competitionId =
      req.query.competition;

    const eventId =
      req.query.id;

    /*
     * CONTROLLO PARAMETRI
     */

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

    /*
     * COMPETIZIONE
     */

    const competition =
      getCompetition(
        competitionId
      );

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

    /*
     * RICHIESTA ESPN
     */

    const summary =
      await getMatchSummary(
        competition.espnLeague,
        eventId
      );

    /*
     * HEADER
     */

    const header =
      summary.header || {};

    const competitionInfo =
      header.competitions?.[0] ||
      null;

    const competitors =
      competitionInfo?.competitors ||
      [];

    /*
     * SQUADRE
     */

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
     * DATA E ORA
     */

    const matchDate =
      header.date ||
      competitionInfo?.date ||
      null;

    const dateTime =
      getRomeDateTime(
        matchDate
      );

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
     * ======================================
     * FORMAZIONI
     * ======================================
     */

    const homeLineup =
      buildLineup(
        summary,
        home,
        "home"
      );

    const awayLineup =
      buildLineup(
        summary,
        away,
        "away"
      );

    /*
     * ======================================
     * EVENTI
     * ======================================
     */

    const rawEvents = [
      ...(Array.isArray(
        summary.keyEvents
      )
        ? summary.keyEvents
        : []),

      ...(Array.isArray(
        summary.plays
      )
        ? summary.plays
        : [])
    ];

    const events =
      rawEvents
        .map(parseEvent)
        .filter(Boolean);

    /*
     * ======================================
     * RISPOSTA
     * ======================================
     */

    return res.status(200).json({

      success: true,

      source: "ESPN",

      timezone:
        "Europe/Rome",

      competition: {

        id:
          competition.id,

        name:
          competition.name,

        espnLeague:
          competition.espnLeague
      },

      match: {

        id:
          eventId,

        date:
          dateTime
            ? dateTime.toFormat(
                "dd/MM/yyyy"
              )
            : null,

        time:
          dateTime
            ? dateTime.toFormat(
                "HH:mm"
              )
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
            translateStatusState(
              competitionInfo
                ?.status
                ?.type
                ?.state
            ),

          name:
            translateStatusName(
              competitionInfo
                ?.status
                ?.type
                ?.name
            ),

          description:
            translateStatusDescription(
              competitionInfo
                ?.status
                ?.type
                ?.description
            ),

          detail:
            translateStatusDetail(
              competitionInfo
                ?.status
                ?.type
                ?.detail
            ),

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

      /*
       * ====================================
       * FORMAZIONI
       * ====================================
       */

      lineups: {

        home:
          homeLineup,

        away:
          awayLineup
      },

      /*
       * ====================================
       * EVENTI
       * ====================================
       */

      events

    });

  } catch (error) {

    console.error(
      "ERRORE PARTITA ESPN:",
      error
    );

    return res.status(500).json({

      success: false,

      error:
        error.message ||
        "Errore interno del server"
    });
  }
};
