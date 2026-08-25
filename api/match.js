const {
  getMatchSummary,
  getScoreboard
} = require("../lib/espn");

const {
  normalizeTeamName
} = require("../lib/teams");

function json(res, status, data) {
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=15, stale-while-revalidate=30");
  res.end(JSON.stringify(data));
}

function clean(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const text = String(value).trim();

  return text || null;
}

function number(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const match = String(value).match(/-?\d+(?:[.,]\d+)?/);

  if (!match) {
    return null;
  }

  const n = Number(match[0].replace(",", "."));

  return Number.isFinite(n) ? n : null;
}

function name(value) {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return clean(value);
  }

  return clean(
    value.displayName ||
    value.fullName ||
    value.name ||
    value.shortName ||
    null
  );
}

function getCompetitions(data) {
  if (!data) {
    return [];
  }

  if (Array.isArray(data.competitions)) {
    return data.competitions;
  }

  if (
    data.header &&
    Array.isArray(data.header.competitions)
  ) {
    return data.header.competitions;
  }

  return [];
}

function getCompetition(summary) {
  const competitions = getCompetitions(summary);

  return competitions[0] || null;
}

function normalizeTeam(competitor) {
  const team =
    competitor &&
    competitor.team
      ? competitor.team
      : {};

  const rawName =
    team.displayName ||
    team.name ||
    competitor.displayName ||
    competitor.name ||
    null;

  const normalized =
    normalizeTeamName(rawName);

  const logos =
    Array.isArray(team.logos)
      ? team.logos
      : [];

  return {
    id: clean(
      competitor.id ||
      team.id ||
      null
    ),

    name: normalized,

    abbreviation: clean(
      team.abbreviation ||
      competitor.abbreviation ||
      null
    ),

    logo: clean(
      competitor.logo ||
      team.logo ||
      (logos[0] && logos[0].href) ||
      null
    ),

    score: number(
      competitor.score
    )
  };
}

function normalizeStatus(competition) {
  const status =
    competition &&
    competition.status
      ? competition.status
      : {};

  const type =
    status.type || {};

  let state = "scheduled";

  if (
    type.completed === true ||
    status.completed === true
  ) {
    state = "terminata";
  } else if (
    type.state === "in" ||
    status.state === "in"
  ) {
    state = "live";
  }

  return {
    state,

    name: clean(
      type.name ||
      status.name ||
      null
    ),

    description: clean(
      type.description ||
      status.description ||
      null
    ),

    detail: clean(
      type.detail ||
      status.detail ||
      null
    ),

    clock: clean(
      status.displayClock ||
      status.clock ||
      null
    ),

    completed:
      type.completed === true ||
      status.completed === true
  };
}

function extractStatistics(boxscoreTeam) {
  const stats =
    boxscoreTeam &&
    Array.isArray(boxscoreTeam.statistics)
      ? boxscoreTeam.statistics
      : [];

  function find(...names) {
    const wanted = names.map(x =>
      String(x).toLowerCase()
    );

    for (const stat of stats) {
      const statName =
        String(
          stat.name ||
          stat.label ||
          stat.abbreviation ||
          ""
        ).toLowerCase();

      if (
        wanted.some(
          wantedName =>
            statName === wantedName ||
            statName.includes(wantedName)
        )
      ) {
        return (
          stat.displayValue ??
          stat.value ??
          null
        );
      }
    }

    return null;
  }

  return {
    shots: number(
      find(
        "shots",
        "total shots",
        "tiri"
      )
    ),

    shotsOnTarget: number(
      find(
        "shots on target",
        "shots on goal",
        "tiri in porta"
      )
    ),

    possession: number(
      find(
        "possession",
        "possesso"
      )
    ),

    corners: number(
      find(
        "corner kicks",
        "corners",
        "calci d'angolo"
      )
    ),

    offsides: number(
      find(
        "offsides",
        "fuorigioco"
      )
    ),

    fouls: number(
      find(
        "fouls",
        "falli"
      )
    ),

    yellowCards: number(
      find(
        "yellow cards",
        "cartellini gialli"
      )
    ),

    redCards: number(
      find(
        "red cards",
        "cartellini rossi"
      )
    ),

    saves: number(
      find(
        "saves",
        "parades",
        "parata"
      )
    )
  };
}

function getBoxscoreTeams(summary) {
  const teams =
    summary &&
    summary.boxscore &&
    Array.isArray(summary.boxscore.teams)
      ? summary.boxscore.teams
      : [];

  return teams;
}

function normalizePlayer(player) {
  if (!player) {
    return null;
  }

  const athlete =
    player.athlete ||
    player.player ||
    player;

  const playerName =
    athlete.displayName ||
    athlete.fullName ||
    athlete.name ||
    null;

  if (!playerName) {
    return null;
  }

  return {
    id: clean(
      athlete.id ||
      player.id ||
      null
    ),

    name: playerName,

    jersey: clean(
      player.jersey ||
      athlete.jersey ||
      null
    ),

    position: clean(
      player.position &&
      (
        player.position.abbreviation ||
        player.position.name
      )
    ),

    starter:
      player.starter === true,

    substitute:
      player.substitute === true
  };
}

function normalizeLineup(competitor) {
  const lineup =
    competitor &&
    competitor.lineup
      ? competitor.lineup
      : {};

  const players =
    Array.isArray(lineup.players)
      ? lineup.players
      : Array.isArray(competitor.players)
      ? competitor.players
      : [];

  const normalized = players
    .map(normalizePlayer)
    .filter(Boolean);

  return {
    formation: clean(
      lineup.formation ||
      competitor.formation ||
      null
    ),

    starters: normalized.filter(
      player => player.starter
    ),

    substitutes: normalized.filter(
      player => player.substitute
    ),

    players: normalized
  };
}

function normalizePlay(play) {
  if (!play) {
    return null;
  }

  const typeText =
    typeof play.type === "string"
      ? play.type
      : (
          play.type &&
          (
            play.type.text ||
            play.type.name
          )
        ) || "";

  const lower =
    String(typeText).toLowerCase();

  let type = "altro";

  if (
    lower.includes("goal") ||
    lower.includes("gol")
  ) {
    type = "gol";
  } else if (
    lower.includes("yellow") ||
    lower.includes("giallo")
  ) {
    type = "cartellino_giallo";
  } else if (
    lower.includes("red") ||
    lower.includes("rosso")
  ) {
    type = "cartellino_rosso";
  } else if (
    lower.includes("substitution") ||
    lower.includes("sostituzione")
  ) {
    type = "sostituzione";
  } else if (
    lower.includes("penalty") ||
    lower.includes("rigore")
  ) {
    type = "rigore";
  } else if (
    lower.includes("injury") ||
    lower.includes("interruption") ||
    lower.includes("interruzione")
  ) {
    type = "interruzione";
  } else if (
    lower.includes("half") ||
    lower.includes("tempo")
  ) {
    type = "intervallo";
  } else if (
    lower.includes("kickoff") ||
    lower.includes("inizio")
  ) {
    type = "inizio";
  } else if (
    lower.includes("end") ||
    lower.includes("fine")
  ) {
    type = "fine";
  }

  const competition =
    Array.isArray(play.competitions)
      ? play.competitions[0]
      : null;

  const competitor =
    play.competitor ||
    (competition &&
      competition.competitor) ||
    null;

  const athlete =
    play.athlete ||
    play.player ||
    null;

  let playerIn =
    play.playerIn ||
    null;

  let playerOut =
    play.playerOut ||
    null;

  if (
    typeof playerIn === "object" &&
    playerIn
  ) {
    playerIn =
      playerIn.athlete ||
      playerIn.player ||
      playerIn;
  }

  if (
    typeof playerOut === "object" &&
    playerOut
  ) {
    playerOut =
      playerOut.athlete ||
      playerOut.player ||
      playerOut;
  }

  return {
    id: clean(play.id),

    type,

    minute: clean(
      (
        play.clock &&
        (
          play.clock.displayValue ||
          play.clock.value
        )
      ) ||
      play.clock ||
      play.minute ||
      null
    ),

    team: normalizeTeamName(
      name(
        competitor &&
        (
          competitor.team ||
          competitor
        )
      )
    ),

    player: name(athlete),

    assist: name(
      play.assist &&
      (
        play.assist.athlete ||
        play.assist
      )
    ),

    playerIn: name(playerIn),

    playerOut: name(playerOut),

    text: clean(
      play.text ||
      play.description ||
      null
    )
  };
}

function extractEvents(summary) {
  const plays =
    summary &&
    Array.isArray(summary.plays)
      ? summary.plays
      : [];

  return plays
    .map(normalizePlay)
    .filter(Boolean);
}

function extractPenalties(events) {
  return events
    .filter(event =>
      event.type === "rigore"
    )
    .map(event => ({
      minute: event.minute,
      team: event.team,
      player: event.player,
      result: event.text,
      scored:
        event.text &&
        (
          event.text.toLowerCase().includes("scored") ||
          event.text.toLowerCase().includes("goal") ||
          event.text.toLowerCase().includes("segnato")
        )
          ? true
          : null
    }));
}

function extractTV(summary) {
  const result = [];

  const broadcasts =
    summary &&
    Array.isArray(summary.broadcasts)
      ? summary.broadcasts
      : [];

  for (const broadcast of broadcasts) {
    const values = [
      broadcast.name,
      broadcast.shortName,
      broadcast.market,
      broadcast.media &&
        broadcast.media.name,
      broadcast.media &&
        broadcast.media.shortName
    ];

    for (const value of values) {
      const text = clean(value);

      if (text && !result.includes(text)) {
        result.push(text);
      }
    }
  }

  return result;
}

function extractVenue(competition) {
  const venue =
    competition &&
    competition.venue
      ? competition.venue
      : null;

  if (!venue) {
    return null;
  }

  const address =
    venue.address || {};

  return {
    id: clean(venue.id),

    name: clean(
      venue.fullName ||
      venue.name
    ),

    city: clean(
      address.city
    ),

    country: clean(
      address.country ||
      address.countryName
    ),

    capacity: number(
      venue.capacity
    ),

    address: clean(
      address.fullAddress ||
      address.street
    )
  };
}

function extractMVP(summary) {
  const candidates = [
    summary.mvp,
    summary.playerOfTheMatch,
    summary.gameInfo &&
      summary.gameInfo.mvp
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const athlete =
      candidate.athlete ||
      candidate.player ||
      candidate;

    const playerName =
      name(athlete);

    if (!playerName) {
      continue;
    }

    return {
      name: playerName,

      team: normalizeTeamName(
        name(
          candidate.team ||
          athlete.team
        )
      ),

      reason: clean(
        candidate.reason ||
        candidate.description
      )
    };
  }

  return null;
}

function formatDateTime(value) {
  if (!value) {
    return {
      date: null,
      time: null
    };
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return {
      date: null,
      time: null
    };
  }

  return {
    date: date.toLocaleDateString(
      "it-IT",
      {
        timeZone: "Europe/Rome",
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      }
    ),

    time: date.toLocaleTimeString(
      "it-IT",
      {
        timeZone: "Europe/Rome",
        hour: "2-digit",
        minute: "2-digit"
      }
    )
  };
}

async function findEventById(
  league,
  eventId,
  date
) {
  /*
   * First try the scoreboard for the requested date.
   */

  if (date) {
    try {
      const scoreboard =
        await getScoreboard(
          league,
          date.replaceAll("-", "")
        );

      const events =
        Array.isArray(scoreboard.events)
          ? scoreboard.events
          : [];

      const found =
        events.find(
          event =>
            String(event.id) ===
            String(eventId)
        );

      if (found) {
        return found;
      }
    } catch {
      // Continue to direct summary.
    }
  }

  /*
   * The summary endpoint itself is enough
   * to retrieve the match by ESPN event ID.
   */

  try {
    const summary =
      await getMatchSummary(
        league,
        eventId
      );

    if (
      summary &&
      (
        summary.header ||
        summary.competitions ||
        summary.boxscore
      )
    ) {
      return summary;
    }
  } catch {
    return null;
  }

  return null;
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return json(
        res,
        405,
        {
          success: false,
          error: "Metodo non consentito"
        }
      );
    }

    const query =
      req.query || {};

    const league =
      query.league ||
      query.competition ||
      "ita.1";

    const eventId =
      query.id ||
      query.event ||
      query.matchId ||
      null;

    const search =
      query.q ||
      query.search ||
      null;

    const date =
      query.date ||
      null;

    /*
     * =====================================================
     * 1. SEARCH BY EVENT ID
     * =====================================================
     */

    let summary = null;

    if (eventId) {
      const result =
        await findEventById(
          league,
          eventId,
          date
        );

      /*
       * If result is already a summary,
       * use it directly.
       */

      if (
        result &&
        (
          result.header ||
          result.boxscore ||
          result.plays
        )
      ) {
        summary = result;
      }

      /*
       * Otherwise retrieve the official summary.
       */

      if (!summary) {
        summary =
          await getMatchSummary(
            league,
            eventId
          );
      }
    }

    /*
     * =====================================================
     * 2. SEARCH BY TEAM NAME
     * =====================================================
     */

    if (!summary && search) {
      const scoreboard =
        await getScoreboard(
          league,
          date
            ? date.replaceAll("-", "")
            : null
        );

      const events =
        Array.isArray(scoreboard.events)
          ? scoreboard.events
          : [];

      const searchText =
        String(search)
          .toLowerCase()
          .trim();

      const event =
        events.find(item => {
          const competition =
            item.competitions &&
            item.competitions[0];

          const competitors =
            competition &&
            Array.isArray(
              competition.competitors
            )
              ? competition.competitors
              : [];

          return competitors.some(
            competitor => {
              const team =
                competitor.team ||
                {};

              const teamName =
                String(
                  team.displayName ||
                  team.name ||
                  ""
                ).toLowerCase();

              return (
                teamName.includes(
                  searchText
                )
              );
            }
          );
        });

      if (event) {
        summary =
          await getMatchSummary(
            league,
            event.id
          );
      }
    }

    /*
     * =====================================================
     * 3. NOT FOUND
     * =====================================================
     */

    if (!summary) {
      return json(
        res,
        404,
        {
          success: false,
          source: "ESPN",
          error: "Partita non trovata",
          query: search,
          eventId
        }
      );
    }

    /*
     * =====================================================
     * 4. COMPETITION
     * =====================================================
     */

    const competition =
      getCompetition(summary);

    if (!competition) {
      return json(
        res,
        502,
        {
          success: false,
          source: "ESPN",
          error:
            "ESPN ha restituito una risposta senza competizione.",
          eventId
        }
      );
    }

    /*
     * =====================================================
     * 5. TEAMS
     * =====================================================
     */

    const competitors =
      Array.isArray(
        competition.competitors
      )
        ? competition.competitors
        : [];

    const homeRaw =
      competitors.find(
        c => c.homeAway === "home"
      ) ||
      competitors[0] ||
      null;

    const awayRaw =
      competitors.find(
        c => c.homeAway === "away"
      ) ||
      competitors[1] ||
      null;

    const home =
      normalizeTeam(homeRaw);

    const away =
      normalizeTeam(awayRaw);

    /*
     * =====================================================
     * 6. DATE
     * =====================================================
     */

    const dateTime =
      formatDateTime(
        competition.date ||
        summary.header &&
        summary.header.competitions &&
        summary.header.competitions[0] &&
        summary.header.competitions[0].date
      );

    /*
     * =====================================================
     * 7. LINEUPS
     * =====================================================
     */

    const homeLineup =
      normalizeLineup(homeRaw);

    const awayLineup =
      normalizeLineup(awayRaw);

    /*
     * =====================================================
     * 8. STATISTICS
     * =====================================================
     */

    const boxscoreTeams =
      getBoxscoreTeams(summary);

    const homeBox =
      boxscoreTeams.find(
        team =>
          team.homeAway === "home"
      );

    const awayBox =
      boxscoreTeams.find(
        team =>
          team.homeAway === "away"
      );

    const homeStats =
      extractStatistics(homeBox);

    const awayStats =
      extractStatistics(awayBox);

    /*
     * =====================================================
     * 9. EVENTS
     * =====================================================
     */

    const events =
      extractEvents(summary);

    /*
     * =====================================================
     * 10. RESPONSE
     * =====================================================
     */

    const response = {
      success: true,

      source: "ESPN",

      timezone: "Europe/Rome",

      competition: {
        id: clean(
          competition.id
        ),

        name: clean(
          competition.league &&
          (
            competition.league.name ||
            competition.league.displayName
          )
        ) || "Serie A",

        espnLeague: league,

        season:
          competition.season &&
          (
            competition.season.year ||
            competition.season.displayName
          )
      },

      match: {
        id: String(
          eventId ||
          (
            summary.header &&
            summary.header.id
          ) ||
          competition.id
        ),

        date: dateTime.date,

        time: dateTime.time,

        home,

        away,

        status:
          normalizeStatus(
            competition
          )
      },

      lineups: {
        home: homeLineup,
        away: awayLineup
      },

      statistics: {
        home: {
          team: home.name,
          ...homeStats
        },

        away: {
          team: away.name,
          ...awayStats
        }
      },

      penalties:
        extractPenalties(events),

      venue:
        extractVenue(
          competition
        ),

      referee: null,

      officials: {
        referee: null,
        assistantReferee1: null,
        assistantReferee2: null,
        fourthOfficial: null,
        var: null,
        avar: null
      },

      tv:
        extractTV(summary),

      mvp:
        extractMVP(summary),

      events
    };

    return json(
      res,
      200,
      response
    );

  } catch (error) {
    console.error(
      "MATCH API ERROR:",
      error
    );

    return json(
      res,
      500,
      {
        success: false,
        source: "ESPN",
        error:
          "Errore interno durante il recupero della partita.",
        message:
          error &&
          error.message
            ? error.message
            : String(error)
      }
    );
  }
};
