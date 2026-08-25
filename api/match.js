import { NextResponse } from "next/server";

const ESPN_SITE =
  "https://site.api.espn.com/apis/site/v2/sports/soccer";

const ESPN_CORE =
  "https://sports.core.api.espn.com/v2/sports/soccer/leagues";

const DEFAULT_LEAGUE = "ita.1";

const CACHE_SECONDS = 15;

/* =========================================================
   GENERIC HELPERS
========================================================= */

async function fetchJSON(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeout || 10000
  );

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "100SerieASerieB-API/1.0",
        ...(options.headers || {}),
      },
      next: {
        revalidate: CACHE_SECONDS,
      },
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function firstDefined(...values) {
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

function cleanString(value) {
  if (value === undefined || value === null) return null;

  const result = String(value).trim();

  return result.length ? result : null;
}

function toNumber(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const match = String(value).match(/-?\d+(?:[.,]\d+)?/);

  if (!match) return null;

  const number = Number(match[0].replace(",", "."));

  return Number.isFinite(number) ? number : null;
}

function normalizeName(value) {
  if (!value) return null;

  if (typeof value === "string") {
    return cleanString(value);
  }

  return cleanString(
    firstDefined(
      value.displayName,
      value.fullName,
      value.name,
      value.shortName
    )
  );
}

function getArray(value) {
  return Array.isArray(value) ? value : [];
}

function unique(array) {
  return [...new Set(array.filter(Boolean))];
}

/* =========================================================
   LEAGUE
========================================================= */

function getLeague(request) {
  const url = new URL(request.url);

  return (
    url.searchParams.get("league") ||
    url.searchParams.get("competition") ||
    DEFAULT_LEAGUE
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

  const logo =
    firstDefined(
      team.logo,
      team.logos?.[0]?.href,
      team.team?.logo,
      team.team?.logos?.[0]?.href
    );

  return {
    id: cleanString(
      firstDefined(
        team.id,
        team.team?.id,
        team.uid
      )
    ),

    name: normalizeName(
      firstDefined(
        team.name,
        team.displayName,
        team.team
      )
    ),

    abbreviation: cleanString(
      firstDefined(
        team.abbreviation,
        team.team?.abbreviation
      )
    ),

    logo: cleanString(logo),

    score: toNumber(
      firstDefined(
        team.score,
        team.score?.value
      )
    ),
  };
}

/* =========================================================
   STATUS
========================================================= */

function normalizeStatus(competition, header = {}) {
  const status =
    competition?.status ||
    header?.status ||
    {};

  const type = status.type || {};

  const completed =
    Boolean(
      firstDefined(
        type.completed,
        status.completed,
        false
      )
    );

  let state = "scheduled";

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

    name: cleanString(
      firstDefined(
        type.name,
        status.name
      )
    ),

    description: cleanString(
      firstDefined(
        type.description,
        status.description
      )
    ),

    detail: cleanString(
      firstDefined(
        type.detail,
        status.detail
      )
    ),

    clock: cleanString(
      firstDefined(
        status.displayClock,
        status.clock
      )
    ),

    completed,
  };
}

/* =========================================================
   VENUE
========================================================= */

function normalizeVenue(competition) {
  const venue =
    competition?.venue ||
    competition?.venue?.venue ||
    null;

  if (!venue) return null;

  const address = venue.address || {};

  return {
    id: cleanString(venue.id),

    name: cleanString(
      firstDefined(
        venue.fullName,
        venue.name
      )
    ),

    city: cleanString(address.city),

    country: cleanString(
      firstDefined(
        address.country,
        address.countryName
      )
    ),

    capacity: toNumber(venue.capacity),

    indoor:
      typeof venue.indoor === "boolean"
        ? venue.indoor
        : null,

    address: cleanString(
      firstDefined(
        venue.address?.fullAddress,
        venue.address?.street
      )
    ),
  };
}

/* =========================================================
   BROADCAST / TV
========================================================= */

function normalizeBroadcasts(summary, competition) {
  const sources = [
    ...getArray(summary?.broadcasts),
    ...getArray(competition?.broadcasts),
  ];

  const channels = [];

  for (const broadcast of sources) {
    const names = [
      broadcast?.name,
      broadcast?.shortName,
      broadcast?.market,
      broadcast?.media?.shortName,
      broadcast?.media?.name,
      ...(getArray(broadcast?.names)),
    ];

    for (const name of names) {
      const clean = cleanString(name);

      if (clean) channels.push(clean);
    }
  }

  return unique(channels);
}

/* =========================================================
   OFFICIALS
========================================================= */

function extractOfficialName(official) {
  if (!official) return null;

  return normalizeName(
    firstDefined(
      official.athlete,
      official.displayName,
      official.fullName,
      official.name
    )
  );
}

function normalizeOfficials(summary, coreOfficials) {
  const result = {
    referee: null,
    assistantReferee1: null,
    assistantReferee2: null,
    fourthOfficial: null,
    var: null,
    avar: null,
  };

  const officials = [
    ...getArray(summary?.officials),
    ...getArray(summary?.competition?.officials),
    ...getArray(coreOfficials?.items),
  ];

  for (const official of officials) {
    const name = extractOfficialName(official);

    if (!name) continue;

    const role = String(
      firstDefined(
        official.type?.text,
        official.type?.name,
        official.position,
        official.role,
        official.displayName
      ) || ""
    ).toLowerCase();

    if (
      role.includes("var") &&
      !role.includes("assistant")
    ) {
      if (!result.var) result.var = name;
      continue;
    }

    if (
      role.includes("avar") ||
      role.includes("video assistant")
    ) {
      if (!result.avar) result.avar = name;
      continue;
    }

    if (
      role.includes("fourth") ||
      role.includes("4th")
    ) {
      if (!result.fourthOfficial) {
        result.fourthOfficial = name;
      }
      continue;
    }

    if (
      role.includes("assistant") ||
      role.includes("linesman")
    ) {
      if (!result.assistantReferee1) {
        result.assistantReferee1 = name;
      } else if (!result.assistantReferee2) {
        result.assistantReferee2 = name;
      }

      continue;
    }

    if (
      role.includes("referee") ||
      role.includes("arbitro")
    ) {
      if (!result.referee) {
        result.referee = name;
      }
    }
  }

  /*
   * ESPN sometimes doesn't expose the role in the summary.
   * In that case use the ordering normally returned by the
   * officials endpoint.
   */

  const names = unique(
    officials
      .map(extractOfficialName)
      .filter(Boolean)
  );

  if (!result.referee && names[0]) {
    result.referee = names[0];
  }

  if (!result.assistantReferee1 && names[1]) {
    result.assistantReferee1 = names[1];
  }

  if (!result.assistantReferee2 && names[2]) {
    result.assistantReferee2 = names[2];
  }

  if (!result.fourthOfficial && names[3]) {
    result.fourthOfficial = names[3];
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
   STATISTICS
========================================================= */

function getStatisticValue(statistics, possibleNames) {
  const wanted = possibleNames.map((x) =>
    String(x).toLowerCase()
  );

  for (const stat of getArray(statistics)) {
    const name = String(
      firstDefined(
        stat.name,
        stat.label,
        stat.abbreviation,
        ""
      )
    ).toLowerCase();

    if (
      wanted.some(
        (item) =>
          name === item ||
          name.includes(item)
      )
    ) {
      return firstDefined(
        stat.displayValue,
        stat.value,
        stat.displayValue
      );
    }
  }

  return null;
}

function normalizeTeamStatistics(teamStats) {
  const statistics = getArray(teamStats?.statistics);

  return {
    team: normalizeName(
      firstDefined(
        teamStats?.team,
        teamStats?.competitor
      )
    ),

    shots: toNumber(
      getStatisticValue(statistics, [
        "shots",
        "total shots",
        "tiri",
      ])
    ),

    shotsOnTarget: toNumber(
      getStatisticValue(statistics, [
        "shots on target",
        "shots on goal",
        "tiri in porta",
      ])
    ),

    possession: toNumber(
      getStatisticValue(statistics, [
        "possession",
        "possesso",
      ])
    ),

    corners: toNumber(
      getStatisticValue(statistics, [
        "corner kicks",
        "corners",
        "calci d'angolo",
      ])
    ),

    offsides: toNumber(
      getStatisticValue(statistics, [
        "offsides",
        "fuorigioco",
      ])
    ),

    fouls: toNumber(
      getStatisticValue(statistics, [
        "fouls",
        "falli",
      ])
    ),

    yellowCards: toNumber(
      getStatisticValue(statistics, [
        "yellow cards",
        "cartellini gialli",
      ])
    ),

    redCards: toNumber(
      getStatisticValue(statistics, [
        "red cards",
        "cartellini rossi",
      ])
    ),

    saves: toNumber(
      getStatisticValue(statistics, [
        "saves",
        "parata",
        "parades",
      ])
    ),
  };
}

/* =========================================================
   LINEUPS
========================================================= */

function extractPlayerName(player) {
  if (!player) return null;

  return normalizeName(
    firstDefined(
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
    competitor?.roster ||
    null;

  const players = getArray(
    lineup?.players ||
    competitor?.players
  );

  const allPlayers = [];

  for (const player of players) {
    const name = extractPlayerName(player);

    if (!name) continue;

    allPlayers.push({
      id: cleanString(
        firstDefined(
          player.athlete?.id,
          player.player?.id,
          player.id
        )
      ),

      name,

      jersey: cleanString(
        firstDefined(
          player.jersey,
          player.athlete?.jersey
        )
      ),

      position: cleanString(
        firstDefined(
          player.position?.abbreviation,
          player.position?.name
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

  const starters = allPlayers.filter(
    (p) => p.starter
  );

  const substitutes = allPlayers.filter(
    (p) => p.substitute
  );

  return {
    formation: cleanString(
      firstDefined(
        lineup?.formation,
        competitor?.formation
      )
    ),

    starters,

    substitutes,

    players: allPlayers,
  };
}

/* =========================================================
   EVENTS
========================================================= */

function normalizeEvent(play) {
  if (!play) return null;

  const typeText = String(
    firstDefined(
      play.type?.text,
      play.type?.name,
      play.type,
      ""
    )
  );

  const lower = typeText.toLowerCase();

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
  }

  const competitors = getArray(play.competitions);

  const competitor =
    play.competitor ||
    competitors[0] ||
    null;

  const athlete =
    play.athlete ||
    play.player ||
    null;

  const participants = getArray(
    play.participants
  );

  let playerIn =
    play.playerIn ||
    play.substitution?.playerIn ||
    null;

  let playerOut =
    play.playerOut ||
    play.substitution?.playerOut ||
    null;

  if (
    !playerIn &&
    participants.length >= 1 &&
    type === "sostituzione"
  ) {
    playerIn =
      participants.find(
        (p) =>
          p.type === "in" ||
          p.role === "in"
      );
  }

  if (
    !playerOut &&
    participants.length >= 2 &&
    type === "sostituzione"
  ) {
    playerOut =
      participants.find(
        (p) =>
          p.type === "out" ||
          p.role === "out"
      );
  }

  return {
    id: cleanString(play.id),

    type,

    minute: cleanString(
      firstDefined(
        play.clock?.displayValue,
        play.clock,
        play.minute
      )
    ),

    team: normalizeName(
      firstDefined(
        competitor?.team,
        play.team
      )
    ),

    player: normalizeName(athlete),

    assist: normalizeName(
      firstDefined(
        play.assist,
        play.assist?.athlete
      )
    ),

    playerIn: normalizeName(playerIn),

    playerOut: normalizeName(playerOut),

    text: cleanString(
      firstDefined(
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
  const penalties = [];

  for (const penalty of getArray(
    summary?.penalties
  )) {
    penalties.push({
      minute: cleanString(
        firstDefined(
          penalty.clock,
          penalty.minute
        )
      ),

      team: normalizeName(
        firstDefined(
          penalty.team,
          penalty.competitor
        )
      ),

      player: normalizeName(
        firstDefined(
          penalty.athlete,
          penalty.player
        )
      ),

      result: cleanString(
        firstDefined(
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

  for (const play of plays) {
    const text = String(
      play?.text || ""
    ).toLowerCase();

    if (
      text.includes("penalty") ||
      text.includes("rigore")
    ) {
      penalties.push({
        minute: cleanString(
          firstDefined(
            play.clock?.displayValue,
            play.clock,
            play.minute
          )
        ),

        team: normalizeName(
          firstDefined(
            play.competitor?.team,
            play.team
          )
        ),

        player: normalizeName(
          firstDefined(
            play.athlete,
            play.player
          )
        ),

        result: cleanString(
          play.text
        ),

        scored:
          text.includes("scored") ||
          text.includes("goal")
            ? true
            : text.includes("missed") ||
              text.includes("saved")
            ? false
            : null,
      });
    }
  }

  return penalties;
}

/* =========================================================
   MVP
========================================================= */

function normalizeMVP(summary) {
  const candidates = [
    summary?.leaders?.[0],
    summary?.leaders?.playerOfTheMatch,
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

    const name = normalizeName(athlete);

    if (!name) continue;

    return {
      name,

      team: normalizeName(
        firstDefined(
          candidate.team,
          athlete.team
        )
      ),

      reason: cleanString(
        firstDefined(
          candidate.reason,
          candidate.description
        )
      ),
    };
  }

  return null;
}

/* =========================================================
   FIND COMPETITION
========================================================= */

function findCompetition(summary) {
  return (
    summary?.header?.competitions?.[0] ||
    summary?.competitions?.[0] ||
    summary?.header?.competitions?.[0]
  );
}

/* =========================================================
   CORE OFFICIALS
========================================================= */

async function fetchCoreOfficials(
  league,
  eventId,
  competitionId
) {
  if (!eventId || !competitionId) {
    return null;
  }

  const url =
    `${ESPN_CORE}/${league}` +
    `/events/${eventId}` +
    `/competitions/${competitionId}` +
    `/officials?limit=50`;

  return await fetchJSON(url);
}

/* =========================================================
   CORE COMPETITOR STATS
========================================================= */

async function fetchCoreStats(
  league,
  eventId,
  competitionId,
  competitorId
) {
  if (
    !eventId ||
    !competitionId ||
    !competitorId
  ) {
    return null;
  }

  const url =
    `${ESPN_CORE}/${league}` +
    `/events/${eventId}` +
    `/competitions/${competitionId}` +
    `/competitors/${competitorId}` +
    `/statistics?limit=100`;

  return await fetchJSON(url);
}

/* =========================================================
   SCOREBOARD SEARCH
========================================================= */

async function findEvent(
  league,
  query,
  date
) {
  const params = new URLSearchParams();

  if (date) {
    params.set(
      "dates",
      date.replaceAll("-", "")
    );
  }

  if (query) {
    params.set("limit", "100");
  }

  const url =
    `${ESPN_SITE}/${league}/scoreboard?` +
    params.toString();

  const data = await fetchJSON(url);

  const events = getArray(
    data?.events
  );

  if (!query) {
    return events[0] || null;
  }

  const normalizedQuery =
    query.toLowerCase().trim();

  return (
    events.find((event) => {
      const competition =
        event.competitions?.[0];

      const teams =
        getArray(
          competition?.competitors
        );

      const names = teams.map(
        (team) =>
          String(
            firstDefined(
              team.team?.displayName,
              team.team?.name,
              team.displayName
            ) || ""
          ).toLowerCase()
      );

      return names.some(
        (name) =>
          name.includes(normalizedQuery)
      );
    }) || null
  );
}

/* =========================================================
   MAIN
========================================================= */

export async function GET(request) {
  try {
    const url = new URL(request.url);

    const league =
      getLeague(request);

    const eventId =
      url.searchParams.get("id") ||
      url.searchParams.get("event") ||
      url.searchParams.get("matchId");

    const query =
      url.searchParams.get("q") ||
      url.searchParams.get("search");

    const date =
      url.searchParams.get("date");

    let selectedEvent = null;

    /*
     * 1. If an event ID is supplied, use it.
     */

    if (eventId) {
      const scoreboard =
        await fetchJSON(
          `${ESPN_SITE}/${league}/scoreboard?dates=${date || ""}`
        );

      selectedEvent =
        getArray(scoreboard?.events).find(
          (event) =>
            String(event.id) ===
            String(eventId)
        ) || null;
    }

    /*
     * 2. Otherwise search the scoreboard.
     */

    if (!selectedEvent && query) {
      selectedEvent =
        await findEvent(
          league,
          query,
          date
        );
    }

    /*
     * 3. If no event was found, return
     * a clean error.
     */

    if (!selectedEvent) {
      return NextResponse.json(
        {
          success: false,
          source: "ESPN",
          error: "Partita non trovata",
          query: query || null,
          eventId: eventId || null,
        },
        { status: 404 }
      );
    }

    const actualEventId =
      String(selectedEvent.id);

    /*
     * 4. Full ESPN summary.
     */

    const summary =
      await fetchJSON(
        `${ESPN_SITE}/${league}/summary?event=${actualEventId}`
      );

    /*
     * If summary fails, still use scoreboard.
     */

    const competition =
      findCompetition(summary) ||
      selectedEvent.competitions?.[0] ||
      null;

    const competitors =
      getArray(
        competition?.competitors
      );

    const homeRaw =
      competitors.find(
        (c) => c.homeAway === "home"
      ) ||
      competitors[0] ||
      null;

    const awayRaw =
      competitors.find(
        (c) => c.homeAway === "away"
      ) ||
      competitors[1] ||
      null;

    const home =
      normalizeTeam(homeRaw);

    const away =
      normalizeTeam(awayRaw);

    /*
     * 5. Core IDs.
     */

    const competitionId =
      String(
        firstDefined(
          competition?.id,
          actualEventId
        )
      );

    const homeId =
      homeRaw?.id ||
      homeRaw?.team?.id;

    const awayId =
      awayRaw?.id ||
      awayRaw?.team?.id;

    /*
     * 6. Parallel requests for rich data.
     */

    const [
      coreOfficials,
      homeCoreStats,
      awayCoreStats,
    ] = await Promise.all([
      fetchCoreOfficials(
        league,
        actualEventId,
        competitionId
      ),

      fetchCoreStats(
        league,
        actualEventId,
        competitionId,
        homeId
      ),

      fetchCoreStats(
        league,
        actualEventId,
        competitionId,
        awayId
      ),
    ]);

    /*
     * 7. Lineups.
     */

    const homeLineup =
      normalizeLineup(homeRaw);

    const awayLineup =
      normalizeLineup(awayRaw);

    /*
     * 8. Statistics.
     */

    const summaryBoxscore =
      summary?.boxscore;

    const boxscoreTeams =
      getArray(
        summaryBoxscore?.teams
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
      normalizeTeamStatistics(
        homeBox || {
          team: home.name,
          statistics: homeCoreStats?.items ||
            homeCoreStats?.statistics ||
            [],
        }
      );

    const awayStats =
      normalizeTeamStatistics(
        awayBox || {
          team: away.name,
          statistics: awayCoreStats?.items ||
            awayCoreStats?.statistics ||
            [],
        }
      );

    /*
     * 9. Plays.
     */

    const rawPlays =
      getArray(
        summary?.plays
      );

    const events =
      rawPlays
        .map(normalizeEvent)
        .filter(Boolean);

    /*
     * 10. Penalties.
     */

    const penalties =
      normalizePenalties(
        summary,
        rawPlays
      );

    /*
     * 11. Venue.
     */

    const venue =
      normalizeVenue(
        competition
      );

    /*
     * 12. Officials.
     */

    const officials =
      normalizeOfficials(
        summary,
        coreOfficials
      );

    /*
     * 13. TV.
     */

    const tv =
      normalizeBroadcasts(
        summary,
        competition
      );

    /*
     * 14. MVP.
     */

    const mvp =
      normalizeMVP(summary);

    /*
     * 15. Date/time.
     */

    const matchDate =
      firstDefined(
        competition?.date,
        selectedEvent?.date
      );

    const dateObject =
      matchDate
        ? new Date(matchDate)
        : null;

    const formattedDate =
      dateObject &&
      !Number.isNaN(
        dateObject.getTime()
      )
        ? dateObject
            .toLocaleDateString(
              "it-IT",
              {
                timeZone:
                  "Europe/Rome",
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              }
            )
        : null;

    const formattedTime =
      dateObject &&
      !Number.isNaN(
        dateObject.getTime()
      )
        ? dateObject
            .toLocaleTimeString(
              "it-IT",
              {
                timeZone:
                  "Europe/Rome",
                hour: "2-digit",
                minute: "2-digit",
              }
            )
        : null;

    /*
     * 16. FINAL RESPONSE.
     */

    const response = {
      success: true,

      source: "ESPN",

      timezone: "Europe/Rome",

      competition: {
        id: cleanString(
          firstDefined(
            selectedEvent?.league?.id,
            competition?.league?.id
          )
        ),

        name: cleanString(
          firstDefined(
            selectedEvent?.league?.name,
            competition?.league?.name,
            "Serie A"
          )
        ),

        espnLeague: league,

        season: cleanString(
          firstDefined(
            selectedEvent?.season?.year,
            competition?.season?.year
          )
        ),
      },

      match: {
        id: actualEventId,

        date:
          formattedDate ||
          cleanString(matchDate),

        time:
          formattedTime,

        home: {
          ...home,
          score:
            home.score ??
            toNumber(
              homeRaw?.score
            ),
        },

        away: {
          ...away,
          score:
            away.score ??
            toNumber(
              awayRaw?.score
            ),
        },

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
        home: {
          ...homeStats,

          team:
            home.name ||
            homeStats.team,
        },

        away: {
          ...awayStats,

          team:
            away.name ||
            awayStats.team,
        },
      },

      penalties,

      venue,

      officials,

      tv,

      mvp,

      events,
    };

    return NextResponse.json(
      response,
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
      "MATCH API ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        source: "ESPN",
        error:
          "Errore interno durante il recupero della partita.",
      },
      { status: 500 }
    );
  }
      }
