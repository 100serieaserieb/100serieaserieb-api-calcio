import { NextResponse } from "next/server";

const ESPN_BASE_URL =
  "https://site.api.espn.com/apis/site/v2/sports/soccer";

const DEFAULT_LEAGUE = "ita.1";

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

  const n = Number(value);

  return Number.isFinite(n) ? n : null;
}

function teamName(team) {
  if (!team) return null;

  return clean(
    team.displayName ||
      team.name ||
      team.shortDisplayName ||
      team.abbreviation
  );
}

function teamLogo(team) {
  if (!team) return null;

  if (team.logo) {
    return team.logo;
  }

  if (
    Array.isArray(team.logos) &&
    team.logos.length > 0
  ) {
    return team.logos[0]?.href || null;
  }

  return null;
}

function normalizeStatus(competition) {
  const status = competition?.status || {};
  const type = status.type || {};

  let state = "programmata";

  if (type.completed === true) {
    state = "terminata";
  } else if (type.state === "in") {
    state = "live";
  }

  return {
    state,
    name: clean(type.name),
    description: clean(type.description),
    detail: clean(type.detail),
    clock: clean(status.displayClock),
    completed: type.completed === true,
  };
}

function getEventTeams(competition) {
  const competitors =
    Array.isArray(competition?.competitors)
      ? competition.competitors
      : [];

  const home =
    competitors.find(
      (item) => item.homeAway === "home"
    ) || null;

  const away =
    competitors.find(
      (item) => item.homeAway === "away"
    ) || null;

  return {
    home,
    away,
  };
}

function normalizeTeam(competitor) {
  if (!competitor) {
    return {
      id: null,
      name: null,
      abbreviation: null,
      logo: null,
      score: null,
    };
  }

  const team =
    competitor.team || competitor;

  return {
    id: clean(team.id || competitor.id),

    name: teamName(team),

    abbreviation: clean(
      team.abbreviation ||
        competitor.abbreviation
    ),

    logo: teamLogo(team),

    score: number(
      competitor.score
    ),
  };
}

function normalizePlay(play) {
  if (!play) return null;

  const typeText = String(
    play.type?.text ||
      play.type?.name ||
      play.type ||
      ""
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
    typeText.includes("tempo")
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
    typeText.includes("interruption") ||
    typeText.includes("interruzione")
  ) {
    type = "interruzione";
  }

  const competitor =
    play.competitor || null;

  const athlete =
    play.athlete ||
    play.player ||
    null;

  let playerIn = null;
  let playerOut = null;

  if (play.substitution) {
    playerIn =
      play.substitution.playerIn || null;

    playerOut =
      play.substitution.playerOut || null;
  }

  if (play.playerIn) {
    playerIn = play.playerIn;
  }

  if (play.playerOut) {
    playerOut = play.playerOut;
  }

  function personName(value) {
    if (!value) return null;

    if (typeof value === "string") {
      return clean(value);
    }

    return clean(
      value.displayName ||
        value.fullName ||
        value.name ||
        value.athlete?.displayName
    );
  }

  return {
    id: clean(play.id),

    type,

    minute: clean(
      play.clock?.displayValue ||
        play.clock ||
        play.minute
    ),

    team: personName(
      competitor?.team ||
        play.team
    ),

    player: personName(athlete),

    assist: personName(
      play.assist
    ),

    playerIn: personName(
      playerIn
    ),

    playerOut: personName(
      playerOut
    ),

    text: clean(
      play.text ||
        play.description
    ),
  };
}

function normalizeStatistics(
  boxscoreTeam,
  teamNameValue
) {
  const stats =
    Array.isArray(
      boxscoreTeam?.statistics
    )
      ? boxscoreTeam.statistics
      : [];

  function find(...names) {
    for (const stat of stats) {
      const label = String(
        stat.name ||
          stat.label ||
          stat.abbreviation ||
          ""
      ).toLowerCase();

      for (const name of names) {
        if (
          label === name ||
          label.includes(name)
        ) {
          return (
            stat.value ??
            stat.displayValue ??
            null
          );
        }
      }
    }

    return null;
  }

  return {
    team: teamNameValue,

    tiri: number(
      find(
        "shots",
        "total shots",
        "tiri"
      )
    ),

    tiriInPorta: number(
      find(
        "shots on target",
        "shots on goal",
        "tiri in porta"
      )
    ),

    possesso: number(
      find(
        "possession",
        "possesso"
      )
    ),

    calciDangolo: number(
      find(
        "corner kicks",
        "corners",
        "calci d'angolo"
      )
    ),

    fuorigioco: number(
      find(
        "offsides",
        "fuorigioco"
      )
    ),

    falli: number(
      find(
        "fouls",
        "falli"
      )
    ),

    cartelliniGialli: number(
      find(
        "yellow cards",
        "cartellini gialli"
      )
    ),

    cartelliniRossi: number(
      find(
        "red cards",
        "cartellini rossi"
      )
    ),

    parate: number(
      find(
        "saves",
        "parades",
        "parate"
      )
    ),

    rigori: number(
      find(
        "penalty kicks",
        "penalties",
        "rigori"
      )
    ),
  };
}

function normalizeLineup(
  competitor
) {
  const roster =
    Array.isArray(
      competitor?.roster
    )
      ? competitor.roster
      : Array.isArray(
          competitor?.lineup
        )
      ? competitor.lineup
      : [];

  const players = roster.map(
    (item) => {
      const athlete =
        item.athlete ||
        item.player ||
        item;

      return {
        id: clean(
          athlete?.id ||
            item.id
        ),

        name: clean(
          athlete?.displayName ||
            athlete?.fullName ||
            athlete?.name
        ),

        jersey: clean(
          item.jersey ||
            athlete?.jersey
        ),

        position: clean(
          item.position?.abbreviation ||
            item.position?.name
        ),

        starter:
          item.starter === true,

        substitute:
          item.substitute === true,
      };
    }
  );

  return {
    formation: clean(
      competitor?.formation ||
        competitor?.lineup?.formation
    ),

    players,
  };
}

async function fetchJSON(url) {
  const controller =
    new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    10000
  );

  try {
    const response =
      await fetch(url, {
        headers: {
          Accept:
            "application/json",
        },
        cache: "no-store",
        signal: controller.signal,
      });

    if (!response.ok) {
      throw new Error(
        `ESPN ${response.status}`
      );
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function findEvent(
  league,
  query,
  date
) {
  let url =
    `${ESPN_BASE_URL}/${league}/scoreboard`;

  const params =
    new URLSearchParams();

  if (date) {
    params.set(
      "dates",
      date.replaceAll("-", "")
    );
  }

  params.set("limit", "100");

  url += `?${params.toString()}`;

  const data =
    await fetchJSON(url);

  const events =
    Array.isArray(data?.events)
      ? data.events
      : [];

  if (!query) {
    return events[0] || null;
  }

  const search =
    query.toLowerCase().trim();

  return (
    events.find((event) => {
      const competitors =
        event.competitions?.[0]
          ?.competitors || [];

      return competitors.some(
        (competitor) => {
          const name =
            teamName(
              competitor.team
            );

          return (
            name &&
            name
              .toLowerCase()
              .includes(search)
          );
        }
      );
    }) || null
  );
}

export async function GET(request) {
  try {
    const { searchParams } =
      new URL(request.url);

    const league =
      searchParams.get(
        "league"
      ) ||
      searchParams.get(
        "competition"
      ) === "serie-a"
        ? "ita.1"
        : "ita.1";

    const eventId =
      searchParams.get("id") ||
      searchParams.get("event") ||
      searchParams.get(
        "matchId"
      );

    const query =
      searchParams.get("q") ||
      searchParams.get("search");

    const date =
      searchParams.get("date");

    let event = null;

    /*
     * ==========================================
     * CERCA PER ID
     * ==========================================
     */

    if (eventId) {
      event =
        await findEvent(
          league,
          null,
          date
        );

      /*
       * Se la partita non è nel
       * primo scoreboard, proviamo
       * direttamente la ricerca
       * su più giorni senza bloccare.
       */

      if (
        !event ||
        String(event.id) !==
          String(eventId)
      ) {
        const scoreboard =
          await fetchJSON(
            `${ESPN_BASE_URL}/${league}/scoreboard?limit=100`
          );

        const events =
          Array.isArray(
            scoreboard?.events
          )
            ? scoreboard.events
            : [];

        event =
          events.find(
            (item) =>
              String(item.id) ===
              String(eventId)
          ) || null;
      }
    }

    /*
     * ==========================================
     * CERCA PER NOME
     * ==========================================
     */

    if (!event && query) {
      event =
        await findEvent(
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
            "Partita non trovata",
          query: query || null,
          eventId:
            eventId || null,
        },
        { status: 404 }
      );
    }

    const actualEventId =
      String(event.id);

    /*
     * ==========================================
     * SUMMARY
     * ==========================================
     */

    const summary =
      await fetchJSON(
        `${ESPN_BASE_URL}/${league}/summary?event=${actualEventId}`
      );

    const competition =
      summary?.header
        ?.competitions?.[0] ||
      summary?.competitions?.[0] ||
      event.competitions?.[0] ||
      null;

    if (!competition) {
      throw new Error(
        "Competizione ESPN non trovata"
      );
    }

    const {
      home,
      away,
    } =
      getEventTeams(
        competition
      );

    const homeTeam =
      normalizeTeam(home);

    const awayTeam =
      normalizeTeam(away);

    /*
     * ==========================================
     * BOX SCORE
     * ==========================================
     */

    const boxscore =
      summary?.boxscore;

    const boxTeams =
      Array.isArray(
        boxscore?.teams
      )
        ? boxscore.teams
        : [];

    const homeBox =
      boxTeams.find(
        (item) =>
          item.homeAway ===
          "home"
      );

    const awayBox =
      boxTeams.find(
        (item) =>
          item.homeAway ===
          "away"
      );

    /*
     * ==========================================
     * DATA E ORA
     * ==========================================
     */

    const rawDate =
      competition.date ||
      event.date ||
      null;

    let dateFormatted = null;
    let timeFormatted = null;

    if (rawDate) {
      const parsed =
        new Date(rawDate);

      if (
        !Number.isNaN(
          parsed.getTime()
        )
      ) {
        dateFormatted =
          parsed.toLocaleDateString(
            "it-IT",
            {
              timeZone:
                "Europe/Rome",
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            }
          );

        timeFormatted =
          parsed.toLocaleTimeString(
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
     * ==========================================
     * EVENTI
     * ==========================================
     */

    const plays =
      Array.isArray(
        summary?.plays
      )
        ? summary.plays
        : [];

    const events =
      plays
        .map(normalizePlay)
        .filter(Boolean);

    /*
     * ==========================================
     * TV
     * ==========================================
     */

    const tv = [];

    const broadcasts = [
      ...(Array.isArray(
        summary?.broadcasts
      )
        ? summary.broadcasts
        : []),

      ...(Array.isArray(
        competition?.broadcasts
      )
        ? competition.broadcasts
        : []),
    ];

    for (const broadcast of broadcasts) {
      const names = [
        broadcast?.name,
        broadcast?.shortName,
        broadcast?.media?.name,
        broadcast?.media?.shortName,
      ];

      for (const value of names) {
        const cleanValue =
          clean(value);

        if (
          cleanValue &&
          !tv.includes(
            cleanValue
          )
        ) {
          tv.push(
            cleanValue
          );
        }
      }
    }

    /*
     * ==========================================
     * VENUE
     * ==========================================
     */

    const venue =
      competition.venue ||
      null;

    /*
     * ==========================================
     * RISPOSTA
     * ==========================================
     */

    const response = {
      success: true,

      source: "ESPN",

      timezone:
        "Europe/Rome",

      competition: {
        id: clean(
          competition.id
        ),

        name: clean(
          competition.league
            ?.name ||
            event.league
              ?.name ||
            "Serie A"
        ),

        espnLeague:
          league,

        season: clean(
          competition.season
            ?.year ||
            event.season
              ?.year
        ),
      },

      match: {
        id:
          actualEventId,

        date:
          dateFormatted ||
          rawDate,

        time:
          timeFormatted,

        home:
          homeTeam,

        away:
          awayTeam,

        status:
          normalizeStatus(
            competition
          ),
      },

      lineups: {
        home:
          normalizeLineup(
            home
          ),

        away:
          normalizeLineup(
            away
          ),
      },

      statistics: {
        home:
          normalizeStatistics(
            homeBox,
            homeTeam.name
          ),

        away:
          normalizeStatistics(
            awayBox,
            awayTeam.name
          ),
      },

      penalties: [],

      venue: venue
        ? {
            id:
              clean(
                venue.id
              ),

            name:
              clean(
                venue.fullName ||
                  venue.name
              ),

            city:
              clean(
                venue.address
                  ?.city
              ),

            country:
              clean(
                venue.address
                  ?.country
              ),

            capacity:
              number(
                venue.capacity
              ),
          }
        : null,

      referee: null,

      officials: {
        referee: null,
        assistantReferee1:
          null,
        assistantReferee2:
          null,
        fourthOfficial:
          null,
        var: null,
        avar: null,
      },

      tv,

      mvp: null,

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
          "Errore durante il recupero della partita.",
        details:
          error?.message ||
          "Errore sconosciuto",
      },
      { status: 500 }
    );
  }
      }
