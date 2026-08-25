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
  return arr(competitors).find(
    item => item?.homeAway === side
  ) || null;
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
    return first(
      event.type.text,
      event.type.name,
      event.type.displayName,
      event.type.id,
      ""
    );
  }

  return "";
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

  return first(
    event.clock,
    event.minute,
    event.displayClock
  );
}

/*
=========================================================
NORMALIZE TEAM
=========================================================
*/

function normalizeEventTeam(team) {
  if (!team) return null;

  if (typeof team === "string") {
    return normalizeTeamName(team);
  }

  const name = first(
    team.displayName,
    team.shortDisplayName,
    team.name
  );

  return name
    ? normalizeTeamName(name)
    : null;
}

/*
=========================================================
TEAM SIDE
=========================================================
*/

function getTeamSide(event, home, away) {
  if (!event) return null;

  const eventTeam =
    event.team ||
    event.competitor ||
    null;

  const eventTeamId =
    eventTeam?.id ||
    eventTeam?.team?.id ||
    null;

  if (
    eventTeamId &&
    String(eventTeamId) ===
      String(home?.team?.id || home?.id)
  ) {
    return "home";
  }

  if (
    eventTeamId &&
    String(eventTeamId) ===
      String(away?.team?.id || away?.id)
  ) {
    return "away";
  }

  if (
    eventTeam?.homeAway === "home" ||
    event.homeAway === "home"
  ) {
    return "home";
  }

  if (
    eventTeam?.homeAway === "away" ||
    event.homeAway === "away"
  ) {
    return "away";
  }

  return null;
}

/*
=========================================================
PLAYER FROM EVENT
=========================================================
*/

function getPlayerFromEvent(event) {
  if (!event) return null;

  const athlete =
    event.athlete ||
    event.player ||
    null;

  if (athlete) {
    return first(
      athlete.displayName,
      athlete.fullName,
      athlete.shortName,
      athlete.name
    );
  }

  const text = getEventText(event);

  if (!text) return null;

  /*
   * Goal!
   */
  if (/^Goal!/i.test(text)) {
    const goalMatch = text.match(
      /^Goal![^.]*\.\s*([^()]+)\s*\(/
    );

    if (goalMatch) {
      return goalMatch[1].trim();
    }
  }

  /*
   * Cartellino
   */
  const cardMatch = text.match(
    /^([^()]+?)\s*\([^)]*\)\s+is shown/i
  );

  if (cardMatch) {
    return cardMatch[1].trim();
  }

  /*
   * Injury
   */
  const injuryMatch = text.match(
    /injury\s+(.+?)\s*\(/i
  );

  if (injuryMatch) {
    return injuryMatch[1].trim();
  }

  return null;
}

/*
=========================================================
ASSIST
=========================================================
*/

function getAssistFromEvent(event) {
  if (!event) return null;

  const direct =
    event.assist ||
    event.assistedBy ||
    event.assister;

  if (typeof direct === "string") {
    return direct.trim();
  }

  if (direct?.displayName) {
    return direct.displayName;
  }

  const text = getEventText(event);

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
EVENT CLASSIFICATION
=========================================================
*/

function classifyEvent(event) {
  const rawType =
    String(getEventType(event) || "")
      .toLowerCase();

  const text =
    String(getEventText(event) || "")
      .toLowerCase();

  if (
    rawType.includes("substitution") ||
    text.startsWith("substitution")
  ) {
    return "Sostituzione";
  }

  if (
    rawType.includes("goal") ||
    text.startsWith("goal!")
  ) {
    return "Gol";
  }

  if (
    rawType.includes("yellow") ||
    text.includes("yellow card")
  ) {
    return "Cartellino giallo";
  }

  if (
    rawType.includes("red") ||
    text.includes("red card")
  ) {
    return "Cartellino rosso";
  }

  if (
    rawType.includes("kickoff") ||
    text.includes("first half begins")
  ) {
    return "Inizio primo tempo";
  }

  if (
    rawType.includes("halftime") ||
    text.includes("first half ends")
  ) {
    return "Fine primo tempo";
  }

  if (
    rawType.includes("start 2nd half") ||
    text.includes("second half begins")
  ) {
    return "Inizio secondo tempo";
  }

  if (
    rawType.includes("end regular") ||
    rawType.includes("game end") ||
    text.includes("match ends") ||
    text.includes("game ends")
  ) {
    return "Fine partita";
  }

  if (
    text.includes("delay in match because of an injury")
  ) {
    return "Interruzione";
  }

  if (
    text.includes("delay over") ||
    rawType.includes("delay")
  ) {
    return "Ripresa del gioco";
  }

  return first(
    getEventType(event),
    "Evento"
  );
}

/*
=========================================================
SUBSTITUTION
=========================================================
*/

function parseSubstitution(event) {
  const text = getEventText(event);

  let incoming =
    first(
      event?.substitution?.in?.displayName,
      event?.substitution?.incoming?.displayName,
      event?.incoming?.displayName,
      event?.incoming
    );

  let outgoing =
    first(
      event?.substitution?.out?.displayName,
      event?.substitution?.outgoing?.displayName,
      event?.outgoing?.displayName,
      event?.outgoing
    );

  if (
    (!incoming || !outgoing) &&
    text
  ) {
    const match = text.match(
      /Substitution,\s*[^.]+\.\s*(.*?)\s+replaces\s+(.*?)(?:\s+because of an injury)?\./i
    );

    if (match) {
      incoming =
        incoming ||
        match[1].trim();

      outgoing =
        outgoing ||
        match[2].trim();
    }
  }

  return {
    incoming:
      stringValue(incoming),

    outgoing:
      stringValue(outgoing)
  };
}

/*
=========================================================
EVENT TRANSLATION
=========================================================
*/

function buildItalianEventText(
  event,
  type,
  team,
  player,
  assist,
  substitution
) {
  const minute =
    getEventMinute(event);

  const prefix = minute !== null
    ? `Al ${minute}: `
    : "";

  switch (type) {
    case "Gol": {
      if (!player) {
        return `${prefix}gol.`;
      }

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

    case "Cartellino giallo":
      return (
        `${prefix}cartellino giallo per ` +
        `${player || "un giocatore"}` +
        `${team ? ` (${team})` : ""}.`
      );

    case "Cartellino rosso":
      return (
        `${prefix}cartellino rosso per ` +
        `${player || "un giocatore"}` +
        `${team ? ` (${team})` : ""}.`
      );

    case "Sostituzione":
      if (
        substitution?.incoming &&
        substitution?.outgoing
      ) {
        return (
          `${prefix}${substitution.incoming} ` +
          `entra al posto di ` +
          `${substitution.outgoing}` +
          `${team ? ` per ${team}` : ""}.`
        );
      }

      return (
        `${prefix}sostituzione` +
        `${team ? ` per ${team}` : ""}.`
      );

    case "Inizio primo tempo":
      return "Inizio del primo tempo.";

    case "Fine primo tempo":
      return "Fine del primo tempo.";

    case "Inizio secondo tempo":
      return "Inizio del secondo tempo.";

    case "Fine partita":
      return "Fine della partita.";

    case "Interruzione":
      if (player) {
        return (
          `${prefix}gioco interrotto per un ` +
          `infortunio a ${player}` +
          `${team ? ` (${team})` : ""}.`
        );
      }

      return `${prefix}gioco momentaneamente interrotto.`;

    case "Ripresa del gioco":
      return `${prefix}gioco ripreso.`;

    default:
      return getEventText(event) || null;
  }
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

  const type =
    classifyEvent(event);

  const teamSide =
    getTeamSide(
      event,
      home,
      away
    );

  const team =
    normalizeEventTeam(
      event.team
    );

  const player =
    getPlayerFromEvent(event);

  const assist =
    type === "Gol"
      ? getAssistFromEvent(event)
      : null;

  const substitution =
    type === "Sostituzione"
      ? parseSubstitution(event)
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

    player:
      type === "Sostituzione"
        ? null
        : player,

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
        substitution
      ),

    rawText:
      getEventText(event) || null
  };
}

/*
=========================================================
DEDUPLICATE EVENTS
=========================================================
*/

function eventKey(event) {
  if (!event) return "";

  if (event.id) {
    return String(event.id);
  }

  return [
    classifyEvent(event),
    getEventMinute(event),
    getEventText(event)
  ]
    .join("|")
    .toLowerCase();
}

function deduplicateEvents(events) {
  const map = new Map();

  for (const event of arr(events)) {
    const key = eventKey(event);

    if (!map.has(key)) {
      map.set(key, event);
    }
  }

  return [...map.values()];
}

/*
=========================================================
TEAM SEARCH
=========================================================
*/

function sameTeam(value, teamId) {
  if (!value || !teamId) {
    return false;
  }

  const ids = [
    value.id,
    value.team?.id,
    value.athlete?.team?.id,
    value.competitor?.id,
    value.competitor?.team?.id
  ];

  return ids.some(
    id =>
      id !== undefined &&
      id !== null &&
      String(id) === String(teamId)
  );
}

function findObjectsForTeam(
  node,
  teamId,
  result = [],
  depth = 0,
  seen = new WeakSet()
) {
  if (
    node === null ||
    node === undefined ||
    depth > 7
  ) {
    return result;
  }

  if (
    typeof node !== "object"
  ) {
    return result;
  }

  /*
   * Evita loop circolari.
   */
  if (seen.has(node)) {
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

  /*
   * Campi che non servono per il roster.
   */
  const ignored = new Set([
    "plays",
    "keyEvents",
    "leaders"
  ]);

  if (Array.isArray(node)) {
    for (const item of node) {
      findObjectsForTeam(
        item,
        teamId,
        result,
        depth + 1,
        seen
      );
    }
  } else {
    for (const key of Object.keys(node)) {
      if (ignored.has(key)) {
        continue;
      }

      findObjectsForTeam(
        node[key],
        teamId,
        result,
        depth + 1,
        seen
      );
    }
  }

  return result;
}

/*
=========================================================
PLAYER NAME
=========================================================
*/

function getAthleteName(item) {
  if (!item) return null;

  const athlete =
    item.athlete ||
    item.player ||
    item;

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

/*
=========================================================
PLAYER ID
=========================================================
*/

function getAthleteId(item) {
  if (!item) return null;

  const athlete =
    item.athlete ||
    item.player ||
    item;

  return first(
    athlete.id,
    item.id
  );
}

/*
=========================================================
POSITION
=========================================================
*/

function getPlayerPosition(item) {
  if (!item) return null;

  const athlete =
    item.athlete ||
    item.player ||
    item;

  return first(
    item.position?.abbreviation,
    item.position?.displayName,
    item.position?.name,

    athlete.position?.abbreviation,
    athlete.position?.displayName,
    athlete.position?.name
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
      getPlayerPosition(item) || ""
    ).toUpperCase();

  if (
    position === "SUB" ||
    position.includes("SUBSTITUTE") ||
    position.includes("BENCH")
  ) {
    return true;
  }

  const status =
    String(
      first(
        item.status?.type,
        item.status?.name,
        item.status,
        item.role
      ) || ""
    ).toLowerCase();

  return (
    status.includes("substitute") ||
    status.includes("bench")
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

  /*
   * Se ESPN classifica il giocatore come SUB,
   * non può essere titolare.
   */
  if (isSubstitute(item)) {
    return false;
  }

  const status =
    String(
      first(
        item.status?.type,
        item.status?.name,
        item.status,
        item.role
      ) || ""
    ).toLowerCase();

  return (
    status.includes("starter") ||
    status === "active"
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
    item.athlete ||
    item.player ||
    item;

  const substitute =
    isSubstitute(item);

  const starter =
    !substitute &&
    isStarter(item);

  return {
    id:
      getAthleteId(item),

    name,

    jersey:
      first(
        item.jersey,
        athlete.jersey,
        item.uniformNumber
      ) || null,

    position:
      getPlayerPosition(item),

    starter,

    substitute
  };
}

/*
=========================================================
EXTRACT PLAYERS
=========================================================
*/

function extractPlayersFromNode(node) {
  if (!node) return [];

  const candidates = [];

  const sources = [
    node.roster?.athletes,
    node.roster?.players,
    node.athletes,
    node.players,
    node.lineup?.athletes,
    node.lineup?.players,
    Array.isArray(node.lineup)
      ? node.lineup
      : null
  ];

  for (const source of sources) {
    if (Array.isArray(source)) {
      candidates.push(...source);
    }
  }

  return candidates;
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
  const teamId =
    competitor?.team?.id ||
    competitor?.id;

  const teamObjects =
    findObjectsForTeam(
      summary,
      teamId
    );

  const candidates = [];

  for (const object of teamObjects) {
    candidates.push(
      ...extractPlayersFromNode(object)
    );
  }

  candidates.push(
    ...extractPlayersFromNode(
      competitor
    )
  );

  const uniquePlayers = [];
  const seen = new Set();

  for (const candidate of candidates) {
    const player =
      normalizePlayer(candidate);

    if (!player) continue;

    const key =
      player.id ||
      player.name.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniquePlayers.push(player);
  }

  const starters =
    uniquePlayers.filter(
      player => player.starter
    );

  const substitutes =
    uniquePlayers.filter(
      player =>
        player.substitute &&
        !player.starter
    );

  const formation =
    first(
      competitor?.formation?.text,
      competitor?.formation?.displayName,
      competitor?.formation?.name,
      typeof competitor?.formation === "string"
        ? competitor.formation
        : null,

      ...teamObjects.map(
        item =>
          first(
            item.formation?.text,
            item.formation?.displayName,
            item.formation?.name,
            typeof item.formation === "string"
              ? item.formation
              : null
          )
      )
    );

  return {
    formation:
      formation || null,

    starters,

    substitutes,

    players:
      uniquePlayers
  };
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
    stat.text
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

  if (
    value.includes("possession") ||
    value.includes("possesso")
  ) {
    return "possession";
  }

  if (
    value.includes("shots on target") ||
    value.includes("shots on goal") ||
    value.includes("shotsontarget") ||
    value.includes("tiri in porta")
  ) {
    return "shotsOnTarget";
  }

  if (
    value === "shots" ||
    value.includes("total shots") ||
    value.includes("shots total") ||
    value.includes("totalshots") ||
    value.includes("tiri totali")
  ) {
    return "shots";
  }

  if (
    value.includes("corner") ||
    value.includes("calci d'angolo")
  ) {
    return "corners";
  }

  if (
    value.includes("offside") ||
    value.includes("offsides") ||
    value.includes("fuorigioco")
  ) {
    return "offsides";
  }

  if (
    value.includes("foul") ||
    value.includes("falli")
  ) {
    return "fouls";
  }

  if (
    value.includes("yellow card") ||
    value === "yellow" ||
    value.includes("yellowcards")
  ) {
    return "yellowCards";
  }

  if (
    value.includes("red card") ||
    value === "red" ||
    value.includes("redcards")
  ) {
    return "redCards";
  }

  if (
    value.includes("save") ||
    value.includes("goalkeeper save") ||
    value.includes("parade")
  ) {
    return "saves";
  }

  if (
    value.includes("blocked shot") ||
    value.includes("blockedshots")
  ) {
    return "blockedShots";
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
  for (const stat of arr(statistics)) {
    const name =
      normalizeStatisticName(
        first(
          stat.name,
          stat.label,
          stat.displayName,
          stat.abbreviation,
          stat.type
        )
      );

    if (!name) continue;

    const value =
      getStatisticValue(stat);

    if (
      value !== null &&
      value !== undefined
    ) {
      output[name] = value;
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

  for (const source of sources) {
    if (Array.isArray(source)) {
      readStatisticsArray(
        source,
        output
      );
    }
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
   * Header competitors
   */
  for (
    const competitor
    of arr(competitionInfo?.competitors)
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
   * Boxscore
   */
  for (
    const team
    of arr(summary?.boxscore?.teams)
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
   * Recursive fallback
   */
  for (
    const [side, competitor]
    of [
      ["home", home],
      ["away", away]
    ]
  ) {
    const teamId =
      competitor?.team?.id ||
      competitor?.id;

    if (!teamId) continue;

    const objects =
      findObjectsForTeam(
        summary,
        teamId
      );

    for (const object of objects) {
      collectStatistics(
        object,
        result[side]
      );
    }
  }

  return result;
}

/*
=========================================================
PENALTIES
=========================================================
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

  const plays = [
    ...arr(summary?.plays),
    ...arr(summary?.keyEvents)
  ];

  const seen = new Set();

  for (const play of plays) {
    const text =
      getEventText(play);

    if (
      !/penalty|penalty kick|rigore/i.test(
        text
      )
    ) {
      continue;
    }

    const key =
      play.id ||
      `${getEventMinute(play)}|${text}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    const side =
      getTeamSide(
        play,
        home,
        away
      );

    const lower =
      text.toLowerCase();

    let esito =
      "Tentativo di rigore";

    if (
      /miss|missed|saved|save|parato|sbagliato/i.test(
        lower
      )
    ) {
      esito =
        "Sbagliato/Parato";
    } else if (
      /goal|scored|gol|realizzato/i.test(
        lower
      )
    ) {
      esito =
        "Realizzato";
    }

    const item = {
      id:
        play.id || null,

      minute:
        getEventMinute(play),

      player:
        getPlayerFromEvent(play),

      esito,

      text:
        text || null
    };

    if (side === "home") {
      result.home.push(item);
    }

    if (side === "away") {
      result.away.push(item);
    }
  }

  return result;
}

/*
=========================================================
VENUE
=========================================================
*/

function getVenue(competitionInfo) {
  const venue =
    competitionInfo?.venue ||
    null;

  if (!venue) return null;

  return {
    id:
      venue.id || null,

    name:
      first(
        venue.fullName,
        venue.displayName,
        venue.name
      ),

    city:
      venue.address?.city ||
      null,

    country:
      venue.address?.country ||
      null,

    capacity:
      venue.capacity ||
      null,

    address:
      first(
        venue.address?.fullAddress,
        venue.address?.street
      )
  };
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

  return arr(officials).map(
    official => ({
      id:
        official.id ||
        null,

      name:
        first(
          official.displayName,
          official.fullName,
          official.name
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
BROADCASTS
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
    )
  ];

  const result = [];
  const seen = new Set();

  for (const item of broadcasts) {
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
        item.media?.type
      );

    const key =
      `${name || ""}|${type || ""}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    result.push({
      name:
        name || null,

      type:
        type || null
    });
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

  for (const group of arr(leaders)) {
    const name =
      String(
        first(
          group.name,
          group.displayName,
          group.shortDisplayName
        ) || ""
      ).toLowerCase();

    if (
      name.includes("player of the match") ||
      name.includes("match winner") ||
      name.includes("mvp")
    ) {
      const leader =
        group.leaders?.[0];

      const athlete =
        leader?.athlete ||
        leader?.player ||
        null;

      if (!athlete) {
        continue;
      }

      return {
        player:
          first(
            athlete.displayName,
            athlete.fullName,
            athlete.shortName
          ),

        team:
          athlete.team?.displayName
            ? normalizeTeamName(
                athlete.team.displayName
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

  return null;
}

/*
=========================================================
LOGO
=========================================================
*/

function getTeamLogo(competitor) {
  return first(
    competitor?.team?.logos?.[0]?.href,
    competitor?.team?.logo,
    competitor?.logos?.[0]?.href,
    competitor?.logo
  );
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
      req.query?.competition;

    const eventId =
      req.query?.id;

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
     * EVENTI
     */
    const rawEvents = [
      ...arr(summary.keyEvents),
      ...arr(summary.plays)
    ];

    const uniqueRawEvents =
      deduplicateEvents(
        rawEvents
      );

    const events =
      uniqueRawEvents
        .map(event =>
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
     * RISULTATO
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
          String(eventId),

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
            home?.team?.id ||
            home?.id ||
            null,

          name:
            home?.team?.displayName
              ? normalizeTeamName(
                  home.team.displayName
                )
              : null,

          abbreviation:
            home?.team?.abbreviation ||
            null,

          score:
            home?.score ??
            "-",

          logo:
            getTeamLogo(home)
        },

        away: {
          id:
            away?.team?.id ||
            away?.id ||
            null,

          name:
            away?.team?.displayName
              ? normalizeTeamName(
                  away.team.displayName
                )
              : null,

          abbreviation:
            away?.team?.abbreviation ||
            null,

          score:
            away?.score ??
            "-",

          logo:
            getTeamLogo(away)
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
            status.shortDetail ||
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
        home: homeLineup,
        away: awayLineup
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
