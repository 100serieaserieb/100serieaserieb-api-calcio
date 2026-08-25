const {
  getScoreboard,
  getMatchSummary,
} = require("../lib/espn");

const {
  normalizeTeamName,
} = require("../lib/teams");

/* =========================================================
   HELPERS
========================================================= */

function clean(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const str = String(value).trim();

  return str || null;
}

function number(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const n = Number(value);

  if (Number.isFinite(n)) {
    return n;
  }

  const match = String(value).match(/-?\d+(?:[.,]\d+)?/);

  if (!match) {
    return null;
  }

  const parsed = Number(match[0].replace(",", "."));

  return Number.isFinite(parsed) ? parsed : null;
}

function array(value) {
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

function name(value) {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return clean(value);
  }

  return clean(
    first(
      value.displayName,
      value.fullName,
      value.name,
      value.shortName
    )
  );
}

/* =========================================================
   TEAM
========================================================= */

function normalizeTeam(team) {
  if (!team) {
    return {
      id: null,
      name: null,
      abbreviation: null,
      logo: null,
      score: null,
    };
  }

  const rawName = first(
    team.team?.displayName,
    team.team?.name,
    team.displayName,
    team.name,
    team.team?.shortDisplayName,
    team.shortDisplayName
  );

  const normalizedName =
    normalizeTeamName(
      clean(rawName)
    );

  const logo = first(
    team.team?.logos?.[0]?.href,
    team.logos?.[0]?.href,
    team.logo,
    team.team?.logo
  );

  return {
    id: clean(
      first(
        team.team?.id,
        team.id
      )
    ),

    name: normalizedName,

    abbreviation: clean(
      first(
        team.team?.abbreviation,
        team.abbreviation
      )
    ),

    logo: clean(logo),

    score: number(
      first(
        team.score,
        team.score?.value
      )
    ),
  };
}

/* =========================================================
   STATUS
========================================================= */

function normalizeStatus(competition, header) {
  const status =
    competition?.status ||
    header?.competitions?.[0]?.status ||
    header?.status ||
    {};

  const type = status.type || {};

  let state = "scheduled";

  const completed =
    Boolean(
      first(
        type.completed,
        status.completed,
        false
      )
    );

  if (completed) {
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
      first(
        type.name,
        status.name,
        "STATUS_SCHEDULED"
      )
    ),

    description: clean(
      first(
        type.description,
        status.description
      )
    ),

    detail: clean(
      first(
        type.detail,
        status.detail
      )
    ),

    clock: clean(
      first(
        status.displayClock,
        status.clock
      )
    ),

    completed,
  };
}

/* =========================================================
   LINEUPS
========================================================= */

function getPlayerName(player) {
  if (!player) {
    return null;
  }

  return name(
    first(
      player.athlete,
      player.player,
      player.displayName,
      player.fullName,
      player.name
    )
  );
}

function normalizeLineup(competitor) {
  if (!competitor) {
    return {
      formation: null,
      players: [],
      starters: [],
      substitutes: [],
    };
  }

  /*
   * ESPN può restituire le formazioni in modi diversi.
   */

  const lineup =
    competitor.lineup ||
    competitor.roster ||
    null;

  const rawPlayers = array(
    lineup?.players ||
    competitor.players ||
    competitor.roster?.athletes
  );

  const players = [];

  for (const player of rawPlayers) {
    const playerName =
      getPlayerName(player);

    if (!playerName) {
      continue;
    }

    const starter =
      player.starter === true ||
      player.status === "starter" ||
      player.status?.type === "starter";

    const substitute =
      player.substitute === true ||
      player.status === "substitute" ||
      player.status?.type === "substitute";

    players.push({
      id: clean(
        first(
          player.athlete?.id,
          player.player?.id,
          player.id
        )
      ),

      name: playerName,

      jersey: clean(
        first(
          player.jersey,
          player.athlete?.jersey
        )
      ),

      position: clean(
        first(
          player.position?.abbreviation,
          player.position?.name,
          player.athlete?.position?.abbreviation,
          player.athlete?.position?.name
        )
      ),

      starter,

      substitute,
    });
  }

  /*
   * Evita duplicati.
   */

  const uniquePlayers = [];

  const seen = new Set();

  for (const player of players) {
    const key =
      player.id ||
      player.name;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniquePlayers.push(player);
  }

  return {
    formation: clean(
      first(
        lineup?.formation,
        competitor.formation
      )
    ),

    players: uniquePlayers,

    starters:
      uniquePlayers.filter(
        (player) => player.starter
      ),

    substitutes:
      uniquePlayers.filter(
        (player) => player.substitute
      ),
  };
}

/* =========================================================
   STATISTICS
========================================================= */

function findStatistic(stats, names) {
  const wanted =
    names.map(
      (item) =>
        String(item).toLowerCase()
    );

  for (const stat of array(stats)) {
    const statName =
      String(
        first(
          stat.name,
          stat.label,
          stat.abbreviation,
          stat.displayName
        ) || ""
      ).toLowerCase();

    if (
      wanted.some(
        (wantedName) =>
          statName === wantedName ||
          statName.includes(wantedName)
      )
    ) {
      return first(
        stat.displayValue,
        stat.value
      );
    }
  }

  return null;
}

function normalizeStatistics(teamBox, teamName) {
  const stats =
    array(
      teamBox?.statistics
    );

  return {
    team: teamName || null,

    shots: number(
      findStatistic(
        stats,
        [
          "shots",
          "total shots",
          "tiri",
        ]
      )
    ),

    shotsOnTarget: number(
      findStatistic(
        stats,
        [
          "shots on target",
          "shots on goal",
          "tiri in porta",
        ]
      )
    ),

    possession: number(
      findStatistic(
        stats,
        [
          "possession",
          "possesso",
        ]
      )
    ),

    corners: number(
      findStatistic(
        stats,
        [
          "corner kicks",
          "corners",
          "calci d'angolo",
        ]
      )
    ),

    offsides: number(
      findStatistic(
        stats,
        [
          "offsides",
          "fuorigioco",
        ]
      )
    ),

    fouls: number(
      findStatistic(
        stats,
        [
          "fouls",
          "falli",
        ]
      )
    ),

    yellowCards: number(
      findStatistic(
        stats,
        [
          "yellow cards",
          "cartellini gialli",
        ]
      )
    ),

    redCards: number(
      findStatistic(
        stats,
        [
          "red cards",
          "cartellini rossi",
        ]
      )
    ),

    saves: number(
      findStatistic(
        stats,
        [
          "saves",
          "parades",
          "parata",
        ]
      )
    ),
  };
}

/* =========================================================
   EVENTS
========================================================= */

function normalizeEvent(play) {
  if (!play) {
    return null;
  }

  const typeText =
    String(
      first(
        play.type?.text,
        play.type?.name,
        play.type,
        ""
      )
    ).toLowerCase();

  let type = "altro";

  if (
    typeText.includes("goal") ||
    typeText.includes("gol")
  ) {
    type = "gol";
  } else if (
    typeText.includes("yellow") ||
    typeText.includes("giallo")
  ) {
    type = "cartellino_giallo";
  } else if (
    typeText.includes("red") ||
    typeText.includes("rosso")
  ) {
    type = "cartellino_rosso";
  } else if (
    typeText.includes("substitution") ||
    typeText.includes("sostituzione")
  ) {
    type = "sostituzione";
  } else if (
    typeText.includes("kickoff") ||
    typeText.includes("inizio")
  ) {
    type = "inizio";
  } else if (
    typeText.includes("half") ||
    typeText.includes("intervallo") ||
    typeText.includes("halftime")
  ) {
    type = "intervallo";
  } else if (
    typeText.includes("end") ||
    typeText.includes("fine")
  ) {
    type = "fine";
  } else if (
    typeText.includes("penalty") ||
    typeText.includes("rigore")
  ) {
    type = "rigore";
  } else if (
    typeText.includes("injury") ||
    typeText.includes("interruption") ||
    typeText.includes("interruzione")
  ) {
    type = "interruzione";
  }

  const competition =
    array(play.competitions)[0];

  const competitor =
    play.competitor ||
    competition?.competitor ||
    competition ||
    null;

  const athlete =
    play.athlete ||
    play.player ||
    null;

  let playerIn =
    play.playerIn ||
    play.substitution?.playerIn ||
    null;

  let playerOut =
    play.playerOut ||
    play.substitution?.playerOut ||
    null;

  /*
   * Alcune versioni di ESPN mettono i cambi
   * direttamente dentro il testo.
   */

  if (
    type === "sostituzione" &&
    (!playerIn || !playerOut) &&
    play.text
  ) {
    const text = String(play.text);

    const match =
      text.match(
        /(?:Substitution,?\s*)?([^()]+?)\s+(?:entra al posto di|replaces|for)\s+([^.(]+)/i
      );

    if (match) {
      if (!playerIn) {
        playerIn = clean(
          match[1]
        );
      }

      if (!playerOut) {
        playerOut = clean(
          match[2]
        );
      }
    }
  }

  return {
    id: clean(play.id),

    type,

    minute: clean(
      first(
        play.clock?.displayValue,
        play.clock,
        play.minute
      )
    ),

    team: normalizeTeamName(
      name(
        first(
          competitor?.team,
          play.team
        )
      )
    ),

    player: name(athlete),

    assist: name(
      first(
        play.assist,
        play.assist?.athlete
      )
    ),

    playerIn: name(playerIn),

    playerOut: name(playerOut),

    text: clean(
      first(
        play.text,
        play.description
      )
    ),
  };
}

/* =========================================================
   PENALTIES
========================================================= */

function normalizePenalties(summary, plays) {
  const result = [];

  for (
    const penalty of array(
      summary?.penalties
    )
  ) {
    result.push({
      minute: clean(
        first(
          penalty.clock?.displayValue,
          penalty.clock,
          penalty.minute
        )
      ),

      team: normalizeTeamName(
        name(
          first(
            penalty.team,
            penalty.competitor
          )
        )
      ),

      player: name(
        first(
          penalty.athlete,
          penalty.player
        )
      ),

      result: clean(
        first(
          penalty.result,
          penalty.outcome,
          penalty.displayValue
        )
      ),

      scored:
        typeof penalty.scored === "boolean"
          ? penalty.scored
          : null,
    });
  }

  /*
   * Cerca anche i rigori negli eventi.
   */

  for (const play of plays) {
    const text =
      String(
        play?.text || ""
      ).toLowerCase();

    if (
      text.includes("penalty") ||
      text.includes("rigore")
    ) {
      result.push({
        minute: clean(
          first(
            play.clock?.displayValue,
            play.clock,
            play.minute
          )
        ),

        team: normalizeTeamName(
          name(
            first(
              play.competitor?.team,
              play.team
            )
          )
        ),

        player: name(
          first(
            play.athlete,
            play.player
          )
        ),

        result: clean(
          play.text
        ),

        scored:
          text.includes("scored") ||
          text.includes("goal") ||
          text.includes("segnato")
            ? true
            : text.includes("missed") ||
              text.includes("saved") ||
              text.includes("sbagliato")
            ? false
            : null,
      });
    }
  }

  return result;
}

/* =========================================================
   VENUE
========================================================= */

function normalizeVenue(competition) {
  const venue =
    competition?.venue ||
    null;

  if (!venue) {
    return null;
  }

  const address =
    venue.address || {};

  return {
    id: clean(venue.id),

    name: clean(
      first(
        venue.fullName,
        venue.name
      )
    ),

    city: clean(
      address.city
    ),

    country: clean(
      first(
        address.country,
        address.countryName
      )
    ),

    capacity: number(
      venue.capacity
    ),

    indoor:
      typeof venue.indoor === "boolean"
        ? venue.indoor
        : null,

    address: clean(
      first(
        address.fullAddress,
        address.street
      )
    ),
  };
}

/* =========================================================
   TV
========================================================= */

function normalizeTV(summary, competition) {
  const result = [];

  const broadcasts = [
    ...array(
      summary?.broadcasts
    ),
    ...array(
      competition?.broadcasts
    ),
  ];

  for (const broadcast of broadcasts) {
    const values = [
      broadcast?.name,
      broadcast?.shortName,
      broadcast?.market,
      broadcast?.media?.name,
      broadcast?.media?.shortName,
    ];

    for (const value of values) {
      const item = clean(value);

      if (item && !result.includes(item)) {
        result.push(item);
      }
    }
  }

  return result;
}

/* =========================================================
   MVP
========================================================= */

function normalizeMVP(summary) {
  const candidates = [
    summary?.playerOfTheMatch,
    summary?.mvp,
    summary?.gameInfo?.mvp,
    summary?.leaders?.[0],
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
          first(
            candidate.team,
            athlete.team
          )
        )
      ),

      reason: clean(
        first(
          candidate.reason,
          candidate.description
        )
      ),
    };
  }

  return null;
}

/* =========================================================
   FIND EVENT FROM SCOREBOARD
========================================================= */

async function findEvent(
  league,
  query,
  date
) {
  const scoreboard =
    await getScoreboard(
      league,
      date || null
    );

  const events =
    array(
      scoreboard?.events
    );

  if (!query) {
    return events[0] || null;
  }

  const search =
    String(query)
      .toLowerCase()
      .trim();

  /*
   * Supporta:
   * Udinese
   * Como
   * Udinese Como
   * Udinese-Como
   * Udinese vs Como
   */

  const parts =
    search
      .replace(/\s+vs\.?\s+/gi, " ")
      .replace(/\s+-\s+/g, " ")
      .split(/\s+/)
      .filter(Boolean);

  for (const event of events) {
    const competition =
      event?.competitions?.[0];

    const competitors =
      array(
        competition?.competitors
      );

    const names =
      competitors.map(
        (item) =>
          String(
            first(
              item.team?.displayName,
              item.team?.name,
              item.displayName,
              item.name
            ) || ""
          ).toLowerCase()
      );

    if (
      parts.length >= 2 &&
      parts.every(
        (part) =>
          names.some(
            (teamName) =>
              teamName.includes(part)
          )
      )
    ) {
      return event;
    }

    if (
      names.some(
        (teamName) =>
          teamName.includes(search)
      )
    ) {
      return event;
    }
  }

  return null;
}

/* =========================================================
   GET /api/match
========================================================= */

module.exports = async function handler(req, res) {
  /*
   * SOLO GET
   */

  if (req.method !== "GET") {
    res.setHeader(
      "Allow",
      "GET"
    );

    return res.status(405).json({
      success: false,
      error: "Metodo non consentito",
    });
  }

  try {
    const query =
      req.query?.q ||
      req.query?.search ||
      null;

    const eventId =
      req.query?.id ||
      req.query?.event ||
      req.query?.matchId ||
      null;

    const league =
      req.query?.league ||
      req.query?.competition ||
      "ita.1";

    const date =
      req.query?.date ||
      null;

    let actualEventId =
      eventId
        ? String(eventId)
        : null;

    let scoreboardEvent =
      null;

    /*
     * =====================================================
     * CASO 1
     * ID PRESENTE
     *
     * NON usare lo scoreboard.
     * Andiamo direttamente al summary ESPN.
     *
     * Questo risolve il problema di:
     *
     * dates=
     *
     * e soprattutto evita la ricerca inutile
     * dell'evento.
     * =====================================================
     */

    if (!actualEventId && query) {
      scoreboardEvent =
        await findEvent(
          league,
          query,
          date
        );

      if (scoreboardEvent?.id) {
        actualEventId =
          String(
            scoreboardEvent.id
          );
      }
    }

    if (!actualEventId) {
      return res.status(404).json({
        success: false,
        source: "ESPN",
        error: "Partita non trovata",
        query: query || null,
        eventId: null,
      });
    }

    /*
     * =====================================================
     * SUMMARY
     * =====================================================
     */

    let summary;

    try {
      summary =
        await getMatchSummary(
          league,
          actualEventId
        );
    } catch (error) {
      /*
       * Se abbiamo trovato l'evento dallo scoreboard,
       * proviamo a usare i dati dello scoreboard.
       *
       * Se invece abbiamo ricevuto direttamente l'id,
       * restituiamo l'errore ESPN reale.
       */

      if (!scoreboardEvent) {
        return res.status(502).json({
          success: false,
          source: "ESPN",
          error:
            "Impossibile recuperare i dati della partita da ESPN.",
          message: error.message,
          eventId: actualEventId,
        });
      }
    }

    /*
     * =====================================================
     * COMPETITION
     * =====================================================
     */

    const competition =
      summary?.header?.competitions?.[0] ||
      summary?.competitions?.[0] ||
      scoreboardEvent?.competitions?.[0] ||
      null;

    if (!competition) {
      return res.status(404).json({
        success: false,
        source: "ESPN",
        error:
          "ESPN non ha restituito i dati della competizione.",
        eventId: actualEventId,
      });
    }

    /*
     * =====================================================
     * TEAMS
     * =====================================================
     */

    const competitors =
      array(
        competition.competitors
      );

    const homeRaw =
      competitors.find(
        (team) =>
          team.homeAway === "home"
      ) ||
      competitors[0] ||
      null;

    const awayRaw =
      competitors.find(
        (team) =>
          team.homeAway === "away"
      ) ||
      competitors[1] ||
      null;

    const home =
      normalizeTeam(homeRaw);

    const away =
      normalizeTeam(awayRaw);

    /*
     * =====================================================
     * LINEUPS
     * =====================================================
     */

    const homeLineup =
      normalizeLineup(
        homeRaw
      );

    const awayLineup =
      normalizeLineup(
        awayRaw
      );

    /*
     * =====================================================
     * STATISTICS
     * =====================================================
     */

    const boxscore =
      summary?.boxscore;

    const boxscoreTeams =
      array(
        boxscore?.teams
      );

    const homeBox =
      boxscoreTeams.find(
        (team) =>
          team.homeAway === "home"
      );

    const awayBox =
      boxscoreTeams.find(
        (team) =>
          team.homeAway === "away"
      );

    const homeStats =
      normalizeStatistics(
        homeBox,
        home.name
      );

    const awayStats =
      normalizeStatistics(
        awayBox,
        away.name
      );

    /*
     * =====================================================
     * EVENTI
     * =====================================================
     */

    const rawPlays =
      array(
        summary?.plays
      );

    const events =
      rawPlays
        .map(normalizeEvent)
        .filter(Boolean);

    /*
     * =====================================================
     * DATA / ORA
     * =====================================================
     */

    const rawDate =
      first(
        competition.date,
        summary?.header?.competitions?.[0]?.date,
        scoreboardEvent?.date
      );

    let formattedDate =
      clean(rawDate);

    let formattedTime =
      null;

    if (rawDate) {
      const d =
        new Date(rawDate);

      if (!Number.isNaN(d.getTime())) {
        formattedDate =
          d.toLocaleDateString(
            "it-IT",
            {
              timeZone:
                "Europe/Rome",
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            }
          );

        formattedTime =
          d.toLocaleTimeString(
            "it-IT",
            {
              timeZone:
                "Europe/Rome",
              hour: "2-digit",
              minute: "2-digit",
            }
          );
      }
    }

    /*
     * =====================================================
     * PENALTIES
     * =====================================================
     */

    const penalties =
      normalizePenalties(
        summary,
        rawPlays
      );

    /*
     * =====================================================
     * FINAL RESPONSE
     * =====================================================
     */

    const response = {
      success: true,

      source: "ESPN",

      timezone: "Europe/Rome",

      competition: {
        id: clean(
          first(
            summary?.header?.league?.id,
            competition?.league?.id,
            competition?.id
          )
        ),

        name: clean(
          first(
            summary?.header?.league?.name,
            competition?.league?.name,
            "Serie A"
          )
        ),

        espnLeague: league,

        season: clean(
          first(
            summary?.header?.season?.year,
            competition?.season?.year,
            scoreboardEvent?.season?.year
          )
        ),
      },

      match: {
        id: actualEventId,

        date: formattedDate,

        time: formattedTime,

        home,

        away,

        status:
          normalizeStatus(
            competition,
            summary?.header
          ),
      },

      lineups: {
        home: homeLineup,
        away: awayLineup,
      },

      statistics: {
        home: homeStats,
        away: awayStats,
      },

      penalties,

      venue:
        normalizeVenue(
          competition
        ),

      referee:
        clean(
          first(
            competition?.officials?.[0]?.athlete?.displayName,
            competition?.officials?.[0]?.displayName
          )
        ),

      officials: {
        referee: null,
        assistantReferee1: null,
        assistantReferee2: null,
        fourthOfficial: null,
        var: null,
        avar: null,
      },

      tv:
        normalizeTV(
          summary,
          competition
        ),

      mvp:
        normalizeMVP(
          summary
        ),

      events,
    };

    /*
     * =====================================================
     * CACHE
     * =====================================================
     */

    res.setHeader(
      "Cache-Control",
      "s-maxage=15, stale-while-revalidate=30"
    );

    res.setHeader(
      "Content-Type",
      "application/json; charset=utf-8"
    );

    return res.status(200).json(
      response
    );

  } catch (error) {
    console.error(
      "MATCH API ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      source: "ESPN",
      error:
        "Errore interno durante il recupero della partita.",
      message:
        error?.message ||
        "Errore sconosciuto",
    });
  }
};
