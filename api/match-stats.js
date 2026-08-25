const { getCompetition } = require("../lib/competitions");
const { getMatchSummary } = require("../lib/espn");
const { normalizeTeamName } = require("../lib/teams");

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
  if (value === undefined || value === null) {
    return null;
  }

  const result = String(value).trim();

  return result || null;
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
    return Number.isFinite(value) ? value : null;
  }

  const match = String(value).match(
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
  const raw = first(
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

function getCompetitor(competitors, side) {
  return (
    arr(competitors).find(
      item => item.homeAway === side
    ) || null
  );
}

/* =========================================================
   GIOCATORE
========================================================= */

function extractAthlete(item) {
  return (
    item?.athlete ||
    item?.player ||
    item
  );
}

function extractPlayer(item) {
  const athlete =
    extractAthlete(item);

  const name = clean(
    first(
      athlete?.displayName,
      athlete?.fullName,
      athlete?.shortName,
      item?.displayName,
      item?.fullName
    )
  );

  if (!name) {
    return null;
  }

  const position =
    item?.position ||
    athlete?.position ||
    {};

  return {
    id: clean(
      first(
        athlete?.id,
        item?.id
      )
    ),

    name,

    jersey: clean(
      first(
        item?.jersey,
        athlete?.jersey,
        item?.uniformNumber
      )
    ),

    position: clean(
      first(
        position?.abbreviation,
        position?.displayName,
        position?.name,
        athlete?.position?.abbreviation,
        athlete?.position?.displayName,
        athlete?.position?.name
      )
    ),

    starter:
      item?.starter === true ||
      item?.starter === "true",

    substitute:
      item?.substitute === true ||
      item?.substitute === "true"
  };
}

/* =========================================================
   FORMAZIONI
========================================================= */

function getRosterSource(
  summary,
  competitor,
  side
) {
  const id =
    teamId(competitor);

  const sources = [
    summary?.rosters,
    summary?.roster,
    summary?.lineups,
    summary?.boxscore?.teams
  ];

  for (const source of sources) {
    for (const item of arr(source)) {
      const itemId =
        teamId(item);

      if (
        id &&
        itemId &&
        String(id) ===
          String(itemId)
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

  return competitor || null;
}

function getFormation(
  roster,
  competitor
) {
  return clean(
    first(
      roster?.formation,
      roster?.formation?.text,
      roster?.lineup?.formation,
      roster?.lineup?.formation?.text,
      competitor?.formation,
      competitor?.formation?.text
    )
  );
}

function getPlayers(
  roster,
  competitor
) {
  const sources = [
    roster?.roster?.athletes,
    roster?.roster?.players,
    roster?.athletes,
    roster?.players,
    roster?.lineup?.players,

    competitor?.roster?.athletes,
    competitor?.roster?.players,
    competitor?.athletes,
    competitor?.players
  ];

  for (const source of sources) {
    if (!arr(source).length) {
      continue;
    }

    const players =
      arr(source)
        .map(extractPlayer)
        .filter(Boolean);

    if (players.length) {
      return players;
    }
  }

  return [];
}

function buildLineup(
  summary,
  competitor,
  side
) {
  const roster =
    getRosterSource(
      summary,
      competitor,
      side
    );

  const players =
    getPlayers(
      roster,
      competitor
    );

  const formation =
    getFormation(
      roster,
      competitor
    );

  const starters =
    players.filter(
      player => player.starter
    );

  const substitutes =
    players.filter(
      player =>
        player.substitute &&
        !player.starter
    );

  return {
    formation,

    starters,

    substitutes,

    players,

    totalPlayers:
      players.length
  };
}

/* =========================================================
   STATISTICHE
========================================================= */

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
    value === "total shots" ||
    value.includes("total shots") ||
    value.includes("tiri totali")
  ) {
    return "shots";
  }

  if (
    value.includes("blocked") ||
    value.includes("bloccati")
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
    value.includes("saves") ||
    value.includes("parades")
  ) {
    return "saves";
  }

  if (
    value.includes("pass") ||
    value.includes("passes") ||
    value.includes("passing")
  ) {
    return "passes";
  }

  if (
    value.includes("accurate pass")
  ) {
    return "accuratePasses";
  }

  if (
    value.includes("pass accuracy") ||
    value.includes("passing accuracy")
  ) {
    return "passAccuracy";
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
    value.includes("duel")
  ) {
    return "duels";
  }

  if (
    value.includes("cross")
  ) {
    return "crosses";
  }

  if (
    value.includes("offensive rebound") ||
    value.includes("rebound")
  ) {
    return "rebounds";
  }

  return null;
}

function getStatisticValue(stat) {
  return first(
    stat?.displayValue,
    stat?.value,
    stat?.displayValueText
  );
}

function extractTeamStatistics(team) {
  const result = {};

  const sources = [
    team?.statistics,
    team?.team?.statistics,
    team?.competitor?.statistics
  ];

  let statistics = [];

  for (const source of sources) {
    if (arr(source).length) {
      statistics = source;
      break;
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

    if (!key) {
      continue;
    }

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
        team.homeAway === side
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

function getTeamStatistics(
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
    extractTeamStatistics(
      homeBox
    );

  let awayStats =
    extractTeamStatistics(
      awayBox
    );

  if (
    Object.keys(homeStats).length === 0
  ) {
    homeStats =
      extractTeamStatistics(home);
  }

  if (
    Object.keys(awayStats).length === 0
  ) {
    awayStats =
      extractTeamStatistics(away);
  }

  return {
    home: homeStats,
    away: awayStats
  };
}

/* =========================================================
   STATISTICHE INDIVIDUALI
========================================================= */

function extractPlayerStatistics(
  summary,
  side,
  teamIdValue
) {
  const result = [];

  const teams =
    arr(
      summary?.boxscore?.players
    );

  let teamBlock =
    teams.find(
      team =>
        team?.homeAway === side
    );

  if (!teamBlock && teamIdValue) {
    teamBlock =
      teams.find(
        team =>
          String(
            teamId(team)
          ) ===
          String(teamIdValue)
      );
  }

  if (!teamBlock) {
    return result;
  }

  const statisticsGroups =
    arr(
      teamBlock.statistics ||
      teamBlock.statisticsGroups ||
      teamBlock.groups
    );

  for (const group of statisticsGroups) {
    const groupName =
      clean(
        first(
          group?.name,
          group?.displayName,
          group?.label
        )
      );

    const athletes =
      arr(
        group?.athletes ||
        group?.players
      );

    for (const athleteItem of athletes) {
      const athlete =
        extractAthlete(
          athleteItem
        );

      const player =
        extractPlayer(
          athleteItem
        );

      if (!player) {
        continue;
      }

      const stats = {};

      const statValues =
        arr(
          athleteItem?.statistics ||
          athleteItem?.stats ||
          athleteItem?.values
        );

      for (
        let i = 0;
        i < statValues.length;
        i++
      ) {
        const value =
          statValues[i];

        const label =
          first(
            value?.name,
            value?.label,
            value?.displayName
          );

        const key =
          normalizeStatisticName(
            label
          );

        if (key) {
          stats[key] =
            getStatisticValue(
              value
            );
        }
      }

      result.push({
        id:
          player.id,

        name:
          player.name,

        jersey:
          player.jersey,

        position:
          player.position,

        group:
          groupName,

        statistics:
          stats
      });
    }
  }

  /*
   * Elimina eventuali duplicati
   */
  const unique =
    new Map();

  for (const player of result) {
    unique.set(
      `${player.id || ""}-${player.name}`,
      player
    );
  }

  return Array.from(
    unique.values()
  );
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
          "Impossibile recuperare il riepilogo ESPN",
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
       FORMAZIONI
    ----------------------------------------------------- */

    const homeLineup =
      buildLineup(
        summary,
        home,
        "home"
      );

    const awayLineup =
      buildLineup(
        summary,
        away,
        "away"
      );

    /* -----------------------------------------------------
       STATISTICHE SQUADRE
    ----------------------------------------------------- */

    const teamStatistics =
      getTeamStatistics(
        summary,
        home,
        away
      );

    /* -----------------------------------------------------
       STATISTICHE GIOCATORI
    ----------------------------------------------------- */

    const homePlayerStatistics =
      extractPlayerStatistics(
        summary,
        "home",
        teamId(home)
      );

    const awayPlayerStatistics =
      extractPlayerStatistics(
        summary,
        "away",
        teamId(away)
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

      match: {
        id:
          String(eventId),

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
            home?.score ?? "-"
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
            away?.score ?? "-"
        }
      },

      formations: {

        home: {
          team:
            teamName(home),

          formation:
            homeLineup.formation,

          starters:
            homeLineup.starters,

          substitutes:
            homeLineup.substitutes,

          players:
            homeLineup.players,

          totalPlayers:
            homeLineup.totalPlayers
        },

        away: {
          team:
            teamName(away),

          formation:
            awayLineup.formation,

          starters:
            awayLineup.starters,

          substitutes:
            awayLineup.substitutes,

          players:
            awayLineup.players,

          totalPlayers:
            awayLineup.totalPlayers
        }
      },

      statistics: {
        teams:
          teamStatistics,

        players: {
          home:
            homePlayerStatistics,

          away:
            awayPlayerStatistics
        }
      },

      summaryMeta: {
        hasBoxscore:
          Boolean(
            summary?.boxscore
          ),

        hasRosters:
          Boolean(
            summary?.rosters ||
            summary?.roster ||
            summary?.lineups
          ),

        homePlayers:
          homeLineup.totalPlayers,

        awayPlayers:
          awayLineup.totalPlayers,

        homePlayerStatistics:
          homePlayerStatistics.length,

        awayPlayerStatistics:
          awayPlayerStatistics.length,

        homeTeamStatistics:
          Object.keys(
            teamStatistics.home
          ).length,

        awayTeamStatistics:
          Object.keys(
            teamStatistics.away
          ).length
      }
    });

  } catch (error) {

    console.error(
      "ESPN MATCH STATS ERROR:",
      error
    );

    return res.status(500).json({

      success: false,

      source: "ESPN",

      error:
        error?.message ||
        "Errore interno durante il recupero delle statistiche.",

      eventId:
        req.query?.id ||
        null
    });
  }
};
