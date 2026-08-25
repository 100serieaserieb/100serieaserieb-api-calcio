const { getCompetition } = require("../lib/competitions");
const { getMatchSummary } = require("../lib/espn");
const { normalizeTeamName } = require("../lib/teams");
const { DateTime } = require("luxon");

/* =========================================================
   DATE
========================================================= */

function getRomeDateTime(date) {
  if (!date) return null;

  let parsed = DateTime.fromISO(String(date), {
    zone: "utc"
  });

  if (!parsed.isValid) {
    parsed = DateTime.fromJSDate(
      new Date(date),
      { zone: "utc" }
    );
  }

  if (!parsed.isValid) return null;

  return parsed.setZone("Europe/Rome");
}

/* =========================================================
   GENERIC HELPERS
========================================================= */

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function clean(value) {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  const result = String(value).trim();

  return result || null;
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

function number(value) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value)
      ? value
      : null;
  }

  const match =
    String(value).match(
      /-?\d+(?:[.,]\d+)?/
    );

  if (!match) return null;

  const result = Number(
    match[0].replace(",", ".")
  );

  return Number.isFinite(result)
    ? result
    : null;
}

function bool(value) {
  return (
    value === true ||
    value === "true" ||
    value === 1 ||
    value === "1"
  );
}

function teamId(team) {
  return clean(
    first(
      team?.team?.id,
      team?.competitor?.id,
      team?.id
    )
  );
}

function teamName(team) {
  const raw =
    first(
      team?.team?.displayName,
      team?.team?.name,
      team?.team?.shortDisplayName,
      team?.displayName,
      team?.name
    );

  if (!raw) return null;

  return normalizeTeamName(raw);
}

function getCompetitor(
  competitors,
  side
) {
  return (
    arr(competitors).find(
      item =>
        item?.homeAway === side
    ) || null
  );
}

function getNested(obj, paths) {
  for (const path of paths) {
    let current = obj;

    for (const key of path) {
      if (
        current === undefined ||
        current === null
      ) {
        current = null;
        break;
      }

      current = current[key];
    }

    if (
      current !== undefined &&
      current !== null &&
      current !== ""
    ) {
      return current;
    }
  }

  return null;
}

/* =========================================================
   EVENTI
========================================================= */

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
      event.type.description,
      event.type.id
    ) || "";
  }

  return "";
}

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
    event.displayClock,
    event.time
  );
}

function getEventText(event) {
  if (!event) return "";

  return clean(
    first(
      event.text,
      event.description,
      event.shortText,
      event.longText
    )
  ) || "";
}

function getPlayerName(event) {
  return clean(
    first(
      event.athlete?.displayName,
      event.athlete?.fullName,
      event.player?.displayName,
      event.player?.fullName,
      event.player?.name,
      event.athlete?.shortName
    )
  );
}

function getAssistName(event) {
  return clean(
    first(
      event.assist?.displayName,
      event.assist?.fullName,
      event.assist?.name,
      event.assist?.athlete?.displayName
    )
  );
}

function getPlayerFromText(text) {
  if (!text) return null;

  let match =
    text.match(
      /Goal!\s+[^.]*\.\s*([^()]+)\s*\(/i
    );

  if (match) {
    return clean(match[1]);
  }

  match =
    text.match(
      /Substitution,\s*[^.]+\.\s*(.*?)\s+replaces/i
    );

  if (match) {
    return clean(match[1]);
  }

  match =
    text.match(
      /injury\s+(.+?)\s*\(/i
    );

  if (match) {
    return clean(match[1]);
  }

  match =
    text.match(
      /^([^(]+)\s*\(/i
    );

  return match
    ? clean(match[1])
    : null;
}

function getAssistFromText(text) {
  if (!text) return null;

  const match =
    text.match(
      /Assisted by\s+(.+?)(?:\s+with|\s+following|\.|$)/i
    );

  return match
    ? clean(match[1])
    : null;
}

function translateEventType(type) {
  const value =
    String(type || "")
      .toLowerCase();

  if (
    value.includes("goal") ||
    value.includes("gol")
  ) {
    return "Gol";
  }

  if (
    value.includes("yellow")
  ) {
    return "Cartellino giallo";
  }

  if (
    value.includes("red card") ||
    value.includes("red")
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
    value.includes("kickoff") ||
    value.includes("first half begins")
  ) {
    return "Inizio primo tempo";
  }

  if (
    value.includes("halftime") ||
    value.includes("end 1st half") ||
    value.includes("first half ends")
  ) {
    return "Fine primo tempo";
  }

  if (
    value.includes("start 2nd half") ||
    value.includes("second half begins")
  ) {
    return "Inizio secondo tempo";
  }

  if (
    value.includes("end regular") ||
    value.includes("end game") ||
    value.includes("game ends")
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
    value.includes("end delay")
  ) {
    return "Ripresa del gioco";
  }

  if (
    value.includes("injury") ||
    value.includes("interruption")
  ) {
    return "Interruzione";
  }

  return clean(type);
}

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
    return `${prefix}cartellino giallo per ${player}${
      team ? ` (${team})` : ""
    }.`;
  }

  if (
    type === "Cartellino rosso" &&
    player
  ) {
    return `${prefix}cartellino rosso per ${player}${
      team ? ` (${team})` : ""
    }.`;
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
      return `${prefix}gioco interrotto per un infortunio a ${player}${
        team ? ` (${team})` : ""
      }.`;
    }

    return `${prefix}gioco momentaneamente interrotto.`;
  }

  if (
    type === "Sostituzione"
  ) {
    const raw =
      getEventText(event);

    const match =
      raw.match(
        /Substitution,\s*([^.]*)\.\s*(.*?)\s+replaces\s+(.*?)(?:\s+because of an injury)?\./i
      );

    if (match) {
      const club =
        normalizeTeamName(
          match[1]
        );

      return `${prefix}${match[2].trim()} entra al posto di ${match[3].trim()} per ${club}.`;
    }

    return `${prefix}sostituzione${
      team ? ` per ${team}` : ""
    }.`;
  }

  return (
    getEventText(event) ||
    null
  );
}

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

  const competitor =
    event.competitor ||
    arr(event.competitors)[0] ||
    null;

  const team =
    teamName(
      event.team ||
      competitor
    );

  let player =
    getPlayerName(event);

  let assist =
    getAssistName(event);

  if (!player) {
    player =
      getPlayerFromText(
        rawText
      );
  }

  if (!assist) {
    assist =
      getAssistFromText(
        rawText
      );
  }

  return {
    id:
      clean(event.id),

    type,

    minute:
      getEventMinute(event),

    team,

    player:
      clean(player),

    assist:
      clean(assist),

    incoming:
      clean(
        first(
          event.substitution?.in?.athlete?.displayName,
          event.incoming?.displayName,
          event.incoming?.fullName
        )
      ),

    outgoing:
      clean(
        first(
          event.substitution?.out?.athlete?.displayName,
          event.outgoing?.displayName,
          event.outgoing?.fullName
        )
      ),

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

/* =========================================================
   FORMAZIONI / ROSTER
========================================================= */

function getPlayersFromSource(
  source
) {
  const result = [];

  for (const item of arr(source)) {
    const athlete =
      item?.athlete ||
      item?.player ||
      item;

    const name =
      clean(
        first(
          athlete?.displayName,
          athlete?.fullName,
          athlete?.shortName,
          item?.displayName,
          item?.fullName,
          item?.name
        )
      );

    if (!name) continue;

    const position =
      clean(
        first(
          item?.position?.abbreviation,
          item?.position?.displayName,
          item?.position?.name,
          athlete?.position?.abbreviation,
          athlete?.position?.displayName,
          athlete?.position?.name,
          item?.position
        )
      );

    const starter =
      bool(item?.starter) ||
      bool(item?.starterStatus) ||
      item?.status === "starter";

    const substitute =
      bool(item?.substitute) ||
      item?.status === "substitute" ||
      item?.didNotPlay === false;

    result.push({
      id:
        clean(
          first(
            athlete?.id,
            item?.id
          )
        ),

      name,

      jersey:
        clean(
          first(
            item?.jersey,
            athlete?.jersey,
            item?.uniformNumber
          )
        ),

      position,

      starter,

      substitute,

      formationPlace:
        clean(
          first(
            item?.formationPlace,
            item?.position?.abbreviation
          )
        )
    });
  }

  return result;
}

function findRosterForTeam(
  summary,
  id,
  side
) {
  const sources = [
    summary?.rosters,
    summary?.roster,
    summary?.lineups,
    summary?.boxscore?.teams,
    summary?.header?.competitions?.[0]?.competitors
  ];

  for (const source of sources) {
    for (const item of arr(source)) {
      const itemId =
        teamId(item);

      if (
        id &&
        itemId &&
        String(itemId) ===
          String(id)
      ) {
        return item;
      }

      if (
        !id &&
        item?.homeAway === side
      ) {
        return item;
      }
    }
  }

  return null;
}

function getFormation(
  roster,
  competitor
) {
  return clean(
    first(
      roster?.formation,
      roster?.formation?.text,
      roster?.formation?.displayName,
      roster?.lineup?.formation,
      roster?.lineup?.formation?.text,
      competitor?.formation,
      competitor?.formation?.text
    )
  );
}

function getLineup(
  summary,
  competitor,
  side
) {
  const id =
    teamId(competitor);

  const roster =
    findRosterForTeam(
      summary,
      id,
      side
    );

  const sources = [
    roster?.roster?.athletes,
    roster?.roster?.players,
    roster?.athletes,
    roster?.players,
    roster?.lineup?.players,
    roster?.lineup?.athletes,
    competitor?.roster?.athletes,
    competitor?.roster?.players,
    competitor?.athletes,
    competitor?.players
  ];

  let players = [];

  for (const source of sources) {
    const extracted =
      getPlayersFromSource(
        source
      );

    if (
      extracted.length >
      players.length
    ) {
      players = extracted;
    }
  }

  const starters =
    players.filter(
      p => p.starter
    );

  const substitutes =
    players.filter(
      p =>
        !p.starter &&
        (
          p.substitute ||
          !starters.includes(p)
        )
    );

  return {
    formation:
      getFormation(
        roster,
        competitor
      ),

    starters,

    substitutes,

    players
  };
}

/* =========================================================
   STATISTICHE
========================================================= */

function normalizeStatisticName(
  name
) {
  const value =
    String(name || "")
      .toLowerCase()
      .replace(/[_-]/g, " ")
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
    value === "total shots" ||
    value.includes("total shots") ||
    value.includes("tiri totali")
  ) {
    return "shots";
  }

  if (
    value.includes("blocked") &&
    value.includes("shot")
  ) {
    return "blockedShots";
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
    value.includes("ammonizioni")
  ) {
    return "yellowCards";
  }

  if (
    value.includes("red card") ||
    value === "red" ||
    value.includes("espulsioni")
  ) {
    return "redCards";
  }

  if (
    value.includes("save") ||
    value.includes("saves") ||
    value.includes("parades") ||
    value.includes("parata")
  ) {
    return "saves";
  }

  if (
    value.includes("pass") ||
    value.includes("passes")
  ) {
    return "passes";
  }

  if (
    value.includes("accuracy") ||
    value.includes("percent")
  ) {
    return "accuracy";
  }

  return null;
}

function getStatisticValue(stat) {
  return first(
    stat?.displayValue,
    stat?.value,
    stat?.displayValueText,
    stat?.valueText
  );
}

function extractStatisticsFromTeam(
  team
) {
  const result = {};

  if (!team) {
    return result;
  }

  const sources = [
    team?.statistics,
    team?.team?.statistics,
    team?.competitor?.statistics
  ];

  let statistics = [];

  for (const source of sources) {
    if (
      arr(source).length >
      statistics.length
    ) {
      statistics = source;
    }
  }

  for (const stat of statistics) {
    const key =
      normalizeStatisticName(
        first(
          stat?.name,
          stat?.label,
          stat?.displayName,
          stat?.abbreviation,
          stat?.type
        )
      );

    if (!key) continue;

    result[key] =
      getStatisticValue(stat);
  }

  return result;
}

function findBoxscoreTeam(
  summary,
  side,
  id
) {
  const teams =
    arr(
      summary?.boxscore?.teams
    );

  return (
    teams.find(
      team =>
        team?.homeAway === side
    ) ||
    teams.find(
      team =>
        id &&
        String(teamId(team)) ===
          String(id)
    ) ||
    null
  );
}

function getStatistics(
  summary,
  home,
  away
) {
  const homeBox =
    findBoxscoreTeam(
      summary,
      "home",
      teamId(home)
    );

  const awayBox =
    findBoxscoreTeam(
      summary,
      "away",
      teamId(away)
    );

  let homeStats =
    extractStatisticsFromTeam(
      homeBox
    );

  let awayStats =
    extractStatisticsFromTeam(
      awayBox
    );

  if (
    Object.keys(homeStats).length === 0
  ) {
    homeStats =
      extractStatisticsFromTeam(
        home
      );
  }

  if (
    Object.keys(awayStats).length === 0
  ) {
    awayStats =
      extractStatisticsFromTeam(
        away
      );
  }

  return {
    home: homeStats,
    away: awayStats
  };
}

/* =========================================================
   FALLI E CARTELLINI — FALLBACK DAGLI EVENTI
========================================================= */

function countEvents(
  events,
  side,
  type
) {
  return events.filter(
    event =>
      event.team &&
      event.teamSide === side &&
      event.type === type
  ).length;
}

function addEventBasedStats(
  statistics,
  events
) {
  for (const side of ["home", "away"]) {
    if (!statistics[side]) {
      statistics[side] = {};
    }

    const yellow =
      events.filter(
        e =>
          e.teamSide === side &&
          e.type ===
            "Cartellino giallo"
      ).length;

    const red =
      events.filter(
        e =>
          e.teamSide === side &&
          e.type ===
            "Cartellino rosso"
      ).length;

    if (
      statistics[side]
        .yellowCards === undefined
    ) {
      statistics[side]
        .yellowCards = yellow;
    }

    if (
      statistics[side]
        .redCards === undefined
    ) {
      statistics[side]
        .redCards = red;
    }
  }

  return statistics;
}

/* =========================================================
   RIGORI
========================================================= */

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

  for (const play of plays) {
    const text =
      getEventText(play);

    if (
      !/penalty|penalt|rigore/i.test(
        text
      )
    ) {
      continue;
    }

    const id =
      play.id ||
      `${getEventMinute(play)}-${text}`;

    if (seen.has(id)) continue;

    seen.add(id);

    const side =
      play.team?.homeAway ||
      play.competitor?.homeAway ||
      null;

    const player =
      clean(
        first(
          play.athlete?.displayName,
          play.player?.displayName,
          getPlayerFromText(text)
        )
      );

    let esito =
      "Tentativo di rigore";

    if (
      /miss|missed|saved|save|parato|sbagliato/i.test(
        text
      )
    ) {
      esito =
        "Sbagliato/Parato";
    } else if (
      /goal|gol|scored/i.test(
        text
      )
    ) {
      esito =
        "Realizzato";
    }

    const item = {
      minute:
        getEventMinute(play),

      player,

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

/* =========================================================
   STADIO
========================================================= */

function getVenue(
  summary,
  competitionInfo
) {
  const venue =
    first(
      summary?.gameInfo?.venue,
      summary?.venue,
      competitionInfo?.venue,
      summary?.header?.venue
    );

  if (!venue) return null;

  const address =
    venue.address || {};

  return {
    id:
      clean(venue.id),

    name:
      clean(
        first(
          venue.fullName,
          venue.displayName,
          venue.name
        )
      ),

    city:
      clean(
        first(
          address.city,
          venue.city
        )
      ),

    country:
      clean(
        first(
          address.country,
          address.countryName,
          venue.country
        )
      ),

    capacity:
      number(
        venue.capacity
      ),

    address:
      clean(
        first(
          address.fullAddress,
          address.street
        )
      )
  };
}

/* =========================================================
   ARBITRI
========================================================= */

function getOfficials(
  summary,
  competitionInfo
) {
  const sources = [
    competitionInfo?.officials,
    summary?.header?.competitions?.[0]?.officials,
    summary?.gameInfo?.officials,
    summary?.officials
  ];

  let officials = [];

  for (const source of sources) {
    if (
      arr(source).length >
      officials.length
    ) {
      officials = source;
    }
  }

  return officials
    .map(
      official => ({
        id:
          clean(official.id),

        name:
          clean(
            first(
              official.displayName,
              official.fullName,
              official.name
            )
          ),

        role:
          clean(
            first(
              official.position?.displayName,
              official.position?.name,
              official.role,
              "Arbitro"
            )
          )
      })
    )
    .filter(
      official =>
        official.name
    );
}

/* =========================================================
   BROADCAST
========================================================= */

function getBroadcasts(
  summary,
  competitionInfo
) {
  const sources = [
    competitionInfo?.broadcasts,
    summary?.broadcasts,
    summary?.header?.competitions?.[0]?.broadcasts
  ];

  let broadcasts = [];

  for (const source of sources) {
    if (
      arr(source).length >
      broadcasts.length
    ) {
      broadcasts = source;
    }
  }

  return broadcasts.map(
    item => ({
      name:
        clean(
          first(
            item.names?.[0],
            item.name,
            item.displayName,
            item.media?.name,
            item.media?.shortName
          )
        ),

      type:
        clean(
          first(
            item.type?.shortName,
            item.type?.text,
            item.type?.name,
            item.type
          )
        )
    })
  );
}

/* =========================================================
   MVP
========================================================= */

function getMVP(summary) {
  const possible = [
    summary?.leaders,
    summary?.header?.competitions?.[0]?.leaders,
    summary?.boxscore?.leaders
  ];

  for (const leaders of possible) {
    for (const group of arr(leaders)) {
      const groupName =
        String(
          first(
            group.name,
            group.displayName,
            group.shortDisplayName
          ) || ""
        ).toLowerCase();

      if (
        groupName.includes(
          "player of the match"
        ) ||
        groupName.includes("mvp") ||
        groupName.includes("match winner")
      ) {
        const leader =
          group.leaders?.[0];

        const athlete =
          leader?.athlete ||
          leader?.player;

        if (!athlete) continue;

        return {
          player:
            clean(
              first(
                athlete.displayName,
                athlete.fullName
              )
            ),

          team:
            athlete.team?.displayName
              ? normalizeTeamName(
                  athlete.team.displayName
                )
              : null,

          value:
            clean(
              first(
                leader.value,
                leader.displayValue
              )
            )
        };
      }
    }
  }

  return null;
}

/* =========================================================
   TEAM DETAILS
========================================================= */

function getTeamDetails(
  competitor
) {
  if (!competitor) {
    return null;
  }

  return {
    id:
      teamId(competitor),

    name:
      teamName(competitor),

    abbreviation:
      clean(
        first(
          competitor?.team?.abbreviation,
          competitor?.abbreviation
        )
      ),

    logo:
      first(
        competitor?.team?.logos?.[0]?.href,
        competitor?.team?.logo,
        competitor?.logos?.[0]?.href,
        competitor?.logo
      ) || null,

    score:
      first(
        competitor?.score,
        "-"
      ),

    record:
      competitor?.record || null
  };
}

/* =========================================================
   MAIN
========================================================= */

module.exports = async (
  req,
  res
) => {
  try {
    const competitionId =
      req.query?.competition;

    const eventId =
      req.query?.id;

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

    /* -----------------------------------------------------
       COMPETIZIONE
    ----------------------------------------------------- */

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

    /* -----------------------------------------------------
       ESPN
    ----------------------------------------------------- */

    const summary =
      await getMatchSummary(
        competition.espnLeague,
        eventId
      );

    if (!summary) {
      return res.status(502).json({
        success: false,
        source: "ESPN",
        error:
          "Impossibile recuperare il riepilogo della partita",
        eventId
      });
    }

    const header =
      summary.header || {};

    const competitionInfo =
      header.competitions?.[0] ||
      summary.competitions?.[0] ||
      null;

    const competitors =
      arr(
        competitionInfo?.competitors
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

    /* -----------------------------------------------------
       DATA
    ----------------------------------------------------- */

    const matchDate =
      first(
        header.date,
        competitionInfo?.date
      );

    const dateTime =
      getRomeDateTime(
        matchDate
      );

    /* -----------------------------------------------------
       EVENTI
    ----------------------------------------------------- */

    const rawEvents = [
      ...arr(summary.keyEvents),
      ...arr(summary.plays),
      ...arr(summary.events)
    ];

    const seenEvents =
      new Set();

    const events =
      rawEvents
        .map(parseEvent)
        .filter(event => {
          if (!event) return false;

          const key =
            event.id ||
            `${event.minute}-${event.type}-${event.player}-${event.text}`;

          if (
            seenEvents.has(key)
          ) {
            return false;
          }

          seenEvents.add(key);

          return true;
        });

    /*
     * Aggiunge il lato home/away
     * quando ESPN lo espone nell'evento.
     */
    for (const event of events) {
      const original =
        rawEvents.find(
          raw =>
            String(raw?.id) ===
            String(event.id)
        );

      event.teamSide =
        original?.team?.homeAway ||
        original?.competitor?.homeAway ||
        original?.homeAway ||
        null;
    }

    /* -----------------------------------------------------
       FORMAZIONI
    ----------------------------------------------------- */

    const homeLineup =
      getLineup(
        summary,
        home,
        "home"
      );

    const awayLineup =
      getLineup(
        summary,
        away,
        "away"
      );

    /* -----------------------------------------------------
       STATISTICHE
    ----------------------------------------------------- */

    let statistics =
      getStatistics(
        summary,
        home,
        away
      );

    statistics =
      addEventBasedStats(
        statistics,
        events
      );

    /* -----------------------------------------------------
       RIGORI
    ----------------------------------------------------- */

    const penalties =
      getPenalties(
        summary
      );

    /* -----------------------------------------------------
       STADIO
    ----------------------------------------------------- */

    const venue =
      getVenue(
        summary,
        competitionInfo
      );

    /* -----------------------------------------------------
       ARBITRI
    ----------------------------------------------------- */

    const officials =
      getOfficials(
        summary,
        competitionInfo
      );

    /* -----------------------------------------------------
       BROADCAST
    ----------------------------------------------------- */

    const broadcasts =
      getBroadcasts(
        summary,
        competitionInfo
      );

    /* -----------------------------------------------------
       MVP
    ----------------------------------------------------- */

    const mvp =
      getMVP(summary);

    /* -----------------------------------------------------
       RESPONSE
    ----------------------------------------------------- */

    res.setHeader(
      "Cache-Control",
      "s-maxage=15, stale-while-revalidate=30"
    );

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

        home:
          getTeamDetails(home),

        away:
          getTeamDetails(away),

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

          period:
            competitionInfo
              ?.status
              ?.period ||
            null,

          completed:
            Boolean(
              competitionInfo
                ?.status
                ?.type
                ?.completed
            )
        }
      },

      lineups: {

        home: {
          formation:
            homeLineup.formation,

          starters:
            homeLineup.starters,

          substitutes:
            homeLineup.substitutes,

          players:
            homeLineup.players,

          totalPlayers:
            homeLineup.players.length
        },

        away: {
          formation:
            awayLineup.formation,

          starters:
            awayLineup.starters,

          substitutes:
            awayLineup.substitutes,

          players:
            awayLineup.players,

          totalPlayers:
            awayLineup.players.length
        }
      },

      statistics,

      penalties,

      venue,

      officials,

      broadcasts,

      mvp,

      events,

      summaryMeta: {
        totalEvents:
          events.length,

        totalPlays:
          arr(summary.plays)
            .length,

        totalKeyEvents:
          arr(summary.keyEvents)
            .length,

        hasBoxscore:
          Boolean(
            summary.boxscore
          ),

        hasRosters:
          Boolean(
            summary.rosters ||
            summary.roster
          ),

        hasVenue:
          Boolean(venue),

        hasOfficials:
          officials.length > 0,

        hasBroadcasts:
          broadcasts.length > 0
      }
    });

  } catch (error) {

    console.error(
      "ESPN MATCH ERROR:",
      error
    );

    return res.status(500).json({

      success: false,

      source: "ESPN",

      error:
        error?.message ||
        "Errore interno durante il recupero della partita.",

      eventId:
        req.query?.id ||
        null
    });
  }
};
