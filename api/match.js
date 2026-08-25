const ESPN_BASE =
  "https://site.api.espn.com/apis/site/v2/sports/soccer";

const DEFAULT_LEAGUE = "ita.1";
const TIMEZONE = "Europe/Rome";

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

function str(value) {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  const result = String(value).trim();

  return result || null;
}

function num(value) {
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

  if (!match) return null;

  const result = Number(
    match[0].replace(",", ".")
  );

  return Number.isFinite(result)
    ? result
    : null;
}

function unique(values) {
  return [
    ...new Set(
      values.filter(Boolean)
    ),
  ];
}

function nameOf(value) {
  if (!value) return null;

  if (typeof value === "string") {
    return str(value);
  }

  return str(
    first(
      value.displayName,
      value.fullName,
      value.shortName,
      value.name,
      value.athlete?.displayName,
      value.athlete?.fullName,
      value.athlete?.name
    )
  );
}

/* =========================================================
   ESPN REQUEST
========================================================= */

async function fetchESPN(url) {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (compatible; 100SerieASerieB/1.0)",
      },
    });

    if (!response.ok) {
      console.error(
        "ESPN HTTP ERROR:",
        response.status,
        url
      );

      return null;
    }

    return await response.json();
  } catch (error) {
    console.error(
      "ESPN REQUEST ERROR:",
      error?.message
    );

    return null;
  }
}

/* =========================================================
   SCOREBOARD
========================================================= */

async function getScoreboard(
  league,
  date
) {
  let url =
    `${ESPN_BASE}/${league}/scoreboard`;

  if (date) {
    const cleanDate =
      String(date)
        .replace(/-/g, "");

    url +=
      `?dates=${encodeURIComponent(
        cleanDate
      )}`;
  }

  return fetchESPN(url);
}

/* =========================================================
   SUMMARY
========================================================= */

async function getSummary(
  league,
  eventId
) {
  const url =
    `${ESPN_BASE}/${league}/summary?event=${encodeURIComponent(
      eventId
    )}`;

  return fetchESPN(url);
}

/* =========================================================
   FIND EVENT
========================================================= */

function findEvent(
  scoreboard,
  eventId
) {
  const events =
    arr(scoreboard?.events);

  return (
    events.find(
      event =>
        String(event.id) ===
        String(eventId)
    ) || null
  );
}

/* =========================================================
   COMPETITION
========================================================= */

function getCompetition(
  event,
  summary
) {
  return (
    summary?.header?.competitions?.[0] ||
    summary?.competitions?.[0] ||
    event?.competitions?.[0] ||
    null
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
      score: null,
    };
  }

  const team =
    competitor.team ||
    competitor;

  return {
    id: str(
      first(
        competitor.id,
        team.id
      )
    ),

    name: nameOf(team),

    abbreviation: str(
      first(
        team.abbreviation,
        competitor.abbreviation
      )
    ),

    logo: str(
      first(
        team.logo,
        team.logos?.[0]?.href,
        competitor.logo,
        competitor.logos?.[0]?.href
      )
    ),

    score: num(
      first(
        competitor.score,
        competitor.score?.value
      )
    ),
  };
}

/* =========================================================
   STATUS
========================================================= */

function normalizeStatus(
  competition,
  event
) {
  const status =
    competition?.status ||
    event?.status ||
    {};

  const type =
    status.type ||
    {};

  const completed =
    Boolean(
      first(
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

    name: str(
      first(
        type.name,
        status.name
      )
    ),

    description: str(
      first(
        type.description,
        status.description
      )
    ),

    detail: str(
      first(
        type.detail,
        status.detail
      )
    ),

    clock: str(
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

function getPlayersFromObject(
  source
) {
  if (!source) return [];

  const candidates = [
    source.lineup?.players,
    source.lineup,
    source.roster?.players,
    source.roster,
    source.players,
  ];

  for (const candidate of candidates) {
    if (arr(candidate).length) {
      return candidate;
    }
  }

  return [];
}

function normalizePlayer(
  player
) {
  if (!player) return null;

  const athlete =
    player.athlete ||
    player.player ||
    player;

  const name =
    nameOf(athlete);

  if (!name) return null;

  const status =
    String(
      first(
        player.status,
        player.type,
        player.role,
        ""
      )
    ).toLowerCase();

  const starter =
    player.starter === true ||
    status.includes("starter");

  const substitute =
    player.substitute === true ||
    status.includes("substitute") ||
    status.includes("bench");

  return {
    id: str(
      first(
        athlete.id,
        player.id
      )
    ),

    name,

    jersey: str(
      first(
        player.jersey,
        athlete.jersey
      )
    ),

    position: str(
      first(
        player.position?.abbreviation,
        player.position?.name,
        athlete.position?.abbreviation,
        athlete.position?.name
      )
    ),

    starter,

    substitute:
      substitute ||
      (!starter && status !== ""),
  };
}

function normalizeLineup(
  competitor
) {
  const rawPlayers =
    getPlayersFromObject(
      competitor
    );

  const players =
    rawPlayers
      .map(normalizePlayer)
      .filter(Boolean);

  let starters =
    players.filter(
      player =>
        player.starter
    );

  let substitutes =
    players.filter(
      player =>
        player.substitute &&
        !player.starter
    );

  /*
   * ESPN può restituire i giocatori
   * senza indicare starter/bench.
   *
   * In quel caso prendiamo i primi 11
   * come titolari e il resto come panchina.
   */

  if (
    starters.length === 0 &&
    players.length >= 11
  ) {
    starters =
      players.slice(0, 11);

    substitutes =
      players.slice(11);
  }

  return {
    formation: str(
      first(
        competitor?.formation,
        competitor?.lineup?.formation,
        competitor?.roster?.formation
      )
    ),

    starters,

    substitutes,

    players,
  };
}

/* =========================================================
   FIND SUMMARY TEAM
========================================================= */

function findTeamData(
  summary,
  teamId,
  homeAway
) {
  const sources = [
    summary?.boxscore?.teams,
    summary?.boxscore?.players,
    summary?.rosters,
    summary?.roster,
    summary?.lineups,
    summary?.header?.competitions?.[0]
      ?.competitors,
  ];

  for (const source of sources) {
    for (const item of arr(source)) {
      const itemTeam =
        item.team ||
        item.competitor ||
        item;

      const id =
        first(
          itemTeam?.id,
          item.id,
          item.team?.id,
          item.competitor?.id
        );

      if (
        teamId &&
        id &&
        String(id) ===
          String(teamId)
      ) {
        return item;
      }

      if (
        homeAway &&
        item.homeAway === homeAway
      ) {
        return item;
      }
    }
  }

  return null;
}

/* =========================================================
   STATISTICS
========================================================= */

function findStatistic(
  statistics,
  names
) {
  const wanted =
    names.map(
      value =>
        String(value)
          .toLowerCase()
          .trim()
    );

  for (const statistic of arr(
    statistics
  )) {
    const label =
      String(
        first(
          statistic.name,
          statistic.label,
          statistic.abbreviation,
          statistic.type,
          statistic.displayName
        ) || ""
      )
        .toLowerCase()
        .trim();

    if (
      wanted.some(
        wantedName =>
          label === wantedName ||
          label.includes(wantedName)
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

function getTeamStatistics(
  team
) {
  if (!team) {
    return {
      team: null,
      shots: null,
      shotsOnTarget: null,
      possession: null,
      corners: null,
      offsides: null,
      fouls: null,
      yellowCards: null,
      redCards: null,
      saves: null,
    };
  }

  const statistics = [
    ...arr(team.statistics),
    ...arr(team.team?.statistics),
  ];

  return {
    team:
      nameOf(
        first(
          team.team,
          team.competitor,
          team
        )
      ),

    shots: num(
      findStatistic(
        statistics,
        [
          "shots",
          "total shots",
          "tiri",
        ]
      )
    ),

    shotsOnTarget: num(
      findStatistic(
        statistics,
        [
          "shots on target",
          "shots on goal",
          "shotsontarget",
          "on target",
          "tiri in porta",
        ]
      )
    ),

    possession: num(
      findStatistic(
        statistics,
        [
          "possession",
          "possesso",
        ]
      )
    ),

    corners: num(
      findStatistic(
        statistics,
        [
          "corner kicks",
          "corners",
          "corner",
          "calci d'angolo",
        ]
      )
    ),

    offsides: num(
      findStatistic(
        statistics,
        [
          "offsides",
          "offside",
          "fuorigioco",
        ]
      )
    ),

    fouls: num(
      findStatistic(
        statistics,
        [
          "fouls",
          "foul",
          "falli",
        ]
      )
    ),

    yellowCards: num(
      findStatistic(
        statistics,
        [
          "yellow cards",
          "yellow",
          "yellowcard",
          "cartellini gialli",
        ]
      )
    ),

    redCards: num(
      findStatistic(
        statistics,
        [
          "red cards",
          "red",
          "redcard",
          "cartellini rossi",
        ]
      )
    ),

    saves: num(
      findStatistic(
        statistics,
        [
          "saves",
          "goalkeeper saves",
          "saves by goalkeeper",
          "parades",
        ]
      )
    ),
  };
}

/* =========================================================
   EVENTS
========================================================= */

function getPlays(summary) {
  const sources = [
    summary?.plays,
    summary?.keyEvents,
    summary?.events,
    summary?.commentary?.plays,
  ];

  for (const source of sources) {
    if (arr(source).length) {
      return source;
    }
  }

  return [];
}

function normalizeEvent(
  play
) {
  if (!play) return null;

  const rawType =
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
    rawType.includes("goal") ||
    rawType.includes("gol")
  ) {
    type = "gol";
  } else if (
    rawType.includes("yellow") ||
    rawType.includes("giallo")
  ) {
    type =
      "cartellino_giallo";
  } else if (
    rawType.includes("red") ||
    rawType.includes("rosso")
  ) {
    type =
      "cartellino_rosso";
  } else if (
    rawType.includes("substitution") ||
    rawType.includes("sostituzione")
  ) {
    type =
      "sostituzione";
  } else if (
    rawType.includes("penalty") ||
    rawType.includes("rigore")
  ) {
    type = "rigore";
  } else if (
    rawType.includes("kickoff") ||
    rawType.includes("start") ||
    rawType.includes("inizio")
  ) {
    type = "inizio";
  } else if (
    rawType.includes("half") ||
    rawType.includes("intervallo")
  ) {
    type = "intervallo";
  } else if (
    rawType.includes("end") ||
    rawType.includes("fine")
  ) {
    type = "fine";
  } else if (
    rawType.includes("injury") ||
    rawType.includes("interruption")
  ) {
    type =
      "interruzione";
  }

  const competition =
    arr(
      play.competitions
    )[0];

  const competitor =
    play.competitor ||
    competition?.competitor ||
    null;

  const athlete =
    play.athlete ||
    play.player ||
    null;

  let playerIn =
    first(
      play.playerIn,
      play.substitution?.playerIn
    );

  let playerOut =
    first(
      play.playerOut,
      play.substitution?.playerOut
    );

  const participants =
    arr(play.participants);

  if (
    type === "sostituzione"
  ) {
    if (!playerIn) {
      const p =
        participants.find(
          participant =>
            participant.type === "in" ||
            participant.role === "in"
        );

      playerIn =
        p?.athlete || p;
    }

    if (!playerOut) {
      const p =
        participants.find(
          participant =>
            participant.type === "out" ||
            participant.role === "out"
        );

      playerOut =
        p?.athlete || p;
    }
  }

  return {
    id: str(play.id),

    type,

    minute: str(
      first(
        play.clock?.displayValue,
        play.clock,
        play.minute
      )
    ),

    team: nameOf(
      first(
        competitor?.team,
        play.team
      )
    ),

    player:
      nameOf(athlete),

    assist:
      nameOf(
        first(
          play.assist,
          play.assist?.athlete
        )
      ),

    playerIn:
      nameOf(playerIn),

    playerOut:
      nameOf(playerOut),

    text: str(
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

function getPenalties(
  summary,
  plays
) {
  const result = [];

  for (const penalty of arr(
    summary?.penalties
  )) {
    result.push({
      minute: str(
        first(
          penalty.clock,
          penalty.minute
        )
      ),

      team: nameOf(
        first(
          penalty.team,
          penalty.competitor
        )
      ),

      player: nameOf(
        first(
          penalty.athlete,
          penalty.player
        )
      ),

      result: str(
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
          : null,
    });
  }

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
        minute: str(
          first(
            play.clock?.displayValue,
            play.clock,
            play.minute
          )
        ),

        team: nameOf(
          first(
            play.competitor?.team,
            play.team
          )
        ),

        player: nameOf(
          first(
            play.athlete,
            play.player
          )
        ),

        result:
          str(play.text),

        scored:
          text.includes("scored") ||
          text.includes("goal") ||
          text.includes("gol")
            ? true
            : text.includes("missed") ||
              text.includes("saved")
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

function getVenue(
  competition,
  event
) {
  const venue =
    first(
      competition?.venue,
      event?.competitions?.[0]?.venue
    );

  if (!venue) return null;

  const address =
    venue.address || {};

  return {
    id: str(venue.id),

    name: str(
      first(
        venue.fullName,
        venue.name
      )
    ),

    city: str(
      address.city
    ),

    country: str(
      first(
        address.country,
        address.countryName
      )
    ),

    capacity:
      num(venue.capacity),

    address: str(
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

function getTV(
  summary,
  competition
) {
  const result = [];

  const sources = [
    ...arr(summary?.broadcasts),
    ...arr(summary?.broadcast),
    ...arr(
      summary?.header?.broadcasts
    ),
    ...arr(
      competition?.broadcasts
    ),
  ];

  for (const broadcast of sources) {
    const values = [
      broadcast?.name,
      broadcast?.shortName,
      broadcast?.market,
      broadcast?.media?.name,
      broadcast?.media?.shortName,
    ];

    for (const value of values) {
      const clean =
        str(value);

      if (clean) {
        result.push(clean);
      }
    }
  }

  return unique(result);
}

/* =========================================================
   OFFICIALS
========================================================= */

function getOfficials(
  summary
) {
  const officials = [
    ...arr(summary?.officials),
    ...arr(
      summary?.competition
        ?.officials
    ),
    ...arr(
      summary?.header
        ?.competitions?.[0]
        ?.officials
    ),
  ];

  const result = {
    referee: null,
    assistantReferee1: null,
    assistantReferee2: null,
    fourthOfficial: null,
    var: null,
    avar: null,
  };

  const names = [];

  for (const official of officials) {
    const name =
      nameOf(
        first(
          official.athlete,
          official.displayName,
          official.fullName,
          official.name
        )
      );

    if (!name) continue;

    names.push(name);

    const role =
      String(
        first(
          official.type?.text,
          official.type?.name,
          official.position,
          official.role,
          ""
        ) || ""
      ).toLowerCase();

    if (
      role.includes("avar") ||
      role.includes("video assistant")
    ) {
      if (!result.avar) {
        result.avar = name;
      }
    } else if (
      role.includes("var")
    ) {
      if (!result.var) {
        result.var = name;
      }
    } else if (
      role.includes("fourth") ||
      role.includes("4th")
    ) {
      if (
        !result.fourthOfficial
      ) {
        result.fourthOfficial =
          name;
      }
    } else if (
      role.includes("assistant") ||
      role.includes("linesman")
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
      if (!result.referee) {
        result.referee = name;
      }
    }
  }

  /*
   * Fallback se ESPN non specifica
   * il ruolo dell'ufficiale.
   */

  const uniqueNames =
    unique(names);

  if (
    !result.referee &&
    uniqueNames[0]
  ) {
    result.referee =
      uniqueNames[0];
  }

  if (
    !result.assistantReferee1 &&
    uniqueNames[1]
  ) {
    result.assistantReferee1 =
      uniqueNames[1];
  }

  if (
    !result.assistantReferee2 &&
    uniqueNames[2]
  ) {
    result.assistantReferee2 =
      uniqueNames[2];
  }

  if (
    !result.fourthOfficial &&
    uniqueNames[3]
  ) {
    result.fourthOfficial =
      uniqueNames[3];
  }

  if (
    !result.var &&
    uniqueNames[4]
  ) {
    result.var =
      uniqueNames[4];
  }

  if (
    !result.avar &&
    uniqueNames[5]
  ) {
    result.avar =
      uniqueNames[5];
  }

  return result;
}

/* =========================================================
   MVP
========================================================= */

function getMVP(
  summary
) {
  const candidates = [
    summary?.playerOfTheMatch,
    summary?.mvp,
    summary?.gameInfo?.mvp,
    summary?.leaders?.[0],
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;

    const athlete =
      candidate.athlete ||
      candidate.player ||
      candidate;

    const name =
      nameOf(athlete);

    if (!name) continue;

    return {
      name,

      team:
        nameOf(
          first(
            candidate.team,
            athlete.team
          )
        ),

      reason:
        str(
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
   DATE
========================================================= */

function formatDateTime(
  value
) {
  if (!value) {
    return {
      date: null,
      time: null,
    };
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return {
      date: str(value),
      time: null,
    };
  }

  return {
    date:
      date.toLocaleDateString(
        "it-IT",
        {
          timeZone:
            TIMEZONE,
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }
      ),

    time:
      date.toLocaleTimeString(
        "it-IT",
        {
          timeZone:
            TIMEZONE,
          hour: "2-digit",
          minute: "2-digit",
        }
      ),
  };
}

/* =========================================================
   MAIN
========================================================= */

module.exports =
  async function handler(
    req,
    res
  ) {
    try {
      const query =
        req.query || {};

      const league =
        query.league ||
        (
          query.competition ===
          "serie-a"
            ? "ita.1"
            : query.competition
        ) ||
        DEFAULT_LEAGUE;

      const eventId =
        query.id ||
        query.event ||
        query.matchId;

      const search =
        query.q ||
        query.search;

      const date =
        query.date;

      if (!eventId && !search) {
        res.status(400).json({
          success: false,
          source: "ESPN",
          error:
            "Inserisci id, event, matchId oppure q/search.",
        });

        return;
      }

      /* -----------------------------------------------------
         1. SCOREBOARD
      ----------------------------------------------------- */

      let scoreboard =
        await getScoreboard(
          league,
          date
        );

      /*
       * Se la ricerca per ID non trova
       * la partita nel giorno specificato,
       * riproviamo senza data.
       */

      if (
        eventId &&
        !findEvent(
          scoreboard,
          eventId
        ) &&
        date
      ) {
        scoreboard =
          await getScoreboard(
            league
          );
      }

      let event =
        eventId
          ? findEvent(
              scoreboard,
              eventId
            )
          : null;

      /* -----------------------------------------------------
         2. SEARCH
      ----------------------------------------------------- */

      if (!event && search) {
        const events =
          arr(
            scoreboard?.events
          );

        const q =
          String(search)
            .toLowerCase()
            .trim();

        event =
          events.find(
            currentEvent => {
              const teams =
                arr(
                  currentEvent
                    ?.competitions?.[0]
                    ?.competitors
                );

              return teams.some(
                competitor => {
                  const team =
                    competitor.team ||
                    competitor;

                  const teamName =
                    String(
                      first(
                        team.displayName,
                        team.name,
                        team.shortDisplayName
                      ) || ""
                    ).toLowerCase();

                  return (
                    teamName.includes(q)
                  );
                }
              );
            }
          ) || null;
      }

      /*
       * IMPORTANTE:
       * se ESPN scoreboard non restituisce
       * l'evento, proviamo comunque summary
       * usando direttamente l'ID.
       */

      let actualEventId =
        event
          ? String(event.id)
          : eventId
          ? String(eventId)
          : null;

      if (!actualEventId) {
        res.status(404).json({
          success: false,
          source: "ESPN",
          error:
            "Partita non trovata",
          query:
            search || null,
          eventId:
            eventId || null,
        });

        return;
      }

      /* -----------------------------------------------------
         3. SUMMARY
      ----------------------------------------------------- */

      let summary =
        await getSummary(
          league,
          actualEventId
        );

      /*
       * Se il summary non risponde ma abbiamo
       * l'evento nello scoreboard, utilizziamo
       * comunque i dati scoreboard.
       */

      if (!event) {
        event =
          findEvent(
            scoreboard,
            actualEventId
          );
      }

      /*
       * -----------------------------------------------------
       * 4. COMPETITION
       * -----------------------------------------------------
       */

      const competition =
        getCompetition(
          event,
          summary
        );

      if (!competition) {
        res.status(404).json({
          success: false,
          source: "ESPN",
          error:
            "Dati della competizione non disponibili.",
          eventId:
            actualEventId,
        });

        return;
      }

      /* -----------------------------------------------------
         5. TEAMS
      ----------------------------------------------------- */

      const competitors =
        arr(
          competition.competitors
        );

      const homeRaw =
        competitors.find(
          item =>
            item.homeAway ===
            "home"
        ) ||
        competitors[0] ||
        null;

      const awayRaw =
        competitors.find(
          item =>
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

      /* -----------------------------------------------------
         6. SUMMARY TEAM DATA
      ----------------------------------------------------- */

      const homeSummary =
        findTeamData(
          summary,
          home.id,
          "home"
        );

      const awaySummary =
        findTeamData(
          summary,
          away.id,
          "away"
        );

      /* -----------------------------------------------------
         7. LINEUPS
      ----------------------------------------------------- */

      const homeLineup =
        normalizeLineup(
          homeSummary ||
          homeRaw
        );

      const awayLineup =
        normalizeLineup(
          awaySummary ||
          awayRaw
        );

      /* -----------------------------------------------------
         8. STATISTICS
      ----------------------------------------------------- */

      let homeStats =
        getTeamStatistics(
          homeSummary
        );

      let awayStats =
        getTeamStatistics(
          awaySummary
        );

      /*
       * Fallback boxscore.
       */

      if (
        !homeStats.shots &&
        summary?.boxscore?.teams
      ) {
        const box =
          arr(
            summary.boxscore.teams
          ).find(
            item =>
              item.homeAway ===
              "home"
          );

        homeStats =
          getTeamStatistics(
            box
          );
      }

      if (
        !awayStats.shots &&
        summary?.boxscore?.teams
      ) {
        const box =
          arr(
            summary.boxscore.teams
          ).find(
            item =>
              item.homeAway ===
              "away"
          );

        awayStats =
          getTeamStatistics(
            box
          );
      }

      homeStats.team =
        home.name;

      awayStats.team =
        away.name;

      /* -----------------------------------------------------
         9. EVENTS
      ----------------------------------------------------- */

      const rawPlays =
        getPlays(
          summary
        );

      const events =
        rawPlays
          .map(
            normalizeEvent
          )
          .filter(Boolean);

      /* -----------------------------------------------------
         10. PENALTIES
      ----------------------------------------------------- */

      const penalties =
        getPenalties(
          summary,
          rawPlays
        );

      /* -----------------------------------------------------
         11. DATE
      ----------------------------------------------------- */

      const dateTime =
        formatDateTime(
          first(
            competition.date,
            event?.date,
            summary?.header
              ?.competitions?.[0]
              ?.date
          )
        );

      /* -----------------------------------------------------
         12. RESPONSE
      ----------------------------------------------------- */

      const response = {
        success: true,

        source: "ESPN",

        timezone:
          TIMEZONE,

        competition: {
          id: str(
            first(
              competition?.league?.id,
              event?.league?.id,
              league
            )
          ),

          name: str(
            first(
              competition?.league?.name,
              event?.league?.name,
              "Italian Serie A"
            )
          ),

          espnLeague:
            league,

          season: str(
            first(
              competition?.season?.year,
              event?.season?.year,
              summary?.header
                ?.season?.year
            )
          ),
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
              num(
                homeRaw?.score
              ),
          },

          away: {
            ...away,

            score:
              away.score ??
              num(
                awayRaw?.score
              ),
          },

          status:
            normalizeStatus(
              competition,
              event
            ),
        },

        lineups: {
          home:
            homeLineup,

          away:
            awayLineup,
        },

        statistics: {
          home:
            homeStats,

          away:
            awayStats,
        },

        penalties,

        venue:
          getVenue(
            competition,
            event
          ),

        officials:
          getOfficials(
            summary
          ),

        tv:
          getTV(
            summary,
            competition
          ),

        mvp:
          getMVP(
            summary
          ),

        events,
      };

      /* -----------------------------------------------------
         13. CACHE
      ----------------------------------------------------- */

      res.setHeader(
        "Cache-Control",
        "s-maxage=15, stale-while-revalidate=30"
      );

      res.status(200).json(
        response
      );
    } catch (error) {
      console.error(
        "MATCH API ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        source: "ESPN",
        error:
          "Errore interno durante il recupero della partita.",
        message:
          error?.message ||
          String(error),
        eventId:
          req.query?.id ||
          req.query?.event ||
          req.query?.matchId ||
          null,
      });
    }
  };
