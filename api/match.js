import { NextResponse } from "next/server";

const ESPN_BASE =
  "https://site.api.espn.com/apis/site/v2/sports/soccer";

const DEFAULT_LEAGUE = "ita.1";

const TIMEZONE = "Europe/Rome";

/* =========================================================
   FETCH SICURO
========================================================= */

async function fetchJSON(url) {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "100SerieASerieB-API/1.0",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      console.error(
        "ESPN ERROR:",
        response.status,
        url
      );

      return null;
    }

    return await response.json();
  } catch (error) {
    console.error(
      "ESPN FETCH ERROR:",
      error?.message || error
    );

    return null;
  }
}

/* =========================================================
   HELPERS
========================================================= */

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function clean(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const text = String(value).trim();

  return text || null;
}

function first(...values) {
  for (const value of values) {
    if (
      value !== null &&
      value !== undefined &&
      value !== ""
    ) {
      return value;
    }
  }

  return null;
}

function number(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
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

  if (!match) return null;

  const result = Number(
    match[0].replace(",", ".")
  );

  return Number.isFinite(result)
    ? result
    : null;
}

function name(value) {
  if (!value) return null;

  if (typeof value === "string") {
    return clean(value);
  }

  return clean(
    first(
      value.displayName,
      value.fullName,
      value.shortName,
      value.name
    )
  );
}

function unique(values) {
  return [
    ...new Set(
      values
        .map(clean)
        .filter(Boolean)
    ),
  ];
}

/* =========================================================
   LEAGUE
========================================================= */

function getLeague(request) {
  const url = new URL(request.url);

  return (
    clean(
      url.searchParams.get("league")
    ) || DEFAULT_LEAGUE
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

  return {
    id: clean(
      first(
        team.id,
        team.team?.id
      )
    ),

    name: name(
      first(
        team.team,
        team
      )
    ),

    abbreviation: clean(
      first(
        team.team?.abbreviation,
        team.abbreviation
      )
    ),

    logo: clean(
      first(
        team.team?.logos?.[0]?.href,
        team.logos?.[0]?.href,
        team.logo
      )
    ),

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

function normalizeStatus(competition) {
  const status =
    competition?.status || {};

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

    completed:
      type.completed === true ||
      status.completed === true,
  };
}

/* =========================================================
   VENUE
========================================================= */

function normalizeVenue(competition) {
  const venue =
    competition?.venue;

  if (!venue) return null;

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
    ),
  };
}

/* =========================================================
   TV
========================================================= */

function normalizeTV(summary) {
  const result = [];

  for (const broadcast of arr(
    summary?.broadcasts
  )) {
    const values = [
      broadcast?.name,
      broadcast?.shortName,
      broadcast?.market,
      broadcast?.media?.name,
      broadcast?.media?.shortName,
    ];

    for (const value of values) {
      const item = clean(value);

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

function getOfficialName(official) {
  if (!official) return null;

  return name(
    first(
      official.athlete,
      official.displayName,
      official.fullName,
      official.name
    )
  );
}

function normalizeOfficials(summary) {
  const result = {
    referee: null,
    assistantReferee1: null,
    assistantReferee2: null,
    fourthOfficial: null,
    var: null,
    avar: null,
  };

  const officials = arr(
    summary?.officials
  );

  for (const official of officials) {
    const officialName =
      getOfficialName(official);

    if (!officialName) continue;

    const role = String(
      first(
        official.type?.text,
        official.type?.name,
        official.role,
        official.position,
        ""
      )
    ).toLowerCase();

    if (
      role.includes("avar") ||
      role.includes("video assistant")
    ) {
      if (!result.avar) {
        result.avar = officialName;
      }

      continue;
    }

    if (
      role.includes("var")
    ) {
      if (!result.var) {
        result.var = officialName;
      }

      continue;
    }

    if (
      role.includes("fourth") ||
      role.includes("4th")
    ) {
      if (!result.fourthOfficial) {
        result.fourthOfficial =
          officialName;
      }

      continue;
    }

    if (
      role.includes("assistant") ||
      role.includes("linesman")
    ) {
      if (!result.assistantReferee1) {
        result.assistantReferee1 =
          officialName;
      } else if (
        !result.assistantReferee2
      ) {
        result.assistantReferee2 =
          officialName;
      }

      continue;
    }

    if (
      role.includes("referee") ||
      role.includes("arbitro")
    ) {
      if (!result.referee) {
        result.referee =
          officialName;
      }
    }
  }

  /*
   * Fallback:
   * se ESPN restituisce gli ufficiali
   * senza il ruolo, usa l'ordine.
   */

  const names = unique(
    officials
      .map(getOfficialName)
      .filter(Boolean)
  );

  if (!result.referee && names[0]) {
    result.referee = names[0];
  }

  if (
    !result.assistantReferee1 &&
    names[1]
  ) {
    result.assistantReferee1 =
      names[1];
  }

  if (
    !result.assistantReferee2 &&
    names[2]
  ) {
    result.assistantReferee2 =
      names[2];
  }

  if (
    !result.fourthOfficial &&
    names[3]
  ) {
    result.fourthOfficial =
      names[3];
  }

  if (!result.var && names[4]) {
    result.var = names[4];
  }

  if (!result.avar && names[5]) {
    result.avar = names[5];
  }

  return result;
}

/* =========================================================
   LINEUPS
========================================================= */

function getPlayerName(player) {
  if (!player) return null;

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
  const lineup =
    competitor?.lineup ||
    null;

  const players = arr(
    lineup?.players ||
    competitor?.players
  );

  const result = [];

  for (const player of players) {
    const playerName =
      getPlayerName(player);

    if (!playerName) continue;

    result.push({
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
          player.athlete?.position?.abbreviation
        )
      ),

      starter:
        player.starter === true ||
        player.status === "starter",

      substitute:
        player.substitute === true ||
        player.status === "substitute",
    });
  }

  return {
    formation: clean(
      first(
        lineup?.formation,
        competitor?.formation
      )
    ),

    starters: result.filter(
      (p) => p.starter
    ),

    substitutes: result.filter(
      (p) => p.substitute
    ),

    players: result,
  };
}

/* =========================================================
   STATISTICS
========================================================= */

function findStat(
  statistics,
  aliases
) {
  const list = arr(statistics);

  for (const stat of list) {
    const statName = String(
      first(
        stat.name,
        stat.label,
        stat.abbreviation,
        ""
      )
    ).toLowerCase();

    for (const alias of aliases) {
      if (
        statName === alias ||
        statName.includes(alias)
      ) {
        return first(
          stat.displayValue,
          stat.value
        );
      }
    }
  }

  return null;
}

function normalizeStats(boxscoreTeam) {
  const statistics = arr(
    boxscoreTeam?.statistics
  );

  return {
    team: name(
      first(
        boxscoreTeam?.team,
        boxscoreTeam?.competitor
      )
    ),

    tiri: number(
      findStat(statistics, [
        "shots",
        "total shots",
        "tiri",
      ])
    ),

    tiriInPorta: number(
      findStat(statistics, [
        "shots on target",
        "shots on goal",
        "tiri in porta",
      ])
    ),

    possesso: number(
      findStat(statistics, [
        "possession",
        "possesso",
      ])
    ),

    calciDangolo: number(
      findStat(statistics, [
        "corner kicks",
        "corners",
        "corner",
        "calci d'angolo",
      ])
    ),

    fuorigioco: number(
      findStat(statistics, [
        "offsides",
        "offside",
        "fuorigioco",
      ])
    ),

    falli: number(
      findStat(statistics, [
        "fouls",
        "falli",
      ])
    ),

    parate: number(
      findStat(statistics, [
        "saves",
        "save",
        "parate",
      ])
    ),

    cartelliniGialli: number(
      findStat(statistics, [
        "yellow cards",
        "yellow card",
      ])
    ),

    cartelliniRossi: number(
      findStat(statistics, [
        "red cards",
        "red card",
      ])
    ),
  };
}

/* =========================================================
   EVENTS
========================================================= */

function normalizeEvent(play) {
  if (!play) return null;

  const rawType = String(
    first(
      play.type?.text,
      play.type?.name,
      play.type,
      ""
    )
  );

  const typeText =
    rawType.toLowerCase();

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
    typeText.includes("penalty") ||
    typeText.includes("rigore")
  ) {
    type = "rigore";
  } else if (
    typeText.includes("kickoff") ||
    typeText.includes("inizio")
  ) {
    type = "inizio";
  } else if (
    typeText.includes("half") ||
    typeText.includes("intervallo") ||
    typeText.includes("tempo")
  ) {
    type = "intervallo";
  } else if (
    typeText.includes("end") ||
    typeText.includes("fine")
  ) {
    type = "fine";
  } else if (
    typeText.includes("interruption") ||
    typeText.includes("interruzione")
  ) {
    type = "interruzione";
  }

  const competition =
    arr(play.competitions)[0];

  const athlete =
    play.athlete ||
    play.player ||
    null;

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

    team: name(
      first(
        competition?.team,
        competition?.competitor?.team,
        play.team
      )
    ),

    player: name(
      athlete
    ),

    assist: name(
      first(
        play.assist,
        play.assist?.athlete
      )
    ),

    playerIn: name(
      first(
        play.playerIn,
        play.substitution?.playerIn
      )
    ),

    playerOut: name(
      first(
        play.playerOut,
        play.substitution?.playerOut
      )
    ),

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

function normalizePenalties(
  summary,
  plays
) {
  const result = [];

  for (const penalty of arr(
    summary?.penalties
  )) {
    const text = String(
      first(
        penalty.result,
        penalty.outcome,
        penalty.displayValue,
        ""
      )
    );

    result.push({
      minute: clean(
        first(
          penalty.minute,
          penalty.clock
        )
      ),

      team: name(
        first(
          penalty.team,
          penalty.competitor
        )
      ),

      player: name(
        first(
          penalty.athlete,
          penalty.player
        )
      ),

      result: clean(text),

      scored:
        typeof penalty.scored ===
        "boolean"
          ? penalty.scored
          : null,
    });
  }

  for (const play of plays) {
    const text = String(
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
          play.clock?.displayValue,
          play.clock,
          play.minute
        )
      ),

      team: name(
        first(
          play.team,
          play.competitor?.team
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
            text.includes("parato")
          ? false
          : null,
    });
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
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;

    const athlete =
      candidate.athlete ||
      candidate.player ||
      candidate;

    const playerName =
      name(athlete);

    if (!playerName) continue;

    return {
      name: playerName,

      team: name(
        first(
          candidate.team,
          athlete.team
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
   SEARCH MATCH
========================================================= */

async function searchMatch(
  league,
  query,
  date
) {
  let endpoint =
    `${ESPN_BASE}/${league}/scoreboard`;

  const params = new URLSearchParams();

  if (date) {
    params.set(
      "dates",
      date.replaceAll("-", "")
    );
  }

  params.set("limit", "100");

  endpoint +=
    "?" + params.toString();

  const data =
    await fetchJSON(endpoint);

  const events =
    arr(data?.events);

  if (!query) {
    return events[0] || null;
  }

  const search =
    query
      .toLowerCase()
      .trim();

  return (
    events.find((event) => {
      const competitors =
        arr(
          event?.competitions?.[0]
            ?.competitors
        );

      return competitors.some(
        (competitor) => {
          const team =
            competitor?.team;

          const values = [
            team?.name,
            team?.displayName,
            team?.shortDisplayName,
            team?.abbreviation,
          ]
            .filter(Boolean)
            .map((x) =>
              String(x).toLowerCase()
            );

          return values.some(
            (value) =>
              value.includes(search)
          );
        }
      );
    }) || null
  );
}

/* =========================================================
   GET
========================================================= */

export async function GET(request) {
  try {
    const url =
      new URL(request.url);

    const league =
      getLeague(request);

    const id =
      clean(
        first(
          url.searchParams.get("id"),
          url.searchParams.get("event"),
          url.searchParams.get("matchId")
        )
      );

    const query =
      clean(
        first(
          url.searchParams.get("q"),
          url.searchParams.get("search")
        )
      );

    const date =
      clean(
        url.searchParams.get("date")
      );

    /* -----------------------------------------------------
       TROVA LA PARTITA
    ----------------------------------------------------- */

    let event = null;

    if (id) {
      const data =
        await fetchJSON(
          `${ESPN_BASE}/${league}/scoreboard?limit=100`
        );

      event =
        arr(data?.events).find(
          (item) =>
            String(item.id) ===
            String(id)
        ) || null;
    }

    if (!event) {
      event =
        await searchMatch(
          league,
          query,
          date
        );
    }

    if (!event) {
      return NextResponse.json(
        {
          success: false,
          source: "ESPN",
          error:
            "Partita non trovata.",
          query: query || null,
          eventId: id || null,
        },
        { status: 404 }
      );
    }

    const eventId =
      String(event.id);

    /* -----------------------------------------------------
       SUMMARY
    ----------------------------------------------------- */

    const summary =
      await fetchJSON(
        `${ESPN_BASE}/${league}/summary?event=${eventId}`
      );

    const competition =
      summary?.header
        ?.competitions?.[0] ||
      summary?.competitions?.[0] ||
      event?.competitions?.[0] ||
      null;

    const competitors =
      arr(
        competition?.competitors
      );

    const homeRaw =
      competitors.find(
        (item) =>
          item.homeAway === "home"
      ) ||
      competitors[0] ||
      null;

    const awayRaw =
      competitors.find(
        (item) =>
          item.homeAway === "away"
      ) ||
      competitors[1] ||
      null;

    const home =
      normalizeTeam(homeRaw);

    const away =
      normalizeTeam(awayRaw);

    /* -----------------------------------------------------
       LINEUPS
    ----------------------------------------------------- */

    const homeLineup =
      normalizeLineup(homeRaw);

    const awayLineup =
      normalizeLineup(awayRaw);

    /* -----------------------------------------------------
       BOXSCORE / STATISTICHE
    ----------------------------------------------------- */

    const boxscoreTeams =
      arr(
        summary?.boxscore?.teams
      );

    const homeBox =
      boxscoreTeams.find(
        (item) =>
          item.homeAway === "home"
      );

    const awayBox =
      boxscoreTeams.find(
        (item) =>
          item.homeAway === "away"
      );

    const homeStats =
      normalizeStats(
        homeBox
      );

    const awayStats =
      normalizeStats(
        awayBox
      );

    homeStats.team =
      home.name;

    awayStats.team =
      away.name;

    /* -----------------------------------------------------
       EVENTI
    ----------------------------------------------------- */

    const rawPlays =
      arr(
        summary?.plays
      );

    const events =
      rawPlays
        .map(normalizeEvent)
        .filter(Boolean);

    /* -----------------------------------------------------
       DATA / ORA
    ----------------------------------------------------- */

    const rawDate =
      first(
        competition?.date,
        event?.date
      );

    let formattedDate = null;
    let formattedTime = null;

    if (rawDate) {
      const dateObject =
        new Date(rawDate);

      if (
        !Number.isNaN(
          dateObject.getTime()
        )
      ) {
        formattedDate =
          dateObject.toLocaleDateString(
            "it-IT",
            {
              timeZone: TIMEZONE,
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            }
          );

        formattedTime =
          dateObject.toLocaleTimeString(
            "it-IT",
            {
              timeZone: TIMEZONE,
              hour: "2-digit",
              minute: "2-digit",
            }
          );
      }
    }

    /* -----------------------------------------------------
       RISPOSTA
    ----------------------------------------------------- */

    return NextResponse.json(
      {
        success: true,

        source: "ESPN",

        timezone: TIMEZONE,

        competition: {
          id: clean(
            first(
              event?.league?.id,
              competition?.league?.id
            )
          ),

          name: clean(
            first(
              event?.league?.name,
              competition?.league?.name
            )
          ),

          espnLeague: league,

          season: clean(
            first(
              event?.season?.year,
              competition?.season?.year
            )
          ),
        },

        match: {
          id: eventId,

          date:
            formattedDate ||
            clean(rawDate),

          time:
            formattedTime,

          home: {
            ...home,

            score:
              home.score ??
              number(
                homeRaw?.score
              ),
          },

          away: {
            ...away,

            score:
              away.score ??
              number(
                awayRaw?.score
              ),
          },

          status:
            normalizeStatus(
              competition
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

        penalties:
          normalizePenalties(
            summary,
            rawPlays
          ),

        venue:
          normalizeVenue(
            competition
          ),

        referee:
          normalizeOfficials(
            summary
          ).referee,

        officials:
          normalizeOfficials(
            summary
          ),

        tv:
          normalizeTV(
            summary
          ),

        mvp:
          normalizeMVP(
            summary
          ),

        events,
      },

      {
        status: 200,

        headers: {
          "Cache-Control":
            "s-maxage=15, stale-while-revalidate=30",
        },
      }
    );
  } catch (error) {
    console.error(
      "MATCH API CRASH:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        source: "ESPN",

        error:
          "Errore interno durante il recupero della partita.",

        details:
          process.env.NODE_ENV ===
          "development"
            ? String(
                error?.message ||
                  error
              )
            : undefined,
      },
      { status: 500 }
    );
  }
      }
