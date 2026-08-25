const { getCompetition } = require("../lib/competitions");
const { getMatchSummary } = require("../lib/espn");
const { normalizeTeamName } = require("../lib/teams");
const { DateTime } = require("luxon");

/*
|--------------------------------------------------------------------------
| UTILITÀ GENERALI
|--------------------------------------------------------------------------
*/

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

  return (
    competitors.find(
      item => item.homeAway === side
    ) || null
  );
}

function firstValue(...values) {
  for (const value of values) {
    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      return value;
    }
  }

  return null;
}

function toNumber(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const match = String(value).match(/-?\d+(?:[.,]\d+)?/);

  if (!match) return null;

  const number = Number(
    match[0].replace(",", ".")
  );

  return Number.isFinite(number)
    ? number
    : null;
}

/*
|--------------------------------------------------------------------------
| TIPO EVENTO
|--------------------------------------------------------------------------
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

/*
|--------------------------------------------------------------------------
| MINUTO
|--------------------------------------------------------------------------
*/

function getEventMinute(event) {
  if (!event) return null;

  if (
    event.clock &&
    typeof event.clock === "object"
  ) {
    return (
      event.clock.displayValue ||
      event.clock.value ||
      null
    );
  }

  if (typeof event.clock === "string") {
    return event.clock;
  }

  if (event.period?.displayClock) {
    return event.period.displayClock;
  }

  return null;
}

/*
|--------------------------------------------------------------------------
| TESTO EVENTO
|--------------------------------------------------------------------------
*/

function getEventText(event) {
  if (!event) return "";

  if (typeof event.text === "string") {
    return event.text;
  }

  if (typeof event.description === "string") {
    return event.description;
  }

  return "";
}

/*
|--------------------------------------------------------------------------
| NOME GIOCATORE
|--------------------------------------------------------------------------
*/

function cleanPlayerName(name) {
  if (!name) return null;

  return String(name)
    .replace(/\s+/g, " ")
    .trim();
}

/*
|--------------------------------------------------------------------------
| GOL
|--------------------------------------------------------------------------
*/

function getPlayerFromText(text) {
  if (!text) return null;

  const patterns = [
    /Goal!\s+.*?\.\s+([^()]+?)\s*\(/i,

    /Gol!\s+.*?\.\s+([^()]+?)\s*\(/i,

    /gol di\s+(.+?)(?:\s+per|\s*\()/i,

    /Goal\s+di\s+(.+?)(?:\s+per|\s*\()/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match) {
      return cleanPlayerName(match[1]);
    }
  }

  return null;
}

/*
|--------------------------------------------------------------------------
| ASSIST
|--------------------------------------------------------------------------
*/

function getAssistFromText(text) {
  if (!text) return null;

  const patterns = [
    /Assisted by\s+([^.]+?)(?:\s+with|\s+following|\.|$)/i,

    /assist(?:ito)?\s+(?:di|da)\s+([^.]+?)(?:\s+con|\.|$)/i,

    /assist di\s+([^.]+?)(?:\.|$)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match) {
      return cleanPlayerName(match[1]);
    }
  }

  return null;
}

/*
|--------------------------------------------------------------------------
| GIOCATORE EVENTO
|--------------------------------------------------------------------------
*/

function getEventPlayer(event, text) {
  if (!event) return null;

  const direct = firstValue(
    event.athlete?.displayName,
    event.athlete?.fullName,
    event.player?.displayName,
    event.player?.fullName,
    typeof event.player === "string"
      ? event.player
      : null
  );

  if (direct) {
    return cleanPlayerName(direct);
  }

  return getPlayerFromText(text);
}

/*
|--------------------------------------------------------------------------
| TRADUZIONE EVENTI
|--------------------------------------------------------------------------
*/

function translateEventType(type, text = "") {
  const value = `${type} ${text}`.toLowerCase();

  if (
    value.includes("kickoff") ||
    value.includes("start of first half") ||
    value.includes("inizio primo tempo")
  ) {
    return "Inizio primo tempo";
  }

  if (
    value.includes("first half ends") ||
    value.includes("fine primo tempo")
  ) {
    return "Fine primo tempo";
  }

  if (
    value.includes("second half") ||
    value.includes("inizio secondo tempo")
  ) {
    return "Inizio secondo tempo";
  }

  if (
    value.includes("full time") ||
    value.includes("fine partita") ||
    value.includes("match ends")
  ) {
    return "Fine partita";
  }

  if (
    value.includes("goal") ||
    value.includes("gol")
  ) {
    return "Gol";
  }

  if (
    value.includes("yellow card") ||
    value.includes("cartellino giallo")
  ) {
    return "Cartellino giallo";
  }

  if (
    value.includes("red card") ||
    value.includes("cartellino rosso")
  ) {
    return "Cartellino rosso";
  }

  if (
    value.includes("substitution") ||
    value.includes("sostituzione")
  ) {
    return "Sostituzione";
  }

  if (
    value.includes("delay") ||
    value.includes("injury") ||
    value.includes("interruption") ||
    value.includes("interruzione")
  ) {
    return "Interruzione";
  }

  if (
    value.includes("delay over") ||
    value.includes("resume") ||
    value.includes("ripresa")
  ) {
    return "Ripresa del gioco";
  }

  return type || "Evento";
}

/*
|--------------------------------------------------------------------------
| TRADUZIONE TESTI ESPN
|--------------------------------------------------------------------------
*/

function translateEventText(
  text,
  type,
  player,
  team,
  assist,
  event
) {
  if (!text) {
    return null;
  }

  let result = String(text);

  /*
   * GOL
   */

  if (
    type === "Gol" &&
    player
  ) {
    if (assist) {
      return `Gol di ${player} per ${team}, assist di ${assist}.`;
    }

    return `Gol di ${player} per ${team}.`;
  }

  /*
   * CARTELLINO
   */

  if (
    type === "Cartellino giallo" &&
    player
  ) {
    return `Cartellino giallo per ${player} (${team}).`;
  }

  if (
    type === "Cartellino rosso" &&
    player
  ) {
    return `Cartellino rosso per ${player} (${team}).`;
  }

  /*
   * INFORTUNIO
   */

  if (
    type === "Interruzione" &&
    player &&
    /injury|infortunio/i.test(result)
  ) {
    return `Gioco interrotto per un infortunio a ${player} (${team}).`;
  }

  /*
   * SOSTITUZIONE
   */

  if (
    type === "Sostituzione"
  ) {
    const substitution =
      getSubstitutionData(event);

    if (
      substitution.playerIn &&
      substitution.playerOut
    ) {
      let reason = "";

      if (
        /injury|infortunio/i.test(result)
      ) {
        reason =
          " a causa di un infortunio";
      }

      return `${substitution.playerIn} entra al posto di ${substitution.playerOut}${reason} per ${team}.`;
    }
  }

  /*
   * INIZIO / FINE
   */

  if (
    type === "Inizio primo tempo"
  ) {
    return "Inizio del primo tempo.";
  }

  if (
    type === "Fine primo tempo"
  ) {
    return "Fine del primo tempo.";
  }

  if (
    type === "Inizio secondo tempo"
  ) {
    return "Inizio del secondo tempo.";
  }

  if (
    type === "Fine partita"
  ) {
    return "Fine della partita.";
  }

  /*
   * RIPRESA
   */

  if (
    type === "Ripresa del gioco"
  ) {
    return "Gioco ripreso.";
  }

  /*
   * INTERVENTI GENERICI
   */

  if (
    type === "Interruzione"
  ) {
    return "Gioco momentaneamente interrotto.";
  }

  /*
   * SOSTITUZIONE GENERICA
   */

  result = result
    .replace(
      /Substitution,\s*/gi,
      "Sostituzione: "
    )
    .replace(
      /\breplaces\b/gi,
      "entra al posto di"
    )
    .replace(
      /\bis shown\b/gi,
      "riceve"
    )
    .replace(
      /\bYellow Card\b/gi,
      "cartellino giallo"
    )
    .replace(
      /\bRed Card\b/gi,
      "cartellino rosso"
    )
    .replace(
      /\bFirst Half ends\b/gi,
      "Fine del primo tempo"
    )
    .replace(
      /\bFull Time\b/gi,
      "Fine della partita"
    );

  return result.trim();
}

/*
|--------------------------------------------------------------------------
| SOSTITUZIONE
|--------------------------------------------------------------------------
*/

function getSubstitutionData(event) {
  if (!event) {
    return {
      playerIn: null,
      playerOut: null
    };
  }

  const playerIn = cleanPlayerName(
    firstValue(
      event.substitution?.in?.athlete?.displayName,
      event.substitution?.in?.athlete?.fullName,
      event.substitution?.playerIn?.displayName,
      event.substitution?.playerIn?.fullName,
      event.athleteIn?.displayName,
      event.athleteIn?.fullName
    )
  );

  const playerOut = cleanPlayerName(
    firstValue(
      event.substitution?.out?.athlete?.displayName,
      event.substitution?.out?.athlete?.fullName,
      event.substitution?.playerOut?.displayName,
      event.substitution?.playerOut?.fullName,
      event.athleteOut?.displayName,
      event.athleteOut?.fullName
    )
  );

  const text = getEventText(event);

  let finalIn = playerIn;
  let finalOut = playerOut;

  if (!finalIn || !finalOut) {
    const patterns = [
      /([A-ZÀ-ÖØ-Ý][^,.]+?)\s+(?:replaces|entra al posto di)\s+([A-ZÀ-ÖØ-Ý][^.]+)/i,

      /([A-ZÀ-ÖØ-Ý][^,.]+?)\s+entra al posto di\s+([A-ZÀ-ÖØ-Ý][^.]+)/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);

      if (match) {
        finalIn =
          finalIn ||
          cleanPlayerName(match[1]);

        finalOut =
          finalOut ||
          cleanPlayerName(match[2]);

        break;
      }
    }
  }

  return {
    playerIn: finalIn,
    playerOut: finalOut
  };
}

/*
|--------------------------------------------------------------------------
| PARSE EVENTO
|--------------------------------------------------------------------------
*/

function parseEvent(event) {
  if (!event) return null;

  const rawType =
    getEventType(event);

  const rawText =
    getEventText(event);

  const type =
    translateEventType(
      rawType,
      rawText
    );

  const team =
    typeof event.team === "string"
      ? normalizeTeamName(event.team)
      : event.team?.displayName
        ? normalizeTeamName(
            event.team.displayName
          )
        : null;

  const player =
    getEventPlayer(
      event,
      rawText
    );

  const assist =
    type === "Gol"
      ? getAssistFromText(rawText)
      : null;

  const result = {
    id: event.id || null,

    type,

    minute:
      getEventMinute(event),

    team,

    player,

    assist,

    text:
      translateEventText(
        rawText,
        type,
        player,
        team,
        assist,
        event
      )
  };

  return result;
}

/*
|--------------------------------------------------------------------------
| STATISTICHE
|--------------------------------------------------------------------------
*/

function normalizeStatisticName(name) {
  if (!name) return "";

  return String(name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function getStatisticValue(stat) {
  if (!stat) return null;

  return firstValue(
    stat.displayValue,
    stat.value,
    stat.displayValueText
  );
}

function extractStatistics(competitor) {
  const result = {
    tiri: null,
    tiriInPorta: null,
    possesso: null,
    calciDangolo: null,
    fuorigioco: null,
    rigori: null
  };

  const statistics =
    competitor?.statistics;

  if (!Array.isArray(statistics)) {
    return result;
  }

  for (const stat of statistics) {
    const name = normalizeStatisticName(
      firstValue(
        stat.name,
        stat.label,
        stat.abbreviation,
        stat.displayName
      )
    );

    const value =
      getStatisticValue(stat);

    if (value === null) continue;

    if (
      name.includes("shotson") ||
      name.includes("shotsontarget") ||
      name.includes("tirinonporta")
    ) {
      result.tiriInPorta =
        toNumber(value);
    }

    else if (
      name === "shots" ||
      name.includes("totalshots") ||
      name === "tiri"
    ) {
      result.tiri =
        toNumber(value);
    }

    else if (
      name.includes("possession")
    ) {
      result.possesso =
        toNumber(value);
    }

    else if (
      name.includes("corners") ||
      name.includes("cornerkicks") ||
      name.includes("calciadangolo")
    ) {
      result.calciDangolo =
        toNumber(value);
    }

    else if (
      name.includes("offsides") ||
      name.includes("fuorigioco")
    ) {
      result.fuorigioco =
        toNumber(value);
    }

    else if (
      name.includes("penalty") ||
      name.includes("rigori")
    ) {
      result.rigori =
        toNumber(value);
    }
  }

  return result;
}

/*
|--------------------------------------------------------------------------
| RIGORI
|--------------------------------------------------------------------------
*/

function extractPenalties(summary) {
  const penalties = [];

  const candidates = [
    ...(Array.isArray(summary.keyEvents)
      ? summary.keyEvents
      : []),

    ...(Array.isArray(summary.plays)
      ? summary.plays
      : [])
  ];

  for (const event of candidates) {
    const text =
      getEventText(event);

    const type =
      getEventType(event);

    const combined =
      `${type} ${text}`.toLowerCase();

    if (
      !combined.includes("penalty") &&
      !combined.includes("rigore")
    ) {
      continue;
    }

    const player =
      getEventPlayer(
        event,
        text
      );

    const team =
      typeof event.team === "string"
        ? normalizeTeamName(event.team)
        : event.team?.displayName
          ? normalizeTeamName(
              event.team.displayName
            )
          : null;

    let result = "non specificato";

    if (
      /missed|saved|parato|sbagliato|fallito/i.test(
        combined
      )
    ) {
      result = "sbagliato/parato";
    }

    else if (
      /scored|goal|gol|segnato/i.test(
        combined
      )
    ) {
      result = "segnato";
    }

    penalties.push({
      id: event.id || null,
      minute:
        getEventMinute(event),
      team,
      player,
      esito: result
    });
  }

  return penalties;
}

/*
|--------------------------------------------------------------------------
| STADIO
|--------------------------------------------------------------------------
*/

function extractVenue(summary) {
  const venue =
    summary.gameInfo?.venue ||
    summary.header?.competitions?.[0]?.venue ||
    summary.header?.competitions?.[0]?.venue?.fullName
      ? summary.header.competitions[0].venue
      : null;

  if (!venue) return null;

  if (typeof venue === "string") {
    return {
      name: venue,
      city: null
    };
  }

  return {
    name:
      firstValue(
        venue.fullName,
        venue.name,
        venue.displayName
      ),

    city:
      firstValue(
        venue.address?.city,
        venue.city
      )
  };
}

/*
|--------------------------------------------------------------------------
| ARBITRI / UFFICIALI
|--------------------------------------------------------------------------
*/

function extractOfficials(summary) {
  const raw =
    summary.header?.competitions?.[0]?.officials ||
    summary.officials ||
    [];

  if (!Array.isArray(raw)) {
    return {
      referee: null,
      assistantReferee1: null,
      assistantReferee2: null,
      fourthOfficial: null,
      var: null,
      avar: null
    };
  }

  const result = {
    referee: null,
    assistantReferee1: null,
    assistantReferee2: null,
    fourthOfficial: null,
    var: null,
    avar: null
  };

  let assistantIndex = 0;

  for (const official of raw) {
    const name =
      firstValue(
        official.athlete?.displayName,
        official.athlete?.fullName,
        official.displayName,
        official.fullName,
        official.name
      );

    if (!name) continue;

    const role = String(
      firstValue(
        official.position?.name,
        official.position?.displayName,
        official.type?.name,
        official.type?.text,
        official.role,
        ""
      )
    ).toLowerCase();

    if (
      role.includes("referee") &&
      !role.includes("assistant")
    ) {
      result.referee = name;
    }

    else if (
      role.includes("assistant")
    ) {
      assistantIndex++;

      if (assistantIndex === 1) {
        result.assistantReferee1 = name;
      }

      else if (assistantIndex === 2) {
        result.assistantReferee2 = name;
      }
    }

    else if (
      role.includes("fourth")
    ) {
      result.fourthOfficial = name;
    }

    else if (
      role.includes("avar")
    ) {
      result.avar = name;
    }

    else if (
      role === "var" ||
      role.includes("video assistant referee") ||
      role.includes("video referee")
    ) {
      result.var = name;
    }
  }

  return result;
}

/*
|--------------------------------------------------------------------------
| TV
|--------------------------------------------------------------------------
*/

function extractTV(summary) {
  const result = [];

  const broadcasts =
    summary.broadcasts ||
    summary.header?.competitions?.[0]?.broadcasts ||
    [];

  if (!Array.isArray(broadcasts)) {
    return result;
  }

  for (const broadcast of broadcasts) {
    const names = [
      broadcast.names,
      broadcast.market?.names,
      broadcast.station?.name,
      broadcast.media?.shortName,
      broadcast.media?.name
    ];

    for (const item of names) {
      if (Array.isArray(item)) {
        for (const name of item) {
          if (
            name &&
            !result.includes(name)
          ) {
            result.push(name);
          }
        }
      }

      else if (
        item &&
        !result.includes(item)
      ) {
        result.push(item);
      }
    }
  }

  return result;
}

/*
|--------------------------------------------------------------------------
| MVP
|--------------------------------------------------------------------------
*/

function extractMVP(summary) {
  const candidates = [
    summary.leaders,
    summary.playerOfTheMatch,
    summary.gameInfo?.playerOfTheMatch,
    summary.header?.competitions?.[0]?.playerOfTheMatch
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;

    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        const found =
          normalizeMVP(item);

        if (found) return found;
      }
    }

    else {
      const found =
        normalizeMVP(candidate);

      if (found) return found;
    }
  }

  return null;
}

function normalizeMVP(item) {
  if (!item) return null;

  const athlete =
    item.athlete ||
    item.player ||
    item;

  const name =
    firstValue(
      athlete.displayName,
      athlete.fullName,
      athlete.name
    );

  if (!name) return null;

  return {
    name,
    team:
      firstValue(
        item.team?.displayName,
        item.team?.name,
        athlete.team?.displayName
      ),

    rating:
      toNumber(
        firstValue(
          item.rating,
          item.score
        )
      )
  };
}

/*
|--------------------------------------------------------------------------
| FORMAZIONI
|--------------------------------------------------------------------------
*/

function extractLineupPlayers(lineup) {
  if (!lineup) return [];

  const players =
    lineup.roster ||
    lineup.players ||
    [];

  if (!Array.isArray(players)) {
    return [];
  }

  return players
    .map(player => {
      if (typeof player === "string") {
        return player;
      }

      return firstValue(
        player.athlete?.displayName,
        player.athlete?.fullName,
        player.displayName,
        player.fullName,
        player.name
      );
    })
    .filter(Boolean);
}

function extractLineups(summary, home, away) {
  const raw =
    summary.rosters ||
    summary.lineups ||
    [];

  let homeLineup = null;
  let awayLineup = null;

  if (Array.isArray(raw)) {
    homeLineup =
      raw.find(
        item =>
          item.team?.id === home?.team?.id
      ) || null;

    awayLineup =
      raw.find(
        item =>
          item.team?.id === away?.team?.id
      ) || null;
  }

  const homeFormation =
    firstValue(
      homeLineup?.formation,
      homeLineup?.team?.formation,
      home?.formation
    );

  const awayFormation =
    firstValue(
      awayLineup?.formation,
      awayLineup?.team?.formation,
      away?.formation
    );

  return {
    home: {
      formation:
        homeFormation || null,

      players:
        extractLineupPlayers(
          homeLineup
        )
    },

    away: {
      formation:
        awayFormation || null,

      players:
        extractLineupPlayers(
          awayLineup
        )
    }
  };
}

/*
|--------------------------------------------------------------------------
| STATISTICHE COMPLESSIVE
|--------------------------------------------------------------------------
*/

function extractMatchStatistics(
  competitionInfo,
  home,
  away
) {
  const homeStats =
    extractStatistics(home);

  const awayStats =
    extractStatistics(away);

  /*
   * Alcune versioni di ESPN mettono
   * le statistiche direttamente nella
   * competition.
   */

  const stats =
    competitionInfo?.statistics;

  if (
    Array.isArray(stats) &&
    stats.length
  ) {
    for (const item of stats) {
      const name =
        normalizeStatisticName(
          firstValue(
            item.name,
            item.label,
            item.displayName
          )
        );

      const homeValue =
        firstValue(
          item.home,
          item.homeValue,
          item.homeDisplayValue
        );

      const awayValue =
        firstValue(
          item.away,
          item.awayValue,
          item.awayDisplayValue
        );

      if (
        name.includes("possession")
      ) {
        homeStats.possesso =
          toNumber(homeValue);

        awayStats.possesso =
          toNumber(awayValue);
      }

      else if (
        name.includes("shotsontarget")
      ) {
        homeStats.tiriInPorta =
          toNumber(homeValue);

        awayStats.tiriInPorta =
          toNumber(awayValue);
      }

      else if (
        name === "shots" ||
        name.includes("totalshots")
      ) {
        homeStats.tiri =
          toNumber(homeValue);

        awayStats.tiri =
          toNumber(awayValue);
      }

      else if (
        name.includes("corner")
      ) {
        homeStats.calciDangolo =
          toNumber(homeValue);

        awayStats.calciDangolo =
          toNumber(awayValue);
      }

      else if (
        name.includes("offside")
      ) {
        homeStats.fuorigioco =
          toNumber(homeValue);

        awayStats.fuorigioco =
          toNumber(awayValue);
      }
    }
  }

  return {
    home: {
      team:
        home?.team?.displayName
          ? normalizeTeamName(
              home.team.displayName
            )
          : null,

      ...homeStats
    },

    away: {
      team:
        away?.team?.displayName
          ? normalizeTeamName(
              away.team.displayName
            )
          : null,

      ...awayStats
    }
  };
}

/*
|--------------------------------------------------------------------------
| HANDLER PRINCIPALE
|--------------------------------------------------------------------------
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
     * Evita duplicati
     */

    const uniqueEvents =
      Array.from(
        new Map(
          rawEvents
            .filter(Boolean)
            .map(event => [
              event.id ||
                `${getEventMinute(event)}-${getEventText(event)}`,
              event
            ])
        ).values()
      );

    const events =
      uniqueEvents
        .map(parseEvent)
        .filter(Boolean);

    /*
     * STATISTICHE
     */

    const statistics =
      extractMatchStatistics(
        competitionInfo,
        home,
        away
      );

    /*
     * RIGORI
     */

    const penalties =
      extractPenalties(
        summary
      );

    /*
     * STADIO
     */

    const venue =
      extractVenue(
        summary
      );

    /*
     * UFFICIALI
     */

    const officials =
      extractOfficials(
        summary
      );

    /*
     * TV
     */

    const tv =
      extractTV(
        summary
      );

    /*
     * MVP
     */

    const mvp =
      extractMVP(
        summary
      );

    /*
     * FORMAZIONI
     */

    const lineups =
      extractLineups(
        summary,
        home,
        away
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

      lineups,

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
       * ARBITRO PRINCIPALE
       */

      referee:
        officials.referee,

      /*
       * TUTTI GLI UFFICIALI
       */

      officials,

      /*
       * TV
       */

      tv,

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
        "Errore interno del server"
    });
  }
};
