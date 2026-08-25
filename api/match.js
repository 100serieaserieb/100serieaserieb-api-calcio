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
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  const result =
    String(value).trim();

  return result || null;
}

function toNumber(value) {
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

  const match =
    String(value).match(
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

  const originalName =
    team.displayName ||
    team.name ||
    team.shortDisplayName ||
    team.abbreviation ||
    null;

  return {
    id: clean(
      team.id ||
        competitor.id
    ),

    name:
      normalizeTeamName(
        originalName
      ),

    abbreviation:
      clean(
        team.abbreviation ||
          competitor.abbreviation
      ),

    logo:
      clean(
        team.logo ||
          team.logos?.[0]?.href ||
          competitor.logo ||
          competitor.logos?.[0]?.href
      ),

    score:
      toNumber(
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
    competition?.status || {};

  const type =
    status.type || {};

  let state =
    "programmata";

  if (
    type.completed === true
  ) {
    state = "terminata";
  } else if (
    type.state === "in"
  ) {
    state = "live";
  }

  return {
    state,

    name:
      clean(type.name),

    description:
      clean(type.description),

    detail:
      clean(type.detail),

    clock:
      clean(
        status.displayClock ||
          status.clock
      ),

    completed:
      type.completed === true,
  };
}

/* =========================================================
   DATE / TIME
========================================================= */

function formatDateTime(
  rawDate
) {
  if (!rawDate) {
    return {
      date: null,
      time: null,
    };
  }

  const date =
    new Date(rawDate);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return {
      date: clean(rawDate),
      time: null,
    };
  }

  return {
    date:
      date.toLocaleDateString(
        "it-IT",
        {
          timeZone:
            "Europe/Rome",
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
            "Europe/Rome",
          hour: "2-digit",
          minute: "2-digit",
        }
      ),
  };
}

/* =========================================================
   PLAYER NAME
========================================================= */

function playerName(
  player
) {
  if (!player) {
    return null;
  }

  if (
    typeof player ===
    "string"
  ) {
    return clean(player);
  }

  const athlete =
    player.athlete ||
    player.player ||
    player;

  return clean(
    athlete.displayName ||
      athlete.fullName ||
      athlete.name ||
      athlete.shortName
  );
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
      play.type?.text ||
        play.type?.name ||
        play.type ||
        ""
    ).toLowerCase();

  let type =
    "altro";

  if (
    typeText.includes(
      "goal"
    ) ||
    typeText.includes(
      "gol"
    )
  ) {
    type = "gol";
  } else if (
    typeText.includes(
      "yellow"
    ) ||
    typeText.includes(
      "giallo"
    )
  ) {
    type =
      "cartellino_giallo";
  } else if (
    typeText.includes(
      "red"
    ) ||
    typeText.includes(
      "rosso"
    )
  ) {
    type =
      "cartellino_rosso";
  } else if (
    typeText.includes(
      "substitution"
    ) ||
    typeText.includes(
      "sostituzione"
    )
  ) {
    type =
      "sostituzione";
  } else if (
    typeText.includes(
      "kickoff"
    ) ||
    typeText.includes(
      "inizio"
    )
  ) {
    type = "inizio";
  } else if (
    typeText.includes(
      "half"
    ) ||
    typeText.includes(
      "tempo"
    )
  ) {
    type =
      "intervallo";
  } else if (
    typeText.includes(
      "end"
    ) ||
    typeText.includes(
      "fine"
    )
  ) {
    type = "fine";
  } else if (
    typeText.includes(
      "penalty"
    ) ||
    typeText.includes(
      "rigore"
    )
  ) {
    type = "rigore";
  } else if (
    typeText.includes(
      "interruption"
    ) ||
    typeText.includes(
      "interruzione"
    )
  ) {
    type =
      "interruzione";
  }

  const competitor =
    play.competitor ||
    array(
      play.competitions
    )[0] ||
    null;

  let playerIn =
    play.playerIn ||
    play.substitution
      ?.playerIn ||
    null;

  let playerOut =
    play.playerOut ||
    play.substitution
      ?.playerOut ||
    null;

  return {
    id:
      clean(play.id),

    type,

    minute:
      clean(
        play.clock
          ?.displayValue ||
          play.clock ||
          play.minute
      ),

    team:
      playerName(
        competitor?.team ||
          play.team
      ),

    player:
      playerName(
        play.athlete ||
          play.player
      ),

    assist:
      playerName(
        play.assist
      ),

    playerIn:
      playerName(
        playerIn
      ),

    playerOut:
      playerName(
        playerOut
      ),

    text:
      clean(
        play.text ||
          play.description
      ),
  };
}

/* =========================================================
   STATISTICS
========================================================= */

function getStatistic(
  statistics,
  names
) {
  const wanted =
    names.map(
      (name) =>
        String(
          name
        ).toLowerCase()
    );

  for (
    const statistic of array(
      statistics
    )
  ) {
    const label =
      String(
        statistic.name ||
          statistic.label ||
          statistic.abbreviation ||
          ""
      ).toLowerCase();

    if (
      wanted.some(
        (name) =>
          label === name ||
          label.includes(name)
      )
    ) {
      return (
        statistic.value ??
        statistic.displayValue ??
        null
      );
    }
  }

  return null;
}

function normalizeStatistics(
  boxscoreTeam,
  teamNameValue
) {
  const statistics =
    array(
      boxscoreTeam
        ?.statistics
    );

  return {
    team:
      teamNameValue,

    tiri:
      toNumber(
        getStatistic(
          statistics,
          [
            "shots",
            "total shots",
            "tiri",
          ]
        )
      ),

    tiriInPorta:
      toNumber(
        getStatistic(
          statistics,
          [
            "shots on target",
            "shots on goal",
            "tiri in porta",
          ]
        )
      ),

    possesso:
      toNumber(
        getStatistic(
          statistics,
          [
            "possession",
            "possesso",
          ]
        )
      ),

    calciDangolo:
      toNumber(
        getStatistic(
          statistics,
          [
            "corner kicks",
            "corners",
            "calci d'angolo",
          ]
        )
      ),

    fuorigioco:
      toNumber(
        getStatistic(
          statistics,
          [
            "offsides",
            "fuorigioco",
          ]
        )
      ),

    falli:
      toNumber(
        getStatistic(
          statistics,
          [
            "fouls",
            "falli",
          ]
        )
      ),

    cartelliniGialli:
      toNumber(
        getStatistic(
          statistics,
          [
            "yellow cards",
            "cartellini gialli",
          ]
        )
      ),

    cartelliniRossi:
      toNumber(
        getStatistic(
          statistics,
          [
            "red cards",
            "cartellini rossi",
          ]
        )
      ),

    parate:
      toNumber(
        getStatistic(
          statistics,
          [
            "saves",
            "parades",
            "parate",
          ]
        )
      ),

    rigori:
      toNumber(
        getStatistic(
          statistics,
          [
            "penalty kicks",
            "penalties",
            "rigori",
          ]
        )
      ),
  };
}

/* =========================================================
   LINEUPS
========================================================= */

function normalizeLineup(
  competitor
) {
  const roster =
    array(
      competitor?.roster
    );

  const players =
    roster
      .map(
        (item) => {
          const athlete =
            item.athlete ||
            item.player ||
            item;

          return {
            id:
              clean(
                athlete.id ||
                  item.id
              ),

            name:
              clean(
                athlete.displayName ||
                  athlete.fullName ||
                  athlete.name
              ),

            jersey:
              clean(
                item.jersey ||
                  athlete.jersey
              ),

            position:
              clean(
                item.position
                  ?.abbreviation ||
                  item.position
                    ?.name
              ),

            starter:
              item.starter ===
              true,

            substitute:
              item.substitute ===
              true,
          };
        }
      )
      .filter(
        (player) =>
          player.name
      );

  return {
    formation:
      clean(
        competitor?.formation
      ),

    players,
  };
}

/* =========================================================
   FIND EVENT
========================================================= */

async function findEventById(
  league,
  eventId,
  date
) {
  /*
   * Prima proviamo la data richiesta.
   */

  const scoreboard =
    await getScoreboard(
      league,
      date
    );

  const events =
    array(
      scoreboard?.events
    );

  let event =
    events.find(
      (item) =>
        String(item.id) ===
        String(eventId)
    );

  if (event) {
    return event;
  }

  /*
   * Se non è presente,
   * proviamo lo scoreboard
   * senza data.
   */

  if (date) {
    const all =
      await getScoreboard(
        league
      );

    event =
      array(
        all?.events
      ).find(
        (item) =>
          String(item.id) ===
          String(eventId)
      );
  }

  return event || null;
}

/* =========================================================
   FIND EVENT BY TEAM NAME
========================================================= */

async function findEventByQuery(
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

  const search =
    String(
      query || ""
    )
      .trim()
      .toLowerCase();

  if (!search) {
    return null;
  }

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
            const name =
              competitor
                ?.team
                ?.displayName ||
              competitor
                ?.team
                ?.name ||
              "";

            return name
              .toLowerCase()
              .includes(search);
          }
        );
      }
    ) || null
  );
}

/* =========================================================
   MAIN VERCEL FUNCTION
========================================================= */

module.exports = async (
  req,
  res
) => {
  try {
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

    const league =
      req.query?.league ||
      "ita.1";

    const eventId =
      req.query?.id ||
      req.query?.event ||
      req.query
        ?.matchId ||
      null;

    const query =
      req.query?.q ||
      req.query?.search ||
      null;

    const date =
      req.query?.date ||
      null;

    let event = null;

    /* ========================================
       CERCA PER ID
    ======================================== */

    if (eventId) {
      event =
        await findEventById(
          league,
          eventId,
          date
        );
    }

    /* ========================================
       CERCA PER NOME
    ======================================== */

    if (
      !event &&
      query
    ) {
      event =
        await findEventByQuery(
          league,
          query,
          date
        );
    }

    /* ========================================
       NON TROVATA
    ======================================== */

    if (!event) {
      return res
        .status(404)
        .json({
          success: false,
          source: "ESPN",
          error:
            "Partita non trovata",
          query:
            query || null,
          eventId:
            eventId || null,
        });
    }

    /* ========================================
       SUMMARY
    ======================================== */

    const summary =
      await getMatchSummary(
        league,
        String(event.id)
      );

    const competition =
      summary
        ?.header
        ?.competitions?.[0] ||
      summary
        ?.competitions?.[0] ||
      event
        ?.competitions?.[0] ||
      null;

    if (!competition) {
      throw new Error(
        "Competizione non trovata"
      );
    }

    /* ========================================
       TEAMS
    ======================================== */

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

    /* ========================================
       DATE
    ======================================== */

    const dateTime =
      formatDateTime(
        competition.date ||
          event.date
      );

    /* ========================================
       BOXSCORE
    ======================================== */

    const boxscore =
      summary?.boxscore;

    const boxTeams =
      array(
        boxscore?.teams
      );

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

    /* ========================================
       EVENTS
    ======================================== */

    const events =
      array(
        summary?.plays
      )
        .map(
          normalizeEvent
        )
        .filter(Boolean);

    /* ========================================
       TV
    ======================================== */

    const tv = [];

    const broadcasts = [
      ...array(
        summary?.broadcasts
      ),
      ...array(
        competition?.broadcasts
      ),
    ];

    for (
      const broadcast of
        broadcasts
    ) {
      const values = [
        broadcast?.name,
        broadcast?.shortName,
        broadcast?.media
          ?.name,
        broadcast?.media
          ?.shortName,
      ];

      for (
        const value of
          values
      ) {
        const item =
          clean(value);

        if (
          item &&
          !tv.includes(item)
        ) {
          tv.push(item);
        }
      }
    }

    /* ========================================
       RESPONSE
    ======================================== */

    return res
      .status(200)
      .json({
        success: true,

        source: "ESPN",

        timezone:
          "Europe/Rome",

        competition: {
          id:
            clean(
              competition.id
            ),

          name:
            clean(
              competition
                ?.league
                ?.name ||
                "Serie A"
            ),

          espnLeague:
            league,

          season:
            clean(
              competition
                ?.season
                ?.year
            ),
        },

        match: {
          id:
            String(
              event.id
            ),

          date:
            dateTime.date,

          time:
            dateTime.time,

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

        penalties: [],

        venue:
          competition
            ?.venue
            ? {
                id:
                  clean(
                    competition
                      .venue
                      .id
                  ),

                name:
                  clean(
                    competition
                      .venue
                      .fullName ||
                      competition
                        .venue
                        .name
                  ),

                city:
                  clean(
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
                  toNumber(
                    competition
                      .venue
                      .capacity
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
      });
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

        details:
          error?.message ||
          "Errore sconosciuto",
      });
  }
};
