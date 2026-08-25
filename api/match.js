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

function getEventMinute(event) {
  if (!event) return null;

  if (event.clock && typeof event.clock === "object") {
    return event.clock.displayValue || null;
  }

  if (typeof event.clock === "string") {
    return event.clock;
  }

  if (event.minute) {
    return event.minute;
  }

  return null;
}

function getEventText(event) {
  if (!event) return "";

  return typeof event.text === "string"
    ? event.text
    : "";
}

/*
 * ESTRAE IL GIOCATORE DAL TESTO
 */
function getPlayerFromText(text) {
  if (!text) return null;

  /*
   * Gol:
   * Goal! Udinese 1, Como 0. Hassane Kamara (Udinese)...
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
   * Cartellini:
   * Jakub Piotrowski (Udinese)...
   */
  const match = text.match(
    /^([^(]+)\s*\(/
  );

  if (!match) return null;

  let player = match[1].trim();

  /*
   * Rimuove eventuali frasi ESPN rimaste
   * davanti al nome del giocatore.
   */
  player = player
    .replace(
      /^Delay in match because of an injury\s+/i,
      ""
    )
    .trim();

  return player || null;
}

function getAssistFromText(text) {
  if (!text) return null;

  const match = text.match(
    /Assisted by ([^.]+?)(?:\s+with|\s+following|\.|$)/
  );

  return match
    ? match[1].trim()
    : null;
}

/*
 * TRADUZIONE EVENTI
 */
function translateEventType(type) {
  const value = String(type || "").toLowerCase();

  if (value.includes("goal")) return "Gol";
  if (value.includes("yellow")) return "Cartellino giallo";
  if (value.includes("red")) return "Cartellino rosso";
  if (value.includes("substitution")) return "Sostituzione";
  if (value.includes("kickoff")) return "Inizio primo tempo";
  if (value.includes("halftime")) return "Fine primo tempo";
  if (value.includes("start 2nd half")) return "Inizio secondo tempo";
  if (value.includes("end regular")) return "Fine partita";
  if (value.includes("start delay")) return "Interruzione";
  if (value.includes("end delay")) return "Ripresa del gioco";

  return type || null;
}

/*
 * COSTRUZIONE TESTO EVENTO IN ITALIANO
 */
function buildItalianEventText(
  event,
  type,
  team,
  player,
  assist
) {
  const minute = getEventMinute(event);

  const prefix = minute
    ? `Al ${minute}: `
    : "";

  if (type === "Gol" && player) {
    let text = `${prefix}gol di ${player}`;

    if (team) {
      text += ` per ${team}`;
    }

    if (assist) {
      text += `, assist di ${assist}`;
    }

    return `${text}.`;
  }

  if (type === "Cartellino giallo" && player) {
    return `${prefix}cartellino giallo per ${player}${
      team ? ` (${team})` : ""
    }.`;
  }

  if (type === "Cartellino rosso" && player) {
    return `${prefix}cartellino rosso per ${player}${
      team ? ` (${team})` : ""
    }.`;
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

  if (type === "Ripresa del gioco") {
    return `${prefix}gioco ripreso.`;
  }

  if (type === "Interruzione") {
    if (player) {
      return `${prefix}gioco interrotto per un infortunio a ${player}${
        team ? ` (${team})` : ""
      }.`;
    }

    return `${prefix}gioco momentaneamente interrotto.`;
  }

  /*
   * Sostituzioni:
   * Manteniamo il testo ESPN tradotto,
   * quando disponibile.
   */
  if (type === "Sostituzione") {
    const original = getEventText(event);

    const substitutionMatch = original.match(
      /Substitution,\s*([^.]*)\.\s*(.*?)\s+replaces\s+(.*?)(?:\s+because of an injury)?\./i
    );

    if (substitutionMatch) {
      const teamName =
        normalizeTeamName(
          substitutionMatch[1]
        );

      const incoming =
        substitutionMatch[2].trim();

      const outgoing =
        substitutionMatch[3].trim();

      return `${prefix}${incoming} entra al posto di ${outgoing} per ${teamName}.`;
    }

    return `${prefix}sostituzione${
      team ? ` per ${team}` : ""
    }.`;
  }

  return getEventText(event) || null;
}

/*
 * PARSING EVENTO
 */
function parseEvent(event) {
  if (!event) return null;

  const rawType = getEventType(event);

  const type =
    translateEventType(rawType);

  const rawText =
    getEventText(event);

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
    type === "Gol" ||
    type === "Cartellino giallo" ||
    type === "Cartellino rosso"
  ) {
    player =
      getPlayerFromText(rawText);

    assist =
      type === "Gol"
        ? getAssistFromText(rawText)
        : null;
  }

  /*
   * Infortuni:
   * cerchiamo direttamente il nome dopo
   * "injury".
   */
  if (
    type === "Interruzione" &&
    /injury/i.test(rawText)
  ) {
    const injuryMatch =
      rawText.match(
        /injury\s+(.+?)\s*\(/i
      );

    if (injuryMatch) {
      player =
        injuryMatch[1].trim();
    }
  }

  return {
    id: event.id || null,

    type,

    minute:
      getEventMinute(event),

    team,

    player,

    assist,

    text:
      buildItalianEventText(
        event,
        type,
        team,
        player,
        assist
      )
  };
}

/*
 * ESTRAZIONE FORMAZIONI
 */
function getLineup(competitor) {
  const athleteGroups =
    competitor?.roster?.athletes ||
    competitor?.athletes ||
    [];

  const players = [];

  if (Array.isArray(athleteGroups)) {
    for (const athlete of athleteGroups) {
      const name =
        athlete?.athlete?.displayName ||
        athlete?.displayName ||
        athlete?.fullName ||
        null;

      if (name) {
        players.push(name);
      }
    }
  }

  const formation =
    competitor?.formation ||
    competitor?.formation?.text ||
    null;

  return {
    formation,
    players
  };
}

/*
 * ESTRAZIONE STATISTICHE
 */
function getStatisticValue(stat) {
  if (!stat) return null;

  return (
    stat.displayValue ??
    stat.value ??
    stat.displayValueText ??
    null
  );
}

function normalizeStatisticName(name) {
  const value =
    String(name || "")
      .toLowerCase()
      .trim();

  if (
    value.includes("possession") ||
    value.includes("possesso")
  ) {
    return "possesso";
  }

  if (
    value.includes("shots on target") ||
    value.includes("shots on goal") ||
    value.includes("tiri in porta")
  ) {
    return "tiri_in_porta";
  }

  if (
    value === "shots" ||
    value.includes("total shots") ||
    value.includes("tiri totali")
  ) {
    return "tiri";
  }

  if (
    value.includes("corners") ||
    value.includes("corner")
  ) {
    return "calci_d_angolo";
  }

  if (
    value.includes("offsides") ||
    value.includes("offside") ||
    value.includes("fuorigioco")
  ) {
    return "fuorigioco";
  }

  return null;
}

function getStatistics(
  competitionInfo,
  home,
  away
) {
  const result = {
    home: {},
    away: {}
  };

  const groups =
    competitionInfo?.competitors || [];

  for (const competitor of groups) {
    const side =
      competitor.homeAway === "home"
        ? "home"
        : competitor.homeAway === "away"
          ? "away"
          : null;

    if (!side) continue;

    const statistics =
      competitor.statistics || [];

    for (const stat of statistics) {
      const name =
        normalizeStatisticName(
          stat.name ||
          stat.label ||
          stat.displayName
        );

      if (!name) continue;

      result[side][name] =
        getStatisticValue(stat);
    }
  }

  return result;
}

/*
 * RIGORI
 */
function getPenalties(
  summary,
  home,
  away
) {
  const result = {
    home: [],
    away: []
  };

  const plays =
    Array.isArray(summary.plays)
      ? summary.plays
      : [];

  for (const play of plays) {
    const text =
      getEventText(play);

    if (!/penalty|rigore/i.test(text)) {
      continue;
    }

    const side =
      play.team?.homeAway ||
      play.team?.abbreviation ||
      null;

    const item = {
      minute:
        getEventMinute(play),

      player:
        play.athlete?.displayName ||
        null,

      esito:
        /miss|save|saved|sbagliato|parato/i.test(text)
          ? "Sbagliato/Parato"
          : /goal|gol|scored/i.test(text)
            ? "Realizzato"
            : "Tentativo di rigore",

      text:
        text || null
    };

    if (side === "home") {
      result.home.push(item);
    } else if (side === "away") {
      result.away.push(item);
    }
  }

  return result;
}

/*
 * STADIO
 */
function getVenue(competitionInfo) {
  const venue =
    competitionInfo?.venue ||
    competitionInfo?.venue?.fullName
      ? competitionInfo.venue
      : null;

  if (!venue) {
    return null;
  }

  return {
    name:
      venue.fullName ||
      venue.displayName ||
      venue.name ||
      null,

    city:
      venue.address?.city ||
      null,

    country:
      venue.address?.country ||
      null
  };
}

/*
 * ARBITRI
 */
function getOfficials(summary) {
  const officials =
    summary.header?.competitions?.[0]?.officials ||
    summary.gameInfo?.officials ||
    [];

  if (!Array.isArray(officials)) {
    return [];
  }

  return officials.map(official => ({
    name:
      official.displayName ||
      official.fullName ||
      official.name ||
      null,

    role:
      official.position?.displayName ||
      official.position?.name ||
      official.role ||
      "Arbitro"
  }));
}

/*
 * CANALI TV
 */
function getBroadcasts(summary, competitionInfo) {
  const broadcasts =
    competitionInfo?.broadcasts ||
    summary.broadcasts ||
    [];

  if (!Array.isArray(broadcasts)) {
    return [];
  }

  return broadcasts.map(item => ({
    name:
      item.names?.[0] ||
      item.name ||
      item.displayName ||
      null,

    type:
      item.type?.shortName ||
      item.type?.text ||
      item.type?.name ||
      null
  }));
}

/*
 * MVP / MIGLIORE GIOCATORE
 */
function getMVP(summary) {
  const leaders =
    summary.leaders ||
    summary.header?.competitions?.[0]?.leaders ||
    [];

  if (!Array.isArray(leaders)) {
    return null;
  }

  for (const group of leaders) {
    const name =
      String(
        group.name ||
        group.displayName ||
        group.shortDisplayName ||
        ""
      ).toLowerCase();

    if (
      name.includes("player of the match") ||
      name.includes("match winner") ||
      name.includes("mvp")
    ) {
      const athlete =
        group.leaders?.[0]?.athlete ||
        group.leaders?.[0]?.player ||
        null;

      if (athlete) {
        return {
          player:
            athlete.displayName ||
            athlete.fullName ||
            null,

          team:
            athlete.team?.displayName
              ? normalizeTeamName(
                  athlete.team.displayName
                )
              : null,

          value:
            group.leaders?.[0]?.value ||
            group.leaders?.[0]?.displayValue ||
            null
        };
      }
    }
  }

  return null;
}

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
     * DATA
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
     * EVENTI
     */
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

    /*
     * FORMAZIONI
     */
    const homeLineup =
      getLineup(home);

    const awayLineup =
      getLineup(away);

    /*
     * STATISTICHE
     */
    const statistics =
      getStatistics(
        competitionInfo,
        home,
        away
      );

    /*
     * RIGORI
     */
    const penalties =
      getPenalties(
        summary,
        home,
        away
      );

    /*
     * STADIO
     */
    const venue =
      getVenue(
        competitionInfo
      );

    /*
     * ARBITRI
     */
    const officials =
      getOfficials(summary);

    /*
     * TV
     */
    const broadcasts =
      getBroadcasts(
        summary,
        competitionInfo
      );

    /*
     * MVP
     */
    const mvp =
      getMVP(summary);

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

      /*
       * FORMAZIONI
       */
      lineups: {

        home: {
          formation:
            homeLineup.formation,

          players:
            homeLineup.players
        },

        away: {
          formation:
            awayLineup.formation,

          players:
            awayLineup.players
        }
      },

      /*
       * STATISTICHE
       */
      statistics,

      /*
       * RIGORI
       */
      penalties,

      /*
       * STADIO
       */
      venue,

      /*
       * ARBITRO
       */
      officials,

      /*
       * CANALI TV
       */
      broadcasts,

      /*
       * MVP
       */
      mvp,

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
