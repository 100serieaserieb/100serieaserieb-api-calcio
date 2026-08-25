const {
  getMatchSummary,
  getScoreboard,
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
      value.shortName ||
      value.name
  );
}

/* =========================================================
   TEAM
========================================================= */

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
    competitor.team ||
    competitor;

  const rawName =
    team.displayName ||
    team.fullName ||
    team.name ||
    team.shortDisplayName ||
    team.abbreviation ||
    null;

  return {
    id: clean(
      team.id ||
        competitor.id
    ),

    name: normalizeTeamName(
      rawName
    ),

    abbreviation: clean(
      team.abbreviation ||
        competitor.abbreviation
    ),

    logo: clean(
      team.logo ||
        team.logos?.[0]?.href ||
        competitor.logo ||
        competitor.logos?.[0]?.href
    ),

    score: number(
      competitor.score
    ),
  };
}

/* =========================================================
   STATUS
========================================================= */

function normalizeStatus(
  competition
) {
  const status =
    competition?.status ||
    {};

  const type =
    status.type ||
    {};

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
        status.name
    ),

    description: clean(
      type.description ||
        status.description
    ),

    detail: clean(
      type.detail ||
        status.detail
    ),

    clock: clean(
      status.displayClock ||
        status.clock
    ),

    completed:
      type.completed === true ||
      status.completed === true,
  };
}

/* =========================================================
   EVENTS
========================================================= */

function normalizeEvent(play) {
  if (!play) {
    return null;
  }

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
    typeText.includes("half") ||
    typeText.includes("tempo")
  ) {
    type = "intervallo";
  } else if (
    typeText.includes("kickoff") ||
    typeText.includes("inizio")
  ) {
    type = "inizio";
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
    play.competitor ||
    play.competitions?.[0]
      ?.competitor ||
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
    typeof playerIn === "object"
  ) {
    playerIn = name(playerIn);
  }

  if (
    typeof playerOut === "object"
  ) {
    playerOut = name(playerOut);
  }

  return {
    id: clean(play.id),

    type,

    minute: clean(
      play.clock?.displayValue ||
        play.clock ||
        play.minute
    ),

    team: normalizeTeamName(
      name(
        competitor?.team ||
          play.team
      )
    ),

    player: name(athlete),

    assist: name(
      play.assist?.athlete ||
        play.assist
    ),

    playerIn: clean(
      playerIn
    ),

    playerOut: clean(
      playerOut
    ),

    text: clean(
      play.text ||
        play.description
    ),
  };
}

/* =========================================================
   LINEUPS
========================================================= */

function normalizeLineup(
  competitor
) {
  if (!competitor) {
    return {
      formation: null,
      starters: [],
      substitutes: [],
      players: [],
    };
  }

  const players = array(
    competitor.roster ||
      competitor.lineup?.players ||
      competitor.players
  );

  const normalized =
    players
      .map((player) => {
        const athlete =
          player.athlete ||
          player.player ||
          player;

        const playerName =
          name(athlete);

        if (!playerName) {
          return null;
        }

        return {
          id: clean(
            athlete.id ||
              player.id
          ),

          name: playerName,

          jersey: clean(
            player.jersey ||
              athlete.jersey
          ),

          position: clean(
            player.position
              ?.abbreviation ||
              player.position?.name ||
              athlete.position
                ?.abbreviation
          ),

          starter:
            player.starter === true,

          substitute:
            player.substitute === true,
        };
      })
      .filter(Boolean);

  return {
    formation: clean(
      competitor.formation ||
        competitor.lineup?.formation
    ),

    starters:
      normalized.filter(
        (player) =>
          player.starter
      ),

    substitutes:
      normalized.filter(
        (player) =>
          player.substitute
      ),

    players:
      normalized,
  };
}

/* =========================================================
   STATISTICS
========================================================= */

function statistic(
  stats,
  names
) {
  for (const stat of array(stats)) {
    const statName =
      String(
        stat.name ||
          stat.label ||
          stat.abbreviation ||
          ""
      ).toLowerCase();

    for (
      const wanted of names
    ) {
      if (
        statName === wanted ||
        statName.includes(wanted)
      ) {
        return number(
          stat.displayValue ??
            stat.value
        );
      }
    }
  }

  return null;
}

function normalizeStatistics(
  boxscoreTeam,
  teamName
) {
  const stats = array(
    boxscoreTeam?.statistics
  );

  return {
    team: teamName,

    shots: statistic(
      stats,
      [
        "shots",
        "total shots",
        "tiri",
      ]
    ),

    shotsOnTarget:
      statistic(
        stats,
        [
          "shots on target",
          "shots on goal",
          "tiri in porta",
        ]
      ),

    possession:
      statistic(
        stats,
        [
          "possession",
          "possesso",
        ]
      ),

    corners:
      statistic(
        stats,
        [
          "corner kicks",
          "corners",
          "calci d'angolo",
        ]
      ),

    offsides:
      statistic(
        stats,
        [
          "offsides",
          "fuorigioco",
        ]
      ),

    fouls:
      statistic(
        stats,
        [
          "fouls",
          "falli",
        ]
      ),

    yellowCards:
      statistic(
        stats,
        [
          "yellow cards",
          "cartellini gialli",
        ]
      ),

    redCards:
      statistic(
        stats,
        [
          "red cards",
          "cartellini rossi",
        ]
      ),

    saves:
      statistic(
        stats,
        [
          "saves",
          "parades",
          "parata",
        ]
      ),
  };
}

/* =========================================================
   DATE
========================================================= */

function formatDate(
  value
) {
  if (!value) {
    return null;
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return clean(value);
  }

  return date.toLocaleDateString(
    "it-IT",
    {
      timeZone:
        "Europe/Rome",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }
  );
}

function formatTime(
  value
) {
  if (!value) {
    return null;
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return date.toLocaleTimeString(
    "it-IT",
    {
      timeZone:
        "Europe/Rome",
      hour: "2-digit",
      minute: "2-digit",
    }
  );
}

/* =========================================================
   FIND EVENT BY TEAM
========================================================= */

async function findEvent(
  league,
  query,
  date
) {
  const data =
    await getScoreboard(
      league,
      date
    );

  const events =
    array(data?.events);

  if (!query) {
    return (
      events[0] ||
      null
    );
  }

  const search =
    query
      .toLowerCase()
      .trim();

  return (
    events.find(
      (event) => {
        const competitors =
          array(
            event
              .competitions?.[0]
              ?.competitors
          );

        return competitors.some(
          (competitor) => {
            const team =
              competitor.team ||
              competitor;

            const teamName =
              String(
                team.displayName ||
                  team.fullName ||
                  team.name ||
                  ""
              ).toLowerCase();

            return teamName.includes(
              search
            );
          }
        );
      }
    ) || null
  );
}

/* =========================================================
   MAIN VERCEL FUNCTION
========================================================= */

module.exports =
  async function handler(
    req,
    res
  ) {
    /*
     * CORS
     */

    res.setHeader(
      "Access-Control-Allow-Origin",
      "*"
    );

    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, OPTIONS"
    );

    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type"
    );

    if (
      req.method ===
      "OPTIONS"
    ) {
      return res
        .status(200)
        .end();
    }

    if (
      req.method !== "GET"
    ) {
      return res
        .status(405)
        .json({
          success: false,
          error:
            "Metodo non consentito",
        });
    }

    try {
      const league =
        req.query.league ||
        (
          req.query.competition ===
          "serie-a"
            ? "ita.1"
            : req.query.competition
        ) ||
        "ita.1";

      const eventId =
        req.query.id ||
        req.query.event ||
        req.query.matchId;

      const query =
        req.query.q ||
        req.query.search;

      const date =
        req.query.date;

      let summary = null;
      let actualEventId =
        eventId
          ? String(eventId)
          : null;

      /*
       * =====================================================
       * 1. RICHIESTA DIRETTA TRAMITE ID
       * =====================================================
       */

      if (actualEventId) {
        try {
          summary =
            await getMatchSummary(
              league,
              actualEventId
            );
        } catch (error) {
          console.error(
            "ESPN SUMMARY ERROR:",
            error.message
          );

          return res
            .status(502)
            .json({
              success: false,
              source: "ESPN",
              error:
                "Impossibile recuperare i dati della partita da ESPN.",
              message:
                error.message,
              eventId:
                actualEventId,
            });
        }
      }

      /*
       * =====================================================
       * 2. RICERCA PER SQUADRA
       * =====================================================
       */

      if (
        !summary &&
        query
      ) {
        const event =
          await findEvent(
            league,
            query,
            date
          );

        if (!event) {
          return res
            .status(404)
            .json({
              success: false,
              source: "ESPN",
              error:
                "Partita non trovata",
              query,
              eventId: null,
            });
        }

        actualEventId =
          String(event.id);

        summary =
          await getMatchSummary(
            league,
            actualEventId
          );
      }

      /*
       * =====================================================
       * 3. NESSUN ID E NESSUNA RICERCA
       * =====================================================
       */

      if (!summary) {
        return res
          .status(400)
          .json({
            success: false,
            source: "ESPN",
            error:
              "Inserisci un id partita oppure una squadra da cercare.",
            query:
              query || null,
            eventId:
              eventId || null,
          });
      }

      /*
       * =====================================================
       * 4. COMPETITION
       * =====================================================
       */

      const competition =
        summary.header
          ?.competitions?.[0] ||
        summary.competitions?.[0] ||
        null;

      if (!competition) {
        return res
          .status(502)
          .json({
            success: false,
            source: "ESPN",
            error:
              "ESPN non ha restituito i dati della competizione.",
            eventId:
              actualEventId,
          });
      }

      /*
       * =====================================================
       * 5. SQUADRE
       * =====================================================
       */

      const competitors =
        array(
          competition.competitors
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
       * =====================================================
       * 6. BOXSCORE
       * =====================================================
       */

      const boxscoreTeams =
        array(
          summary.boxscore
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

      /*
       * =====================================================
       * 7. DATA / ORA
       * =====================================================
       */

      const matchDate =
        competition.date ||
        summary.header
          ?.competitions?.[0]
          ?.date ||
        null;

      /*
       * =====================================================
       * 8. EVENTS
       * =====================================================
       */

      const events =
        array(
          summary.plays
        )
          .map(
            normalizeEvent
          )
          .filter(Boolean);

      /*
       * =====================================================
       * 9. TV
       * =====================================================
       */

      const tv =
        array(
          summary.broadcasts
        )
          .map(
            (item) =>
              clean(
                item.name ||
                  item.shortName ||
                  item.media?.name
              )
          )
          .filter(Boolean);

      /*
       * =====================================================
       * 10. RESPONSE
       * =====================================================
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
              summary.header
                ?.league
                ?.name ||
              "Serie A"
          ),

          espnLeague:
            league,

          season: clean(
            competition.season
              ?.year ||
              summary.header
                ?.season
                ?.year
          ),
        },

        match: {
          id:
            actualEventId,

          date:
            formatDate(
              matchDate
            ),

          time:
            formatTime(
              matchDate
            ),

          home,

          away,

          status:
            normalizeStatus(
              competition
            ),
        },

        lineups: {
          home:
            normalizeLineup(
              homeRaw
            ),

          away:
            normalizeLineup(
              awayRaw
            ),
        },

        statistics: {
          home:
            normalizeStatistics(
              homeBox,
              home.name
            ),

          away:
            normalizeStatistics(
              awayBox,
              away.name
            ),
        },

        penalties:
          array(
            summary.penalties
          ),

        venue:
          competition.venue
            ? {
                id: clean(
                  competition
                    .venue.id
                ),

                name: clean(
                  competition
                    .venue
                    .fullName ||
                    competition
                      .venue.name
                ),

                city: clean(
                  competition
                    .venue
                    .address
                    ?.city
                ),

                country:
                  clean(
                    competition
                      .venue
                      .address
                      ?.country
                  ),

                capacity:
                  number(
                    competition
                      .venue
                      .capacity
                  ),
              }
            : null,

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

      /*
       * =====================================================
       * 11. OFFICIALS
       * =====================================================
       */

      const officials =
        array(
          summary.officials
        );

      officials.forEach(
        (official) => {
          const officialName =
            name(
              official.athlete ||
                official
            );

          if (!officialName) {
            return;
          }

          const role =
            String(
              official.type?.text ||
                official.type?.name ||
                official.role ||
                ""
            ).toLowerCase();

          if (
            role.includes(
              "assistant"
            )
          ) {
            if (
              !response
                .officials
                .assistantReferee1
            ) {
              response
                .officials
                .assistantReferee1 =
                officialName;
            } else if (
              !response
                .officials
                .assistantReferee2
            ) {
              response
                .officials
                .assistantReferee2 =
                officialName;
            }
          } else if (
            role.includes(
              "fourth"
            )
          ) {
            response
              .officials
              .fourthOfficial =
              officialName;
          } else if (
            role.includes(
              "avar"
            )
          ) {
            response
              .officials
              .avar =
              officialName;
          } else if (
            role.includes(
              "var"
            )
          ) {
            response
              .officials
              .var =
              officialName;
          } else if (
            role.includes(
              "referee"
            )
          ) {
            response
              .officials
              .referee =
              officialName;
          }
        }
      );

      /*
       * =====================================================
       * 12. CACHE
       * =====================================================
       */

      res.setHeader(
        "Cache-Control",
        "s-maxage=15, stale-while-revalidate=30"
      );

      /*
       * =====================================================
       * 13. OK
       * =====================================================
       */

      return res
        .status(200)
        .json(response);

    } catch (error) {
      console.error(
        "MATCH API ERROR:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,
          source: "ESPN",
          error:
            "Errore interno durante il recupero della partita.",
          message:
            error?.message ||
            null,
        });
    }
  };
