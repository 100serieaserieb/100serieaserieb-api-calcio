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
 * TRADUZIONE STATI PARTITA
 */

function translateStatus(status) {
  if (!status) {
    return {
      state: null,
      name: null,
      description: null,
      detail: null
    };
  }

  const state = status.state || "";
  const name = status.name || "";
  const description = status.description || "";
  const detail = status.detail || "";

  if (
    state === "post" ||
    name.includes("FINAL") ||
    name.includes("FULL_TIME") ||
    description.includes("Final") ||
    description.includes("Full Time")
  ) {
    return {
      state: "terminata",
      name: "Partita terminata",
      description: "Fine partita",
      detail: "Fine partita"
    };
  }

  if (
    state === "in" ||
    name.includes("IN_PROGRESS") ||
    name.includes("LIVE")
  ) {
    return {
      state: "in_corso",
      name: "Partita in corso",
      description: "Partita in corso",
      detail: "Partita in corso"
    };
  }

  if (
    state === "pre" ||
    name.includes("SCHEDULED")
  ) {
    return {
      state: "programmata",
      name: "Partita programmata",
      description: "In programma",
      detail: "In programma"
    };
  }

  if (
    name.includes("POSTPONED") ||
    description.includes("Postponed")
  ) {
    return {
      state: "rinviata",
      name: "Partita rinviata",
      description: "Partita rinviata",
      detail: "Partita rinviata"
    };
  }

  if (
    name.includes("CANCELED") ||
    name.includes("CANCELLED")
  ) {
    return {
      state: "annullata",
      name: "Partita annullata",
      description: "Partita annullata",
      detail: "Partita annullata"
    };
  }

  return {
    state: state || null,
    name: name || null,
    description: description || null,
    detail: detail || null
  };
}

/*
 * TRADUZIONE TIPO EVENTO
 */

function translateEventType(type) {
  if (!type) {
    return "";
  }

  const value = type.toLowerCase();

  if (value.includes("kickoff")) {
    return "Inizio primo tempo";
  }

  if (
    value.includes("start 2nd") ||
    value.includes("second half")
  ) {
    return "Inizio secondo tempo";
  }

  if (
    value.includes("halftime") ||
    value.includes("half time")
  ) {
    return "Fine primo tempo";
  }

  if (
    value.includes("end regular") ||
    value.includes("end game") ||
    value.includes("final")
  ) {
    return "Fine partita";
  }

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

  if (value.includes("start delay")) {
    return "Interruzione";
  }

  if (value.includes("end delay")) {
    return "Ripresa del gioco";
  }

  if (value.includes("injury")) {
    return "Infortunio";
  }

  return type;
}

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

  /*
   * Alcuni eventi ESPN utilizzano direttamente
   * il campo period / clock o altri valori.
   */

  if (event.minute) {
    return event.minute;
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
 * ESTRAE IL NOME DEL GIOCATORE DAL TESTO ESPN
 */

function getPlayerFromText(text) {
  if (!text) return null;

  /*
   * GOL
   */

  if (text.startsWith("Goal!")) {
    const goalMatch = text.match(
      /Goal![^.]*\.\s*([^()]+)\s*\(/
    );

    if (goalMatch) {
      return goalMatch[1].trim();
    }
  }

  /*
   * CARTELLINI
   */

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
 * CREA TESTO EVENTO COMPLETAMENTE IN ITALIANO
 */

function createItalianEventText({
  type,
  minute,
  team,
  player,
  assist,
  originalText
}) {
  const minuteText =
    minute ? `Al ${minute}: ` : "";

  if (type === "Gol") {
    let text =
      `${minuteText}gol di ${player || "sconosciuto"}`;

    if (team) {
      text += ` per ${team}`;
    }

    if (assist) {
      text += `, assist di ${assist}`;
    }

    return `${text}.`;
  }

  if (type === "Cartellino giallo") {
    let text =
      `${minuteText}cartellino giallo`;

    if (player) {
      text += ` per ${player}`;
    }

    if (team) {
      text += ` (${team})`;
    }

    return `${text}.`;
  }

  if (type === "Cartellino rosso") {
    let text =
      `${minuteText}cartellino rosso`;

    if (player) {
      text += ` per ${player}`;
    }

    if (team) {
      text += ` (${team})`;
    }

    return `${text}.`;
  }

  if (type === "Inizio primo tempo") {
    return "Inizio del primo tempo.";
  }

  if (type === "Fine primo tempo") {
    return "Fine del primo tempo.";
  }

  if (type === "Inizio secondo tempo") {
    return "Inizio del secondo tempo.";
  }

  if (type === "Fine partita") {
    return "Fine della partita.";
  }

  if (type === "Interruzione") {
    if (player) {
      return `${minuteText}gioco interrotto per un infortunio a ${player}${team ? ` (${team})` : ""}.`;
    }

    return `${minuteText}gioco momentaneamente interrotto.`;
  }

  if (type === "Ripresa del gioco") {
    return `${minuteText}gioco ripreso.`;
  }

  /*
   * SOSTITUZIONE
   *
   * ESPN può fornire il testo originale:
   * Substitution, Udinese. Enzo Ebosse replaces Matteo Palma.
   */

  if (type === "Sostituzione") {
    const substitutionMatch =
      originalText?.match(
        /Substitution,\s*(.+?)\.\s*(.+?)\s+replaces\s+(.+?)\.?$/i
      );

    if (substitutionMatch) {
      const substitutionTeam =
        normalizeTeamName(
          substitutionMatch[1]
        );

      const incoming =
        substitutionMatch[2].trim();

      const outgoing =
        substitutionMatch[3].trim();

      return `${minuteText}${incoming} entra al posto di ${outgoing} per ${substitutionTeam}.`;
    }

    return `${minuteText}sostituzione${team ? ` per ${team}` : ""}.`;
  }

  /*
   * FALLBACK
   */

  return originalText || null;
}

/*
 * PARSE EVENTO
 */

function parseEvent(event) {
  if (!event) {
    return null;
  }

  const originalType =
    getEventType(event);

  const originalText =
    getEventText(event);

  const type =
    translateEventType(
      originalType
    );

  const minute =
    getEventMinute(event);

  const player =
    getPlayerFromText(
      originalText
    );

  const assist =
    getAssistFromText(
      originalText
    );

  const team =
    typeof event.team === "string"
      ? normalizeTeamName(
          event.team
        )
      : event.team?.displayName
        ? normalizeTeamName(
            event.team.displayName
          )
        : null;

  return {
    id:
      event.id || null,

    type:
      type || null,

    minute:
      minute,

    team:
      team,

    player:
      player,

    assist:
      assist,

    text:
      createItalianEventText({
        type,
        minute,
        team,
        player,
        assist,
        originalText
      })
  };
}

/*
 * ESTRAE LE FORMAZIONI
 */

function getLineupPlayers(teamLineup) {
  if (!teamLineup) {
    return [];
  }

  /*
   * Caso ESPN:
   * lineup.athletes
   */

  if (
    Array.isArray(
      teamLineup.athletes
    )
  ) {
    return teamLineup.athletes
      .map(player => {
        return (
          player?.athlete?.displayName ||
          player?.athlete?.fullName ||
          player?.displayName ||
          player?.fullName ||
          null
        );
      })
      .filter(Boolean);
  }

  /*
   * Alcune risposte ESPN possono utilizzare
   * semplicemente una lista di giocatori.
   */

  if (
    Array.isArray(
      teamLineup.players
    )
  ) {
    return teamLineup.players
      .map(player => {
        if (typeof player === "string") {
          return player;
        }

        return (
          player?.displayName ||
          player?.fullName ||
          player?.athlete?.displayName ||
          player?.athlete?.fullName ||
          null
        );
      })
      .filter(Boolean);
  }

  return [];
}

function getFormation(teamLineup) {
  if (!teamLineup) {
    return null;
  }

  return (
    teamLineup.formation ||
    teamLineup.formations?.[0]?.formation ||
    teamLineup.formation?.text ||
    null
  );
}

function getTeamLineup(
  lineups,
  competitor,
  side
) {
  if (!lineups) {
    return {
      formation: null,
      players: []
    };
  }

  /*
   * Cerca prima tramite team ID
   */

  const teamId =
    competitor?.team?.id;

  let lineup = null;

  if (Array.isArray(lineups)) {
    lineup =
      lineups.find(item => {
        if (
          item?.team?.id &&
          teamId
        ) {
          return (
            String(item.team.id) ===
            String(teamId)
          );
        }

        return (
          item?.homeAway === side
        );
      }) || null;
  }

  /*
   * Se ESPN restituisce direttamente
   * home / away
   */

  if (!lineup) {
    if (side === "home") {
      lineup =
        lineups.home ||
        lineups.homeTeam ||
        null;
    }

    if (side === "away") {
      lineup =
        lineups.away ||
        lineups.awayTeam ||
        null;
    }
  }

  return {
    formation:
      getFormation(lineup),

    players:
      getLineupPlayers(lineup)
  };
}

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
     * RICHIESTA A ESPN
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
     * FORMAZIONI
     */

    const rawLineups =
      summary.lineups ||
      summary.rosters ||
      [];

    const homeLineup =
      getTeamLineup(
        rawLineups,
        home,
        "home"
      );

    const awayLineup =
      getTeamLineup(
        rawLineups,
        away,
        "away"
      );

    /*
     * EVENTI
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

    /*
     * ELIMINA EVENTUALI DUPLICATI
     */

    const uniqueEvents =
      Array.from(
        new Map(
          rawEvents.map(event => [
            event.id ||
              `${getEventType(event)}-${getEventMinute(event)}-${getEventText(event)}`,
            event
          ])
        ).values()
      );

    const events =
      uniqueEvents
        .map(parseEvent)
        .filter(Boolean);

    /*
     * STATO PARTITA
     */

    const status =
      translateStatus(
        competitionInfo?.status
          ?.type
      );

    /*
     * RISPOSTA
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
            status.state,

          name:
            status.name,

          description:
            status.description,

          detail:
            status.detail,

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
       * FORMAZIONI
       */

      lineups: {

        home: homeLineup,

        away: awayLineup

      },

      /*
       * EVENTI IN ITALIANO
       */

      events

    });

  } catch (error) {

    console.error(
      "ESPN MATCH ERROR:",
      error
    );

    return res.status(500).json({

      success: false,

      error:
        error.message ||
        "Errore interno"
    });
  }
};
