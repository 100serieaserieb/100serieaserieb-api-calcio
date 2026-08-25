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

function objectValue(value) {
  return (
    value &&
    typeof value === "object"
      ? value
      : null
  );
}

/*
=========================================================
DATE
=========================================================
*/

function getRomeDateTime(date) {
  if (!date) return null;

  let parsed;

  if (date instanceof Date) {
    parsed = DateTime.fromJSDate(date, {
      zone: "utc"
    });
  } else {
    parsed = DateTime.fromISO(
      String(date),
      {
        zone: "utc"
      }
    );
  }

  if (!parsed.isValid) {
    return null;
  }

  return parsed.setZone(TIMEZONE);
}

/*
=========================================================
COMPETITOR
=========================================================
*/

function getCompetitor(
  competitors,
  side
) {
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

function getTeamId(
  competitor
) {
  return (
    competitor?.team?.id ||
    competitor?.id ||
    null
  );
}

/*
=========================================================
TEAM NAME
=========================================================
*/

function getTeamName(
  competitor
) {
  const name =
    first(
      competitor?.team?.displayName,
      competitor?.team?.shortDisplayName,
      competitor?.team?.name,
      competitor?.displayName,
      competitor?.name
    );

  if (!name) {
    return null;
  }

  return normalizeTeamName(
    String(name)
  );
}

/*
=========================================================
EVENT TYPE
=========================================================
*/

function getEventType(event) {
  if (!event) return "";

  if (
    typeof event.type === "string"
  ) {
    return event.type;
  }

  if (
    event.type &&
    typeof event.type === "object"
  ) {
    return first(
      event.type.text,
      event.type.name,
      event.type.shortText,
      event.type.id,
      ""
    );
  }

  return first(
    event.typeText,
    event.typeName,
    event.category,
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
      event.clock.value,
      null
    );
  }

  if (
    typeof event.clock === "string" ||
    typeof event.clock === "number"
  ) {
    return String(event.clock);
  }

  return first(
    event.minute,
    event.displayClock,
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
    event.detail,
    ""
  ) || "";
}

/*
=========================================================
NORMALIZE EVENT TEXT
=========================================================
*/

function normalizeEventText(
  text
) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

/*
=========================================================
PLAYER FROM EVENT
=========================================================
*/

function getPlayerFromText(
  text
) {
  const value =
    normalizeEventText(text);

  if (!value) {
    return null;
  }

  /*
   * Goal! Player Name (Team)
   */
  let match =
    value.match(
      /Goal!\s*(?:.*?)\.\s*([^()]+?)\s*\(/i
    );

  if (match) {
    return match[1].trim();
  }

  /*
   * Goal! Player Name
   */
  match =
    value.match(
      /Goal!\s*(?:.*?)\.\s*([A-ZÀ-ÖØ-Ý][^.()]+?)(?:\s*\(|\s+with\s+|\s+following\s+|$)/i
    );

  if (match) {
    return match[1].trim();
  }

  /*
   * Cartellini:
   * Player Name (Team)
   */
  match =
    value.match(
      /^([^()]+?)\s*\(/i
    );

  if (match) {
    let player =
      match[1].trim();

    player =
      player.replace(
        /^Delay in match because of an injury\s+/i,
        ""
      );

    player =
      player.replace(
        /^(?:Yellow Card|Red Card|Second Yellow)\s*[:,-]?\s*/i,
        ""
      );

    return player || null;
  }

  /*
   * Fallback per alcuni testi ESPN.
   */
  match =
    value.match(
      /(?:yellow card|red card|second yellow)[,:]?\s+(.+?)(?:\s*\(|$)/i
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

function getAssistFromText(
  text
) {
  const value =
    normalizeEventText(text);

  if (!value) {
    return null;
  }

  const patterns = [
    /Assisted by ([^.]+?)(?:\s+with\b|\s+following\b|\.|$)/i,
    /assist(?:ed)?\s+by\s+([^.]+?)(?:\.|$)/i
  ];

  for (
    const pattern
    of patterns
  ) {
    const match =
      value.match(pattern);

    if (match) {
      return match[1].trim();
    }
  }

  return null;
}

/*
=========================================================
EVENT TEAM
=========================================================
*/

function getEventTeam(
  event
) {
  if (!event) return null;

  if (
    typeof event.team === "string"
  ) {
    return normalizeTeamName(
      event.team
    );
  }

  return normalizeTeamName(
    first(
      event.team?.displayName,
      event.team?.shortDisplayName,
      event.team?.name,
      event.competitor?.displayName,
      event.competitor?.name
    ) || ""
  ) || null;
}

/*
=========================================================
TRANSLATE EVENT
=========================================================
*/

function translateEventType(
  type,
  event = null
) {
  const value =
    String(type || "")
      .toLowerCase()
      .trim();

  const text =
    getEventText(event)
      .toLowerCase();

  if (
    value.includes("goal") ||
    value.includes("scoring") ||
    text.startsWith("goal!")
  ) {
    return "Gol";
  }

  if (
    value.includes("yellow") ||
    value.includes("second yellow") ||
    text.includes("yellow card")
  ) {
    return "Cartellino giallo";
  }

  if (
    value.includes("red") ||
    text.includes("red card")
  ) {
    return "Cartellino rosso";
  }

  if (
    value.includes("substitution") ||
    value.includes("substitute") ||
    text.startsWith("substitution")
  ) {
    return "Sostituzione";
  }

  if (
    value.includes("kickoff") ||
    value.includes("kick off") ||
    value.includes("start first")
  ) {
    return "Inizio primo tempo";
  }

  if (
    value.includes("halftime") ||
    value.includes("half time") ||
    value.includes("end 1st half")
  ) {
    return "Fine primo tempo";
  }

  if (
    value.includes("start 2nd half") ||
    value.includes("start second half") ||
    value.includes("second half")
  ) {
    return "Inizio secondo tempo";
  }

  if (
    value.includes("end regular") ||
    value.includes("full time") ||
    value.includes("end game") ||
    value.includes("match ended")
  ) {
    return "Fine partita";
  }

  if (
    value.includes("start delay") ||
    value.includes("delay")
  ) {
    return "Interruzione";
  }

  if (
    value.includes("end delay") ||
    value.includes("resume")
  ) {
    return "Ripresa del gioco";
  }

  return stringValue(type);
}

/*
=========================================================
SUBSTITUTION
=========================================================
*/

function parseSubstitution(
  event
) {
  const original =
    normalizeEventText(
      getEventText(event)
    );

  if (!original) {
    return {
      incoming: null,
      outgoing: null,
      team: getEventTeam(event)
    };
  }

  const patterns = [
    /Substitution,\s*([^.]*)\.\s*(.*?)\s+replaces\s+(.*?)(?:\s+because of an injury)?\./i,

    /Substitution,\s*([^.]*)\.\s*(.*?)\s+replaces\s+(.*?)(?:\s+because of an injury)?$/i,

    /([^:]+):\s*(.*?)\s+(?:replaces|for)\s+(.*?)(?:\.|$)/i
  ];

  for (
    const pattern
    of patterns
  ) {
    const match =
      original.match(pattern);

    if (!match) {
      continue;
    }

    return {
      team:
        normalizeTeamName(
          match[1].trim()
        ),

      incoming:
        match[2]
          ? match[2].trim()
          : null,

      outgoing:
        match[3]
          ? match[3].trim()
          : null
    };
  }

  return {
    incoming: null,
    outgoing: null,
    team: getEventTeam(event)
  };
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
  assist
) {
  const minute =
    getEventMinute(event);

  const prefix =
    minute
      ? `Al ${minute}: `
      : "";

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

  if (
    type === "Cartellino giallo" &&
    player
  ) {
    return (
      `${prefix}cartellino giallo per ${player}` +
      `${team ? ` (${team})` : ""}.`
    );
  }

  if (
    type === "Cartellino rosso" &&
    player
  ) {
    return (
      `${prefix}cartellino rosso per ${player}` +
      `${team ? ` (${team})` : ""}.`
    );
  }

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

  if (
    type === "Ripresa del gioco"
  ) {
    return `${prefix}gioco ripreso.`;
  }

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

  if (
    type === "Sostituzione"
  ) {
    const substitution =
      parseSubstitution(event);

    const substitutionTeam =
      substitution.team ||
      team;

    if (
      substitution.incoming &&
      substitution.outgoing
    ) {
      return (
        `${prefix}${substitution.incoming} ` +
        `entra al posto di ${substitution.outgoing}` +
        `${substitutionTeam ? ` per ${substitutionTeam}` : ""}.`
      );
    }

    return (
      `${prefix}sostituzione` +
      `${substitutionTeam ? ` per ${substitutionTeam}` : ""}.`
    );
  }

  return (
    getEventText(event) ||
    null
  );
}

/*
=========================================================
PARSE EVENT
=========================================================
*/

function parseEvent(
  event
) {
  if (!event) {
    return null;
  }

  const rawType =
    getEventType(event);

  const type =
    translateEventType(
      rawType,
      event
    );

  const rawText =
    getEventText(event);

  const team =
    getEventTeam(event);

  let player = null;
  let assist = null;

  if (
    type === "Gol" ||
    type === "Cartellino giallo" ||
    type === "Cartellino rosso"
  ) {
    player =
      getPlayerFromText(
        rawText
      );

    if (
      type === "Gol"
    ) {
      assist =
        getAssistFromText(
          rawText
        );
    }
  }

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

  const substitution =
    type === "Sostituzione"
      ? parseSubstitution(event)
      : null;

  return {
    id:
      first(
        event.id,
        event.sequenceNumber
      ),

    type,

    minute:
      getEventMinute(event),

    team,

    player,

    assist,

    incoming:
      substitution?.incoming ||
      null,

    outgoing:
      substitution?.outgoing ||
      null,

    text:
      buildItalianEventText(
        event,
        type,
        team,
        player,
        assist
      ),

    rawText:
      rawText || null
  };
}

/*
=========================================================
TEAM MATCH
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
    value.team?.id,
    value.competitor?.team?.id,
    value.competitor?.id
  ];

  /*
   * Evitiamo value.id generico:
   * potrebbe coincidere casualmente con
   * l'ID di una squadra.
   */
  return ids.some(
    id =>
      id !== undefined &&
      id !== null &&
      String(id) ===
        String(teamId)
  );
}

/*
=========================================================
FIND OBJECTS FOR TEAM
=========================================================
*/

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
    depth > 10
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

  if (
    Array.isArray(node)
  ) {
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
    const key
    of Object.keys(node)
  ) {
    /*
     * Questi campi possono essere enormi
     * e vengono gestiti separatamente.
     */
    if (
      key === "plays" ||
      key === "keyEvents"
    ) {
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

  return result;
}

/*
=========================================================
PLAYER NAME
=========================================================
*/

function getAthleteName(
  item
) {
  if (!item) {
    return null;
  }

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
    item.shortName,
    item.name
  );
}

/*
=========================================================
PLAYER ID
=========================================================
*/

function getAthleteId(
  item
) {
  if (!item) {
    return null;
  }

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

function getPlayerPosition(
  item
) {
  const athlete =
    item?.athlete ||
    item?.player ||
    item;

  return first(
    item?.position?.abbreviation,
    item?.position?.displayName,
    item?.position?.name,

    athlete?.position?.abbreviation,
    athlete?.position?.displayName,
    athlete?.position?.name
  );
}

/*
=========================================================
JERSEY
=========================================================
*/

function getPlayerJersey(
  item
) {
  const athlete =
    item?.athlete ||
    item?.player ||
    item;

  return first(
    item?.jersey,
    item?.uniformNumber,
    item?.shirtNumber,

    athlete?.jersey,
    athlete?.uniformNumber,
    athlete?.shirtNumber
  );
}

/*
=========================================================
STARTER DETECTION
=========================================================
*/

function isStarter(
  item
) {
  if (!item) {
    return false;
  }

  if (
    item.starter === true ||
    item.isStarter === true
  ) {
    return true;
  }

  const status =
    String(
      first(
        item.status?.type,
        item.status?.name,
        item.status?.displayName,
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

function isSubstitute(
  item
) {
  if (!item) {
    return false;
  }

  if (
    item.substitute === true ||
    item.isSubstitute === true ||
    item.onBench === true
  ) {
    return true;
  }

  const status =
    String(
      first(
        item.status?.type,
        item.status?.name,
        item.status?.displayName,
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

function normalizePlayer(
  item,
  fallbackStarter = false,
  fallbackSubstitute = false
) {
  const name =
    getAthleteName(item);

  if (!name) {
    return null;
  }

  const starter =
    isStarter(item) ||
    fallbackStarter;

  const substitute =
    isSubstitute(item) ||
    fallbackSubstitute;

  return {
    id:
      getAthleteId(item),

    name,

    jersey:
      getPlayerJersey(item) ||
      null,

    position:
      getPlayerPosition(item) ||
      null,

    starter,

    substitute:
      substitute && !starter
  };
}

/*
=========================================================
PLAYER ARRAY EXTRACTION
=========================================================
*/

function extractPlayerArray(
  source
) {
  if (!source) {
    return [];
  }

  if (
    Array.isArray(source)
  ) {
    return source;
  }

  if (
    Array.isArray(
      source.athletes
    )
  ) {
    return source.athletes;
  }

  if (
    Array.isArray(
      source.players
    )
  ) {
    return source.players;
  }

  return [];
}

/*
=========================================================
LINEUP CANDIDATES
=========================================================
*/

function extractPlayersFromNode(
  node
) {
  const result = [];

  if (!node) {
    return result;
  }

  const sources = [
    node.roster?.athletes,
    node.roster?.players,

    node.athletes,
    node.players,

    node.lineup?.athletes,
    node.lineup?.players,

    node.roster,

    node.lineup
  ];

  for (
    const source
    of sources
  ) {
    result.push(
      ...extractPlayerArray(
        source
      )
    );
  }

  /*
   * ESPN boxscore:
   *
   * boxscore.players[].statistics[]
   *
   * Gli atleti possono essere dentro
   * i gruppi statistics.
   */
  for (
    const statisticsGroup
    of arr(node.statistics)
  ) {
    result.push(
      ...extractPlayerArray(
        statisticsGroup.athletes
      )
    );

    result.push(
      ...extractPlayerArray(
        statisticsGroup.players
      )
    );
  }

  return result;
}

/*
=========================================================
BOX SCORE PLAYER EXTRACTION
=========================================================
*/

function extractBoxscorePlayers(
  summary,
  teamId
) {
  const result = [];

  const teams =
    arr(
      summary?.boxscore?.players
    );

  for (
    const teamBlock
    of teams
  ) {
    const blockTeamId =
      teamBlock?.team?.id ||
      teamBlock?.id;

    if (
      blockTeamId === undefined ||
      blockTeamId === null ||
      String(blockTeamId) !==
        String(teamId)
    ) {
      continue;
    }

    /*
     * Forma 1:
     * athletes direttamente.
     */
    result.push(
      ...arr(
        teamBlock.athletes
      )
    );

    /*
     * Forma 2:
     * statistics[].athletes
     */
    for (
      const group
      of arr(
        teamBlock.statistics
      )
    ) {
      result.push(
        ...arr(
          group.athletes
        )
      );

      result.push(
        ...arr(
          group.players
        )
      );
    }

    /*
     * Forma 3:
     * players direttamente.
     */
    result.push(
      ...arr(
        teamBlock.players
      )
    );
  }

  return result;
}

/*
=========================================================
FORMATION
=========================================================
*/

function getFormationFromNode(
  node
) {
  if (!node) {
    return null;
  }

  return first(
    node.formation?.text,
    node.formation?.displayName,
    node.formation?.name,
    node.formation?.abbreviation,

    typeof node.formation === "string"
      ? node.formation
      : null,

    node.formations?.[0]?.text,
    node.formations?.[0]?.displayName,
    node.formations?.[0]?.name
  );
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
    getTeamId(
      competitor
    );

  if (!teamId) {
    return {
      formation: null,
      starters: [],
      substitutes: [],
      players: []
    };
  }

  const teamObjects =
    findObjectsForTeam(
      summary,
      teamId
    );

  const candidates = [];

  /*
   * Fonte principale:
   * boxscore.players
   */
  candidates.push(
    ...extractBoxscorePlayers(
      summary,
      teamId
    )
  );

  /*
   * Altre fonti.
   */
  for (
    const object
    of teamObjects
  ) {
    candidates.push(
      ...extractPlayersFromNode(
        object
      )
    );
  }

  candidates.push(
    ...extractPlayersFromNode(
      competitor
    )
  );

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

    if (!player) {
      continue;
    }

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

  let formation =
    getFormationFromNode(
      competitor
    );

  if (!formation) {
    for (
      const object
      of teamObjects
    ) {
      formation =
        getFormationFromNode(
          object
        );

      if (formation) {
        break;
      }
    }
  }

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
STATISTIC VALUE
=========================================================
*/

function getStatisticValue(
  stat
) {
  if (!stat) {
    return null;
  }

  return first(
    stat.displayValue,
    stat.value,
    stat.displayValueText,
    stat.displayValueString,
    stat.text
  );
}

/*
=========================================================
STATISTIC NAME
=========================================================
*/

function normalizeStatisticName(
  name
) {
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
    value.includes("shots on frame") ||
    value.includes("tiri in porta")
  ) {
    return "shotsOnTarget";
  }

  if (
    value === "shots" ||
    value.includes("total shots") ||
    value.includes("shots total") ||
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
    value.includes("fouls") ||
    value.includes("falli")
  ) {
    return "fouls";
  }

  if (
    value.includes("yellow card") ||
    value === "yellow" ||
    value.includes("yellow")
  ) {
    return "yellowCards";
  }

  if (
    value.includes("red card") ||
    value === "red"
  ) {
    return "redCards";
  }

  if (
    value.includes("save") ||
    value.includes("goalkeeper save") ||
    value.includes("goalkeeper saves") ||
    value.includes("parade")
  ) {
    return "saves";
  }

  if (
    value.includes("pass") &&
    value.includes("complete")
  ) {
    return "passesCompleted";
  }

  if (
    value.includes("touch")
  ) {
    return "touches";
  }

  if (
    value.includes("blocked")
  ) {
    return "blockedShots";
  }

  return null;
}

/*
=========================================================
READ STATISTICS ARRAY
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
    /*
     * Alcuni payload ESPN hanno:
     *
     * {
     *   name: "...",
     *   displayValue: "..."
     * }
     *
     * altri hanno:
     *
     * {
     *   name: "...",
     *   value: ...
     * }
     */
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

    if (!name) {
      continue;
    }

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
  if (!node) {
    return;
  }

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
   * 1. Competitors.
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
   * 2. Boxscore teams.
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
   * 3. Oggetti collegati alla squadra.
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

    if (!teamId) {
      continue;
    }

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

  return result;
}

/*
=========================================================
PENALTY DETECTION
=========================================================
*/

function isPenaltyPlay(
  play
) {
  const text =
    normalizeEventText(
      getEventText(play)
    );

  if (!text) {
    return false;
  }

  /*
   * Cerchiamo specificamente eventi
   * relativi al calcio di rigore.
   */
  return (
    /\bpenalty\b/i.test(text) ||
    /\bpenalty kick\b/i.test(text) ||
    /\bpenalty scored\b/i.test(text) ||
    /\bpenalty missed\b/i.test(text) ||
    /\bpenalty saved\b/i.test(text) ||
    /\brigore\b/i.test(text)
  );
}

/*
=========================================================
PENALTY OUTCOME
=========================================================
*/

function getPenaltyOutcome(
  text
) {
  const value =
    String(text || "")
      .toLowerCase();

  if (
    /miss|missed|wide|off target|sbagliato/i.test(
      value
    )
  ) {
    return "Sbagliato";
  }

  if (
    /save|saved|parato/i.test(
      value
    )
  ) {
    return "Parato";
  }

  if (
    /goal|scored|gol|realizzato/i.test(
      value
    )
  ) {
    return "Realizzato";
  }

  return "Tentativo";
}

/*
=========================================================
PENALTIES
=========================================================
*/

function getPenalties(
  summary
) {
  const result = {
    home: [],
    away: []
  };

  const plays =
    arr(
      summary?.plays
    );

  const seen =
    new Set();

  for (
    const play
    of plays
  ) {
    if (
      !isPenaltyPlay(play)
    ) {
      continue;
    }

    const id =
      first(
        play.id,
        `${getEventMinute(play)}-${getEventText(play)}`
      );

    if (
      seen.has(id)
    ) {
      continue;
    }

    seen.add(id);

    const text =
      getEventText(play);

    const side =
      play.team?.homeAway ||
      play.competitor?.homeAway ||
      null;

    const item = {
      id:
        play.id || null,

      minute:
        getEventMinute(play),

      player:
        first(
          play.athlete?.displayName,
          play.player?.displayName,
          getPlayerFromText(text)
        ),

      team:
        getEventTeam(play),

      esito:
        getPenaltyOutcome(text),

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

function getVenue(
  competitionInfo,
  summary
) {
  const venue =
    first(
      competitionInfo?.venue,
      summary?.gameInfo?.venue,
      summary?.header?.venue
    );

  if (!venue) {
    return null;
  }

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
      venue.capacity ||
      null,

    address:
      first(
        venue.address?.fullAddress,
        venue.address?.street,
        venue.address?.line1
      )
  };
}

/*
=========================================================
OFFICIALS
=========================================================
*/

function getOfficials(
  summary
) {
  const officials =
    [
      ...arr(
        summary?.header
          ?.competitions?.[0]
          ?.officials
      ),

      ...arr(
        summary?.gameInfo
          ?.officials
      )
    ];

  const result = [];
  const seen = new Set();

  for (
    const official
    of officials
  ) {
    const name =
      first(
        official?.displayName,
        official?.fullName,
        official?.name
      );

    if (!name) {
      continue;
    }

    const key =
      `${name}|${
        official?.position?.displayName ||
        official?.position?.name ||
        official?.role ||
        ""
      }`;

    if (
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);

    result.push({
      name,

      role:
        first(
          official?.position?.displayName,
          official?.position?.name,
          official?.role,
          "Arbitro"
        )
    });
  }

  return result;
}

/*
=========================================================
TV / BROADCASTS
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
  const seen = new Set();

  for (
    const item
    of broadcasts
  ) {
    const names =
      arr(
        item?.names
      );

    const name =
      first(
        names[0],
        item?.name,
        item?.displayName,
        item?.media?.name,
        item?.station?.name
      );

    const type =
      first(
        item?.type?.shortName,
        item?.type?.text,
        item?.type?.name,
        item?.media?.type,
        item?.type
      );

    const key =
      `${name || ""}|${type || ""}`;

    if (
      seen.has(key)
    ) {
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

function getMVP(
  summary
) {
  const groups = [
    ...arr(
      summary?.leaders
    ),

    ...arr(
      summary?.header
        ?.competitions?.[0]
        ?.leaders
    ),

    ...arr(
      summary?.boxscore
        ?.leaders
    )
  ];

  for (
    const group
    of groups
  ) {
    const groupName =
      String(
        first(
          group?.name,
          group?.displayName,
          group?.shortDisplayName,
          group?.label
        ) || ""
      ).toLowerCase();

    if (
      !(
        groupName.includes(
          "player of the match"
        ) ||
        groupName.includes(
          "man of the match"
        ) ||
        groupName.includes(
          "match winner"
        ) ||
        groupName.includes(
          "mvp"
        )
      )
    ) {
      continue;
    }

    const leader =
      arr(
        group?.leaders
      )[0];

    if (!leader) {
      continue;
    }

    const athlete =
      leader?.athlete ||
      leader?.player ||
      leader?.participant ||
      null;

    if (!athlete) {
      continue;
    }

    return {
      player:
        first(
          athlete?.displayName,
          athlete?.fullName,
          athlete?.shortName
        ),

      team:
        athlete?.team?.displayName
          ? normalizeTeamName(
              athlete.team.displayName
            )
          : null,

      value:
        first(
          leader?.value,
          leader?.displayValue,
          leader?.displayValueText
        )
    };
  }

  return null;
}

/*
=========================================================
EVENT DEDUPLICATION
=========================================================
*/

function getEventKey(
  event
) {
  if (!event) {
    return null;
  }

  if (event.id) {
    return `id:${event.id}`;
  }

  return [
    getEventMinute(event),
    getEventType(event),
    getEventText(event),
    getEventTeam(event)
  ].join("|");
}

/*
=========================================================
EVENTS
=========================================================
*/

function getEvents(
  summary
) {
  const rawEvents = [
    ...arr(
      summary?.keyEvents
    ),

    ...arr(
      summary?.plays
    )
  ];

  const eventMap =
    new Map();

  for (
    const event
    of rawEvents
  ) {
    const key =
      getEventKey(event);

    if (!key) {
      continue;
    }

    /*
     * Se keyEvents e plays contengono
     * lo stesso evento, lo manteniamo
     * una sola volta.
     */
    if (
      !eventMap.has(key)
    ) {
      eventMap.set(
        key,
        event
      );
    }
  }

  return [
    ...eventMap.values()
  ]
    .map(
      parseEvent
    )
    .filter(
      Boolean
    );
}

/*
=========================================================
STATUS
=========================================================
*/

function getMatchStatus(
  competitionInfo
) {
  const status =
    competitionInfo?.status;

  const type =
    status?.type;

  return {
    state:
      type?.state ||
      null,

    name:
      type?.name ||
      null,

    description:
      type?.description ||
      null,

    detail:
      type?.detail ||
      null,

    shortDetail:
      type?.shortDetail ||
      null,

    clock:
      first(
        status?.displayClock,
        status?.clock
      ),

    period:
      first(
        status?.period,
        null
      ),

    completed:
      type?.completed === true
  };
}

/*
=========================================================
LOGO
=========================================================
*/

function getTeamLogo(
  competitor
) {
  return first(
    competitor?.team?.logos?.[0]?.href,
    competitor?.team?.logo,
    competitor?.logo
  );
}

/*
=========================================================
TEAM RESPONSE
=========================================================
*/

function buildTeamResponse(
  competitor,
  score
) {
  return {
    id:
      getTeamId(
        competitor
      ),

    name:
      getTeamName(
        competitor
      ),

    abbreviation:
      first(
        competitor?.team?.abbreviation,
        competitor?.team?.shortName
      ),

    score:
      score ??
      "-",

    logo:
      getTeamLogo(
        competitor
      )
  };
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
      stringValue(
        req.query?.competition
      );

    const eventId =
      stringValue(
        req.query?.id
      );

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
      header?.competitions?.[0] ||
      null;

    if (!competitionInfo) {
      return res.status(404).json({
        success: false,
        error:
          "Informazioni competizione non disponibili"
      });
    }

    /*
     * SQUADRE
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
     * EVENTI
     */
    const events =
      getEvents(
        summary
      );

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
        competitionInfo,
        summary
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

        home:
          buildTeamResponse(
            home,
            home?.score
          ),

        away:
          buildTeamResponse(
            away,
            away?.score
          ),

        status:
          getMatchStatus(
            competitionInfo
          )
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
