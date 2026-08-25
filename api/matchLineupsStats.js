const { getCompetition } = require("../lib/competitions");
const { getMatchSummary } = require("../lib/espn");
const { normalizeTeamName } = require("../lib/teams");
const { DateTime } = require("luxon");

/* =========================================================
   DATE
========================================================= */

function getRomeDateTime(date) {
  if (!date) return null;

  const parsed = DateTime.fromISO(date, {
    zone: "utc"
  });

  if (!parsed.isValid) return null;

  return parsed.setZone("Europe/Rome");
}

/* =========================================================
   HELPERS
========================================================= */

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

function clean(value) {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  const result =
    String(value).trim();

  return result || null;
}

function number(value) {
  if (
    value === undefined ||
    value === null
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

  const result =
    Number(
      match[0].replace(",", ".")
    );

  return Number.isFinite(result)
    ? result
    : null;
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

  return raw
    ? normalizeTeamName(raw)
    : null;
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

/* =========================================================
   GENERIC PLAYER EXTRACTION
========================================================= */

function getAthlete(item) {
  if (!item) return null;

  return (
    item.athlete ||
    item.player ||
    item
  );
}

function getPlayerName(item) {
  const athlete =
    getAthlete(item);

  return clean(
    first(
      athlete?.displayName,
      athlete?.fullName,
      athlete?.shortName,
      item?.displayName,
      item?.fullName,
      item?.name
    )
  );
}

function getPlayerId(item) {
  const athlete =
    getAthlete(item);

  return clean(
    first(
      athlete?.id,
      item?.id
    )
  );
}

function getJersey(item) {
  const athlete =
    getAthlete(item);

  return clean(
    first(
      item?.jersey,
      athlete?.jersey,
      item?.uniform?.number,
      athlete?.uniform?.number
    )
  );
}

function getPosition(item) {
  const athlete =
    getAthlete(item);

  const position =
    first(
      item?.position,
      athlete?.position
    );

  if (!position) {
    return null;
  }

  if (typeof position === "string") {
    return position;
  }

  return clean(
    first(
      position?.abbreviation,
      position?.displayName,
      position?.name,
      position?.shortName
    )
  );
}

function getStarter(item) {
  return (
    item?.starter === true ||
    item?.starter === "true" ||
    item?.isStarter === true ||
    item?.isStarter === "true"
  );
}

function getSubstitute(item) {
  return (
    item?.substitute === true ||
    item?.substitute === "true" ||
    item?.isSubstitute === true ||
    item?.isSubstitute === "true"
  );
}

/* =========================================================
   PLAYER STATISTICS
========================================================= */

function normalizePlayerStatisticName(
  name
) {
  const value =
    String(name || "")
      .toLowerCase()
      .trim();

  if (
    value.includes("minutes")
  ) {
    return "minutes";
  }

  if (
    value === "goals" ||
    value === "goal"
  ) {
    return "goals";
  }

  if (
    value.includes("assist")
  ) {
    return "assists";
  }

  if (
    value.includes("shot on target") ||
    value.includes("shots on target")
  ) {
    return "shotsOnTarget";
  }

  if (
    value === "shots" ||
    value.includes("total shots")
  ) {
    return "shots";
  }

  if (
    value.includes("foul")
  ) {
    return "fouls";
  }

  if (
    value.includes("yellow")
  ) {
    return "yellowCards";
  }

  if (
    value.includes("red")
  ) {
    return "redCards";
  }

  if (
    value.includes("save")
  ) {
    return "saves";
  }

  if (
    value.includes("pass")
  ) {
    return "passes";
  }

  if (
    value.includes("tackle")
  ) {
    return "tackles";
  }

  if (
    value.includes("interception")
  ) {
    return "interceptions";
  }

  if (
    value.includes("clearance")
  ) {
    return "clearances";
  }

  if (
    value.includes("touch")
  ) {
    return "touches";
  }

  if (
    value.includes("offside")
  ) {
    return "offsides";
  }

  if (
    value.includes("cross")
  ) {
    return "crosses";
  }

  if (
    value.includes("dribble")
  ) {
    return "dribbles";
  }

  if (
    value.includes("block")
  ) {
    return "blocks";
  }

  return null;
}

function getStatisticDisplayValue(
  stat
) {
  return first(
    stat?.displayValue,
    stat?.value,
    stat?.displayValueText,
    stat?.text
  );
}

function extractPlayerStatistics(
  item
) {
  const result = {};

  const sources = [
    item?.statistics,
    item?.stats,
    item?.athlete?.statistics,
    item?.player?.statistics
  ];

  let statistics = [];

  for (
    const source of sources
  ) {
    if (arr(source).length) {
      statistics = source;
      break;
    }
  }

  for (
    const stat of statistics
  ) {
    if (
      typeof stat === "string"
    ) {
      continue;
    }

    const key =
      normalizePlayerStatisticName(
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
      getStatisticDisplayValue(
        stat
      );
  }

  /*
   * Conserviamo anche le statistiche
   * ESPN che non riconosciamo.
   */
  for (
    const stat of statistics
  ) {
    if (
      !stat ||
      typeof stat !== "object"
    ) {
      continue;
    }

    const name =
      clean(
        first(
          stat?.name,
          stat?.label,
          stat?.displayName,
          stat?.abbreviation,
          stat?.type
        )
      );

    if (!name) continue;

    const key =
      name
        .replace(/\s+/g, "_")
        .replace(/[^\w]/g, "")
        .toLowerCase();

    if (
      !key ||
      result[key] !== undefined
    ) {
      continue;
    }

    result[key] =
      getStatisticDisplayValue(
        stat
      );
  }

  return result;
}

/* =========================================================
   PLAYER
========================================================= */

function parsePlayer(item) {
  if (!item) return null;

  const name =
    getPlayerName(item);

  if (!name) {
    return null;
  }

  const athlete =
    getAthlete(item);

  return {
    id:
      getPlayerId(item),

    name,

    jersey:
      getJersey(item),

    position:
      getPosition(item),

    starter:
      getStarter(item),

    substitute:
      getSubstitute(item),

    captain:
      item?.captain === true ||
      item?.isCaptain === true ||
      athlete?.captain === true ||
      false,

    statistics:
      extractPlayerStatistics(
        item
      ),

    raw: {
      athleteId:
        getPlayerId(item),

      jersey:
        getJersey(item),

      position:
        getPosition(item)
    }
  };
}

/* =========================================================
   RICERCA PROFONDA DEI ROSTER
========================================================= */

function collectPlayerArrays(
  source,
  output = [],
  depth = 0
) {
  if (!source) {
    return output;
  }

  /*
   * Evitiamo ricorsioni infinite
   * e oggetti ESPN troppo profondi.
   */
  if (depth > 7) {
    return output;
  }

  if (Array.isArray(source)) {
    for (
      const item of source
    ) {
      if (!item) continue;

      /*
       * Possibile giocatore.
       */
      const player =
        parsePlayer(item);

      if (player) {
        output.push({
          original: item,
          parsed: player
        });
      }

      /*
       * Continuiamo a cercare
       * eventuali players annidati.
       */
      if (
        typeof item === "object"
      ) {
        collectPlayerArrays(
          item,
          output,
          depth + 1
        );
      }
    }

    return output;
  }

  if (
    typeof source !== "object"
  ) {
    return output;
  }

  for (
    const [key, value]
    of Object.entries(source)
  ) {
    if (
      key === "athlete" ||
      key === "player"
    ) {
      const player =
        parsePlayer(source);

      if (player) {
        output.push({
          original: source,
          parsed: player
        });
      }
    }

    if (
      value &&
      typeof value === "object"
    ) {
      collectPlayerArrays(
        value,
        output,
        depth + 1
      );
    }
  }

  return output;
}

/* =========================================================
   DEDUPLICAZIONE GIOCATORI
========================================================= */

function deduplicatePlayers(
  entries
) {
  const map =
    new Map();

  for (
    const entry of entries
  ) {
    const player =
      entry.parsed;

    if (!player?.name) {
      continue;
    }

    const key =
      player.id ||
      `${player.name}-${player.jersey}`;

    if (
      !map.has(key)
    ) {
      map.set(
        key,
        player
      );
    }
  }

  return Array.from(
    map.values()
  );
}

/* =========================================================
   ROSTER TEAM
========================================================= */

function findRosterForTeam(
  summary,
  competitor,
  side
) {
  const id =
    teamId(competitor);

  /*
   * Percorsi ESPN più comuni.
   */
  const sources = [
    summary?.rosters,
    summary?.roster,
    summary?.boxscore?.teams,
    summary?.lineups,
    summary?.header
      ?.competitions?.[0]
      ?.competitors
  ];

  for (
    const source of sources
  ) {
    for (
      const item of arr(source)
    ) {
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

/* =========================================================
   FORMAZIONE
========================================================= */

function getFormation(
  roster,
  competitor,
  side
) {
  const possible = [
    roster?.formation,
    roster?.formation?.text,
    roster?.formation?.displayName,

    roster?.lineup?.formation,
    roster?.lineup?.formation?.text,
    roster?.lineup?.formation?.displayName,

    roster?.tacticalFormation,
    roster?.tacticalFormation?.text,

    competitor?.formation,
    competitor?.formation?.text,
    competitor?.formation?.displayName,

    competitor?.lineup?.formation,
    competitor?.lineup?.formation?.text
  ];

  for (
    const value of possible
  ) {
    if (
      value === undefined ||
      value === null
    ) {
      continue;
    }

    if (
      typeof value === "object"
    ) {
      const result =
        clean(
          first(
            value.text,
            value.displayName,
            value.name,
            value.abbreviation
          )
        );

      if (result) {
        return result;
      }
    }

    const result =
      clean(value);

    if (result) {
      return result;
    }
  }

  return null;
}

/* =========================================================
   ESTRAZIONE LINEUP
========================================================= */

function extractLineupPlayers(
  summary,
  roster,
  competitor
) {
  const sources = [
    /*
     * Roster ESPN
     */
    roster?.roster?.athletes,
    roster?.roster?.players,

    roster?.athletes,
    roster?.players,

    /*
     * Lineup
     */
    roster?.lineup?.players,
    roster?.lineup?.athletes,

    /*
     * Competitor
     */
    competitor?.roster?.athletes,
    competitor?.roster?.players,

    competitor?.athletes,
    competitor?.players,

    /*
     * Boxscore
     */
    roster?.boxscore?.athletes,
    roster?.boxscore?.players
  ];

  for (
    const source of sources
  ) {
    if (!arr(source).length) {
      continue;
    }

    const players =
      source
        .map(parsePlayer)
        .filter(Boolean);

    if (players.length) {
      return players;
    }
  }

  /*
   * Fallback più aggressivo:
   * cerchiamo giocatori dentro
   * l'intero oggetto roster.
   */
  const collected =
    collectPlayerArrays(
      roster
    );

  return deduplicatePlayers(
    collected
  );
}

/* =========================================================
   LINEUP COMPLETA
========================================================= */

function getLineup(
  summary,
  competitor,
  side
) {
  const roster =
    findRosterForTeam(
      summary,
      competitor,
      side
    );

  let players =
    extractLineupPlayers(
      summary,
      roster,
      competitor
    );

  /*
   * Rimuoviamo duplicati.
   */
  players =
    deduplicatePlayers(
      players.map(
        player => ({
          parsed: player
        })
      )
    );

  /*
   * Se ESPN non specifica starter/substitute,
   * non inventiamo la formazione.
   */
  const starters =
    players.filter(
      player =>
        player.starter === true
    );

  const substitutes =
    players.filter(
      player =>
        player.substitute === true &&
        !player.starter
    );

  const formation =
    getFormation(
      roster,
      competitor,
      side
    );

  return {
    formation,

    starters,

    substitutes,

    players,

    totalPlayers:
      players.length,

    totalStarters:
      starters.length,

    totalSubstitutes:
      substitutes.length
  };
}

/* =========================================================
   STATISTICHE SQUADRA
========================================================= */

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
    value.includes("blocked shot") ||
    value.includes("blocked shots") ||
    value.includes("tiri bloccati")
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
    value.includes("offsides") ||
    value.includes("offside") ||
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
    value.includes("parades")
  ) {
    return "saves";
  }

  if (
    value.includes("pass")
  ) {
    return "passes";
  }

  if (
    value.includes("cross")
  ) {
    return "crosses";
  }

  if (
    value.includes("tackle")
  ) {
    return "tackles";
  }

  if (
    value.includes("interception")
  ) {
    return "interceptions";
  }

  if (
    value.includes("clearance")
  ) {
    return "clearances";
  }

  if (
    value.includes("touch")
  ) {
    return "touches";
  }

  if (
    value.includes("dribble")
  ) {
    return "dribbles";
  }

  if (
    value.includes("duel")
  ) {
    return "duels";
  }

  if (
    value.includes("big chance")
  ) {
    return "bigChances";
  }

  if (
    value.includes("expected goals") ||
    value === "xg"
  ) {
    return "xg";
  }

  return null;
}

/* =========================================================
   VALORE STATISTICA
========================================================= */

function getStatisticValue(
  stat
) {
  return first(
    stat?.displayValue,
    stat?.value,
    stat?.displayValueText,
    stat?.text
  );
}

/* =========================================================
   ESTRAZIONE STATISTICHE
========================================================= */

function extractStatisticsFromTeam(
  team
) {
  const result = {};
  const raw = {};

  if (!team) {
    return {
      normalized: result,
      raw
    };
  }

  const sources = [
    team?.statistics,
    team?.team?.statistics,
    team?.competitor?.statistics
  ];

  let statistics = [];

  for (
    const source of sources
  ) {
    if (arr(source).length) {
      statistics = source;
      break;
    }
  }

  for (
    const stat of statistics
  ) {
    if (
      !stat ||
      typeof stat !== "object"
    ) {
      continue;
    }

    const name =
      clean(
        first(
          stat?.name,
          stat?.label,
          stat?.displayName,
          stat?.abbreviation,
          stat?.type
        )
      );

    if (!name) {
      continue;
    }

    const value =
      getStatisticValue(stat);

    /*
     * Statistica normalizzata.
     */
    const normalized =
      normalizeStatisticName(
        name
      );

    if (normalized) {
      result[normalized] =
        value;
    }

    /*
     * Statistica originale ESPN.
     */
    const rawKey =
      name
        .replace(/\s+/g, "_")
        .replace(/[^\w]/g, "")
        .toLowerCase();

    if (rawKey) {
      raw[rawKey] = value;
    }
  }

  return {
    normalized: result,
    raw
  };
}

/* =========================================================
   BOX SCORE TEAM
========================================================= */

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
        teamId(team) &&
        String(teamId(team)) ===
          String(id)
    ) ||
    null
  );
}

/* =========================================================
   STATISTICHE COMPLETE
========================================================= */

function getTeamStatistics(
  summary,
  home,
  away
) {
  const homeId =
    teamId(home);

  const awayId =
    teamId(away);

  const homeBox =
    findBoxscoreTeam(
      summary,
      "home",
      homeId
    );

  const awayBox =
    findBoxscoreTeam(
      summary,
      "away",
      awayId
    );

  let homeStats =
    extractStatisticsFromTeam(
      homeBox
    );

  let awayStats =
    extractStatisticsFromTeam(
      awayBox
    );

  /*
   * Fallback al competitor.
   */
  if (
    Object.keys(
      homeStats.normalized
    ).length === 0
  ) {
    homeStats =
      extractStatisticsFromTeam(
        home
      );
  }

  if (
    Object.keys(
      awayStats.normalized
    ).length === 0
  ) {
    awayStats =
      extractStatisticsFromTeam(
        away
      );
  }

  return {
    home: {
      ...homeStats.normalized,

      raw:
        homeStats.raw
    },

    away: {
      ...awayStats.normalized,

      raw:
        awayStats.raw
    }
  };
}

/* =========================================================
   STATISTICHE INDIVIDUALI BOX SCORE
========================================================= */

function extractIndividualPlayers(
  boxTeam
) {
  if (!boxTeam) {
    return [];
  }

  const sources = [
    boxTeam?.players,
    boxTeam?.athletes,
    boxTeam?.roster?.players,
    boxTeam?.roster?.athletes
  ];

  for (
    const source of sources
  ) {
    if (!arr(source).length) {
      continue;
    }

    const players =
      source
        .map(parsePlayer)
        .filter(Boolean);

    if (players.length) {
      return deduplicatePlayers(
        players.map(
          player => ({
            parsed: player
          })
        )
      );
    }
  }

  return [];
}

/* =========================================================
   MERGE LINEUP + BOXSCORE
========================================================= */

function mergePlayerData(
  lineupPlayers,
  boxPlayers
) {
  const map =
    new Map();

  for (
    const player of lineupPlayers
  ) {
    const key =
      player.id ||
      `${player.name}-${player.jersey}`;

    map.set(
      key,
      {
        ...player
      }
    );
  }

  for (
    const player of boxPlayers
  ) {
    const key =
      player.id ||
      `${player.name}-${player.jersey}`;

    const existing =
      map.get(key);

    if (!existing) {
      map.set(
        key,
        {
          ...player
        }
      );

      continue;
    }

    map.set(
      key,
      {
        ...existing,

        statistics:
          Object.keys(
            player.statistics || {}
          ).length
            ? player.statistics
            : existing.statistics,

        captain:
          player.captain ||
          existing.captain,

        starter:
          player.starter ||
          existing.starter,

        substitute:
          player.substitute ||
          existing.substitute
      }
    );
  }

  return Array.from(
    map.values()
  );
}

/* =========================================================
   INFO PARTITA
========================================================= */

function getMatchInfo(
  header,
  competitionInfo,
  home,
  away
) {
  const matchDate =
    first(
      header?.date,
      competitionInfo?.date
    );

  const dateTime =
    getRomeDateTime(
      matchDate
    );

  return {
    id:
      clean(
        first(
          header?.id,
          competitionInfo?.id
        )
      ),

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
        teamId(home),

      name:
        teamName(home),

      abbreviation:
        clean(
          first(
            home?.team?.abbreviation,
            home?.abbreviation
          )
        ),

      score:
        home?.score ?? null
    },

    away: {
      id:
        teamId(away),

      name:
        teamName(away),

      abbreviation:
        clean(
          first(
            away?.team?.abbreviation,
            away?.abbreviation
          )
        ),

      score:
        away?.score ?? null
    },

    status: {
      state:
        competitionInfo
          ?.status
          ?.type
          ?.state || null,

      name:
        competitionInfo
          ?.status
          ?.type
          ?.name || null,

      description:
        competitionInfo
          ?.status
          ?.type
          ?.description || null,

      detail:
        competitionInfo
          ?.status
          ?.type
          ?.detail || null,

      completed:
        Boolean(
          competitionInfo
            ?.status
            ?.type
            ?.completed
        )
    }
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
       ESPN SUMMARY
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

    /* -----------------------------------------------------
       HEADER
    ----------------------------------------------------- */

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

    if (!home || !away) {
      return res.status(502).json({
        success: false,
        source: "ESPN",
        error:
          "Impossibile identificare le due squadre della partita",
        eventId
      });
    }

    /* -----------------------------------------------------
       LINEUPS
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
       BOX SCORE
    ----------------------------------------------------- */

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

    const homeBoxPlayers =
      extractIndividualPlayers(
        homeBox
      );

    const awayBoxPlayers =
      extractIndividualPlayers(
        awayBox
      );

    /* -----------------------------------------------------
       MERGE GIOCATORI
    ----------------------------------------------------- */

    const homePlayers =
      mergePlayerData(
        homeLineup.players,
        homeBoxPlayers
      );

    const awayPlayers =
      mergePlayerData(
        awayLineup.players,
        awayBoxPlayers
      );

    /*
     * Ricalcoliamo titolari e panchina
     * dopo il merge.
     */

    const homeStarters =
      homePlayers.filter(
        player =>
          player.starter === true
      );

    const homeSubstitutes =
      homePlayers.filter(
        player =>
          player.substitute === true &&
          !player.starter
      );

    const awayStarters =
      awayPlayers.filter(
        player =>
          player.starter === true
      );

    const awaySubstitutes =
      awayPlayers.filter(
        player =>
          player.substitute === true &&
          !player.starter
      );

    /* -----------------------------------------------------
       STATISTICHE SQUADRA
    ----------------------------------------------------- */

    const statistics =
      getTeamStatistics(
        summary,
        home,
        away
      );

    /* -----------------------------------------------------
       MATCH INFO
    ----------------------------------------------------- */

    const match =
      getMatchInfo(
        header,
        competitionInfo,
        home,
        away
      );

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

      match,

      lineups: {

        home: {

          team:
            teamName(home),

          formation:
            homeLineup.formation,

          starters:
            homeStarters,

          substitutes:
            homeSubstitutes,

          players:
            homePlayers,

          totalPlayers:
            homePlayers.length,

          totalStarters:
            homeStarters.length,

          totalSubstitutes:
            homeSubstitutes.length
        },

        away: {

          team:
            teamName(away),

          formation:
            awayLineup.formation,

          starters:
            awayStarters,

          substitutes:
            awaySubstitutes,

          players:
            awayPlayers,

          totalPlayers:
            awayPlayers.length,

          totalStarters:
            awayStarters.length,

          totalSubstitutes:
            awaySubstitutes.length
        }
      },

      statistics: {

        home: {
          team:
            teamName(home),

          ...statistics.home
        },

        away: {
          team:
            teamName(away),

          ...statistics.away
        }
      },

      individualStatistics: {

        home:
          homePlayers.map(
            player => ({
              id:
                player.id,

              name:
                player.name,

              jersey:
                player.jersey,

              position:
                player.position,

              starter:
                player.starter,

              substitute:
                player.substitute,

              statistics:
                player.statistics
            })
          ),

        away:
          awayPlayers.map(
            player => ({
              id:
                player.id,

              name:
                player.name,

              jersey:
                player.jersey,

              position:
                player.position,

              starter:
                player.starter,

              substitute:
                player.substitute,

              statistics:
                player.statistics
            })
          )
      },

      summaryMeta: {

        hasBoxscore:
          Boolean(
            summary?.boxscore
          ),

        hasRosters:
          Boolean(
            summary?.rosters ||
            summary?.roster
          ),

        homePlayers:
          homePlayers.length,

        awayPlayers:
          awayPlayers.length,

        homeStarters:
          homeStarters.length,

        awayStarters:
          awayStarters.length,

        homeSubstitutes:
          homeSubstitutes.length,

        awaySubstitutes:
          awaySubstitutes.length,

        homeTeamStatistics:
          Object.keys(
            statistics.home || {}
          ).length,

        awayTeamStatistics:
          Object.keys(
            statistics.away || {}
          ).length
      }
    });

  } catch (error) {

    console.error(
      "ESPN LINEUPS/STATS ERROR:",
      error
    );

    return res.status(500).json({

      success: false,

      source: "ESPN",

      error:
        error?.message ||
        "Errore interno durante il recupero di formazioni e statistiche.",

      eventId:
        req.query?.id ||
        null
    });
  }
};
