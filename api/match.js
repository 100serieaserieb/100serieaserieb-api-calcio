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
 * =========================
 * STATO PARTITA
 * =========================
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

  const state =
    String(status.state || "").toLowerCase();

  const name =
    String(status.name || "").toLowerCase();

  const description =
    String(status.description || "").toLowerCase();

  if (
    state === "post" ||
    name.includes("full_time") ||
    name.includes("final")
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
    name.includes("in_progress") ||
    name.includes("live")
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
    name.includes("scheduled")
  ) {
    return {
      state: "programmata",
      name: "Partita programmata",
      description: "In programma",
      detail: "In programma"
    };
  }

  if (
    name.includes("postponed") ||
    description.includes("postponed")
  ) {
    return {
      state: "rinviata",
      name: "Partita rinviata",
      description: "Partita rinviata",
      detail: "Partita rinviata"
    };
  }

  if (
    name.includes("cancelled") ||
    name.includes("canceled")
  ) {
    return {
      state: "annullata",
      name: "Partita annullata",
      description: "Partita annullata",
      detail: "Partita annullata"
    };
  }

  return {
    state: status.state || null,
    name: status.name || null,
    description: status.description || null,
    detail: status.detail || null
  };
}

/*
 * =========================
 * TIPO EVENTO
 * =========================
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

function translateEventType(type) {
  const value =
    String(type || "").toLowerCase();

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

  return type || "";
}

/*
 * =========================
 * MINUTO
 * =========================
 */

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

  if (event.minute) {
    return event.minute;
  }

  return null;
}

/*
 * =========================
 * TESTO EVENTO
 * =========================
 */

function getEventText(event) {
  if (!event) return "";

  if (typeof event.text === "string") {
    return event.text;
  }

  return "";
}

/*
 * =========================
 * GIOCATORE
 * =========================
 */

function getPlayerFromText(text) {
  if (!text) return null;

  /*
   * INFORTUNIO
   *
   * Delay in match because of an injury Jesús Rodríguez (Como).
   */

  const injuryMatch =
    text.match(
      /because of an injury\s+(.+?)(?:\s*\(|\.)/i
    );

  if (injuryMatch) {
    return injuryMatch[1].trim();
  }

  /*
   * GOL
   */

  if (text.startsWith("Goal!")) {
    const goalMatch =
      text.match(
        /Goal![^.]*\.\s*([^()]+)\s*\(/
      );

    if (goalMatch) {
      return goalMatch[1].trim();
    }
  }

  /*
   * CARTELLINI
   */

  const match =
    text.match(
      /^([^(]+)\s*\(/
    );

  if (!match) {
    return null;
  }

  return match[1].trim();
}

/*
 * =========================
 * ASSIST
 * =========================
 */

function getAssistFromText(text) {
  if (!text) return null;

  const match =
    text.match(
      /Assisted by ([^.]+?)(?:\s+with|\s+following|\.|$)/
    );

  if (!match) {
    return null;
  }

  return match[1].trim();
}

/*
 * =========================
 * SOSTITUZIONE
 * =========================
 */

function getSubstitutionFromText(text) {
  if (!text) {
    return null;
  }

  const match =
    text.match(
      /Substitution,\s*(.+?)\.\s*(.+?)\s+replaces\s+(.+?)(?:\s+because of an injury)?\.?$/i
    );

  if (!match) {
    return null;
  }

  return {
    team:
      normalizeTeamName(
        match[1].trim()
      ),

    incoming:
      match[2].trim(),

    outgoing:
      match[3].trim()
  };
}

/*
 * =========================
 * TESTO ITALIANO EVENTO
 * =========================
 */

function createItalianEventText({
  type,
  minute,
  team,
  player,
  assist,
  originalText
}) {
  const prefix =
    minute ? `Al ${minute}: ` : "";

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

  if (type === "Gol") {
    let text =
      `${prefix}gol di ${player || "sconosciuto"}`;

    if (team) {
      text += ` per ${team}`;
    }

    if (assist) {
      text += `, assist di ${assist}`;
    }

    return `${text}.`;
  }

  if (
    type === "Cartellino giallo" ||
    type === "Cartellino rosso"
  ) {
    const card =
      type === "Cartellino giallo"
        ? "cartellino giallo"
        : "cartellino rosso";

    let text =
      `${prefix}${card}`;

    if (player) {
      text += ` per ${player}`;
    }

    if (team) {
      text += ` (${team})`;
    }

    return `${text}.`;
  }

  if (type === "Interruzione") {
    if (player) {
      return `${prefix}gioco interrotto per un infortunio a ${player}${team ? ` (${team})` : ""}.`;
    }

    return `${prefix}gioco momentaneamente interrotto.`;
  }

  if (type === "Ripresa del gioco") {
    return `${prefix}gioco ripreso.`;
  }

  if (type === "Sostituzione") {
    const substitution =
      getSubstitutionFromText(
        originalText
      );

    if (substitution) {
      return `${prefix}${substitution.incoming} entra al posto di ${substitution.outgoing} per ${substitution.team}.`;
    }

    return `${prefix}sostituzione${team ? ` per ${team}` : ""}.`;
  }

  return originalText || null;
}

/*
 * =========================
 * PARSE EVENTO
 * =========================
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

  const player =
    getPlayerFromText(
      originalText
    );

  const assist =
    getAssistFromText(
      originalText
    );

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
 * =========================
 * FORMAZIONI
 * =========================
 *
 * Questa funzione è volutamente
 * molto più robusta.
 */

function extractPlayerName(player) {
  if (!player) {
    return null;
  }

  if (typeof player === "string") {
    return player;
  }

  return (
    player.displayName ||
    player.fullName ||
    player.name ||
    player.athlete?.displayName ||
    player.athlete?.fullName ||
    player.athlete?.name ||
    player.player?.displayName ||
    player.player?.fullName ||
    player.player?.name ||
    null
  );
}

function extractPlayersFromArray(array) {
  if (!Array.isArray(array)) {
    return [];
  }

  const players = [];

  for (const item of array) {
    const name =
      extractPlayerName(item);

    if (name) {
      players.push(name);
      continue;
    }

    /*
     * Alcune strutture ESPN possono
     * contenere una lista nested.
     */

    if (
      Array.isArray(item?.athletes)
    ) {
      players.push(
        ...extractPlayersFromArray(
          item.athletes
        )
      );
    }

    if (
      Array.isArray(item?.players)
    ) {
      players.push(
        ...extractPlayersFromArray(
          item.players
        )
      );
    }

    if (
      Array.isArray(item?.roster)
    ) {
      players.push(
        ...extractPlayersFromArray(
          item.roster
        )
      );
    }
  }

  return players;
}

function getLineupPlayers(lineup) {
  if (!lineup) {
    return [];
  }

  /*
   * Caso diretto:
   * players
   */

  if (Array.isArray(lineup.players)) {
    const players =
      extractPlayersFromArray(
        lineup.players
      );

    if (players.length) {
      return players;
    }
  }

  /*
   * Caso athletes
   */

  if (Array.isArray(lineup.athletes)) {
    const players =
      extractPlayersFromArray(
        lineup.athletes
      );

    if (players.length) {
      return players;
    }
  }

  /*
   * Caso starters + substitutes
   */

  const players = [];

  if (Array.isArray(lineup.starters)) {
    players.push(
      ...extractPlayersFromArray(
        lineup.starters
      )
    );
  }

  if (Array.isArray(lineup.substitutes)) {
    players.push(
      ...extractPlayersFromArray(
        lineup.substitutes
      )
    );
  }

  if (players.length) {
    return players;
  }

  /*
   * Caso roster
   */

  if (Array.isArray(lineup.roster)) {
    return extractPlayersFromArray(
      lineup.roster
    );
  }

  return [];
}

function getFormation(lineup) {
  if (!lineup) {
    return null;
  }

  if (
    typeof lineup.formation === "string"
  ) {
    return lineup.formation;
  }

  if (
    lineup.formation?.text
  ) {
    return lineup.formation.text;
  }

  if (
    lineup.formation?.displayValue
  ) {
    return lineup.formation.displayValue;
  }

  if (
    Array.isArray(lineup.formations)
  ) {
    const formation =
      lineup.formations[0];

    return (
      formation?.formation ||
      formation?.text ||
      formation?.displayValue ||
      null
    );
  }

  return null;
}

function findLineup(
  lineups,
  competitor,
  side
) {
  if (!lineups) {
    return null;
  }

  const teamId =
    competitor?.team?.id
      ? String(competitor.team.id)
      : null;

  /*
   * =========================
   * ARRAY
   * =========================
   */

  if (Array.isArray(lineups)) {
    return (
      lineups.find(item => {

        if (
          teamId &&
          item?.team?.id
        ) {
          return (
            String(item.team.id) ===
            teamId
          );
        }

        if (
          item?.homeAway
        ) {
          return (
            item.homeAway === side
          );
        }

        return false;
      }) || null
    );
  }

  /*
   * =========================
   * OBJECT HOME / AWAY
   * =========================
   */

  if (side === "home") {
    return (
      lineups.home ||
      lineups.homeTeam ||
      lineups.homeLineup ||
      null
    );
  }

  return (
    lineups.away ||
    lineups.awayTeam ||
    lineups.awayLineup ||
    null
  );
}

function getTeamLineup(
  lineups,
  competitor,
  side
) {
  const lineup =
    findLineup(
      lineups,
      competitor,
      side
    );

  return {
    formation:
      getFormation(lineup),

    players:
      getLineupPlayers(lineup)
  };
}

/*
 * =========================
 * API
 * =========================
 */

module.exports = async (req, res) => {
  try {

    const competitionId =
      req.query.competition;

    const eventId =
      req.query.id;

    /*
     * PARAMETRI
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
     * ESPN
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
     * DATA / ORA
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
     * =========================
     * FORMAZIONI
     * =========================
     */

    const rawLineups =
      summary.lineups ||
      summary.rosters ||
      summary.roster ||
      null;

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
     * =========================
     * EVENTI
     * =========================
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
     * ELIMINA DUPLICATI
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
     * STATO
     */

    const status =
      translateStatus(
        competitionInfo
          ?.status
          ?.type
      );

    /*
     * =========================
     * RISPOSTA
     * =========================
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
       * EVENTI
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
