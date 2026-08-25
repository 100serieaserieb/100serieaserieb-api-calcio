const { getCompetition } = require("../lib/competitions");
const { getMatchSummary } = require("../lib/espn");
const { normalizeTeamName } = require("../lib/teams");
const { DateTime } = require("luxon");

/*
=========================================================
CONFIG
=========================================================
*/

const TIMEZONE = "Europe/Rome";

/*
=========================================================
DATE
=========================================================
*/

function getRomeDateTime(date) {
  if (!date) return null;

  const parsed = DateTime.fromISO(String(date), {
    zone: "utc"
  });

  if (!parsed.isValid) return null;

  return parsed.setZone(TIMEZONE);
}

/*
=========================================================
GENERIC HELPERS
=========================================================
*/

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function first(...values) {
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

function stringValue(value) {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  const result = String(value).trim();

  return result || null;
}

/*
=========================================================
COMPETITOR
=========================================================
*/

function getCompetitor(competitors, side) {
  if (!Array.isArray(competitors)) {
    return null;
  }

  return (
    competitors.find(
      item =>
        item?.homeAway === side
    ) || null
  );
}

/*
=========================================================
TEAM ID
=========================================================
*/

function getTeamId(competitor) {
  return (
    competitor?.team?.id ||
    competitor?.id ||
    null
  );
}

/*
=========================================================
EVENT TYPE
=========================================================
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
      event.type.description ||
      event.type.id ||
      ""
    );
  }

  return "";
}

/*
=========================================================
EVENT MINUTE
=========================================================
*/

function getEventMinute(event) {
  if (!event) return null;

  if (
    event.clock &&
    typeof event.clock === "object"
  ) {
    return first(
      event.clock.displayValue,
      event.clock.value
    );
  }

  if (
    typeof event.clock === "string"
  ) {
    return event.clock;
  }

  return first(
    event.minute,
    event.period?.displayValue,
    null
  );
}

/*
=========================================================
EVENT TEXT
=========================================================
*/

function getEventText(event) {
  if (!event) return "";

  return first(
    event.text,
    event.description,
    event.shortText,
    ""
  );
}

/*
=========================================================
RAW EVENT TEXT
=========================================================
*/

function getRawEventText(event) {
  if (!event) return "";

  return first(
    event.text,
    event.description,
    event.shortText,
    event.type?.text,
    ""
  );
}

/*
=========================================================
PLAYER FROM EVENT
=========================================================
*/

function getPlayerFromEvent(event, text) {
  if (!event && !text) return null;

  const athlete =
    event?.athlete ||
    event?.player ||
    null;

  if (athlete) {
    return first(
      athlete.displayName,
      athlete.fullName,
      athlete.shortName,
      athlete.name
    );
  }

  if (!text) return null;

  /*
   * Goal!
   */
  let match = text.match(
    /Goal![^.]*\.\s*([^()]+)\s*\(/i
  );

  if (match) {
    return match[1].trim();
  }

  /*
   * Yellow / red card
   */
  match = text.match(
    /^([^(]+)\s*\(/i
  );

  if (match) {
    let player =
      match[1].trim();

    player = player
      .replace(
        /^Delay in match because of an injury\s+/i,
        ""
      )
      .trim();

    if (
      !/^Goal!$/i.test(player) &&
      !/^Substitution/i.test(player)
    ) {
      return player;
    }
  }

  /*
   * Injury
   */
  match = text.match(
    /injury\s+(.+?)\s*\(/i
  );

  if (match) {
    return match[1].trim();
  }

  return null;
}

/*
=========================================================
ASSIST
=========================================================
*/

function getAssistFromText(text) {
  if (!text) return null;

  const match = text.match(
    /Assisted by ([^.]+?)(?:\s+with|\s+following|\.|$)/i
  );

  return match
    ? match[1].trim()
    : null;
}

/*
=========================================================
SUBSTITUTION
=========================================================
*/

function getSubstitution(event, text) {
  const incoming =
    first(
      event?.substitution?.in?.displayName,
      event?.substitution?.in?.fullName,
      event?.incoming?.displayName,
      event?.incoming?.name,
      typeof event?.incoming === "string"
        ? event.incoming
        : null
    );

  const outgoing =
    first(
      event?.substitution?.out?.displayName,
      event?.substitution?.out?.fullName,
      event?.outgoing?.displayName,
      event?.outgoing?.name,
      typeof event?.outgoing === "string"
        ? event.outgoing
        : null
    );

  if (incoming || outgoing) {
    return {
      incoming: incoming || null,
      outgoing: outgoing || null
    };
  }

  if (!text) {
    return {
      incoming: null,
      outgoing: null
    };
  }

  /*
   * Esempio ESPN:
   *
   * Substitution, Udinese.
   * Enzo Ebosse replaces Matteo Palma.
   */
  let match = text.match(
    /Substitution,\s*[^.]+\.\s*(.*?)\s+replaces\s+(.*?)(?:\s+because of an injury)?\./i
  );

  if (!match) {
    match = text.match(
      /Substitution.*?\.\s*(.*?)\s+replaces\s+(.*?)(?:\.|$)/i
    );
  }

  if (!match) {
    return {
      incoming: null,
      outgoing: null
    };
  }

  return {
    incoming:
      match[1]?.trim() || null,

    outgoing:
      match[2]?.trim() || null
  };
}

/*
=========================================================
TRANSLATE EVENT
=========================================================
*/

function translateEventType(type, text = "") {
  const value =
    String(type || "")
      .toLowerCase()
      .trim();

  const raw =
    String(text || "")
      .toLowerCase();

  /*
   * GOAL
   */
  if (
    value.includes("goal") ||
    raw.startsWith("goal!")
  ) {
    return "Gol";
  }

  /*
   * CARDS
   */
  if (
    value.includes("yellow") ||
    raw.includes("yellow card")
  ) {
    return "Cartellino giallo";
  }

  if (
    value.includes("red") ||
    raw.includes("red card")
  ) {
    return "Cartellino rosso";
  }

  /*
   * SUBSTITUTION
   */
  if (
    value.includes("substitution") ||
    raw.includes("substitution")
  ) {
    return "Sostituzione";
  }

  /*
   * KICKOFF
   */
  if (
    value.includes("kickoff") ||
    value.includes("first half begins") ||
    raw.includes("first half begins")
  ) {
    return "Inizio primo tempo";
  }

  /*
   * HALF TIME
   */
  if (
    value.includes("halftime") ||
    value.includes("first half ends") ||
    raw.includes("first half ends")
  ) {
    return "Fine primo tempo";
  }

  /*
   * SECOND HALF
   */
  if (
    value.includes("start 2nd half") ||
    value.includes("second half begins") ||
    raw.includes("second half begins")
  ) {
    return "Inizio secondo tempo";
  }

  /*
   * FULL TIME
   */
  if (
    value.includes("end regular") ||
    value.includes("game over") ||
    value.includes("full time") ||
    raw.includes("game over")
  ) {
    return "Fine partita";
  }

  /*
   * DELAY OVER / RESUME
   */
  if (
    value.includes("end delay") ||
    value.includes("delay over") ||
    raw.includes("delay over") ||
    raw.includes("ready to continue")
  ) {
    return "Ripresa del gioco";
  }

  /*
   * DELAY / INJURY
   */
  if (
    value.includes("start delay") ||
    value.includes("delay") ||
    raw.includes("delay in match") ||
    raw.includes("injury")
  ) {
    return "Interruzione";
  }

  return type || null;
}

/*
=========================================================
ITALIAN EVENT TEXT
=========================================================
*/

function buildItalianEventText(
  event,
  type,
  team,
  player,
  assist,
  incoming,
  outgoing
) {
  const minute =
    getEventMinute(event);

  const prefix =
    minute !== null &&
    minute !== undefined &&
    minute !== ""
      ? `Al ${minute}: `
      : "";

  /*
   * GOAL
   */
  if (
    type === "Gol" &&
    player
  ) {
    let text =
      `${prefix}gol di ${player}`;

    if (team) {
      text += ` per ${team}`;
    }

    if (assist) {
      text += `, assist di ${assist}`;
    }

    return `${text}.`;
  }

  /*
   * YELLOW
   */
  if (
    type === "Cartellino giallo" &&
    player
  ) {
    return (
      `${prefix}cartellino giallo per ${player}` +
      `${team ? ` (${team})` : ""}.`
    );
  }

  /*
   * RED
   */
  if (
    type === "Cartellino rosso" &&
    player
  ) {
    return (
      `${prefix}cartellino rosso per ${player}` +
      `${team ? ` (${team})` : ""}.`
    );
  }

  /*
   * FIRST HALF
   */
  if (
    type === "Inizio primo tempo"
  ) {
    return "Inizio del primo tempo.";
  }

  /*
   * HALF TIME
   */
  if (
    type === "Fine primo tempo"
  ) {
    return "Fine del primo tempo.";
  }

  /*
   * SECOND HALF
   */
  if (
    type === "Inizio secondo tempo"
  ) {
    return "Inizio del secondo tempo.";
  }

  /*
   * FULL TIME
   */
  if (
    type === "Fine partita"
  ) {
    return "Fine della partita.";
  }

  /*
   * RESUME
   */
  if (
    type === "Ripresa del gioco"
  ) {
    return `${prefix}gioco ripreso.`;
  }

  /*
   * DELAY
   */
  if (
    type === "Interruzione"
  ) {
    if (player) {
      return (
        `${prefix}gioco interrotto per un infortunio a ${player}` +
        `${team ? ` (${team})` : ""}.`
      );
    }

    return (
      `${prefix}gioco momentaneamente interrotto.`
    );
  }

  /*
   * SUBSTITUTION
   */
  if (
    type === "Sostituzione"
  ) {
    if (
      incoming &&
      outgoing
    ) {
      return (
        `${prefix}${incoming} entra al posto di ` +
        `${outgoing}` +
        `${team ? ` per ${team}` : ""}.`
      );
    }

    return (
      `${prefix}sostituzione` +
      `${team ? ` per ${team}` : ""}.`
    );
  }

  return (
    getEventText(event) ||
    null
  );
}

/*
=========================================================
EVENT TEAM
=========================================================
*/

function getEventTeam(event) {
  if (!event) return null;

  const team =
    event.team ||
    event.competitor ||
    event.teamInfo ||
    null;

  if (typeof team === "string") {
    return {
      name:
        normalizeTeamName(team),

      id: null
    };
  }

  const id =
    team?.id ||
    team?.team?.id ||
    null;

  const name =
    first(
      team?.displayName,
      team?.fullName,
      team?.shortDisplayName,
      team?.name,
      team?.team?.displayName,
      team?.team?.name
    );

  return {
    id,
    name:
      name
        ? normalizeTeamName(name)
        : null
  };
}

/*
=========================================================
TEAM SIDE
=========================================================
*/

function getTeamSide(
  event,
  home,
  away
) {
  const eventTeam =
    getEventTeam(event);

  if (!eventTeam) {
    return null;
  }

  const homeId =
    getTeamId(home);

  const awayId =
    getTeamId(away);

  if (
    eventTeam.id &&
    homeId &&
    String(eventTeam.id) ===
      String(homeId)
  ) {
    return "home";
  }

  if (
    eventTeam.id &&
    awayId &&
    String(eventTeam.id) ===
      String(awayId)
  ) {
    return "away";
  }

  /*
   * Fallback tramite nome.
   */
  const eventName =
    String(
      eventTeam.name || ""
    ).toLowerCase();

  const homeName =
    String(
      home?.team?.displayName ||
      home?.team?.name ||
      ""
    ).toLowerCase();

  const awayName =
    String(
      away?.team?.displayName ||
      away?.team?.name ||
      ""
    ).toLowerCase();

  if (
    eventName &&
    homeName &&
    (
      eventName === homeName ||
      eventName.includes(homeName) ||
      homeName.includes(eventName)
    )
  ) {
    return "home";
  }

  if (
    eventName &&
    awayName &&
    (
      eventName === awayName ||
      eventName.includes(awayName) ||
      awayName.includes(eventName)
    )
  ) {
    return "away";
  }

  return null;
}

/*
=========================================================
PARSE EVENT
=========================================================
*/

function parseEvent(
  event,
  home,
  away
) {
  if (!event) return null;

  const rawType =
    getEventType(event);

  const rawText =
    getRawEventText(event);

  const type =
    translateEventType(
      rawType,
      rawText
    );

  const eventTeam =
    getEventTeam(event);

  const team =
    eventTeam?.name ||
    null;

  const teamSide =
    getTeamSide(
      event,
      home,
      away
    );

  let player = null;
  let assist = null;

  if (
    type === "Gol" ||
    type === "Cartellino giallo" ||
    type === "Cartellino rosso"
  ) {
    player =
      getPlayerFromEvent(
        event,
        rawText
      );

    assist =
      type === "Gol"
        ? getAssistFromText(
            rawText
          )
        : null;
  }

  if (
    type === "Interruzione" &&
    /injury/i.test(rawText)
  ) {
    player =
      getPlayerFromEvent(
        event,
        rawText
      );
  }

  const substitution =
    type === "Sostituzione"
      ? getSubstitution(
          event,
          rawText
        )
      : {
          incoming: null,
          outgoing: null
        };

  return {
    id:
      event.id ||
      null,

    type,

    minute:
      getEventMinute(event),

    team,

    teamSide,

    player,

    assist,

    incoming:
      substitution.incoming,

    outgoing:
      substitution.outgoing,

    text:
      buildItalianEventText(
        event,
        type,
        team,
        player,
        assist,
        substitution.incoming,
        substitution.outgoing
      ),

    rawText:
      rawText || null
  };
}

/*
=========================================================
ATHLETE HELPERS
=========================================================
*/

function getAthleteObject(item) {
  if (!item) return null;

  return (
    item.athlete ||
    item.player ||
    item
  );
}

function getAthleteName(item) {
  const athlete =
    getAthleteObject(item);

  if (!athlete) return null;

  return first(
    athlete.displayName,
    athlete.fullName,
    athlete.shortName,
    athlete.name,
    item.displayName,
    item.fullName,
    item.name
  );
}

function getAthleteId(item) {
  const athlete =
    getAthleteObject(item);

  return first(
    athlete?.id,
    item?.id,
    null
  );
}

/*
=========================================================
POSITION
=========================================================
*/

function getPlayerPosition(item) {
  const athlete =
    getAthleteObject(item);

  const position =
    first(
      item?.position,
      athlete?.position
    );

  if (
    typeof position === "string"
  ) {
    return position;
  }

  return first(
    position?.abbreviation,
    position?.displayName,
    position?.name,
    item?.position?.abbreviation,
    item?.position?.displayName,
    item?.position?.name,
    athlete?.position?.abbreviation,
    athlete?.position?.displayName,
    athlete?.position?.name,
    null
  );
}

/*
=========================================================
STARTER DETECTION
=========================================================
*/

function isStarter(item) {
  if (!item) return false;

  if (
    item.starter === true ||
    item.isStarter === true
  ) {
    return true;
  }

  const position =
    String(
      getPlayerPosition(item) ||
      ""
    ).toLowerCase();

  if (
    position === "sub" ||
    position.includes("substitute") ||
    position.includes("bench")
  ) {
    return false;
  }

  const status =
    String(
      first(
        item.status?.type,
        item.status?.name,
        item.status,
        item.role,
        ""
      )
    ).toLowerCase();

  return (
    status.includes("starter") ||
    status === "active"
  );
}

/*
=========================================================
SUBSTITUTE DETECTION
=========================================================
*/

function isSubstitute(item) {
  if (!item) return false;

  if (
    item.substitute === true ||
    item.isSubstitute === true
  ) {
    return true;
  }

  const position =
    String(
      getPlayerPosition(item) ||
      ""
    ).toLowerCase();

  if (
    position === "sub" ||
    position.includes("substitute") ||
    position.includes("bench")
  ) {
    return true;
  }

  const status =
    String(
      first(
        item.status?.type,
        item.status?.name,
        item.status,
        item.role,
        ""
      )
    ).toLowerCase();

  return (
    status.includes("substitute") ||
    status.includes("bench")
  );
}

/*
=========================================================
NORMALIZE PLAYER
=========================================================
*/

function normalizePlayer(item) {
  const name =
    getAthleteName(item);

  if (!name) {
    return null;
  }

  const athlete =
    getAthleteObject(item);

  const starter =
    isStarter(item);

  const substitute =
    isSubstitute(item);

  return {
    id:
      getAthleteId(item),

    name,

    jersey:
      first(
        item.jersey,
        athlete?.jersey,
        item.uniformNumber,
        item.jerseyNumber
      ) || null,

    position:
      getPlayerPosition(item),

    starter,

    substitute:
      substitute && !starter
  };
}

/*
=========================================================
VALID PLAYER OBJECT
=========================================================
*/

function looksLikePlayer(item) {
  if (!item || typeof item !== "object") {
    return false;
  }

  const name =
    getAthleteName(item);

  if (!name) {
    return false;
  }

  /*
   * Evita considerare squadre/coach come giocatori.
   */
  const type =
    String(
      item.type?.id ||
      item.type?.name ||
      item.type ||
      ""
    ).toLowerCase();

  if (
    type.includes("team") ||
    type.includes("coach")
  ) {
    return false;
  }

  return true;
}

/*
=========================================================
RECURSIVE PLAYER FINDER
=========================================================
*/

function findPlayersDeep(
  node,
  result = [],
  depth = 0,
  seen = new Set()
) {
  if (
    node === null ||
    node === undefined ||
    depth > 10
  ) {
    return result;
  }

  if (
    typeof node !== "object"
  ) {
    return result;
  }

  /*
   * Evitiamo cicli.
   */
  if (seen.has(node)) {
    return result;
  }

  seen.add(node);

  if (
    looksLikePlayer(node)
  ) {
    result.push(node);
  }

  if (Array.isArray(node)) {
    for (
      const item
      of node
    ) {
      findPlayersDeep(
        item,
        result,
        depth + 1,
        seen
      );
    }

    return result;
  }

  for (
    const [key, value]
    of Object.entries(node)
  ) {
    /*
     * Non cerchiamo giocatori dentro
     * gli eventi: potrebbero creare
     * falsi duplicati.
     */
    if (
      key === "plays" ||
      key === "keyEvents" ||
      key === "events" ||
      key === "broadcasts" ||
      key === "officials"
    ) {
      continue;
    }

    findPlayersDeep(
      value,
      result,
      depth + 1,
      seen
    );
  }

  return result;
}

/*
=========================================================
LINEUP SOURCES
=========================================================
*/

function getLineupSources(
  summary,
  competitor
) {
  const teamId =
    getTeamId(competitor);

  const sources = [];

  /*
   * Competitor
   */
  sources.push(
    competitor
  );

  /*
   * Boxscore players ESPN
   *
   * Struttura tipica:
   *
   * boxscore.players[
   *   {
   *     team: {...},
   *     statistics: [...]
   *   }
   * ]
   */
  for (
    const boxTeam
    of arr(
      summary?.boxscore?.players
    )
  ) {
    const boxTeamId =
      boxTeam?.team?.id ||
      boxTeam?.id ||
      null;

    if (
      teamId &&
      boxTeamId &&
      String(boxTeamId) ===
        String(teamId)
    ) {
      sources.push(
        boxTeam
      );
    }
  }

  /*
   * Roster.
   */
  for (
    const roster
    of arr(
      summary?.rosters
    )
  ) {
    const rosterTeamId =
      roster?.team?.id ||
      roster?.id ||
      null;

    if (
      !teamId ||
      !rosterTeamId ||
      String(rosterTeamId) ===
        String(teamId)
    ) {
      sources.push(
        roster
      );
    }
  }

  /*
   * Boxscore teams.
   */
  for (
    const team
    of arr(
      summary?.boxscore?.teams
    )
  ) {
    const teamId2 =
      team?.team?.id ||
      team?.id ||
      null;

    if (
      teamId &&
      teamId2 &&
      String(teamId2) ===
        String(teamId)
    ) {
      sources.push(
        team
      );
    }
  }

  return sources;
}

/*
=========================================================
FORMATION
=========================================================
*/

function getFormation(
  summary,
  competitor
) {
  const sources =
    getLineupSources(
      summary,
      competitor
    );

  for (
    const source
    of sources
  ) {
    const formation =
      first(
        source?.formation?.text,
        source?.formation?.displayName,
        source?.formation?.name,
        typeof source?.formation === "string"
          ? source.formation
          : null,

        source?.statistics?.formation?.displayValue,
        source?.statistics?.formation?.value
      );

    if (formation) {
      return formation;
    }
  }

  return null;
}

/*
=========================================================
LINEUP
=========================================================
*/

function getLineup(
  summary,
  competitor
) {
  const sources =
    getLineupSources(
      summary,
      competitor
    );

  const candidates = [];

  /*
   * Estraiamo giocatori dalle fonti
   * specifiche ESPN.
   */
  for (
    const source
    of sources
  ) {
    findPlayersDeep(
      source,
      candidates
    );
  }

  /*
   * Fallback: cerchiamo nell'intero
   * summary, ma soltanto negli oggetti
   * associati alla squadra.
   */
  const teamId =
    getTeamId(competitor);

  if (teamId) {
    const teamObjects =
      findObjectsForTeam(
        summary,
        teamId
      );

    for (
      const object
      of teamObjects
    ) {
      findPlayersDeep(
        object,
        candidates
      );
    }
  }

  const uniquePlayers = [];
  const seen = new Set();

  for (
    const candidate
    of candidates
  ) {
    const player =
      normalizePlayer(
        candidate
      );

    if (!player) continue;

    /*
     * Se non abbiamo ID usiamo nome.
     */
    const key =
      player.id
        ? `id:${player.id}`
        : `name:${player.name.toLowerCase()}`;

    if (
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);

    uniquePlayers.push(
      player
    );
  }

  const starters =
    uniquePlayers.filter(
      player =>
        player.starter === true
    );

  const substitutes =
    uniquePlayers.filter(
      player =>
        player.substitute === true &&
        player.starter !== true
    );

  /*
   * Se ESPN ha fornito una lista completa
   * ma non ha marcato gli starter, utilizziamo
   * la formazione e le posizioni per evitare
   * di perdere i giocatori.
   */
  let finalStarters =
    starters;

  let finalSubstitutes =
    substitutes;

  /*
   * Se abbiamo meno di 11 titolari
   * e i giocatori sono presenti, prendiamo
   * quelli non SUB come fallback.
   */
  if (
    finalStarters.length === 0 &&
    uniquePlayers.length > 0
  ) {
    const fallback =
      uniquePlayers.filter(
        player =>
          !player.substitute &&
          player.position !== "SUB"
      );

    if (
      fallback.length > 0
    ) {
      finalStarters =
        fallback.slice(0, 11);
    }
  }

  /*
   * Tutti i restanti giocatori diventano
   * panchinari se ESPN li ha marcati SUB.
   */
  if (
    finalSubstitutes.length === 0
  ) {
    finalSubstitutes =
      uniquePlayers.filter(
        player =>
          !finalStarters.some(
            starter =>
              String(starter.id) ===
              String(player.id)
          ) &&
          player.position === "SUB"
      );
  }

  return {
    formation:
      getFormation(
        summary,
        competitor
      ),

    starters:
      finalStarters,

    substitutes:
      finalSubstitutes,

    players:
      uniquePlayers
  };
}

/*
=========================================================
RECURSIVE TEAM FINDER
=========================================================
*/

function sameTeam(
  value,
  teamId
) {
  if (
    !value ||
    !teamId
  ) {
    return false;
  }

  const ids = [
    value.id,
    value.team?.id,
    value.athlete?.team?.id,
    value.player?.team?.id,
    value.competitor?.id,
    value.competitor?.team?.id
  ];

  return ids.some(
    id =>
      id !== undefined &&
      id !== null &&
      String(id) ===
        String(teamId)
  );
}

function findObjectsForTeam(
  node,
  teamId,
  result = [],
  depth = 0,
  seen = new Set()
) {
  if (
    node === null ||
    node === undefined ||
    depth > 8
  ) {
    return result;
  }

  if (
    typeof node !== "object"
  ) {
    return result;
  }

  if (
    seen.has(node)
  ) {
    return result;
  }

  seen.add(node);

  if (
    sameTeam(
      node,
      teamId
    )
  ) {
    result.push(node);
  }

  if (Array.isArray(node)) {
    for (
      const item
      of node
    ) {
      findObjectsForTeam(
        item,
        teamId,
        result,
        depth + 1,
        seen
      );
    }

    return result;
  }

  for (
    const [key, value]
    of Object.entries(node)
  ) {
    if (
      key === "plays" ||
      key === "keyEvents" ||
      key === "events"
    ) {
      continue;
    }

    findObjectsForTeam(
      value,
      teamId,
      result,
      depth + 1,
      seen
    );
  }

  return result;
}

/*
=========================================================
STATISTICS
=========================================================
*/

function getStatisticValue(stat) {
  if (!stat) return null;

  return first(
    stat.displayValue,
    stat.value,
    stat.displayValueText,
    stat.description
  );
}

/*
=========================================================
STAT NAME
=========================================================
*/

function normalizeStatisticName(name) {
  const value =
    String(name || "")
      .toLowerCase()
      .trim();

  /*
   * POSSESSION
   */
  if (
    value.includes("possession") ||
    value.includes("possesso")
  ) {
    return "possession";
  }

  /*
   * SHOTS ON TARGET
   */
  if (
    value.includes("shots on target") ||
    value.includes("shots on goal") ||
    value.includes("shots on frame") ||
    value.includes("tiri in porta")
  ) {
    return "shotsOnTarget";
  }

  /*
   * SHOTS
   */
  if (
    value === "shots" ||
    value === "shot" ||
    value.includes("total shots") ||
    value.includes("shots total") ||
    value.includes("tiri totali")
  ) {
    return "shots";
  }

  /*
   * BLOCKED SHOTS
   */
  if (
    value.includes("blocked shots") ||
    value.includes("blocked shot") ||
    value.includes("tiri bloccati")
  ) {
    return "blockedShots";
  }

  /*
   * CORNERS
   */
  if (
    value.includes("corner") ||
    value.includes("calci d'angolo")
  ) {
    return "corners";
  }

  /*
   * OFFSIDES
   */
  if (
    value.includes("offside") ||
    value.includes("offsides") ||
    value.includes("fuorigioco")
  ) {
    return "offsides";
  }

  /*
   * FOULS
   */
  if (
    value.includes("foul") ||
    value.includes("falli")
  ) {
    return "fouls";
  }

  /*
   * YELLOW
   */
  if (
    value.includes("yellow card") ||
    value.includes("yellow cards") ||
    value === "yellow"
  ) {
    return "yellowCards";
  }

  /*
   * RED
   */
  if (
    value.includes("red card") ||
    value.includes("red cards") ||
    value === "red"
  ) {
    return "redCards";
  }

  /*
   * SAVES
   */
  if (
    value.includes("save") ||
    value.includes("goalkeeper save") ||
    value.includes("goalkeeper saves") ||
    value.includes("parade")
  ) {
    return "saves";
  }

  return null;
}

/*
=========================================================
READ STATISTICS
=========================================================
*/

function readStatisticsArray(
  statistics,
  output
) {
  for (
    const stat
    of arr(statistics)
  ) {
    const name =
      normalizeStatisticName(
        first(
          stat.name,
          stat.label,
          stat.displayName,
          stat.abbreviation,
          stat.type,
          stat.shortName
        )
      );

    if (!name) continue;

    const value =
      getStatisticValue(
        stat
      );

    if (
      value !== null &&
      value !== undefined
    ) {
      output[name] =
        value;
    }
  }
}

/*
=========================================================
COLLECT STATISTICS
=========================================================
*/

function collectStatistics(
  node,
  output
) {
  if (!node) return;

  const sources = [
    node.statistics,
    node.stats,
    node.team?.statistics,
    node.team?.stats,
    node.competitor?.statistics,
    node.competitor?.stats
  ];

  for (
    const source
    of sources
  ) {
    if (
      Array.isArray(source)
    ) {
      readStatisticsArray(
        source,
        output
      );
    }
  }

  /*
   * ESPN può avere statistiche
   * dentro statisticGroups.
   */
  for (
    const group
    of arr(node.statistics?.statistics)
  ) {
    readStatisticsArray(
      group,
      output
    );
  }
}

/*
=========================================================
STATISTICS
=========================================================
*/

function getStatistics(
  summary,
  competitionInfo,
  home,
  away
) {
  const result = {
    home: {},
    away: {}
  };

  /*
   * HEADER COMPETITORS
   */
  for (
    const competitor
    of arr(
      competitionInfo?.competitors
    )
  ) {
    const side =
      competitor?.homeAway;

    if (
      side !== "home" &&
      side !== "away"
    ) {
      continue;
    }

    collectStatistics(
      competitor,
      result[side]
    );
  }

  /*
   * BOXSCORE TEAMS
   */
  for (
    const team
    of arr(
      summary?.boxscore?.teams
    )
  ) {
    const side =
      team?.homeAway;

    if (
      side !== "home" &&
      side !== "away"
    ) {
      continue;
    }

    collectStatistics(
      team,
      result[side]
    );
  }

  /*
   * BOXSCORE PLAYERS / TEAM OBJECTS
   */
  for (
    const [side, competitor]
    of [
      ["home", home],
      ["away", away]
    ]
  ) {
    const teamId =
      getTeamId(
        competitor
      );

    const objects =
      findObjectsForTeam(
        summary,
        teamId
      );

    for (
      const object
      of objects
    ) {
      collectStatistics(
        object,
        result[side]
      );
    }
  }

  /*
   * Garantiamo valori standard.
   */
  for (
    const side
    of ["home", "away"]
  ) {
    const defaults = {
      fouls: "0",
      yellowCards: "0",
      redCards: "0",
      offsides: "0",
      corners: "0",
      saves: "0",
      possession: "0",
      shots: "0",
      shotsOnTarget: "0",
      blockedShots: "0"
    };

    for (
      const [key, value]
      of Object.entries(defaults)
    ) {
      if (
        result[side][key] ===
          undefined ||
        result[side][key] === null
      ) {
        result[side][key] =
          value;
      }
    }
  }

  return result;
}

/*
=========================================================
PENALTIES
=========================================================
*/

function getPenalties(summary) {
  const result = {
    home: [],
    away: []
  };

  const plays = [
    ...arr(summary?.plays),
    ...arr(summary?.keyEvents)
  ];

  const seen =
    new Set();

  for (
    const play
    of plays
  ) {
    const id =
      play?.id ||
      `${getEventMinute(play)}-${getEventText(play)}`;

    if (
      seen.has(id)
    ) {
      continue;
    }

    seen.add(id);

    const text =
      getRawEventText(play);

    if (
      !/penalty|rigore/i.test(
        text
      )
    ) {
      continue;
    }

    const eventTeam =
      getEventTeam(play);

    const side =
      play?.team?.homeAway ||
      play?.team?.side ||
      null;

    const item = {
      id:
        play?.id ||
        null,

      minute:
        getEventMinute(play),

      player:
        getPlayerFromEvent(
          play,
          text
        ),

      esito:
        /miss|save|saved|sbagliato|parato/i.test(
          text
        )
          ? "Sbagliato/Parato"
          : /goal|gol|scored/i.test(
              text
            )
            ? "Realizzato"
            : "Tentativo di rigore",

      team:
        eventTeam?.name ||
        null,

      teamSide:
        side,

      text:
        text || null
    };

    if (
      side === "home"
    ) {
      result.home.push(
        item
      );
    }

    if (
      side === "away"
    ) {
      result.away.push(
        item
      );
    }
  }

  return result;
}

/*
=========================================================
VENUE
=========================================================
*/

function normalizeVenue(venue) {
  if (!venue) return null;

  return {
    id:
      venue.id ||
      null,

    name:
      first(
        venue.fullName,
        venue.displayName,
        venue.name
      ),

    city:
      first(
        venue.address?.city,
        venue.city
      ),

    country:
      first(
        venue.address?.country,
        venue.country
      ),

    capacity:
      first(
        venue.capacity,
        venue.seatingCapacity
      ),

    address:
      first(
        venue.address?.fullAddress,
        venue.address?.street,
        venue.address?.line1
      )
  };
}

function getVenue(
  summary,
  competitionInfo
) {
  const possibleVenues = [
    competitionInfo?.venue,
    competitionInfo?.venue?.venue,
    summary?.gameInfo?.venue,
    summary?.gameInfo?.venue?.venue,
    summary?.header?.venue,
    summary?.venue
  ];

  for (
    const venue
    of possibleVenues
  ) {
    const result =
      normalizeVenue(
        venue
      );

    if (
      result?.name
    ) {
      return result;
    }
  }

  /*
   * Alcune risposte ESPN hanno
   * location dentro gameInfo.
   */
  const location =
    summary?.gameInfo?.venue?.location ||
    summary?.gameInfo?.location ||
    null;

  if (location) {
    return {
      id: null,

      name:
        first(
          location.name,
          location.displayName
        ),

      city:
        location.address?.city ||
        null,

      country:
        location.address?.country ||
        null,

      capacity:
        location.capacity ||
        null,

      address:
        location.address?.fullAddress ||
        null
    };
  }

  return null;
}

/*
=========================================================
OFFICIALS
=========================================================
*/

function getOfficials(summary) {
  const officials =
    summary?.header
      ?.competitions?.[0]
      ?.officials ||
    summary?.gameInfo
      ?.officials ||
    [];

  if (
    !Array.isArray(
      officials
    )
  ) {
    return [];
  }

  return officials.map(
    official => ({
      id:
        official.id ||
        official.person?.id ||
        null,

      name:
        first(
          official.displayName,
          official.fullName,
          official.name,
          official.person?.displayName
        ),

      role:
        first(
          official.position?.displayName,
          official.position?.name,
          official.role,
          "Arbitro"
        )
    })
  );
}

/*
=========================================================
TV
=========================================================
*/

function getBroadcasts(
  summary,
  competitionInfo
) {
  const broadcasts = [
    ...arr(
      competitionInfo?.broadcasts
    ),
    ...arr(
      summary?.broadcasts
    ),
    ...arr(
      summary?.header
        ?.competitions?.[0]
        ?.broadcasts
    )
  ];

  const result = [];

  for (
    const item
    of broadcasts
  ) {
    const name =
      first(
        item.names?.[0],
        item.name,
        item.displayName,
        item.media?.name
      );

    const type =
      first(
        item.type?.shortName,
        item.type?.text,
        item.type?.name,
        item.media?.type,
        typeof item.type === "string"
          ? item.type
          : null
      );

    const key =
      `${name || ""}|${type || ""}`;

    if (
      !result.some(
        current =>
          `${current.name || ""}|${current.type || ""}` ===
          key
      )
    ) {
      result.push({
        name:
          name || null,

        type:
          type || null
      });
    }
  }

  return result;
}

/*
=========================================================
MVP
=========================================================
*/

function getMVP(summary) {
  const leaders =
    summary?.leaders ||
    summary?.header
      ?.competitions?.[0]
      ?.leaders ||
    [];

  if (
    !Array.isArray(
      leaders
    )
  ) {
    return null;
  }

  for (
    const group
    of leaders
  ) {
    const name =
      String(
        group.name ||
        group.displayName ||
        group.shortDisplayName ||
        ""
      ).toLowerCase();

    if (
      name.includes(
        "player of the match"
      ) ||
      name.includes(
        "match winner"
      ) ||
      name.includes("mvp")
    ) {
      const leader =
        group.leaders?.[0];

      const athlete =
        leader?.athlete ||
        leader?.player ||
        null;

      if (athlete) {
        return {
          player:
            first(
              athlete.displayName,
              athlete.fullName,
              athlete.shortName
            ),

          team:
            athlete.team
              ?.displayName
              ? normalizeTeamName(
                  athlete.team
                    .displayName
                )
              : null,

          value:
            first(
              leader.value,
              leader.displayValue
            )
        };
      }
    }
  }

  return null;
}

/*
=========================================================
EVENT DEDUPLICATION
=========================================================
*/

function getEventUniqueId(event) {
  if (event?.id) {
    return String(
      event.id
    );
  }

  return [
    getEventMinute(event),
    getEventType(event),
    getEventText(event)
  ]
    .filter(Boolean)
    .join("|");
}

/*
=========================================================
MAIN API
=========================================================
*/

module.exports = async (
  req,
  res
) => {
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

    if (
      !competition.espnLeague
    ) {
      return res.status(400).json({
        success: false,
        error:
          "Codice ESPN non configurato"
      });
    }

    /*
     * ESPN SUMMARY
     */
    const summary =
      await getMatchSummary(
        competition.espnLeague,
        eventId
      );

    if (
      !summary ||
      !summary.header
    ) {
      return res.status(404).json({
        success: false,
        error:
          "Dati partita non disponibili da ESPN"
      });
    }

    const header =
      summary.header;

    const competitionInfo =
      header.competitions?.[0] ||
      null;

    if (!competitionInfo) {
      return res.status(404).json({
        success: false,
        error:
          "Informazioni competizione non disponibili"
      });
    }

    /*
     * COMPETITOR
     */
    const competitors =
      arr(
        competitionInfo.competitors
      );

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
      first(
        header.date,
        competitionInfo.date
      );

    const dateTime =
      getRomeDateTime(
        matchDate
      );

    /*
     * LOGHI
     */
    const homeLogo =
      first(
        home?.team?.logos?.[0]?.href,
        home?.team?.logo,
        home?.team?.logos?.[0]?.url
      );

    const awayLogo =
      first(
        away?.team?.logos?.[0]?.href,
        away?.team?.logo,
        away?.team?.logos?.[0]?.url
      );

    /*
     * EVENTI
     */
    const rawEvents = [
      ...arr(
        summary.keyEvents
      ),
      ...arr(
        summary.plays
      )
    ];

    const eventMap =
      new Map();

    for (
      const event
      of rawEvents
    ) {
      const id =
        getEventUniqueId(
          event
        );

      if (
        !eventMap.has(id)
      ) {
        eventMap.set(
          id,
          event
        );
      }
    }

    const events =
      [...eventMap.values()]
        .map(
          event =>
            parseEvent(
              event,
              home,
              away
            )
        )
        .filter(Boolean);

    /*
     * FORMAZIONI
     */
    const homeLineup =
      getLineup(
        summary,
        home
      );

    const awayLineup =
      getLineup(
        summary,
        away
      );

    /*
     * STATISTICHE
     */
    const statistics =
      getStatistics(
        summary,
        competitionInfo,
        home,
        away
      );

    /*
     * RIGORI
     */
    const penalties =
      getPenalties(
        summary
      );

    /*
     * STADIO
     */
    const venue =
      getVenue(
        summary,
        competitionInfo
      );

    /*
     * ARBITRI
     */
    const officials =
      getOfficials(
        summary
      );

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
      getMVP(
        summary
      );

    /*
     * STATUS
     */
    const status =
      competitionInfo?.status ||
      {};

    const statusType =
      status.type ||
      {};

    /*
     * RISPOSTA
     */
    const response = {
      success: true,

      source: "ESPN",

      timezone:
        TIMEZONE,

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
          id:
            getTeamId(
              home
            ),

          name:
            home?.team?.displayName
              ? normalizeTeamName(
                  home.team
                    .displayName
                )
              : null,

          abbreviation:
            first(
              home?.team?.abbreviation,
              home?.team?.shortDisplayName
            ),

          score:
            home?.score ??
            "-",

          logo:
            homeLogo
        },

        away: {
          id:
            getTeamId(
              away
            ),

          name:
            away?.team?.displayName
              ? normalizeTeamName(
                  away.team
                    .displayName
                )
              : null,

          abbreviation:
            first(
              away?.team?.abbreviation,
              away?.team?.shortDisplayName
            ),

          score:
            away?.score ??
            "-",

          logo:
            awayLogo
        },

        status: {
          state:
            statusType.state ||
            null,

          name:
            statusType.name ||
            null,

          description:
            statusType.description ||
            null,

          detail:
            statusType.detail ||
            null,

          shortDetail:
            statusType.shortDetail ||
            null,

          clock:
            status.displayClock ||
            null,

          period:
            status.period ||
            null,

          completed:
            statusType.completed === true
        }
      },

      /*
       * FORMAZIONI
       */
      lineups: {
        home: {
          formation:
            homeLineup.formation,

          starters:
            homeLineup.starters,

          substitutes:
            homeLineup.substitutes,

          players:
            homeLineup.players
        },

        away: {
          formation:
            awayLineup.formation,

          starters:
            awayLineup.starters,

          substitutes:
            awayLineup.substitutes,

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
       * ARBITRI
       */
      officials,

      /*
       * TV
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
    };

    /*
     * CACHE
     */
    res.setHeader(
      "Cache-Control",
      "s-maxage=15, stale-while-revalidate=30"
    );

    return res
      .status(200)
      .json(response);

  } catch (error) {
    console.error(
      "ESPN MATCH ERROR:",
      error
    );

    return res.status(500).json({
      success: false,

      error:
        error?.message ||
        "Errore interno",

      eventId:
        req.query?.id ||
        null
    });
  }
};
