const ESPN_BASE_URL =
  "https://site.api.espn.com/apis/site/v2/sports/soccer";

const DEFAULT_LEAGUE = "ita.1";

/* =========================================================
   HELPERS
========================================================= */

function clean(value) {
  if (value === undefined || value === null) return null;

  const text = String(value).trim();

  return text || null;
}

function number(value) {
  if (value === undefined || value === null) return null;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const match = String(value).match(/-?\d+(?:[.,]\d+)?/);

  if (!match) return null;

  const result = Number(match[0].replace(",", "."));

  return Number.isFinite(result) ? result : null;
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

function array(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

/* =========================================================
   ESPN FETCH
========================================================= */

async function fetchESPN(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0",
    },
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `ESPN error ${response.status}: ${text.slice(0, 500)}`
    );
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("ESPN ha restituito una risposta non JSON.");
  }
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

  const data = team.team || team;

  return {
    id: clean(
      first(
        data.id,
        team.id
      )
    ),

    name: clean(
      first(
        data.displayName,
        data.name,
        data.shortDisplayName,
        data.shortName
      )
    ),

    abbreviation: clean(
      first(
        data.abbreviation,
        team.abbreviation
      )
    ),

    logo: clean(
      first(
        data.logo,
        data.logos?.[0]?.href,
        team.logo,
        team.logos?.[0]?.href
      )
    ),

    score: number(
      first(
        team.score,
        data.score
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
      state === "terminata",
  };
}

/* =========================================================
   EVENT TYPE
========================================================= */

function normalizeEventType(play) {
  const text = String(
    first(
      play?.type?.text,
      play?.type?.name,
      play?.type,
      ""
    )
  ).toLowerCase();

  if (
    text.includes("goal") ||
    text.includes("gol")
  ) {
    return "gol";
  }

  if (
    text.includes("yellow") ||
    text.includes("giallo")
  ) {
    return "cartellino_giallo";
  }

  if (
    text.includes("red") ||
    text.includes("rosso")
  ) {
    return "cartellino_rosso";
  }

  if (
    text.includes("substitution") ||
    text.includes("sostituzione")
  ) {
    return "sostituzione";
  }

  if (
    text.includes("half") ||
    text.includes("tempo")
  ) {
    return "intervallo";
  }

  if (
    text.includes("kickoff") ||
    text.includes("inizio")
  ) {
    return "inizio";
  }

  if (
    text.includes("end") ||
    text.includes("fine")
  ) {
    return "fine";
  }

  if (
    text.includes("penalty") ||
    text.includes("rigore")
  ) {
    return "rigore";
  }

  if (
    text.includes("injury") ||
    text.includes("interruption") ||
    text.includes("interruzione")
  ) {
    return "interruzione";
  }

  return "altro";
}

/* =========================================================
   EVENT
========================================================= */

function normalizeEvent(play) {
  if (!play) return null;

  const competitors =
    array(play.competitions);

  const competitor =
    play.competitor ||
    competitors[0] ||
    null;

  const athlete =
    play.athlete ||
    play.player ||
    null;

  const type =
    normalizeEventType(play);

  let playerIn =
    play.playerIn ||
    null;

  let playerOut =
    play.playerOut ||
    null;

  /*
   * ESPN può restituire i cambi dentro
   * substitution.
   */

  if (!playerIn) {
    playerIn =
      play.substitution?.playerIn ||
      play.substitution?.in ||
      null;
  }

  if (!playerOut) {
    playerOut =
      play.substitution?.playerOut ||
      play.substitution?.out ||
      null;
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

    team: clean(
      first(
        competitor?.team?.displayName,
        competitor?.team?.name,
        play.team?.displayName,
        play.team?.name,
        play.team
      )
    ),

    player: clean(
      first(
        athlete?.displayName,
        athlete?.fullName,
        athlete?.name,
        typeof athlete === "string"
          ? athlete
          : null,
        typeof play.player === "string"
          ? play.player
          : null
      )
    ),

    assist: clean(
      first(
        play.assist?.athlete?.displayName,
        play.assist?.athlete?.fullName,
        play.assist?.athlete?.name,
        play.assist
      )
    ),

    playerIn: clean(
      first(
        playerIn?.athlete?.displayName,
        playerIn?.displayName,
        playerIn?.fullName,
        playerIn?.name,
        playerIn
      )
    ),

    playerOut: clean(
      first(
        playerOut?.athlete?.displayName,
        playerOut?.displayName,
        playerOut?.fullName,
        playerOut?.name,
        playerOut
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
   STATISTICS
========================================================= */

function getStat(stats, names) {
  const wanted =
    names.map(
      x => String(x).toLowerCase()
    );

  for (const item of array(stats)) {
    const name = String(
      first(
        item.name,
        item.label,
        item.abbreviation,
        ""
      )
    ).toLowerCase();

    if (
      wanted.some(
        wantedName =>
          name === wantedName ||
          name.includes(wantedName)
      )
    ) {
      return first(
        item.displayValue,
        item.value
      );
    }
  }

  return null;
}

function normalizeStatistics(box) {
  const stats =
    array(box?.statistics);

  return {
    team: clean(
      first(
        box?.team?.displayName,
        box?.team?.name,
        box?.team
      )
    ),

    tiri: number(
      getStat(stats, [
        "shots",
        "total shots",
        "tiri",
      ])
    ),

    tiriInPorta: number(
      getStat(stats, [
        "shots on target",
        "shots on goal",
        "tiri in porta",
      ])
    ),

    possesso: number(
      getStat(stats, [
        "possession",
        "possesso",
      ])
    ),

    calciDangolo: number(
      getStat(stats, [
        "corner kicks",
        "corners",
        "calci d'angolo",
      ])
    ),

    fuorigioco: number(
      getStat(stats, [
        "offsides",
        "fuorigioco",
      ])
    ),

    falli: number(
      getStat(stats, [
        "fouls",
        "falli",
      ])
    ),

    ammonizioni: number(
      getStat(stats, [
        "yellow cards",
        "yellow card",
        "cartellini gialli",
      ])
    ),

    espulsioni: number(
      getStat(stats, [
        "red cards",
        "red card",
        "cartellini rossi",
      ])
    ),

    parate: number(
      getStat(stats, [
        "saves",
        "save",
        "parate",
      ])
    ),
  };
}

/* =========================================================
   LINEUPS
========================================================= */

function normalizeLineup(competitor) {
  const lineup =
    competitor?.lineup ||
    null;

  const players =
    array(
      lineup?.players ||
      competitor?.players
    );

  const result = [];

  for (const item of players) {
    const athlete =
      item.athlete ||
      item.player ||
      item;

    const name = clean(
      first(
        athlete?.displayName,
        athlete?.fullName,
        athlete?.name
      )
    );

    if (!name) continue;

    result.push({
      id: clean(
        first(
          athlete?.id,
          item.id
        )
      ),

      name,

      jersey: clean(
        first(
          item.jersey,
          athlete?.jersey
        )
      ),

      position: clean(
        first(
          item.position?.abbreviation,
          item.position?.name,
          athlete?.position?.abbreviation,
          athlete?.position?.name
        )
      ),

      starter:
        item.starter === true,

      substitute:
        item.substitute === true,
    });
  }

  return {
    formation: clean(
      first(
        lineup?.formation,
        competitor?.formation
      )
    ),

    starters:
      result.filter(
        p => p.starter
      ),

    substitutes:
      result.filter(
        p => p.substitute
      ),

    players: result,
  };
}

/* =========================================================
   BROADCAST
========================================================= */

function normalizeTV(summary, competition) {
  const list = [];

  for (const item of [
    ...array(summary?.broadcasts),
    ...array(competition?.broadcasts),
  ]) {
    const values = [
      item.name,
      item.shortName,
      item.market,
      item.media?.name,
      item.media?.shortName,
    ];

    for (const value of values) {
      const name = clean(value);

      if (name) {
        list.push(name);
      }
    }
  }

  return unique(list);
}

/* =========================================================
   VENUE
========================================================= */

function normalizeVenue(competition) {
  const venue =
    competition?.venue;

  if (!venue) return null;

  return {
    id: clean(venue.id),

    name: clean(
      first(
        venue.fullName,
        venue.name
      )
    ),

    city: clean(
      venue.address?.city
    ),

    country: clean(
      first(
        venue.address?.country,
        venue.address?.countryName
      )
    ),

    capacity: number(
      venue.capacity
    ),
  };
}

/* =========================================================
   DATE
========================================================= */

function formatDateTime(date) {
  if (!date) {
    return {
      date: null,
      time: null,
    };
  }

  const d = new Date(date);

  if (Number.isNaN(d.getTime())) {
    return {
      date: clean(date),
      time: null,
    };
  }

  return {
    date: d.toLocaleDateString(
      "it-IT",
      {
        timeZone: "Europe/Rome",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }
    ),

    time: d.toLocaleTimeString(
      "it-IT",
      {
        timeZone: "Europe/Rome",
        hour: "2-digit",
        minute: "2-digit",
      }
    ),
  };
}

/* =========================================================
   FIND MATCH IN SCOREBOARD
========================================================= */

function findMatch(events, query) {
  if (!query) return null;

  const q =
    query
      .toLowerCase()
      .trim();

  for (const event of events) {
    const competition =
      event.competitions?.[0];

    const teams =
      array(
        competition?.competitors
      );

    const names =
      teams.map(team =>
        String(
          first(
            team.team?.displayName,
            team.team?.name,
            team.displayName,
            ""
          )
        ).toLowerCase()
      );

    if (
      names.some(
        name =>
          name === q ||
          name.includes(q)
      )
    ) {
      return event;
    }
  }

  return null;
}

/* =========================================================
   GET
========================================================= */

async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Metodo non consentito",
    });
  }

  const {
    id,
    event,
    matchId,
    q,
    search,
    date,
    league,
    competition,
  } = req.query;

  const eventId =
    id ||
    event ||
    matchId ||
    null;

  /*
   * IMPORTANTE:
   * "serie-a" non viene passato a ESPN.
   * ESPN per la Serie A usa "ita.1".
   */

  const espnLeague =
    league === "serie-a" ||
    competition === "serie-a" ||
    !league
      ? DEFAULT_LEAGUE
      : league;

  try {
    let selectedEvent = null;

    /* =====================================================
       1. CERCA DIRETTAMENTE PER ID
    ===================================================== */

    if (eventId) {
      /*
       * NON facciamo:
       *
       * /summary?event=...
       *
       * come prima richiesta.
       *
       * Prima prendiamo lo scoreboard.
       */

      let scoreboardUrl =
        `${ESPN_BASE_URL}/${espnLeague}/scoreboard`;

      if (date) {
        scoreboardUrl +=
          `?dates=${encodeURIComponent(
            date
          )}`;
      }

      const scoreboard =
        await fetchESPN(
          scoreboardUrl
        );

      selectedEvent =
        array(
          scoreboard?.events
        ).find(
          item =>
            String(item.id) ===
            String(eventId)
        ) || null;
    }

    /* =====================================================
       2. CERCA PER NOME
    ===================================================== */

    if (!selectedEvent && (q || search)) {
      let scoreboardUrl =
        `${ESPN_BASE_URL}/${espnLeague}/scoreboard`;

      if (date) {
        scoreboardUrl +=
          `?dates=${encodeURIComponent(
            date
          )}`;
      }

      const scoreboard =
        await fetchESPN(
          scoreboardUrl
        );

      selectedEvent =
        findMatch(
          array(scoreboard?.events),
          q || search
        );
    }

    /* =====================================================
       3. MATCH NON TROVATO
    ===================================================== */

    if (!selectedEvent) {
      return res.status(404).json({
        success: false,
        source: "ESPN",
        error: "Partita non trovata",
        query: q || search || null,
        eventId: eventId || null,
        league: espnLeague,
      });
    }

    /* =====================================================
       4. COMPETITION
    ===================================================== */

    const competitionData =
      selectedEvent
        ?.competitions?.[0] ||
      null;

    const competitors =
      array(
        competitionData?.competitors
      );

    const homeRaw =
      competitors.find(
        team =>
          team.homeAway === "home"
      ) ||
      competitors[0] ||
      null;

    const awayRaw =
      competitors.find(
        team =>
          team.homeAway === "away"
      ) ||
      competitors[1] ||
      null;

    const home =
      normalizeTeam(homeRaw);

    const away =
      normalizeTeam(awayRaw);

    /* =====================================================
       5. SUMMARY
       
       ATTENZIONE:
       ESPN può rispondere 403.
       La partita NON deve andare in errore.
       ===================================================== */

    let summary = null;
    let summaryError = null;

    try {
      const summaryUrl =
        `${ESPN_BASE_URL}/${espnLeague}/summary` +
        `?event=${encodeURIComponent(
          String(selectedEvent.id)
        )}`;

      summary =
        await fetchESPN(
          summaryUrl
        );
    } catch (error) {
      summaryError =
        error?.message ||
        "Summary ESPN non disponibile";
    }

    /* =====================================================
       6. DATA
    ===================================================== */

    const dateTime =
      formatDateTime(
        first(
          competitionData?.date,
          selectedEvent?.date
        )
      );

    /* =====================================================
       7. EVENTS
    ===================================================== */

    const events =
      array(
        summary?.plays
      )
        .map(normalizeEvent)
        .filter(Boolean);

    /* =====================================================
       8. LINEUPS
    ===================================================== */

    const homeLineup =
      normalizeLineup(homeRaw);

    const awayLineup =
      normalizeLineup(awayRaw);

    /* =====================================================
       9. STATISTICS
    ===================================================== */

    let homeStats = {
      team: home.name,
      tiri: null,
      tiriInPorta: null,
      possesso: null,
      calciDangolo: null,
      fuorigioco: null,
      falli: null,
      ammonizioni: null,
      espulsioni: null,
      parate: null,
    };

    let awayStats = {
      team: away.name,
      tiri: null,
      tiriInPorta: null,
      possesso: null,
      calciDangolo: null,
      fuorigioco: null,
      falli: null,
      ammonizioni: null,
      espulsioni: null,
      parate: null,
    };

    const boxscoreTeams =
      array(
        summary?.boxscore?.teams
      );

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

    if (homeBox) {
      homeStats =
        normalizeStatistics(
          homeBox
        );
      homeStats.team =
        home.name;
    }

    if (awayBox) {
      awayStats =
        normalizeStatistics(
          awayBox
        );
      awayStats.team =
        away.name;
    }

    /* =====================================================
       10. VENUE
    ===================================================== */

    const venue =
      normalizeVenue(
        competitionData
      );

    /* =====================================================
       11. TV
    ===================================================== */

    const tv =
      normalizeTV(
        summary,
        competitionData
      );

    /* =====================================================
       12. MVP
    ===================================================== */

    let mvp = null;

    const mvpCandidate =
      first(
        summary?.playerOfTheMatch,
        summary?.mvp,
        summary?.gameInfo?.mvp
      );

    if (mvpCandidate) {
      const athlete =
        mvpCandidate.athlete ||
        mvpCandidate.player ||
        mvpCandidate;

      const name =
        clean(
          first(
            athlete?.displayName,
            athlete?.fullName,
            athlete?.name
          )
        );

      if (name) {
        mvp = {
          name,

          team: clean(
            first(
              mvpCandidate.team?.displayName,
              mvpCandidate.team?.name,
              athlete?.team?.displayName,
              athlete?.team?.name
            )
          ),

          reason: clean(
            first(
              mvpCandidate.reason,
              mvpCandidate.description
            )
          ),
        };
      }
    }

    /* =====================================================
       13. PENALTIES
    ===================================================== */

    const penalties =
      array(
        summary?.penalties
      );

    /* =====================================================
       14. FINAL RESPONSE
    ===================================================== */

    return res.status(200).json({
      success: true,

      source: "ESPN",

      timezone: "Europe/Rome",

      competition: {
        id: clean(
          first(
            selectedEvent?.league?.id,
            competitionData?.league?.id,
            espnLeague
          )
        ),

        name: clean(
          first(
            selectedEvent?.league?.name,
            competitionData?.league?.name,
            "Serie A"
          )
        ),

        espnLeague,

        season:
          selectedEvent?.season?.year ||
          competitionData?.season?.year ||
          null,
      },

      match: {
        id: String(
          selectedEvent.id
        ),

        date:
          dateTime.date,

        time:
          dateTime.time,

        home: {
          ...home,
          score:
            home.score !== null
              ? home.score
              : number(
                  homeRaw?.score
                ),
        },

        away: {
          ...away,
          score:
            away.score !== null
              ? away.score
              : number(
                  awayRaw?.score
                ),
        },

        status:
          normalizeStatus(
            competitionData
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

      venue,

      officials: {
        referee: null,
        assistantReferee1: null,
        assistantReferee2: null,
        fourthOfficial: null,
        var: null,
        avar: null,
      },

      tv,

      mvp,

      events,

      /*
       * Questo campo serve solo per capire
       * se ESPN ha bloccato summary.
       * Non rompe l'API.
       */

      summaryAvailable:
        summary !== null,

      summaryError:
        summaryError || null,
    });
  } catch (error) {
    console.error(
      "MATCH API ERROR:",
      error
    );

    return res.status(500).json({
      success: false,

      source: "ESPN",

      error:
        "Impossibile recuperare i dati della partita da ESPN.",

      message:
        error?.message ||
        "Errore sconosciuto.",

      eventId:
        eventId || null,

      league:
        espnLeague,
    });
  }
}

module.exports = handler;
