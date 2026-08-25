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
  if (value === undefined || value === null) {
    return null;
  }

  const result = String(value).trim();

  return result || null;
}

function number(value) {
  if (value === undefined || value === null) {
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

function getCompetitor(competitors, side) {
  return arr(competitors).find(
    item => item.homeAway === side
  ) || null;
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

  if (
    event.clock &&
    typeof event.clock === "object"
  ) {
    return event.clock.displayValue || null;
  }

  if (typeof event.clock === "string") {
    return event.clock;
  }

  return event.minute || null;
}

function getEventText(event) {
  if (!event) return "";

  return typeof event.text === "string"
    ? event.text
    : typeof event.description === "string"
      ? event.description
      : "";
}

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

  return match[1]
    .trim()
    .replace(
      /^Delay in match because of an injury\s+/i,
      ""
    )
    .trim() || null;
}

function getAssistFromText(text) {
  if (!text) return null;

  const match = text.match(
    /Assisted by ([^.]+?)(?:\s+with|\s+following|\.|$)/i
  );

  return match
    ? match[1].trim()
    : null;
}

function translateEventType(type) {
  const value =
    String(type || "").toLowerCase();

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

  if (value.includes("kickoff")) {
    return "Inizio primo tempo";
  }

  if (
    value.includes("halftime") ||
    value.includes("end 1st half")
  ) {
    return "Fine primo tempo";
  }

  if (
    value.includes("start 2nd half") ||
    value.includes("second half")
  ) {
    return "Inizio secondo tempo";
  }

  if (
    value.includes("end regular") ||
    value.includes("end game")
  ) {
    return "Fine partita";
  }

  if (value.includes("start delay")) {
    return "Interruzione";
  }

  if (value.includes("end delay")) {
    return "Ripresa del gioco";
  }

  if (
    value.includes("injury") ||
    value.includes("interruption")
  ) {
    return "Interruzione";
  }

  return type || null;
}

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

  if (type === "Sostituzione") {
    const original =
      getEventText(event);

    const match =
      original.match(
        /Substitution,\s*([^.]*)\.\s*(.*?)\s+replaces\s+(.*?)(?:\s+because of an injury)?\./i
      );

    if (match) {
      const teamName =
        normalizeTeamName(
          match[1]
        );

      return `${prefix}${match[2].trim()} entra al posto di ${match[3].trim()} per ${teamName}.`;
    }

    return `${prefix}sostituzione${
      team ? ` per ${team}` : ""
    }.`;
  }

  return getEventText(event) || null;
}

function parseEvent(event) {
  if (!event) return null;

  const rawType =
    getEventType(event);

  const type =
    translateEventType(rawType);

  const rawText =
    getEventText(event);

  const competitor =
    event.competitor ||
    event.competitors?.[0] ||
    null;

  const team =
    teamName(
      event.team ||
      competitor
    );

  let player = null;
  let assist = null;

  if (
    type === "Gol" ||
    type === "Cartellino giallo" ||
    type === "Cartellino rosso"
  ) {
    player =
      event.athlete?.displayName ||
      event.athlete?.fullName ||
      event.player?.displayName ||
      event.player?.fullName ||
      getPlayerFromText(rawText);

    assist =
      event.assist?.displayName ||
      event.assist?.fullName ||
      getAssistFromText(rawText);
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

    player:
      clean(player),

    assist:
      clean(assist),

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

/* =========================================================
   LINEUPS
========================================================= */

function getPlayersFromSource(source) {
  const result = [];

  for (const item of arr(source)) {
    const athlete =
      item?.athlete ||
      item?.player ||
      item;

    const name =
      athlete?.displayName ||
      athlete?.fullName ||
      athlete?.shortName ||
      item?.displayName ||
      item?.fullName;

    if (!name) continue;

    result.push({
      id:
        clean(
          athlete?.id ||
          item?.id
        ),

      name,

      jersey:
        clean(
          item?.jersey ||
          athlete?.jersey
        ),

      position:
        clean(
          item?.position?.abbreviation ||
          item?.position?.name ||
          athlete?.position?.abbreviation ||
          athlete?.position?.name
        ),

      starter:
        item?.starter === true ||
        item?.starter === "true",

      substitute:
        item?.substitute === true ||
        item?.substitute === "true"
    });
  }

  return result;
}

function findRosterForTeam(
  summary,
  teamIdValue,
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
      const id =
        teamId(item);

      const homeAway =
        item?.homeAway;

      if (
        teamIdValue &&
        id &&
        String(id) ===
          String(teamIdValue)
      ) {
        return item;
      }

      if (
        !teamIdValue &&
        homeAway === side
      ) {
        return item;
      }
    }
  }

  return null;
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

    if (extracted.length) {
      players = extracted;
      break;
    }
  }

  /*
   * ESPN può mettere la formazione
   * direttamente nella lineup.
   */
  const formation =
    clean(
      first(
        roster?.formation,
        roster?.formation?.text,
        roster?.lineup?.formation,
        roster?.lineup?.formation?.text,
        competitor?.formation,
        competitor?.formation?.text
      )
    );

  const starters =
    players.filter(
      player =>
        player.starter
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

  return null;
}

function getStatisticValue(stat) {
  return first(
    stat?.displayValue,
    stat?.value,
    stat?.displayValueText
  );
}

function extractStatisticsFromTeam(
  team
) {
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

  /*
   * Fallback: header competitors
   */
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
   RIGORI
========================================================= */

function getPenalties(summary) {
  const result = {
    home: [],
    away: []
  };

  const plays =
    arr(summary?.plays);

  for (const play of plays) {
    const text =
      getEventText(play);

    if (
      !/penalty|rigore/i.test(text)
    ) {
      continue;
    }

    const side =
      play.team?.homeAway ||
      play.competitor?.homeAway ||
      null;

    const item = {
      minute:
        getEventMinute(play),

      player:
        play.athlete?.displayName ||
        play.player?.displayName ||
        getPlayerFromText(text),

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

  if (!venue) {
    return null;
  }

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
        address.city ||
        venue.city
      ),

    country:
      clean(
        address.country ||
        address.countryName ||
        venue.country
      ),

    capacity:
      number(
        venue.capacity
      ),

    address:
      clean(
        address.fullAddress ||
        address.street
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
    if (arr(source).length) {
      officials = source;
      break;
    }
  }

  return officials.map(
    official => ({
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
  );
}

/* =========================================================
   TV
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
    if (arr(source).length) {
      broadcasts = source;
      break;
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

        if (athlete) {
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
  }

  return null;
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
       LOGHI
    ----------------------------------------------------- */

    const homeLogo =
      first(
        home?.team?.logos?.[0]?.href,
        home?.team?.logo,
        home?.logos?.[0]?.href,
        home?.logo
      );

    const awayLogo =
      first(
        away?.team?.logos?.[0]?.href,
        away?.team?.logo,
        away?.logos?.[0]?.href,
        away?.logo
      );

    /* -----------------------------------------------------
       EVENTI
    ----------------------------------------------------- */

    const rawEvents = [
      ...arr(summary.keyEvents),
      ...arr(summary.plays)
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

          if (seenEvents.has(key)) {
            return false;
          }

          seenEvents.add(key);

          return true;
        });

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

    const statistics =
      getStatistics(
        summary,
        home,
        away
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
       TV
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
            home?.score ??
            "-",

          logo:
            homeLogo || null
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
            away?.score ??
            "-",

          logo:
            awayLogo || null
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

      statistics,

      penalties,

      venue,

      officials,

      broadcasts,

      mvp,

      events
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
