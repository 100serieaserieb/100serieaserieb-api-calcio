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

  const parsed = DateTime.fromISO(date, {
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
        item.homeAway === side
    ) || null
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
    return (
      event.clock.displayValue ||
      null
    );
  }

  if (
    typeof event.clock === "string"
  ) {
    return event.clock;
  }

  if (event.minute) {
    return event.minute;
  }

  return null;
}

/*
=========================================================
EVENT TEXT
=========================================================
*/

function getEventText(event) {
  if (!event) return "";

  return typeof event.text === "string"
    ? event.text
    : "";
}

/*
=========================================================
PLAYER FROM EVENT TEXT
=========================================================
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

  if (!match) return null;

  let player =
    match[1].trim();

  player = player
    .replace(
      /^Delay in match because of an injury\s+/i,
      ""
    )
    .trim();

  return player || null;
}

/*
=========================================================
ASSIST
=========================================================
*/

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
=========================================================
TRANSLATE EVENT
=========================================================
*/

function translateEventType(type) {
  const value =
    String(type || "")
      .toLowerCase();

  if (value.includes("goal"))
    return "Gol";

  if (value.includes("yellow"))
    return "Cartellino giallo";

  if (value.includes("red"))
    return "Cartellino rosso";

  if (value.includes("substitution"))
    return "Sostituzione";

  if (value.includes("kickoff"))
    return "Inizio primo tempo";

  if (value.includes("halftime"))
    return "Fine primo tempo";

  if (
    value.includes("start 2nd half")
  )
    return "Inizio secondo tempo";

  if (
    value.includes("end regular")
  )
    return "Fine partita";

  if (
    value.includes("start delay")
  )
    return "Interruzione";

  if (
    value.includes("end delay")
  )
    return "Ripresa del gioco";

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
  assist
) {
  const minute =
    getEventMinute(event);

  const prefix = minute
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
    const original =
      getEventText(event);

    const substitutionMatch =
      original.match(
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

      return (
        `${prefix}${incoming} entra al posto di ` +
        `${outgoing} per ${teamName}.`
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
PARSE EVENT
=========================================================
*/

function parseEvent(event) {
  if (!event) return null;

  const rawType =
    getEventType(event);

  const type =
    translateEventType(
      rawType
    );

  const rawText =
    getEventText(event);

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
    id:
      event.id || null,

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
=========================================================
RECURSIVE TEAM FINDER
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
      String(id) ===
        String(teamId)
  );
}

function findObjectsForTeam(
  node,
  teamId,
  result = [],
  depth = 0
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
    sameTeam(
      node,
      teamId
    )
  ) {
    result.push(node);
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      findObjectsForTeam(
        item,
        teamId,
        result,
        depth + 1
      );
    }
  } else {
    for (const key of Object.keys(node)) {
      /*
       * Evitiamo di esplorare campi enormi
       * non utili.
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
        depth + 1
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

function getAthleteName(
  item
) {
  if (!item) return null;

  const athlete =
    item.athlete ||
    item.player ||
    item;

  return (
    athlete.displayName ||
    athlete.fullName ||
    athlete.shortName ||
    athlete.name ||
    item.displayName ||
    item.fullName ||
    item.name ||
    null
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
  if (!item) return null;

  const athlete =
    item.athlete ||
    item.player ||
    item;

  return (
    athlete.id ||
    item.id ||
    null
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

  return (
    item?.position?.abbreviation ||
    item?.position?.displayName ||
    item?.position?.name ||
    athlete?.position?.abbreviation ||
    athlete?.position?.displayName ||
    athlete?.position?.name ||
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
    item.starter === true
  ) {
    return true;
  }

  if (
    item.isStarter === true
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

function normalizePlayer(
  item
) {
  const name =
    getAthleteName(item);

  if (!name) {
    return null;
  }

  const athlete =
    item.athlete ||
    item.player ||
    item;

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

    starter:
      isStarter(item),

    substitute:
      isSubstitute(item)
  };
}

/*
=========================================================
LINEUP CANDIDATE
=========================================================
*/

function extractPlayersFromNode(
  node
) {
  const candidates = [];

  if (!node) return candidates;

  const sources = [
    node.roster?.athletes,
    node.roster?.players,
    node.athletes,
    node.players,
    node.lineup?.athletes,
    node.lineup?.players,
    node.lineup,
    node.roster
  ];

  for (const source of sources) {
    if (Array.isArray(source)) {
      candidates.push(
        ...source
      );
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

  /*
   * Mettiamo prima gli oggetti che
   * sembrano realmente contenere roster.
   */
  const candidates = [];

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

  /*
   * Fallback diretto.
   */
  candidates.push(
    ...extractPlayersFromNode(
      competitor
    )
  );

  const uniquePlayers =
    [];

  const seen =
    new Set();

  for (
    const candidate
    of candidates
  ) {
    const player =
      normalizePlayer(
        candidate
      );

    if (!player) continue;

    const key =
      player.id ||
      player.name;

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

  let starters =
    uniquePlayers.filter(
      player =>
        player.starter
    );

  let substitutes =
    uniquePlayers.filter(
      player =>
        player.substitute &&
        !player.starter
    );

  /*
   * Se ESPN ha fornito tutti i giocatori
   * ma non ha indicato starter/sub,
   * non distruggiamo il risultato:
   * li lasciamo in players.
   */

  const formation =
    first(
      competitor?.formation?.text,
      competitor?.formation?.displayName,
      competitor?.formation?.name,
      typeof competitor?.formation === "string"
        ? competitor.formation
        : null,

      /*
       * Cerca la formazione anche negli
       * oggetti trovati nel summary.
       */
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

function getStatisticValue(
  stat
) {
  if (!stat) return null;

  return first(
    stat.displayValue,
    stat.value,
    stat.displayValueText
  );
}

/*
=========================================================
STAT NAME
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
    value.includes(
      "shots on target"
    ) ||
    value.includes(
      "shots on goal"
    ) ||
    value.includes(
      "tiri in porta"
    )
  ) {
    return "shotsOnTarget";
  }

  if (
    value === "shots" ||
    value.includes(
      "total shots"
    ) ||
    value.includes(
      "shots total"
    ) ||
    value.includes(
      "tiri totali"
    )
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
    value === "yellow"
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
    value.includes("parade")
  ) {
    return "saves";
  }

  return null;
}

/*
=========================================================
READ STATISTICS FROM ARRAY
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
          stat.type
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
STATISTICS FROM TEAM OBJECT
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
    node.competitor?.statistics,
    node.team?.stats,
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
   * Prima fonte:
   * competitionInfo.competitors
   */
  const competitors =
    arr(
      competitionInfo?.competitors
    );

  for (
    const competitor
    of competitors
  ) {
    const side =
      competitor.homeAway;

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
   * Seconda fonte:
   * boxscore ESPN.
   */
  const boxscoreTeams =
    arr(
      summary?.boxscore?.teams
    );

  for (
    const team
    of boxscoreTeams
  ) {
    const side =
      team.homeAway;

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
   * Terza fonte:
   * tutti gli oggetti associati
   * alla squadra.
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
    Array.isArray(
      summary.plays
    )
      ? summary.plays
      : [];

  for (
    const play
    of plays
  ) {
    const text =
      getEventText(play);

    if (
      !/penalty|rigore/i.test(
        text
      )
    ) {
      continue;
    }

    const side =
      play.team?.homeAway ||
      null;

    const item = {
      minute:
        getEventMinute(play),

      player:
        play.athlete?.displayName ||
        play.player?.displayName ||
        null,

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
  competitionInfo
) {
  const venue =
    competitionInfo?.venue ||
    null;

  if (!venue) {
    return null;
  }

  return {
    id:
      venue.id ||
      null,

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
      null,

    capacity:
      venue.capacity ||
      null,

    address:
      venue.address?.fullAddress ||
      venue.address?.street ||
      null
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
    summary.header
      ?.competitions?.[0]
      ?.officials ||
    summary.gameInfo
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
      name:
        official.displayName ||
        official.fullName ||
        official.name ||
        null,

      role:
        official.position
          ?.displayName ||
        official.position?.name ||
        official.role ||
        "Arbitro"
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
      summary.broadcasts
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
        item.media?.type
      );

    /*
     * Evita duplicati.
     */
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

function getMVP(
  summary
) {
  const leaders =
    summary.leaders ||
    summary.header
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
            athlete.displayName ||
            athlete.fullName ||
            null,

          team:
            athlete.team
              ?.displayName
              ? normalizeTeamName(
                  athlete.team
                    .displayName
                )
              : null,

          value:
            leader.value ||
            leader.displayValue ||
            null
        };
      }
    }
  }

  return null;
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

    const competitors =
      competitionInfo
        .competitors ||
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
      competitionInfo.date ||
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
      ...(
        Array.isArray(
          summary.keyEvents
        )
          ? summary.keyEvents
          : []
      ),

      ...(
        Array.isArray(
          summary.plays
        )
          ? summary.plays
          : []
      )
    ];

    /*
     * Rimuove eventuali duplicati
     * tra keyEvents e plays.
     */
    const eventMap =
      new Map();

    for (
      const event
      of rawEvents
    ) {
      const id =
        event?.id ||
        `${getEventMinute(event)}-${getEventText(event)}`;

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
        .map(parseEvent)
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
            home?.team?.id ||
            home?.id ||
            null,

          name:
            home?.team?.displayName
              ? normalizeTeamName(
                  home.team
                    .displayName
                )
              : null,

          abbreviation:
            home?.team?.abbreviation ||
            null,

          score:
            home?.score ??
            "-",

          logo:
            homeLogo
        },

        away: {
          id:
            away?.team?.id ||
            away?.id ||
            null,

          name:
            away?.team?.displayName
              ? normalizeTeamName(
                  away.team
                    .displayName
                )
              : null,

          abbreviation:
            away?.team?.abbreviation ||
            null,

          score:
            away?.score ??
            "-",

          logo:
            awayLogo
        },

        status: {
          state:
            competitionInfo
              ?.status?.type
              ?.state ||
            null,

          name:
            competitionInfo
              ?.status?.type
              ?.name ||
            null,

          description:
            competitionInfo
              ?.status?.type
              ?.description ||
            null,

          detail:
            competitionInfo
              ?.status?.type
              ?.detail ||
            null,

          clock:
            competitionInfo
              ?.status
              ?.displayClock ||
            null,

          completed:
            competitionInfo
              ?.status?.type
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
