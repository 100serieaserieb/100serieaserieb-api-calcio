const { getCompetition } = require("../lib/competitions");
const { getMatchSummary } = require("../lib/espn");
const { normalizeTeamName } = require("../lib/teams");
const { DateTime } = require("luxon");

/* =========================================================
   DATE
========================================================= */

function getRomeDateTime(date) {
  if (!date) return null;

  const parsed = DateTime.fromISO(String(date), {
    zone: "utc"
  });

  if (!parsed.isValid) return null;

  return parsed.setZone("Europe/Rome");
}

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

  if (!match) return null;

  const result = Number(
    match[0].replace(",", ".")
  );

  return Number.isFinite(result)
    ? result
    : null;
}

/* =========================================================
   TEAM
========================================================= */

function teamId(team) {
  return clean(
    first(
      team?.team?.id,
      team?.competitor?.id,
      team?.id
    )
  );
}

function teamName(team) {
  const raw = first(
    team?.team?.displayName,
    team?.team?.name,
    team?.team?.shortDisplayName,
    team?.displayName,
    team?.name
  );

  return raw
    ? normalizeTeamName(raw)
    : null;
}

function getCompetitor(
  competitors,
  side
) {
  return arr(competitors).find(
    item => item?.homeAway === side
  ) || null;
}

function getTeamSide(item) {
  return (
    item?.homeAway ||
    item?.team?.homeAway ||
    item?.competitor?.homeAway ||
    null
  );
}

/* =========================================================
   EVENT TYPE
========================================================= */

function getEventType(event) {
  if (!event) return "";

  if (typeof event.type === "string") {
    return event.type;
  }

  if (
    event.type &&
    typeof event.type === "object"
  ) {
    return (
      event.type.text ||
      event.type.name ||
      event.type.id ||
      ""
    );
  }

  return "";
}

/* =========================================================
   EVENT MINUTE
========================================================= */

function getEventMinute(event) {
  if (!event) return null;

  if (
    event.clock &&
    typeof event.clock === "object"
  ) {
    return first(
      event.clock.displayValue,
      event.clock.value
    );
  }

  if (typeof event.clock === "string") {
    return event.clock;
  }

  return first(
    event.minute,
    event.period?.displayValue
  );
}

/* =========================================================
   EVENT TEXT
========================================================= */

function getEventText(event) {
  if (!event) return "";

  return clean(
    first(
      event.text,
      event.description,
      event.shortDescription,
      event.comment
    )
  ) || "";
}

/* =========================================================
   PLAYER
========================================================= */

function getAthleteName(value) {
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

function getPlayer(event, rawText) {
  const direct = getAthleteName(
    first(
      event?.athlete,
      event?.player
    )
  );

  if (direct) return direct;

  if (!rawText) return null;

  /*
   * Goal!
   * Udinese 1, Como 0.
   * Hassane Kamara (Udinese) ...
   */
  const goalMatch =
    rawText.match(
      /Goal![^.]*\.\s*([^()]+?)\s*\(/i
    );

  if (goalMatch) {
    return clean(goalMatch[1]);
  }

  /*
   * Jesús Rodríguez (Como)
   * is shown...
   */
  const genericMatch =
    rawText.match(
      /^([^()]+?)\s*\([^)]*\)/
    );

  if (genericMatch) {
    const value =
      genericMatch[1]
        .replace(
          /^Delay in match because of an injury\s*/i,
          ""
        )
        .trim();

    if (
      value &&
      !/^Goal!/i.test(value) &&
      !/^Substitution/i.test(value)
    ) {
      return clean(value);
    }
  }

  /*
   * injury Jesús Rodríguez (Como)
   */
  const injuryMatch =
    rawText.match(
      /injury\s+(.+?)\s*\(/i
    );

  if (injuryMatch) {
    return clean(injuryMatch[1]);
  }

  return null;
}

/* =========================================================
   ASSIST
========================================================= */

function getAssist(
  event,
  rawText
) {
  const direct =
    getAthleteName(
      event?.assist
    );

  if (direct) return direct;

  if (!rawText) return null;

  const match =
    rawText.match(
      /Assisted by\s+(.+?)(?:\s+with|\s+following|\.|$)/i
    );

  return match
    ? clean(match[1])
    : null;
}

/* =========================================================
   TEAM FROM EVENT
========================================================= */

function getEventTeam(event) {
  const candidates = [
    event?.team,
    event?.competitor,
    event?.competitors?.[0]
  ];

  for (const candidate of candidates) {
    const name = teamName(candidate);

    if (name) {
      return name;
    }
  }

  const text = getEventText(event);

  const match =
    text.match(
      /\(([^)]+)\)/
    );

  if (match) {
    try {
      return normalizeTeamName(
        match[1]
      );
    } catch {
      return clean(match[1]);
    }
  }

  return null;
}

/* =========================================================
   EVENT CLASSIFICATION
========================================================= */

function classifyEvent(event) {
  const rawType =
    String(
      getEventType(event) || ""
    ).toLowerCase();

  const text =
    String(
      getEventText(event) || ""
    ).toLowerCase();

  /*
   * ORDINE IMPORTANTE:
   * prima riconosciamo gli eventi specifici,
   * poi quelli generici.
   */

  if (
    rawType.includes("goal") ||
    rawType.includes("score")
  ) {
    return "Gol";
  }

  if (
    rawType.includes("yellow") ||
    text.includes("yellow card")
  ) {
    return "Cartellino giallo";
  }

  if (
    rawType.includes("red") ||
    text.includes("red card")
  ) {
    return "Cartellino rosso";
  }

  if (
    rawType.includes("substitution") ||
    text.startsWith("substitution")
  ) {
    return "Sostituzione";
  }

  if (
    rawType.includes("kickoff") ||
    rawType.includes("start first half") ||
    text.includes("first half begins")
  ) {
    return "Inizio primo tempo";
  }

  if (
    rawType.includes("halftime") ||
    rawType.includes("end 1st half") ||
    text.includes("first half ends")
  ) {
    return "Fine primo tempo";
  }

  if (
    rawType.includes("start 2nd half") ||
    rawType.includes("second half") &&
      !text.includes("ends")
  ) {
    return "Inizio secondo tempo";
  }

  if (
    rawType.includes("end regular") ||
    rawType.includes("end game") ||
    rawType.includes("full time") ||
    text === "match ends." ||
    text === "game over."
  ) {
    return "Fine partita";
  }

  /*
   * DELAY:
   *
   * "Delay in match because of an injury..."
   * = interruzione
   *
   * "Delay over. They are ready to continue."
   * = ripresa
   */
  if (
    text.includes("delay over") ||
    text.includes("ready to continue") ||
    rawType.includes("end delay")
  ) {
    return "Ripresa del gioco";
  }

  if (
    text.includes("delay in match") ||
    text.includes("injury") ||
    rawType.includes("start delay") ||
    rawType.includes("injury") ||
    rawType.includes("interruption")
  ) {
    return "Interruzione";
  }

  return null;
}

/* =========================================================
   SUBSTITUTION PARSER
========================================================= */

function parseSubstitution(
  event,
  team
) {
  const text =
    getEventText(event);

  /*
   * ESPN:
   *
   * Substitution, Udinese.
   * Enzo Ebosse replaces Matteo Palma.
   */

  const english =
    text.match(
      /Substitution,\s*([^.]*)\.\s*(.*?)\s+replaces\s+(.*?)(?:\s+because of an injury)?\./i
    );

  if (english) {
    const substitutionTeam =
      normalizeTeamName(
        clean(english[1])
      );

    return {
      incoming:
        clean(english[2]),

      outgoing:
        clean(english[3]),

      team:
        substitutionTeam || team
    };
  }

  /*
   * Possibile struttura ESPN
   * con athlete/incoming/outgoing.
   */

  const incoming =
    getAthleteName(
      first(
        event?.incoming,
        event?.substitution?.incoming,
        event?.substitution?.in
      )
    );

  const outgoing =
    getAthleteName(
      first(
        event?.outgoing,
        event?.substitution?.outgoing,
        event?.substitution?.out
      )
    );

  if (incoming || outgoing) {
    return {
      incoming,
      outgoing,
      team
    };
  }

  return {
    incoming: null,
    outgoing: null,
    team
  };
}

/* =========================================================
   ITALIAN EVENT TEXT
========================================================= */

function buildItalianEventText(
  event,
  type,
  team,
  player,
  assist,
  substitution
) {
  const minute =
    getEventMinute(event);

  const prefix =
    minute !== null &&
    minute !== undefined &&
    minute !== ""
      ? `Al ${minute}: `
      : "";

  /* GOL */

  if (
    type === "Gol"
  ) {
    let result =
      `${prefix}gol di ${player || "giocatore"}`;

    if (team) {
      result += ` per ${team}`;
    }

    if (assist) {
      result += `, assist di ${assist}`;
    }

    return `${result}.`;
  }

  /* CARTELLINI */

  if (
    type === "Cartellino giallo"
  ) {
    return `${prefix}cartellino giallo per ${
      player || "giocatore"
    }${
      team
        ? ` (${team})`
        : ""
    }.`;
  }

  if (
    type === "Cartellino rosso"
  ) {
    return `${prefix}cartellino rosso per ${
      player || "giocatore"
    }${
      team
        ? ` (${team})`
        : ""
    }.`;
  }

  /* SOSTITUZIONE */

  if (
    type === "Sostituzione"
  ) {
    if (
      substitution?.incoming ||
      substitution?.outgoing
    ) {
      return (
        `${prefix}` +
        `${
          substitution.incoming ||
          "Un giocatore"
        } entra al posto di ${
          substitution.outgoing ||
          "un giocatore"
        }` +
        `${
          substitution.team
            ? ` per ${substitution.team}`
            : ""
        }.`
      );
    }

    return `${prefix}sostituzione${
      team
        ? ` per ${team}`
        : ""
    }.`;
  }

  /* INIZI/FINE */

  if (
    type === "Inizio primo tempo"
  ) {
    return "Inizio del primo tempo.";
  }

  if (
    type === "Fine primo tempo"
  ) {
    return "Fine del primo tempo.";
  }

  if (
    type === "Inizio secondo tempo"
  ) {
    return "Inizio del secondo tempo.";
  }

  if (
    type === "Fine partita"
  ) {
    return "Fine della partita.";
  }

  /* INTERRUZIONE */

  if (
    type === "Interruzione"
  ) {
    if (player) {
      return (
        `${prefix}gioco interrotto per un ` +
        `infortunio a ${player}` +
        `${
          team
            ? ` (${team})`
            : ""
        }.`
      );
    }

    return (
      `${prefix}` +
      `gioco momentaneamente interrotto.`
    );
  }

  /* RIPRESA */

  if (
    type === "Ripresa del gioco"
  ) {
    return (
      `${prefix}` +
      `gioco ripreso.`
    );
  }

  return (
    getEventText(event) ||
    null
  );
}

/* =========================================================
   PARSE EVENT
========================================================= */

function parseEvent(event) {
  if (!event) return null;

  const type =
    classifyEvent(event);

  /*
   * Gli eventi che non ci interessano
   * non entrano nella cronaca.
   */
  if (!type) {
    return null;
  }

  const rawText =
    getEventText(event);

  const team =
    getEventTeam(event);

  const player =
    getPlayer(
      event,
      rawText
    );

  const assist =
    type === "Gol"
      ? getAssist(
          event,
          rawText
        )
      : null;

  const substitution =
    type === "Sostituzione"
      ? parseSubstitution(
          event,
          team
        )
      : null;

  return {
    id:
      clean(event.id),

    type,

    minute:
      getEventMinute(event),

    team,

    teamSide:
      getTeamSide(
        event?.competitor ||
        event?.team ||
        event
      ),

    player:
      clean(player),

    assist:
      clean(assist),

    incoming:
      clean(
        substitution?.incoming
      ),

    outgoing:
      clean(
        substitution?.outgoing
      ),

    text:
      buildItalianEventText(
        event,
        type,
        team,
        player,
        assist,
        substitution
      ),

    rawText:
      rawText || null
  };
}

/* =========================================================
   EVENTS
========================================================= */

function getMatchEvents(summary) {
  /*
   * ESPN può utilizzare:
   *
   * keyEvents
   * plays
   *
   * Usiamo entrambi, ma eliminiamo
   * i duplicati.
   */

  const rawEvents = [
    ...arr(summary?.keyEvents),
    ...arr(summary?.plays)
  ];

  const result = [];
  const seen = new Set();

  for (const event of rawEvents) {
    const parsed =
      parseEvent(event);

    if (!parsed) continue;

    const key =
      parsed.id ||
      [
        parsed.minute,
        parsed.type,
        parsed.team,
        parsed.player,
        parsed.incoming,
        parsed.outgoing,
        parsed.text
      ].join("|");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(parsed);
  }

  return result;
}

/* =========================================================
   GOALS
========================================================= */

function getGoals(events) {
  return events
    .filter(
      event =>
        event.type === "Gol"
    )
    .map(
      event => ({
        minute:
          event.minute,

        team:
          event.team,

        teamSide:
          event.teamSide,

        player:
          event.player,

        assist:
          event.assist,

        text:
          event.text
      })
    );
}

/* =========================================================
   CARDS
========================================================= */

function getCards(events) {
  return events
    .filter(
      event =>
        event.type ===
          "Cartellino giallo" ||
        event.type ===
          "Cartellino rosso"
    )
    .map(
      event => ({
        minute:
          event.minute,

        team:
          event.team,

        teamSide:
          event.teamSide,

        player:
          event.player,

        card:
          event.type ===
          "Cartellino rosso"
            ? "red"
            : "yellow",

        text:
          event.text
      })
    );
}

/* =========================================================
   SUBSTITUTIONS
========================================================= */

function getSubstitutions(events) {
  return events
    .filter(
      event =>
        event.type ===
        "Sostituzione"
    )
    .map(
      event => ({
        minute:
          event.minute,

        team:
          event.team,

        teamSide:
          event.teamSide,

        incoming:
          event.incoming,

        outgoing:
          event.outgoing,

        text:
          event.text
      })
    );
}

/* =========================================================
   INJURIES
========================================================= */

function getInjuries(events) {
  return events
    .filter(
      event =>
        event.type ===
          "Interruzione" &&
        event.player
    )
    .map(
      event => ({
        minute:
          event.minute,

        team:
          event.team,

        teamSide:
          event.teamSide,

        player:
          event.player,

        text:
          event.text
      })
    );
}

/* =========================================================
   PENALTIES
========================================================= */

function getPenalties(summary) {
  const result = {
    home: [],
    away: []
  };

  const plays = [
    ...arr(summary?.plays),
    ...arr(summary?.keyEvents)
  ];

  const seen = new Set();

  for (const play of plays) {
    const text =
      getEventText(play);

    if (
      !/penalty|penalt|rigore/i.test(
        `${getEventType(play)} ${text}`
      )
    ) {
      continue;
    }

    const side =
      getTeamSide(
        play?.competitor ||
        play?.team ||
        play
      );

    const player =
      getPlayer(
        play,
        text
      );

    const key = [
      getEventMinute(play),
      side,
      player,
      text
    ].join("|");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    let outcome =
      "Tentativo di rigore";

    if (
      /miss|missed|saved|save|sbagliato|parato/i.test(
        text
      )
    ) {
      outcome =
        "Sbagliato/Parato";
    } else if (
      /goal|scored|gol|realizzato/i.test(
        text
      )
    ) {
      outcome =
        "Realizzato";
    }

    const item = {
      minute:
        getEventMinute(play),

      player,

      outcome,

      text:
        text || null
    };

    if (side === "home") {
      result.home.push(item);
    }

    if (side === "away") {
      result.away.push(item);
    }
  }

  return result;
}

/* =========================================================
   VENUE
========================================================= */

function getVenue(
  summary,
  competitionInfo
) {
  const venue =
    first(
      summary?.gameInfo?.venue,
      summary?.venue,
      competitionInfo?.venue,
      summary?.header?.venue
    );

  if (!venue) {
    return null;
  }

  const address =
    venue.address || {};

  return {
    id:
      clean(venue.id),

    name:
      clean(
        first(
          venue.fullName,
          venue.displayName,
          venue.name
        )
      ),

    city:
      clean(
        first(
          address.city,
          venue.city
        )
      ),

    country:
      clean(
        first(
          address.country,
          address.countryName,
          venue.country
        )
      ),

    capacity:
      number(
        venue.capacity
      ),

    address:
      clean(
        first(
          address.fullAddress,
          address.street
        )
      )
  };
}

/* =========================================================
   OFFICIALS
========================================================= */

function getOfficials(
  summary,
  competitionInfo
) {
  const sources = [
    competitionInfo?.officials,
    summary?.header?.competitions?.[0]?.officials,
    summary?.gameInfo?.officials,
    summary?.officials
  ];

  let officials = [];

  for (const source of sources) {
    if (arr(source).length) {
      officials = source;
      break;
    }
  }

  return officials.map(
    official => ({
      id:
        clean(
          first(
            official.id,
            official.official?.id
          )
        ),

      name:
        clean(
          first(
            official.displayName,
            official.fullName,
            official.name,
            official.official?.displayName,
            official.official?.fullName
          )
        ),

      role:
        clean(
          first(
            official.position?.displayName,
            official.position?.name,
            official.role,
            "Arbitro"
          )
        )
    })
  );
}

/* =========================================================
   BROADCASTS
========================================================= */

function getBroadcasts(
  summary,
  competitionInfo
) {
  const sources = [
    competitionInfo?.broadcasts,
    summary?.broadcasts,
    summary?.header?.competitions?.[0]?.broadcasts
  ];

  let broadcasts = [];

  for (const source of sources) {
    if (arr(source).length) {
      broadcasts = source;
      break;
    }
  }

  return broadcasts.map(
    item => ({
      name:
        clean(
          first(
            item.names?.[0],
            item.name,
            item.displayName,
            item.media?.name,
            item.media?.shortName
          )
        ),

      type:
        clean(
          first(
            item.type?.shortName,
            item.type?.text,
            item.type?.name,
            item.type
          )
        )
    })
  );
}

/* =========================================================
   MVP
========================================================= */

function getMVP(summary) {
  const sources = [
    summary?.leaders,
    summary?.header?.competitions?.[0]?.leaders,
    summary?.boxscore?.leaders
  ];

  for (const leaders of sources) {
    for (const group of arr(leaders)) {
      const groupName =
        String(
          first(
            group?.name,
            group?.displayName,
            group?.shortDisplayName
          ) || ""
        ).toLowerCase();

      if (
        groupName.includes(
          "player of the match"
        ) ||
        groupName.includes("mvp") ||
        groupName.includes(
          "match winner"
        )
      ) {
        const leader =
          group?.leaders?.[0];

        const athlete =
          leader?.athlete ||
          leader?.player;

        if (!athlete) {
          continue;
        }

        return {
          player:
            getAthleteName(
              athlete
            ),

          team:
            clean(
              athlete?.team?.displayName
                ? normalizeTeamName(
                    athlete.team.displayName
                  )
                : null
            ),

          value:
            clean(
              first(
                leader?.value,
                leader?.displayValue
              )
            )
        };
      }
    }
  }

  return null;
}

/* =========================================================
   RECORD
========================================================= */

function getRecord(
  competitor
) {
  const records =
    arr(
      competitor?.records
    );

  return records.map(
    record => ({
      type:
        clean(record?.type),

      summary:
        clean(record?.summary),

      displayValue:
        clean(
          record?.displayValue
        )
    })
  );
}

/* =========================================================
   MATCH STATUS
========================================================= */

function getStatus(
  competitionInfo
) {
  const status =
    competitionInfo?.status;

  const type =
    status?.type || {};

  return {
    state:
      clean(type.state),

    name:
      clean(type.name),

    description:
      clean(type.description),

    detail:
      clean(type.detail),

    shortDetail:
      clean(type.shortDetail),

    clock:
      clean(
        status?.displayClock ||
        type?.displayClock
      ),

    period:
      first(
        status?.period,
        type?.period
      ),

    completed:
      Boolean(
        type.completed
      )
  };
}

/* =========================================================
   MAIN
========================================================= */

module.exports = async (
  req,
  res
) => {
  try {
    /* -----------------------------------------------------
       PARAMETRI
    ----------------------------------------------------- */

    const competitionId =
      req.query?.competition;

    const eventId =
      req.query?.id;

    if (!competitionId) {
      return res.status(400).json({
        success: false,
        error:
          "Parametro competition obbligatorio"
      });
    }

    if (!eventId) {
      return res.status(400).json({
        success: false,
        error:
          "Parametro id obbligatorio"
      });
    }

    /* -----------------------------------------------------
       COMPETIZIONE
    ----------------------------------------------------- */

    const competition =
      getCompetition(
        competitionId
      );

    if (!competition) {
      return res.status(404).json({
        success: false,
        error:
          "Competizione non trovata"
      });
    }

    if (!competition.espnLeague) {
      return res.status(400).json({
        success: false,
        error:
          "Codice ESPN non configurato"
      });
    }

    /* -----------------------------------------------------
       ESPN
    ----------------------------------------------------- */

    const summary =
      await getMatchSummary(
        competition.espnLeague,
        eventId
      );

    if (!summary) {
      return res.status(502).json({
        success: false,
        source: "ESPN",
        error:
          "Impossibile recuperare il riepilogo della partita",
        eventId
      });
    }

    /* -----------------------------------------------------
       HEADER / COMPETITION
    ----------------------------------------------------- */

    const header =
      summary.header || {};

    const competitionInfo =
      header.competitions?.[0] ||
      summary.competitions?.[0] ||
      null;

    const competitors =
      arr(
        competitionInfo?.competitors
      );

    const home =
      getCompetitor(
        competitors,
        "home"
      );

    const away =
      getCompetitor(
        competitors,
        "away"
      );

    /* -----------------------------------------------------
       DATA
    ----------------------------------------------------- */

    const matchDate =
      first(
        header.date,
        competitionInfo?.date
      );

    const dateTime =
      getRomeDateTime(
        matchDate
      );

    /* -----------------------------------------------------
       LOGHI
    ----------------------------------------------------- */

    const homeLogo =
      first(
        home?.team?.logos?.[0]?.href,
        home?.team?.logo,
        home?.logos?.[0]?.href,
        home?.logo
      );

    const awayLogo =
      first(
        away?.team?.logos?.[0]?.href,
        away?.team?.logo,
        away?.logos?.[0]?.href,
        away?.logo
      );

    /* -----------------------------------------------------
       EVENTI
    ----------------------------------------------------- */

    const events =
      getMatchEvents(
        summary
      );

    const goals =
      getGoals(events);

    const cards =
      getCards(events);

    const substitutions =
      getSubstitutions(events);

    const injuries =
      getInjuries(events);

    /* -----------------------------------------------------
       RIGORI
    ----------------------------------------------------- */

    const penalties =
      getPenalties(
        summary
      );

    /* -----------------------------------------------------
       STADIO
    ----------------------------------------------------- */

    const venue =
      getVenue(
        summary,
        competitionInfo
      );

    /* -----------------------------------------------------
       ARBITRI
    ----------------------------------------------------- */

    const officials =
      getOfficials(
        summary,
        competitionInfo
      );

    /* -----------------------------------------------------
       BROADCAST
    ----------------------------------------------------- */

    const broadcasts =
      getBroadcasts(
        summary,
        competitionInfo
      );

    /* -----------------------------------------------------
       MVP
    ----------------------------------------------------- */

    const mvp =
      getMVP(summary);

    /* -----------------------------------------------------
       RESPONSE
    ----------------------------------------------------- */

    res.setHeader(
      "Cache-Control",
      "s-maxage=15, stale-while-revalidate=30"
    );

    return res.status(200).json({

      success: true,

      source: "ESPN",

      timezone:
        "Europe/Rome",

      competition: {
        id:
          competition.id,

        name:
          competition.name,

        espnLeague:
          competition.espnLeague
      },

      match: {

        id:
          String(eventId),

        date:
          dateTime
            ? dateTime.toFormat(
                "dd/MM/yyyy"
              )
            : null,

        time:
          dateTime
            ? dateTime.toFormat(
                "HH:mm"
              )
            : null,

        home: {
          id:
            teamId(home),

          name:
            teamName(home),

          abbreviation:
            clean(
              first(
                home?.team?.abbreviation,
                home?.abbreviation
              )
            ),

          logo:
            homeLogo || null,

          score:
            home?.score ?? "-",

          record:
            getRecord(home)
        },

        away: {
          id:
            teamId(away),

          name:
            teamName(away),

          abbreviation:
            clean(
              first(
                away?.team?.abbreviation,
                away?.abbreviation
              )
            ),

          logo:
            awayLogo || null,

          score:
            away?.score ?? "-",

          record:
            getRecord(away)
        },

        status:
          getStatus(
            competitionInfo
          )
      },

      /* =================================================
         MATCH EVENTS
      ================================================= */

      goals,

      cards,

      substitutions,

      injuries,

      penalties,

      /* =================================================
         CRONACA
      ================================================= */

      events,

      /* =================================================
         EXTRA MATCH INFO
      ================================================= */

      venue,

      officials,

      broadcasts,

      mvp,

      summaryMeta: {

        totalEvents:
          events.length,

        totalGoals:
          goals.length,

        totalCards:
          cards.length,

        totalSubstitutions:
          substitutions.length,

        totalInjuries:
          injuries.length,

        hasVenue:
          Boolean(venue),

        hasOfficials:
          officials.length > 0,

        hasBroadcasts:
          broadcasts.length > 0,

        hasMVP:
          Boolean(mvp)
      }
    });

  } catch (error) {

    console.error(
      "ESPN MATCH SUMMARY ERROR:",
      error
    );

    return res.status(500).json({

      success: false,

      source: "ESPN",

      error:
        error?.message ||
        "Errore interno durante il recupero della partita.",

      eventId:
        req.query?.id ||
        null
    });
  }
};
