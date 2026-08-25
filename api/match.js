const ESPN_BASE =
  "https://site.api.espn.com/apis/site/v2/sports/soccer";

const ESPN_CORE =
  "https://sports.core.api.espn.com/v2/sports/soccer/leagues";

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
    value === null ||
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

  const n = Number(
    match[0].replace(",", ".")
  );

  return Number.isFinite(n)
    ? n
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
      value.shortDisplayName,
      value.name,

      value.athlete?.displayName,
      value.athlete?.fullName,
      value.athlete?.shortName,
      value.athlete?.name,

      value.player?.displayName,
      value.player?.fullName,
      value.player?.name
    )
  );
}

/* =========================================================
   ESPN FETCH
========================================================= */

/*
 * IMPORTANTE:
 *
 * La summary ESPN può rispondere 403 da Vercel.
 *
 * NON lanciamo un errore.
 * Restituiamo null e continuiamo usando
 * scoreboard + eventuali endpoint alternativi.
 */

async function fetchESPN(url) {
  try {
    const response = await fetch(url, {
      method: "GET",

      headers: {
        Accept:
          "application/json,text/plain,*/*",

        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",

        "Referer":
          "https://www.espn.com/",

        "Origin":
          "https://www.espn.com/",
      },

      cache: "no-store",
    });

    if (!response.ok) {
      console.error(
        `ESPN HTTP ERROR: ${response.status} ${url}`
      );

      return null;
    }

    return await response.json();

  } catch (error) {
    console.error(
      "ESPN REQUEST ERROR:",
      url,
      error?.message || error
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
        .replaceAll("-", "");

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
  return (
    arr(scoreboard?.events).find(
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
        team.id,
        competitor.id
      )
    ),

    name:
      nameOf(team),

    abbreviation:
      str(
        first(
          team.abbreviation,
          competitor.abbreviation
        )
      ),

    logo:
      str(
        first(
          team.logo,
          team.logos?.[0]?.href,
          competitor.logo,
          competitor.logos?.[0]?.href
        )
      ),

    score:
      num(
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
    status.type || {};

  const completed =
    Boolean(
      first(
        type.completed,
        status.completed,
        false
      )
    );

  let state =
    "scheduled";

  if (completed) {
    state =
      "terminata";

  } else if (
    type.state === "in" ||
    status.state === "in"
  ) {
    state =
      "live";
  }

  return {
    state,

    name:
      str(
        first(
          type.name,
          status.name
        )
      ),

    description:
      str(
        first(
          type.description,
          status.description
        )
      ),

    detail:
      str(
        first(
          type.detail,
          status.detail
        )
      ),

    clock:
      str(
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

function getPlayers(
  competitor
) {
  const sources = [
    competitor?.lineup?.players,
    competitor?.roster?.players,
    competitor?.roster,
    competitor?.players,
  ];

  for (const source of sources) {
    if (arr(source).length > 0) {
      return source;
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

  if (!name) {
    return null;
  }

  const status =
    String(
      first(
        player.status,
        player.role,
        player.type,
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
    id:
      str(
        first(
          athlete.id,
          player.id
        )
      ),

    name,

    jersey:
      str(
        first(
          player.jersey,
          athlete.jersey
        )
      ),

    position:
      str(
        first(
          player.position?.abbreviation,
          player.position?.name,
          athlete.position?.abbreviation,
          athlete.position?.name
        )
      ),

    starter,

    substitute,
  };
}

function normalizeLineup(
  competitor
) {
  const players =
    getPlayers(competitor)
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
   * Se ESPN restituisce i giocatori
   * ma non specifica starter/substitute,
   * prendiamo i primi 11 come titolari.
   */

  if (
    starters.length === 0 &&
    players.length > 0
  ) {
    starters =
      players.slice(0, 11);

    substitutes =
      players.slice(11);
  }

  return {
    formation:
      str(
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
   SUMMARY COMPETITOR
========================================================= */

function findSummaryCompetitor(
  summary,
  teamId
) {
  const sources = [
    summary?.boxscore?.teams,
    summary?.rosters,
    summary?.roster,
    summary?.lineups,
    summary?.header?.competitions?.[0]
      ?.competitors,
  ];

  for (const source of sources) {
    for (const item of arr(source)) {

      const team =
        item.team ||
        item.competitor ||
        item;

      const id =
        first(
          team?.id,
          item?.id,
          item?.team?.id,
          item?.competitor?.id
        );

      if (
        teamId &&
        id &&
        String(id) ===
        String(teamId)
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

  for (
    const statistic
    of arr(statistics)
  ) {

    const label =
      String(
        first(
          statistic.name,
          statistic.label,
          statistic.abbreviation,
          statistic.type,
          ""
        )
      )
        .toLowerCase()
        .trim();

    if (
      wanted.some(
        wantedName =>
          label === wantedName ||
          label.includes(
            wantedName
          )
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
    ...arr(
      team.statistics
    ),

    ...arr(
      team.team?.statistics
    ),
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

    shots:
      num(
        findStatistic(
          statistics,
          [
            "shots",
            "total shots",
            "tiri",
          ]
        )
      ),

    shotsOnTarget:
      num(
        findStatistic(
          statistics,
          [
            "shots on target",
            "shots on goal",
            "shotsontarget",
            "tiri in porta",
          ]
        )
      ),

    possession:
      num(
        findStatistic(
          statistics,
          [
            "possession",
            "possesso",
          ]
        )
      ),

    corners:
      num(
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

    offsides:
      num(
        findStatistic(
          statistics,
          [
            "offsides",
            "fuorigioco",
          ]
        )
      ),

    fouls:
      num(
        findStatistic(
          statistics,
          [
            "fouls",
            "falli",
          ]
        )
      ),

    yellowCards:
      num(
        findStatistic(
          statistics,
          [
            "yellow cards",
            "yellow",
            "cartellini gialli",
          ]
        )
      ),

    redCards:
      num(
        findStatistic(
          statistics,
          [
            "red cards",
            "red",
            "cartellini rossi",
          ]
        )
      ),

    saves:
      num(
        findStatistic(
          statistics,
          [
            "saves",
            "goalkeeper saves",
            "parades",
          ]
        )
      ),
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

  const rawType =
    String(
      first(
        play.type?.text,
        play.type?.name,
        play.type,
        ""
      )
    ).toLowerCase();

  let type =
    "altro";

  if (
    rawType.includes("goal") ||
    rawType.includes("gol")
  ) {
    type =
      "gol";

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
    rawType.includes("kickoff") ||
    rawType.includes("start") ||
    rawType.includes("inizio")
  ) {
    type =
      "inizio";

  } else if (
    rawType.includes("half") ||
    rawType.includes("intervallo")
  ) {
    type =
      "intervallo";

  } else if (
    rawType.includes("end") ||
    rawType.includes("fine")
  ) {
    type =
      "fine";

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
    arr(
      play.participants
    );

  if (
    type ===
    "sostituzione"
  ) {

    if (!playerIn) {
      const p =
        participants.find(
          participant =>
            participant.type ===
              "in" ||
            participant.role ===
              "in"
        );

      playerIn =
        p?.athlete || p;
    }

    if (!playerOut) {
      const p =
        participants.find(
          participant =>
            participant.type ===
              "out" ||
            participant.role ===
              "out"
        );

      playerOut =
        p?.athlete || p;
    }
  }

  return {
    id:
      str(play.id),

    type,

    minute:
      str(
        first(
          play.clock?.displayValue,
          play.clock,
          play.minute
        )
      ),

    team:
      nameOf(
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

    text:
      str(
        first(
          play.text,
          play.description
        )
      ),
  };
}

/* =========================================================
   GET PLAYS
========================================================= */

function getPlays(
  summary
) {
  const sources = [
    summary?.plays,
    summary?.keyEvents,
    summary?.events,
    summary?.commentary?.plays,
  ];

  for (const source of sources) {
    if (
      arr(source).length
    ) {
      return source;
    }
  }

  return [];
}

/* =========================================================
   PENALTIES
========================================================= */

function getPenalties(
  summary,
  plays
) {
  const result = [];

  for (
    const penalty
    of arr(
      summary?.penalties
    )
  ) {
    result.push({
      minute:
        str(
          first(
            penalty.clock,
            penalty.minute
          )
        ),

      team:
        nameOf(
          first(
            penalty.team,
            penalty.competitor
          )
        ),

      player:
        nameOf(
          first(
            penalty.athlete,
            penalty.player
          )
        ),

      result:
        str(
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

  for (
    const play
    of plays
  ) {

    const text =
      String(
        play?.text || ""
      ).toLowerCase();

    if (
      text.includes("penalty") ||
      text.includes("rigore")
    ) {
      result.push({
        minute:
          str(
            first(
              play.clock?.displayValue,
              play.clock,
              play.minute
            )
          ),

        team:
          nameOf(
            first(
              play.competitor?.team,
              play.team
            )
          ),

        player:
          nameOf(
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
      event?.competitions?.[0]
        ?.venue
    );

  if (!venue) {
    return null;
  }

  const address =
    venue.address || {};

  return {
    id:
      str(venue.id),

    name:
      str(
        first(
          venue.fullName,
          venue.name
        )
      ),

    city:
      str(address.city),

    country:
      str(
        first(
          address.country,
          address.countryName
        )
      ),

    capacity:
      num(venue.capacity),

    address:
      str(
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
  const channels = [];

  const sources = [
    ...arr(
      summary?.broadcasts
    ),
    ...arr(
      competition?.broadcasts
    ),
  ];

  for (
    const broadcast
    of sources
  ) {

    const values = [
      broadcast?.name,
      broadcast?.shortName,
      broadcast?.market,
      broadcast?.media?.name,
      broadcast?.media?.shortName,
    ];

    for (
      const value
      of values
    ) {
      const clean =
        str(value);

      if (clean) {
        channels.push(clean);
      }
    }
  }

  return unique(
    channels
  );
}

/* =========================================================
   DATE
========================================================= */

function formatDateTime(
  date
) {
  if (!date) {
    return {
      date: null,
      time: null,
    };
  }

  const d =
    new Date(date);

  if (
    Number.isNaN(
      d.getTime()
    )
  ) {
    return {
      date: str(date),
      time: null,
    };
  }

  return {
    date:
      d.toLocaleDateString(
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
      d.toLocaleTimeString(
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
   OPTIONAL CORE API
========================================================= */

/*
 * Questi endpoint sono usati SOLO come fallback.
 *
 * Se ESPN summary è 403, proviamo a recuperare
 * le informazioni dettagliate dal Core API.
 */

async function getCore(
  url
) {
  try {
    const response =
      await fetch(url, {
        headers: {
          Accept:
            "application/json",
          "User-Agent":
            "Mozilla/5.0 100SerieASerieB",
        },
        cache: "no-store",
      });

    if (!response.ok) {
      console.error(
        `ESPN CORE ERROR: ${response.status} ${url}`
      );

      return null;
    }

    return await response.json();

  } catch (error) {
    console.error(
      "ESPN CORE REQUEST ERROR:",
      error?.message || error
    );

    return null;
  }
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
        query.competition ||
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

      /*
       * -----------------------------------------------------
       * VALIDAZIONE
       * -----------------------------------------------------
       */

      if (
        !eventId &&
        !search
      ) {
        res.status(400).json({
          success: false,
          source: "ESPN",
          error:
            "Inserisci id, event, matchId oppure q/search.",
        });

        return;
      }

      /*
       * -----------------------------------------------------
       * SCOREBOARD
       * -----------------------------------------------------
       */

      let scoreboard =
        await getScoreboard(
          league,
          date
        );

      /*
       * Se non abbiamo specificato
       * la data, proviamo anche il
       * calendario senza data.
       */

      if (
        !scoreboard
      ) {
        scoreboard =
          await getScoreboard(
            league
          );
      }

      /*
       * -----------------------------------------------------
       * EVENTO
       * -----------------------------------------------------
       */

      let event =
        findEvent(
          scoreboard,
          eventId
        );

      /*
       * -----------------------------------------------------
       * RICERCA PER NOME
       * -----------------------------------------------------
       */

      if (
        !event &&
        search
      ) {

        const q =
          String(search)
            .toLowerCase()
            .trim();

        event =
          arr(
            scoreboard?.events
          ).find(
            currentEvent => {

              const competitors =
                arr(
                  currentEvent
                    ?.competitions?.[0]
                    ?.competitors
                );

              return competitors.some(
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
                    )
                      .toLowerCase();

                  return (
                    teamName.includes(q)
                  );
                }
              );
            }
          ) || null;
      }

      /*
       * -----------------------------------------------------
       * PARTITA NON TROVATA
       * -----------------------------------------------------
       */

      if (!event) {

        res.status(404).json({
          success: false,
          source: "ESPN",
          error:
            "Partita non trovata",
          query:
            search || null,
          eventId:
            eventId || null,
          league,
        });

        return;
      }

      const actualEventId =
        String(event.id);

      /*
       * -----------------------------------------------------
       * SUMMARY
       * -----------------------------------------------------
       *
       * ATTENZIONE:
       * Se ESPN risponde 403, summary = null.
       * NON mandiamo 500.
       *
       * Il match continua a funzionare.
       */

      const summary =
        await getSummary(
          league,
          actualEventId
        );

      /*
       * -----------------------------------------------------
       * COMPETITION
       * -----------------------------------------------------
       */

      const competition =
        getCompetition(
          event,
          summary
        );

      const competitors =
        arr(
          competition?.competitors
        );

      const homeRaw =
        competitors.find(
          c =>
            c.homeAway ===
            "home"
        ) ||
        competitors[0] ||
        null;

      const awayRaw =
        competitors.find(
          c =>
            c.homeAway ===
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
       * LINEUPS
       * -----------------------------------------------------
       */

      const homeSummary =
        summary
          ? findSummaryCompetitor(
              summary,
              home.id
            )
          : null;

      const awaySummary =
        summary
          ? findSummaryCompetitor(
              summary,
              away.id
            )
          : null;

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

      /*
       * -----------------------------------------------------
       * STATISTICHE
       * -----------------------------------------------------
       */

      const homeBox =
        summary
          ? summary?.boxscore
              ?.teams
              ?.find(
                team =>
                  team.homeAway ===
                  "home"
              )
          : null;

      const awayBox =
        summary
          ? summary?.boxscore
              ?.teams
              ?.find(
                team =>
                  team.homeAway ===
                  "away"
              )
          : null;

      let homeStats =
        getTeamStatistics(
          homeBox
        );

      let awayStats =
        getTeamStatistics(
          awayBox
        );

      if (
        !homeStats.shots &&
        homeSummary
      ) {
        homeStats =
          getTeamStatistics(
            homeSummary
          );
      }

      if (
        !awayStats.shots &&
        awaySummary
      ) {
        awayStats =
          getTeamStatistics(
            awaySummary
          );
      }

      /*
       * -----------------------------------------------------
       * CORE STATS FALLBACK
       * -----------------------------------------------------
       */

      if (
        !homeStats.shots &&
        home.id
      ) {

        const coreHome =
          await getCore(
            `${ESPN_CORE}/${league}/events/${actualEventId}/competitions/${actualEventId}/competitors/${home.id}/statistics?limit=100`
          );

        if (coreHome) {
          homeStats =
            getTeamStatistics({
              team: home,
              statistics:
                coreHome.items ||
                coreHome.statistics ||
                [],
            });
        }
      }

      if (
        !awayStats.shots &&
        away.id
      ) {

        const coreAway =
          await getCore(
            `${ESPN_CORE}/${league}/events/${actualEventId}/competitions/${actualEventId}/competitors/${away.id}/statistics?limit=100`
          );

        if (coreAway) {
          awayStats =
            getTeamStatistics({
              team: away,
              statistics:
                coreAway.items ||
                coreAway.statistics ||
                [],
            });
        }
      }

      homeStats.team =
        home.name;

      awayStats.team =
        away.name;

      /*
       * -----------------------------------------------------
       * EVENTI
       * -----------------------------------------------------
       */

      const rawPlays =
        summary
          ? getPlays(summary)
          : [];

      const events =
        rawPlays
          .map(
            normalizeEvent
          )
          .filter(Boolean);

      /*
       * -----------------------------------------------------
       * RIGORI
       * -----------------------------------------------------
       */

      const penalties =
        summary
          ? getPenalties(
              summary,
              rawPlays
            )
          : [];

      /*
       * -----------------------------------------------------
       * DATA / ORA
       * -----------------------------------------------------
       */

      const dateTime =
        formatDateTime(
          first(
            competition?.date,
            event?.date
          )
        );

      /*
       * -----------------------------------------------------
       * RISPOSTA
       * -----------------------------------------------------
       */

      const response = {

        success: true,

        source: "ESPN",

        timezone:
          TIMEZONE,

        /*
         * Indica chiaramente se ESPN
         * ha concesso la summary.
         */

        summaryAvailable:
          Boolean(summary),

        competition: {

          id:
            str(
              first(
                competition?.league?.id,
                event?.league?.id,
                league
              )
            ),

          name:
            str(
              first(
                competition?.league?.name,
                event?.league?.name,
                "Italian Serie A"
              )
            ),

          espnLeague:
            league,

          season:
            str(
              first(
                competition?.season?.year,
                event?.season?.year
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

        tv:
          getTV(
            summary,
            competition
          ),

        mvp:
          null,

        events,
      };

      /*
       * -----------------------------------------------------
       * CACHE
       * -----------------------------------------------------
       */

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
