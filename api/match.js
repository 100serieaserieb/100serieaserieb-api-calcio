const ESPN_BASE_URL =
  "https://site.api.espn.com/apis/site/v2/sports/soccer";

/* =========================================================
   CONFIG
========================================================= */

const DEFAULT_LEAGUE = "ita.1";

/* =========================================================
   RESPONSE
========================================================= */

function sendJSON(res, status, data) {
  res.status(status);

  res.setHeader(
    "Content-Type",
    "application/json; charset=utf-8"
  );

  res.setHeader(
    "Cache-Control",
    "s-maxage=15, stale-while-revalidate=30"
  );

  return res.end(JSON.stringify(data));
}

/* =========================================================
   GENERIC HELPERS
========================================================= */

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
    value === null
  ) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value)
      ? value
      : null;
  }

  const match = String(value).match(
    /-?\d+(?:[.,]\d+)?/
  );

  if (!match) {
    return null;
  }

  const result = Number(
    match[0].replace(",", ".")
  );

  return Number.isFinite(result)
    ? result
    : null;
}

function array(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function unique(values) {
  return [
    ...new Set(
      values.filter(Boolean)
    )
  ];
}

/* =========================================================
   LEAGUE NORMALIZATION
========================================================= */

function normalizeLeague(value) {
  const input = String(
    value || ""
  )
    .toLowerCase()
    .trim();

  const leagues = {
    "serie-a": "ita.1",
    "seriea": "ita.1",
    "serie_a": "ita.1",
    "italia-serie-a": "ita.1",
    "italy-serie-a": "ita.1",

    "serie-b": "ita.2",
    "serieb": "ita.2",
    "serie_b": "ita.2",
    "italia-serie-b": "ita.2",
    "italy-serie-b": "ita.2",

    "ita.1": "ita.1",
    "ita.2": "ita.2"
  };

  return (
    leagues[input] ||
    input ||
    DEFAULT_LEAGUE
  );
}

/* =========================================================
   ESPN FETCH
========================================================= */

async function fetchESPN(url) {
  console.log(
    "[MATCH API] ESPN:",
    url
  );

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent":
        "100SerieASerieB-API/1.0"
    }
  });

  const text =
    await response.text();

  if (!response.ok) {
    console.error(
      "[MATCH API] ESPN ERROR:",
      response.status,
      text
    );

    throw new Error(
      `ESPN error ${response.status}`
    );
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      "ESPN ha restituito dati non JSON"
    );
  }
}

/* =========================================================
   ESPN SCOREBOARD
========================================================= */

async function getScoreboard(
  league,
  date
) {
  let url =
    `${ESPN_BASE_URL}/${league}/scoreboard`;

  if (date) {
    const cleanDate =
      String(date)
        .replaceAll("-", "")
        .trim();

    url +=
      `?dates=${encodeURIComponent(
        cleanDate
      )}`;
  }

  return fetchESPN(url);
}

/* =========================================================
   ESPN SUMMARY
========================================================= */

async function getSummary(
  league,
  eventId
) {
  const url =
    `${ESPN_BASE_URL}/${league}/summary?event=${encodeURIComponent(
      String(eventId)
    )}`;

  return fetchESPN(url);
}

/* =========================================================
   TEAM NAME
========================================================= */

const TEAM_MAP = {
  "Inter Milan": "Inter",
  "Internazionale": "Inter",

  "AC Milan": "Milan",

  "Juventus FC": "Juventus",

  "AS Roma": "Roma",

  "SS Lazio": "Lazio",

  "SSC Napoli": "Napoli",

  "Athletic Club": "Athletic Bilbao",

  "Udinese Calcio": "Udinese",

  "Como 1907": "Como"
};

function normalizeTeamName(name) {
  const value = clean(name);

  if (!value) {
    return null;
  }

  return (
    TEAM_MAP[value] ||
    value
  );
}

/* =========================================================
   TEAM
========================================================= */

function normalizeTeam(
  competitor
) {
  if (!competitor) {
    return {
      id: null,
      name: null,
      abbreviation: null,
      logo: null,
      score: null
    };
  }

  const team =
    competitor.team || {};

  const logo =
    first(
      team.logo,
      team.logos?.[0]?.href,
      competitor.logo,
      competitor.logos?.[0]?.href
    );

  return {
    id: clean(
      first(
        team.id,
        competitor.team?.id,
        competitor.id
      )
    ),

    name:
      normalizeTeamName(
        first(
          team.displayName,
          team.name,
          competitor.team?.displayName,
          competitor.displayName
        )
      ),

    abbreviation: clean(
      first(
        team.abbreviation,
        competitor.abbreviation
      )
    ),

    logo: clean(logo),

    score: number(
      first(
        competitor.score,
        competitor.score?.value
      )
    )
  };
}

/* =========================================================
   STATUS
========================================================= */

function normalizeStatus(
  competition
) {
  const status =
    competition?.status || {};

  const type =
    status.type || {};

  const completed =
    type.completed === true ||
    status.completed === true;

  let state =
    "scheduled";

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
        status.name
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

    completed
  };
}

/* =========================================================
   DATE / TIME
========================================================= */

function normalizeDateTime(
  date
) {
  if (!date) {
    return {
      date: null,
      time: null
    };
  }

  const object =
    new Date(date);

  if (
    Number.isNaN(
      object.getTime()
    )
  ) {
    return {
      date: clean(date),
      time: null
    };
  }

  return {
    date:
      object.toLocaleDateString(
        "it-IT",
        {
          timeZone:
            "Europe/Rome",
          day: "2-digit",
          month: "2-digit",
          year: "numeric"
        }
      ),

    time:
      object.toLocaleTimeString(
        "it-IT",
        {
          timeZone:
            "Europe/Rome",
          hour: "2-digit",
          minute: "2-digit"
        }
      )
  };
}

/* =========================================================
   LINEUPS
========================================================= */

function playerName(
  player
) {
  if (!player) {
    return null;
  }

  const athlete =
    player.athlete ||
    player.player ||
    {};

  return clean(
    first(
      athlete.displayName,
      athlete.fullName,
      athlete.shortName,
      player.displayName,
      player.fullName,
      player.name
    )
  );
}

function normalizeLineup(
  competitor
) {
  if (!competitor) {
    return {
      formation: null,
      starters: [],
      substitutes: [],
      players: []
    };
  }

  const lineup =
    competitor.lineup ||
    {};

  const rawPlayers =
    array(
      lineup.players ||
      competitor.players
    );

  const players =
    rawPlayers
      .map((player) => {
        const name =
          playerName(player);

        if (!name) {
          return null;
        }

        const starter =
          player.starter === true ||
          player.status ===
            "starter";

        const substitute =
          player.substitute === true ||
          player.status ===
            "substitute";

        return {
          id: clean(
            first(
              player.athlete?.id,
              player.player?.id,
              player.id
            )
          ),

          name,

          jersey: clean(
            first(
              player.jersey,
              player.athlete?.jersey
            )
          ),

          position: clean(
            first(
              player.position
                ?.abbreviation,
              player.position
                ?.name
            )
          ),

          starter,

          substitute
        };
      })
      .filter(Boolean);

  return {
    formation: clean(
      first(
        lineup.formation,
        competitor.formation
      )
    ),

    starters:
      players.filter(
        (p) => p.starter
      ),

    substitutes:
      players.filter(
        (p) => p.substitute
      ),

    players
  };
}

/* =========================================================
   STATISTICS
========================================================= */

function statisticValue(
  statistics,
  names
) {
  const wanted =
    names.map((name) =>
      name.toLowerCase()
    );

  for (const statistic of array(
    statistics
  )) {
    const statName =
      String(
        first(
          statistic.name,
          statistic.label,
          statistic.abbreviation
        ) || ""
      ).toLowerCase();

    if (
      wanted.some(
        (name) =>
          statName === name ||
          statName.includes(name)
      )
    ) {
      return first(
        statistic.displayValue,
        statistic.value
      );
    }
  }

  return null;
}

function normalizeStatistics(
  boxscoreTeam,
  fallbackTeam
) {
  const statistics =
    array(
      boxscoreTeam?.statistics
    );

  return {
    team:
      normalizeTeamName(
        first(
          boxscoreTeam?.team
            ?.displayName,
          boxscoreTeam?.team
            ?.name,
          fallbackTeam
        )
      ),

    shots: number(
      statisticValue(
        statistics,
        [
          "shots",
          "total shots",
          "tiri"
        ]
      )
    ),

    shotsOnTarget: number(
      statisticValue(
        statistics,
        [
          "shots on target",
          "shots on goal",
          "tiri in porta"
        ]
      )
    ),

    possession: number(
      statisticValue(
        statistics,
        [
          "possession",
          "possesso"
        ]
      )
    ),

    corners: number(
      statisticValue(
        statistics,
        [
          "corner kicks",
          "corners",
          "calci d'angolo"
        ]
      )
    ),

    offsides: number(
      statisticValue(
        statistics,
        [
          "offsides",
          "fuorigioco"
        ]
      )
    ),

    fouls: number(
      statisticValue(
        statistics,
        [
          "fouls",
          "falli"
        ]
      )
    ),

    yellowCards: number(
      statisticValue(
        statistics,
        [
          "yellow cards",
          "cartellini gialli"
        ]
      )
    ),

    redCards: number(
      statisticValue(
        statistics,
        [
          "red cards",
          "cartellini rossi"
        ]
      )
    ),

    saves: number(
      statisticValue(
        statistics,
        [
          "saves",
          "parades",
          "parata"
        ]
      )
    )
  };
}

/* =========================================================
   EVENTS
========================================================= */

function normalizeEvent(
  play
) {
  if (!play) {
    return null;
  }

  const typeText =
    String(
      first(
        play.type?.text,
        play.type?.name,
        play.type
      ) || ""
    );

  const lower =
    typeText.toLowerCase();

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
    type =
      "cartellino_giallo";
  } else if (
    lower.includes("red") ||
    lower.includes("rosso")
  ) {
    type =
      "cartellino_rosso";
  } else if (
    lower.includes(
      "substitution"
    ) ||
    lower.includes(
      "sostituzione"
    )
  ) {
    type =
      "sostituzione";
  } else if (
    lower.includes(
      "penalty"
    ) ||
    lower.includes(
      "rigore"
    )
  ) {
    type = "rigore";
  } else if (
    lower.includes(
      "kickoff"
    ) ||
    lower.includes(
      "inizio"
    )
  ) {
    type = "inizio";
  } else if (
    lower.includes(
      "half"
    ) ||
    lower.includes(
      "tempo"
    )
  ) {
    type = "intervallo";
  } else if (
    lower.includes(
      "end"
    ) ||
    lower.includes(
      "fine"
    )
  ) {
    type = "fine";
  } else if (
    lower.includes(
      "injury"
    ) ||
    lower.includes(
      "interruption"
    ) ||
    lower.includes(
      "interruzione"
    )
  ) {
    type =
      "interruzione";
  }

  const competitors =
    array(
      play.competitions
    );

  const competitor =
    play.competitor ||
    competitors[0] ||
    null;

  const athlete =
    play.athlete ||
    play.player ||
    null;

  const participants =
    array(
      play.participants
    );

  let playerIn =
    play.playerIn ||
    null;

  let playerOut =
    play.playerOut ||
    null;

  if (
    type ===
      "sostituzione" &&
    !playerIn &&
    participants.length
  ) {
    playerIn =
      participants.find(
        (p) =>
          p.type === "in" ||
          p.role === "in"
      );
  }

  if (
    type ===
      "sostituzione" &&
    !playerOut &&
    participants.length
  ) {
    playerOut =
      participants.find(
        (p) =>
          p.type === "out" ||
          p.role === "out"
      );
  }

  return {
    id: clean(play.id),

    type,

    minute: clean(
      first(
        play.clock
          ?.displayValue,
        play.clock,
        play.minute
      )
    ),

    team:
      normalizeTeamName(
        first(
          competitor?.team
            ?.displayName,
          competitor?.team
            ?.name,
          play.team
        )
      ),

    player:
      playerName(athlete),

    assist: clean(
      first(
        play.assist
          ?.athlete
          ?.displayName,
        play.assist
      )
    ),

    playerIn:
      playerName(playerIn),

    playerOut:
      playerName(playerOut),

    text: clean(
      first(
        play.text,
        play.description
      )
    )
  };
}

/* =========================================================
   VENUE
========================================================= */

function normalizeVenue(
  competition
) {
  const venue =
    competition?.venue;

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

    address: clean(
      first(
        address.fullAddress,
        address.street
      )
    )
  };
}

/* =========================================================
   TV
========================================================= */

function normalizeTV(
  summary,
  competition
) {
  const result = [];

  const broadcasts = [
    ...array(
      summary?.broadcasts
    ),
    ...array(
      competition?.broadcasts
    )
  ];

  for (
    const broadcast of broadcasts
  ) {
    const values = [
      broadcast?.name,
      broadcast?.shortName,
      broadcast?.market,
      broadcast?.media
        ?.name,
      broadcast?.media
        ?.shortName
    ];

    for (
      const value of values
    ) {
      const item = clean(
        value
      );

      if (item) {
        result.push(item);
      }
    }
  }

  return unique(result);
}

/* =========================================================
   OFFICIALS
========================================================= */

function normalizeOfficials(
  summary
) {
  const result = {
    referee: null,
    assistantReferee1: null,
    assistantReferee2: null,
    fourthOfficial: null,
    var: null,
    avar: null
  };

  const officials =
    array(
      summary?.officials
    );

  for (
    const official of officials
  ) {
    const athlete =
      official.athlete ||
      {};

    const name =
      clean(
        first(
          athlete.displayName,
          athlete.fullName,
          official.displayName,
          official.name
        )
      );

    if (!name) {
      continue;
    }

    const role =
      String(
        first(
          official.type?.text,
          official.type?.name,
          official.position,
          official.role
        ) || ""
      ).toLowerCase();

    if (
      role.includes("var") &&
      !role.includes("assistant")
    ) {
      result.var =
        result.var || name;
    } else if (
      role.includes("avar") ||
      role.includes(
        "video assistant"
      )
    ) {
      result.avar =
        result.avar || name;
    } else if (
      role.includes("fourth") ||
      role.includes("4th")
    ) {
      result.fourthOfficial =
        result.fourthOfficial ||
        name;
    } else if (
      role.includes("assistant")
    ) {
      if (
        !result.assistantReferee1
      ) {
        result.assistantReferee1 =
          name;
      } else if (
        !result.assistantReferee2
      ) {
        result.assistantReferee2 =
          name;
      }
    } else if (
      role.includes("referee") ||
      role.includes("arbitro")
    ) {
      result.referee =
        result.referee ||
        name;
    }
  }

  return result;
}

/* =========================================================
   MVP
========================================================= */

function normalizeMVP(
  summary
) {
  const candidates = [
    summary?.playerOfTheMatch,
    summary?.mvp,
    summary?.gameInfo?.mvp
  ];

  for (
    const candidate of candidates
  ) {
    if (!candidate) {
      continue;
    }

    const athlete =
      candidate.athlete ||
      candidate.player ||
      candidate;

    const name =
      clean(
        first(
          athlete.displayName,
          athlete.fullName,
          candidate.displayName,
          candidate.name
        )
      );

    if (!name) {
      continue;
    }

    return {
      name,

      team:
        normalizeTeamName(
          first(
            candidate.team
              ?.displayName,
            candidate.team
              ?.name,
            athlete.team
              ?.displayName,
            athlete.team?.name
          )
        ),

      reason: clean(
        first(
          candidate.reason,
          candidate.description
        )
      )
    };
  }

  return null;
}

/* =========================================================
   PENALTIES
========================================================= */

function normalizePenalties(
  summary,
  plays
) {
  const result = [];

  for (
    const penalty of array(
      summary?.penalties
    )
  ) {
    result.push({
      minute: clean(
        first(
          penalty.clock,
          penalty.minute
        )
      ),

      team:
        normalizeTeamName(
          first(
            penalty.team
              ?.displayName,
            penalty.team?.name,
            penalty.competitor
          )
        ),

      player: clean(
        first(
          penalty.athlete
            ?.displayName,
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
        typeof penalty.scored ===
        "boolean"
          ? penalty.scored
          : null
    });
  }

  for (
    const play of plays
  ) {
    const text =
      String(
        play?.text || ""
      ).toLowerCase();

    if (
      !text.includes("penalty") &&
      !text.includes("rigore")
    ) {
      continue;
    }

    result.push({
      minute: clean(
        first(
          play.clock
            ?.displayValue,
          play.clock,
          play.minute
        )
      ),

      team:
        normalizeTeamName(
          first(
            play.competitor?.team
              ?.displayName,
            play.competitor?.team
              ?.name,
            play.team
          )
        ),

      player: clean(
        first(
          play.athlete
            ?.displayName,
          play.player
        )
      ),

      result: clean(
        play.text
      ),

      scored:
        text.includes("scored") ||
        text.includes("goal")
          ? true
          : text.includes("missed") ||
            text.includes("saved")
          ? false
          : null
    });
  }

  return result;
}

/* =========================================================
   FIND EVENT
========================================================= */

function eventMatchesQuery(
  event,
  query
) {
  const competition =
    event?.competitions?.[0];

  const competitors =
    array(
      competition?.competitors
    );

  const q =
    String(
      query || ""
    )
      .toLowerCase()
      .trim();

  if (!q) {
    return false;
  }

  const names =
    competitors.map(
      (competitor) =>
        String(
          first(
            competitor.team
              ?.displayName,
            competitor.team
              ?.name,
            competitor.displayName
          ) || ""
        ).toLowerCase()
    );

  /*
   * Support:
   * "Udinese"
   * "Como"
   * "Udinese Como"
   * "Como Udinese"
   */

  if (
    names.some(
      (name) =>
        name.includes(q)
    )
  ) {
    return true;
  }

  const words =
    q.split(
      /\s+/
    ).filter(Boolean);

  if (
    words.length >= 2
  ) {
    return words.every(
      (word) =>
        names.some(
          (name) =>
            name.includes(word)
        )
    );
  }

  return false;
}

/* =========================================================
   FIND EVENT BY ID
========================================================= */

async function findEventById(
  league,
  eventId
) {
  /*
   * ESPN scoreboard con ID.
   *
   * Usiamo il parametro event
   * solo sul summary.
   *
   * Per il recupero iniziale
   * chiediamo lo scoreboard.
   */

  const scoreboard =
    await getScoreboard(
      league
    );

  const events =
    array(
      scoreboard?.events
    );

  return (
    events.find(
      (event) =>
        String(event.id) ===
        String(eventId)
    ) || null
  );
}

/* =========================================================
   FIND EVENT BY SEARCH
========================================================= */

async function findEventBySearch(
  league,
  query,
  date
) {
  const scoreboard =
    await getScoreboard(
      league,
      date
    );

  const events =
    array(
      scoreboard?.events
    );

  return (
    events.find(
      (event) =>
        eventMatchesQuery(
          event,
          query
        )
    ) || null
  );
}

/* =========================================================
   MAIN HANDLER
========================================================= */

module.exports = async function handler(
  req,
  res
) {
  try {
    if (
      req.method !== "GET"
    ) {
      return sendJSON(
        res,
        405,
        {
          success: false,
          error:
            "Metodo non consentito"
        }
      );
    }

    const query =
      req.query || {};

    /*
     * IMPORTANTISSIMO:
     *
     * ?competition=serie-a
     *
     * diventa:
     *
     * ita.1
     */

    const league =
      normalizeLeague(
        query.league ||
        query.competition ||
        DEFAULT_LEAGUE
      );

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

    console.log(
      "[MATCH API] league:",
      league
    );

    console.log(
      "[MATCH API] eventId:",
      eventId
    );

    console.log(
      "[MATCH API] search:",
      search
    );

    /*
     * -----------------------------------------------------
     * 1. TROVA LA PARTITA
     * -----------------------------------------------------
     */

    let event = null;

    if (eventId) {
      event =
        await findEventById(
          league,
          eventId
        );
    }

    if (
      !event &&
      search
    ) {
      event =
        await findEventBySearch(
          league,
          search,
          date
        );
    }

    /*
     * -----------------------------------------------------
     * 2. PARTITA NON TROVATA
     * -----------------------------------------------------
     */

    if (!event) {
      return sendJSON(
        res,
        404,
        {
          success: false,
          source: "ESPN",
          error:
            "Partita non trovata",
          league,
          query:
            search || null,
          eventId:
            eventId || null,
          date:
            date || null
        }
      );
    }

    const actualEventId =
      String(event.id);

    /*
     * -----------------------------------------------------
     * 3. SUMMARY COMPLETO
     * -----------------------------------------------------
     */

    const summary =
      await getSummary(
        league,
        actualEventId
      );

    /*
     * -----------------------------------------------------
     * 4. COMPETITION
     * -----------------------------------------------------
     */

    const competition =
      summary?.header
        ?.competitions?.[0] ||
      summary?.competitions?.[0] ||
      event?.competitions?.[0] ||
      null;

    /*
     * -----------------------------------------------------
     * 5. SQUADRE
     * -----------------------------------------------------
     */

    const competitors =
      array(
        competition?.competitors
      );

    const homeRaw =
      competitors.find(
        (item) =>
          item.homeAway ===
          "home"
      ) ||
      competitors[0] ||
      null;

    const awayRaw =
      competitors.find(
        (item) =>
          item.homeAway ===
          "away"
      ) ||
      competitors[1] ||
      null;

    const home =
      normalizeTeam(
        homeRaw
      );

    const away =
      normalizeTeam(
        awayRaw
      );

    /*
     * -----------------------------------------------------
     * 6. FORMAZIONI
     * -----------------------------------------------------
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
     * -----------------------------------------------------
     * 7. STATISTICHE
     * -----------------------------------------------------
     */

    const boxscoreTeams =
      array(
        summary?.boxscore
          ?.teams
      );

    const homeBox =
      boxscoreTeams.find(
        (item) =>
          item.homeAway ===
          "home"
      );

    const awayBox =
      boxscoreTeams.find(
        (item) =>
          item.homeAway ===
          "away"
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
     * -----------------------------------------------------
     * 8. EVENTI
     * -----------------------------------------------------
     */

    const rawPlays =
      array(
        summary?.plays
      );

    const events =
      rawPlays
        .map(
          normalizeEvent
        )
        .filter(Boolean);

    /*
     * -----------------------------------------------------
     * 9. RIGORI
     * -----------------------------------------------------
     */

    const penalties =
      normalizePenalties(
        summary,
        rawPlays
      );

    /*
     * -----------------------------------------------------
     * 10. DATA / ORA
     * -----------------------------------------------------
     */

    const matchDate =
      first(
        competition?.date,
        event?.date,
        summary?.header
          ?.competitions?.[0]
          ?.date
      );

    const dateTime =
      normalizeDateTime(
        matchDate
      );

    /*
     * -----------------------------------------------------
     * 11. VENUE
     * -----------------------------------------------------
     */

    const venue =
      normalizeVenue(
        competition
      );

    /*
     * -----------------------------------------------------
     * 12. ARBITRI
     * -----------------------------------------------------
     */

    const officials =
      normalizeOfficials(
        summary
      );

    /*
     * -----------------------------------------------------
     * 13. TV
     * -----------------------------------------------------
     */

    const tv =
      normalizeTV(
        summary,
        competition
      );

    /*
     * -----------------------------------------------------
     * 14. MVP
     * -----------------------------------------------------
     */

    const mvp =
      normalizeMVP(
        summary
      );

    /*
     * -----------------------------------------------------
     * 15. COMPETITION INFO
     * -----------------------------------------------------
     */

    const leagueInfo =
      event?.league ||
      competition?.league ||
      {};

    const season =
      event?.season ||
      competition?.season ||
      {};

    /*
     * -----------------------------------------------------
     * 16. RISPOSTA
     * -----------------------------------------------------
     */

    const response = {
      success: true,

      source: "ESPN",

      timezone:
        "Europe/Rome",

      competition: {
        id: clean(
          first(
            leagueInfo.id,
            league
          )
        ),

        name: clean(
          first(
            leagueInfo.name,
            league === "ita.1"
              ? "Serie A"
              : league === "ita.2"
              ? "Serie B"
              : league
          )
        ),

        espnLeague:
          league,

        season:
          season.year ||
          null
      },

      match: {
        id:
          actualEventId,

        date:
          dateTime.date,

        time:
          dateTime.time,

        home: {
          ...home,

          score:
            home.score ??
            number(
              homeRaw?.score
            )
        },

        away: {
          ...away,

          score:
            away.score ??
            number(
              awayRaw?.score
            )
        },

        status:
          normalizeStatus(
            competition
          )
      },

      lineups: {
        home:
          homeLineup,

        away:
          awayLineup
      },

      statistics: {
        home: {
          ...homeStats,

          team:
            home.name ||
            homeStats.team
        },

        away: {
          ...awayStats,

          team:
            away.name ||
            awayStats.team
        }
      },

      penalties,

      venue,

      officials,

      tv,

      mvp,

      events
    };

    return sendJSON(
      res,
      200,
      response
    );
  } catch (error) {
    console.error(
      "[MATCH API] FATAL ERROR:",
      error
    );

    return sendJSON(
      res,
      500,
      {
        success: false,

        source: "ESPN",

        error:
          "Errore interno durante il recupero della partita.",

        message:
          error?.message ||
          "Errore sconosciuto"
      }
    );
  }
};
