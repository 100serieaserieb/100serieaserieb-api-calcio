import { NextResponse } from "next/server";

const ESPN_SITE =
  "https://site.api.espn.com/apis/site/v2/sports/soccer";

const ESPN_CORE =
  "https://sports.core.api.espn.com/v2/sports/soccer/leagues";

const DEFAULT_LEAGUE = "ita.1";
const TIMEZONE = "Europe/Rome";
const CACHE_SECONDS = 15;

/* =========================================================
   GENERIC HELPERS
========================================================= */

async function fetchJSON(url, options = {}) {
  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    options.timeout || 12000
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
      console.error(
        `ESPN ${response.status}: ${url}`
      );
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error(
      "ESPN FETCH ERROR:",
      url,
      error?.message || error
    );

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
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  const result = String(value).trim();

  return result.length > 0
    ? result
    : null;
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

  const match = String(value).match(
    /-?\d+(?:[.,]\d+)?/
  );

  if (!match) return null;

  const number = Number(
    match[0].replace(",", ".")
  );

  return Number.isFinite(number)
    ? number
    : null;
}

function getArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function unique(array) {
  return [
    ...new Set(
      array.filter(Boolean)
    ),
  ];
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
      value.shortName,
      value.name,
      value.shortDisplayName
    )
  );
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

  const teamObject =
    team.team || team;

  const logo =
    firstDefined(
      teamObject.logo,
      teamObject.logos?.[0]?.href,
      team.logo,
      team.logos?.[0]?.href
    );

  return {
    id: cleanString(
      firstDefined(
        teamObject.id,
        team.id,
        team.uid
      )
    ),

    name: normalizeName(
      teamObject
    ),

    abbreviation: cleanString(
      firstDefined(
        teamObject.abbreviation,
        team.abbreviation
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

function normalizeStatus(
  competition,
  header = {}
) {
  const status =
    competition?.status ||
    header?.competitions?.[0]?.status ||
    header?.status ||
    {};

  const type =
    status.type || {};

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

function normalizeVenue(
  competition,
  summary
) {
  const venue =
    firstDefined(
      competition?.venue,
      competition?.venue?.venue,
      summary?.gameInfo?.venue,
      summary?.gameInfo?.venue?.venue,
      summary?.header?.competitions?.[0]?.venue
    );

  if (!venue) return null;

  const address =
    venue.address || {};

  return {
    id: cleanString(
      venue.id
    ),

    name: cleanString(
      firstDefined(
        venue.fullName,
        venue.name,
        venue.displayName
      )
    ),

    city: cleanString(
      address.city
    ),

    country: cleanString(
      firstDefined(
        address.country,
        address.countryName
      )
    ),

    capacity: toNumber(
      venue.capacity
    ),

    indoor:
      typeof venue.indoor === "boolean"
        ? venue.indoor
        : null,

    address: cleanString(
      firstDefined(
        address.fullAddress,
        address.street,
        address.city
      )
    ),
  };
}

/* =========================================================
   TV / BROADCAST
========================================================= */

function normalizeBroadcasts(
  summary,
  competition
) {
  const channels = [];

  const sources = [
    ...getArray(
      competition?.broadcasts
    ),

    ...getArray(
      summary?.broadcasts
    ),

    ...getArray(
      summary?.header
        ?.competitions?.[0]
        ?.broadcasts
    ),

    ...getArray(
      summary?.gameInfo?.broadcasts
    ),
  ];

  for (const broadcast of sources) {
    const possibleNames = [
      broadcast?.name,
      broadcast?.shortName,
      broadcast?.longName,
      broadcast?.market,
      broadcast?.media?.name,
      broadcast?.media?.shortName,
      broadcast?.media?.longName,
    ];

    for (const name of possibleNames) {
      const value =
        cleanString(name);

      if (value) {
        channels.push(value);
      }
    }
  }

  return unique(channels);
}

/* =========================================================
   OFFICIALS
========================================================= */

function extractOfficialName(
  official
) {
  if (!official) return null;

  return normalizeName(
    firstDefined(
      official.athlete,
      official.person,
      official.displayName,
      official.fullName,
      official.name
    )
  );
}

function getOfficialRole(
  official
) {
  return String(
    firstDefined(
      official?.type?.text,
      official?.type?.name,
      official?.position,
      official?.role,
      official?.officialType,
      ""
    )
  ).toLowerCase();
}

function normalizeOfficials(
  summary,
  coreOfficials
) {
  const result = {
    referee: null,
    assistantReferee1: null,
    assistantReferee2: null,
    fourthOfficial: null,
    var: null,
    avar: null,
  };

  const sources = [
    ...getArray(
      summary?.officials
    ),

    ...getArray(
      summary?.gameInfo?.officials
    ),

    ...getArray(
      summary?.competition?.officials
    ),

    ...getArray(
      summary?.header
        ?.competitions?.[0]
        ?.officials
    ),

    ...getArray(
      coreOfficials?.items
    ),

    ...getArray(
      coreOfficials?.officials
    ),
  ];

  const officials = sources
    .filter(Boolean);

  for (const official of officials) {
    const name =
      extractOfficialName(
        official
      );

    if (!name) continue;

    const role =
      getOfficialRole(
        official
      );

    if (
      role.includes("avar") ||
      role.includes("video assistant referee")
    ) {
      if (!result.avar) {
        result.avar = name;
      }

      continue;
    }

    if (
      role === "var" ||
      role.includes("video referee") ||
      role.includes("video assistant")
    ) {
      if (!result.var) {
        result.var = name;
      }

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
      role.includes("linesman") ||
      role.includes("lineswoman")
    ) {
      if (!result.assistantReferee1) {
        result.assistantReferee1 = name;
      } else if (
        !result.assistantReferee2
      ) {
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
   * Fallback: ESPN sometimes returns
   * officials without the role.
   */

  const names = unique(
    officials
      .map(
        extractOfficialName
      )
      .filter(Boolean)
  );

  if (
    !result.referee &&
    names[0]
  ) {
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

  if (
    !result.var &&
    names[4]
  ) {
    result.var = names[4];
  }

  if (
    !result.avar &&
    names[5]
  ) {
    result.avar = names[5];
  }

  return result;
}

/* =========================================================
   STATISTICS
========================================================= */

function getStatisticValue(
  statistics,
  names
) {
  const wanted =
    names.map((name) =>
      String(name)
        .toLowerCase()
        .trim()
    );

  for (
    const stat of getArray(
      statistics
    )
  ) {
    const statName =
      String(
        firstDefined(
          stat?.name,
          stat?.label,
          stat?.abbreviation,
          stat?.displayName,
          ""
        )
      )
        .toLowerCase()
        .trim();

    if (
      wanted.some(
        (wantedName) =>
          statName ===
            wantedName ||
          statName.includes(
            wantedName
          )
      )
    ) {
      return firstDefined(
        stat?.displayValue,
        stat?.value
      );
    }
  }

  return null;
}

function normalizeTeamStatistics(
  teamStats
) {
  const statistics =
    getArray(
      teamStats?.statistics
    );

  return {
    team: normalizeName(
      firstDefined(
        teamStats?.team,
        teamStats?.competitor
      )
    ),

    shots: toNumber(
      getStatisticValue(
        statistics,
        [
          "shots",
          "total shots",
          "tiri",
        ]
      )
    ),

    shotsOnTarget: toNumber(
      getStatisticValue(
        statistics,
        [
          "shots on target",
          "shots on goal",
          "tiri in porta",
        ]
      )
    ),

    possession: toNumber(
      getStatisticValue(
        statistics,
        [
          "possession",
          "possesso",
        ]
      )
    ),

    corners: toNumber(
      getStatisticValue(
        statistics,
        [
          "corner kicks",
          "corners",
          "corner",
          "calci d'angolo",
        ]
      )
    ),

    offsides: toNumber(
      getStatisticValue(
        statistics,
        [
          "offsides",
          "offside",
          "fuorigioco",
        ]
      )
    ),

    fouls: toNumber(
      getStatisticValue(
        statistics,
        [
          "fouls",
          "falli",
        ]
      )
    ),

    yellowCards: toNumber(
      getStatisticValue(
        statistics,
        [
          "yellow cards",
          "yellowcard",
          "cartellini gialli",
        ]
      )
    ),

    redCards: toNumber(
      getStatisticValue(
        statistics,
        [
          "red cards",
          "redcard",
          "cartellini rossi",
        ]
      )
    ),

    saves: toNumber(
      getStatisticValue(
        statistics,
        [
          "saves",
          "save",
          "parades",
          "parata",
        ]
      )
    ),

    penalties: null,
  };
}

/* =========================================================
   PENALTY STATISTICS
========================================================= */

function extractPenaltyStats(
  statistics
) {
  const value =
    getStatisticValue(
      statistics,
      [
        "penalties",
        "penalty kicks",
        "rigori",
      ]
    );

  if (value === null) {
    return null;
  }

  return cleanString(
    value
  );
}

/* =========================================================
   LINEUPS
========================================================= */

function extractPlayerName(
  player
) {
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

function normalizePlayer(
  player
) {
  const athlete =
    player?.athlete ||
    player?.player ||
    player;

  const name =
    extractPlayerName(
      player
    );

  if (!name) {
    return null;
  }

  const starter =
    player?.starter === true ||
    player?.status === "starter" ||
    player?.starter === 1;

  const substitute =
    player?.substitute === true ||
    player?.status === "substitute" ||
    player?.substitute === 1;

  return {
    id: cleanString(
      firstDefined(
        athlete?.id,
        player?.id
      )
    ),

    name,

    jersey: cleanString(
      firstDefined(
        player?.jersey,
        athlete?.jersey
      )
    ),

    position: cleanString(
      firstDefined(
        player?.position?.abbreviation,
        player?.position?.name,
        athlete?.position?.abbreviation,
        athlete?.position?.name
      )
    ),

    starter,

    substitute,
  };
}

function normalizeLineup(
  competitor,
  summary,
  side
) {
  const summaryRosters =
    getArray(
      summary?.rosters
    );

  const roster =
    summaryRosters.find(
      (item) =>
        item.homeAway === side ||
        String(
          item.team?.id
        ) ===
          String(
            competitor?.team?.id
          )
    );

  const possibleSources = [
    competitor?.lineup,
    competitor?.roster,
    competitor?.players,
    roster,
    roster?.roster,
    roster?.players,
  ];

  let rawPlayers = [];

  for (
    const source of possibleSources
  ) {
    if (!source) continue;

    const players =
      getArray(
        source?.players
      ).length > 0
        ? getArray(
            source.players
          )
        : getArray(source);

    if (
      players.length > 0
    ) {
      rawPlayers =
        players;

      break;
    }
  }

  const players =
    rawPlayers
      .map(
        normalizePlayer
      )
      .filter(Boolean);

  const starters =
    players.filter(
      (player) =>
        player.starter
    );

  const substitutes =
    players.filter(
      (player) =>
        player.substitute
    );

  const formation =
    cleanString(
      firstDefined(
        competitor?.formation,
        competitor?.lineup
          ?.formation,
        roster?.formation,
        roster?.lineup
          ?.formation
      )
    );

  return {
    formation,

    starters,

    substitutes,

    players,
  };
}

/* =========================================================
   EVENTS
========================================================= */

function getPlayTeam(
  play
) {
  const competitor =
    play?.competitor ||
    play?.team ||
    getArray(
      play?.competitions
    )[0];

  return normalizeName(
    firstDefined(
      competitor?.team,
      competitor
    )
  );
}

function getPlayPlayer(
  play
) {
  return normalizeName(
    firstDefined(
      play?.athlete,
      play?.player
    )
  );
}

function normalizeEvent(
  play
) {
  if (!play) return null;

  const typeText =
    String(
      firstDefined(
        play?.type?.text,
        play?.type?.name,
        play?.type,
        ""
      )
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
    lower.includes("substitution") ||
    lower.includes("sostituzione")
  ) {
    type =
      "sostituzione";
  } else if (
    lower.includes("penalty") ||
    lower.includes("rigore")
  ) {
    type = "rigore";
  } else if (
    lower.includes("kickoff") ||
    lower.includes("inizio")
  ) {
    type = "inizio";
  } else if (
    lower.includes("half") ||
    lower.includes("halftime") ||
    lower.includes("tempo") ||
    lower.includes("intervallo")
  ) {
    type = "intervallo";
  } else if (
    lower.includes("end") ||
    lower.includes("fine")
  ) {
    type = "fine";
  } else if (
    lower.includes("injury") ||
    lower.includes("interruption") ||
    lower.includes("interruzione")
  ) {
    type =
      "interruzione";
  }

  const participants =
    getArray(
      play?.participants
    );

  let playerIn =
    firstDefined(
      play?.playerIn,
      play?.substitution
        ?.playerIn
    );

  let playerOut =
    firstDefined(
      play?.playerOut,
      play?.substitution
        ?.playerOut
    );

  if (
    type === "sostituzione"
  ) {
    if (
      !playerIn &&
      participants.length
    ) {
      const foundIn =
        participants.find(
          (participant) =>
            participant?.type === "in" ||
            participant?.role === "in"
        );

      if (foundIn) {
        playerIn =
          foundIn.athlete ||
          foundIn.player ||
          foundIn;
      }
    }

    if (
      !playerOut &&
      participants.length
    ) {
      const foundOut =
        participants.find(
          (participant) =>
            participant?.type === "out" ||
            participant?.role === "out"
        );

      if (foundOut) {
        playerOut =
          foundOut.athlete ||
          foundOut.player ||
          foundOut;
      }
    }
  }

  const text =
    cleanString(
      firstDefined(
        play?.text,
        play?.description
      )
    );

  /*
   * Fallback per sostituzioni
   * direttamente dal testo ESPN.
   */

  if (
    type === "sostituzione" &&
    text
  ) {
    const substitutionMatch =
      text.match(
        /(?:Substitution|Sostituzione)[^.]*(?:,\s*)?([^.]*)\s+(?:replaces|entra al posto di|sostituisce)\s+([^.]*)/i
      );

    if (
      substitutionMatch
    ) {
      if (!playerIn) {
        playerIn =
          substitutionMatch[1];
      }

      if (!playerOut) {
        playerOut =
          substitutionMatch[2];
      }
    }
  }

  return {
    id: cleanString(
      play?.id
    ),

    type,

    minute: cleanString(
      firstDefined(
        play?.clock?.displayValue,
        play?.clock?.value,
        play?.clock,
        play?.minute
      )
    ),

    team:
      getPlayTeam(play),

    player:
      getPlayPlayer(play),

    assist: normalizeName(
      firstDefined(
        play?.assist,
        play?.assist?.athlete
      )
    ),

    playerIn:
      normalizeName(
        playerIn
      ),

    playerOut:
      normalizeName(
        playerOut
      ),

    text,
  };
}

/* =========================================================
   PENALTIES
========================================================= */

function normalizePenalties(
  summary,
  plays
) {
  const penalties = [];

  for (
    const penalty of getArray(
      summary?.penalties
    )
  ) {
    const result =
      cleanString(
        firstDefined(
          penalty?.result,
          penalty?.outcome,
          penalty?.displayValue
        )
      );

    penalties.push({
      minute: cleanString(
        firstDefined(
          penalty?.clock,
          penalty?.minute
        )
      ),

      team: normalizeName(
        firstDefined(
          penalty?.team,
          penalty?.competitor
        )
      ),

      player: normalizeName(
        firstDefined(
          penalty?.athlete,
          penalty?.player
        )
      ),

      result,

      scored:
        typeof penalty?.scored ===
        "boolean"
          ? penalty.scored
          : null,
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

    const alreadyExists =
      penalties.some(
        (item) =>
          item.minute ===
            cleanString(
              firstDefined(
                play?.clock
                  ?.displayValue,
                play?.clock,
                play?.minute
              )
            ) &&
          item.player ===
            normalizeName(
              firstDefined(
                play?.athlete,
                play?.player
              )
            )
      );

    if (
      alreadyExists
    ) {
      continue;
    }

    let scored = null;

    if (
      text.includes("scored") ||
      text.includes("goal") ||
      text.includes("segnato")
    ) {
      scored = true;
    }

    if (
      text.includes("missed") ||
      text.includes("saved") ||
      text.includes("parato") ||
      text.includes("sbagliato")
    ) {
      scored = false;
    }

    penalties.push({
      minute: cleanString(
        firstDefined(
          play?.clock
            ?.displayValue,
          play?.clock,
          play?.minute
        )
      ),

      team:
        getPlayTeam(play),

      player:
        getPlayPlayer(play),

      result:
        cleanString(
          play?.text
        ),

      scored,
    });
  }

  return penalties;
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
    summary?.gameInfo
      ?.playerOfTheMatch,
    summary?.gameInfo?.mvp,
    summary?.leaders
      ?.playerOfTheMatch,
    summary?.leaders?.[0],
  ];

  for (
    const candidate of candidates
  ) {
    if (!candidate) {
      continue;
    }

    const athlete =
      candidate?.athlete ||
      candidate?.player ||
      candidate;

    const name =
      normalizeName(
        athlete
      );

    if (!name) {
      continue;
    }

    return {
      name,

      team:
        normalizeName(
          firstDefined(
            candidate?.team,
            athlete?.team
          )
        ),

      reason:
        cleanString(
          firstDefined(
            candidate?.reason,
            candidate?.description
          )
        ),
    };
  }

  return null;
}

/* =========================================================
   COMPETITION
========================================================= */

function findCompetition(
  summary,
  selectedEvent
) {
  return (
    summary?.header
      ?.competitions?.[0] ||
    summary?.competitions?.[0] ||
    selectedEvent
      ?.competitions?.[0] ||
    null
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
  if (
    !eventId ||
    !competitionId
  ) {
    return null;
  }

  const url =
    `${ESPN_CORE}/${league}` +
    `/events/${eventId}` +
    `/competitions/${competitionId}` +
    `/officials?limit=50`;

  return fetchJSON(url);
}

/* =========================================================
   CORE STATISTICS
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

  return fetchJSON(url);
}

/* =========================================================
   SCOREBOARD SEARCH
========================================================= */

async function findEvent(
  league,
  query,
  date
) {
  const params =
    new URLSearchParams();

  if (date) {
    params.set(
      "dates",
      date.replaceAll("-", "")
    );
  }

  params.set(
    "limit",
    "100"
  );

  const url =
    `${ESPN_SITE}/${league}/scoreboard?` +
    params.toString();

  const data =
    await fetchJSON(url);

  const events =
    getArray(
      data?.events
    );

  if (!query) {
    return (
      events[0] || null
    );
  }

  const normalizedQuery =
    query
      .toLowerCase()
      .trim();

  /*
   * Prima prova ricerca
   * completa della coppia.
   */

  const queryParts =
    normalizedQuery
      .split(/\s+/)
      .filter(Boolean);

  const exact =
    events.find(
      (event) => {
        const teams =
          getArray(
            event?.competitions?.[0]
              ?.competitors
          );

        const names =
          teams.map(
            (team) =>
              String(
                firstDefined(
                  team?.team
                    ?.displayName,
                  team?.team?.name,
                  team?.displayName
                ) || ""
              ).toLowerCase()
          );

        return (
          queryParts.length >= 2 &&
          queryParts.every(
            (part) =>
              names.some(
                (name) =>
                  name.includes(
                    part
                  )
              )
          );
        );
      }
    );

  if (exact) {
    return exact;
  }

  /*
   * Fallback: basta trovare
   * almeno una squadra.
   */

  return (
    events.find(
      (event) => {
        const teams =
          getArray(
            event?.competitions?.[0]
              ?.competitors
          );

        const names =
          teams.map(
            (team) =>
              String(
                firstDefined(
                  team?.team
                    ?.displayName,
                  team?.team?.name,
                  team?.displayName
                ) || ""
              ).toLowerCase()
          );

        return names.some(
          (name) =>
            name.includes(
              normalizedQuery
            )
        );
      }
    ) || null
  );
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
      date: cleanString(value),
      time: null,
    };
  }

  return {
    date:
      date.toLocaleDateString(
        "it-IT",
        {
          timeZone: TIMEZONE,
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }
      ),

    time:
      date.toLocaleTimeString(
        "it-IT",
        {
          timeZone: TIMEZONE,
          hour: "2-digit",
          minute: "2-digit",
        }
      ),
  };
}

/* =========================================================
   MAIN API
========================================================= */

export async function GET(
  request
) {
  try {
    const url =
      new URL(
        request.url
      );

    const league =
      getLeague(request);

    const eventId =
      url.searchParams.get(
        "id"
      ) ||
      url.searchParams.get(
        "event"
      ) ||
      url.searchParams.get(
        "matchId"
      );

    const query =
      url.searchParams.get(
        "q"
      ) ||
      url.searchParams.get(
        "search"
      );

    const date =
      url.searchParams.get(
        "date"
      );

    let selectedEvent =
      null;

    /* =====================================================
       1. EVENT ID
    ===================================================== */

    if (eventId) {
      const params =
        new URLSearchParams();

      if (date) {
        params.set(
          "dates",
          date.replaceAll(
            "-",
            ""
          )
        );
      }

      params.set(
        "limit",
        "100"
      );

      const scoreboard =
        await fetchJSON(
          `${ESPN_SITE}/${league}/scoreboard?${params.toString()}`
        );

      selectedEvent =
        getArray(
          scoreboard?.events
        ).find(
          (event) =>
            String(
              event?.id
            ) ===
            String(eventId)
        ) || null;
    }

    /* =====================================================
       2. SEARCH
    ===================================================== */

    if (
      !selectedEvent &&
      query
    ) {
      selectedEvent =
        await findEvent(
          league,
          query,
          date
        );
    }

    /* =====================================================
       3. NOT FOUND
    ===================================================== */

    if (!selectedEvent) {
      return NextResponse.json(
        {
          success: false,
          source: "ESPN",
          error:
            "Partita non trovata",
          query:
            query || null,
          eventId:
            eventId || null,
        },
        {
          status: 404,
        }
      );
    }

    const actualEventId =
      String(
        selectedEvent.id
      );

    /* =====================================================
       4. SUMMARY
    ===================================================== */

    const summary =
      await fetchJSON(
        `${ESPN_SITE}/${league}/summary?event=${actualEventId}`
      );

    const competition =
      findCompetition(
        summary,
        selectedEvent
      );

    const competitors =
      getArray(
        competition?.competitors
      );

    const homeRaw =
      competitors.find(
        (team) =>
          team?.homeAway ===
          "home"
      ) ||
      competitors[0] ||
      null;

    const awayRaw =
      competitors.find(
        (team) =>
          team?.homeAway ===
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

    /* =====================================================
       5. CORE IDs
    ===================================================== */

    const competitionId =
      cleanString(
        firstDefined(
          competition?.id,
          selectedEvent
            ?.competitions?.[0]
            ?.id
        )
      );

    const homeId =
      cleanString(
        firstDefined(
          homeRaw?.team?.id,
          homeRaw?.id
        )
      );

    const awayId =
      cleanString(
        firstDefined(
          awayRaw?.team?.id,
          awayRaw?.id
        )
      );

    /* =====================================================
       6. RICH DATA
    ===================================================== */

    const [
      coreOfficials,
      homeCoreStats,
      awayCoreStats,
    ] =
      await Promise.all([
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

    /* =====================================================
       7. LINEUPS
    ===================================================== */

    const homeLineup =
      normalizeLineup(
        homeRaw,
        summary,
        "home"
      );

    const awayLineup =
      normalizeLineup(
        awayRaw,
        summary,
        "away"
      );

    /* =====================================================
       8. BOXSCORE
    ===================================================== */

    const boxscore =
      summary?.boxscore ||
      null;

    const boxscoreTeams =
      getArray(
        boxscore?.teams
      );

    const homeBox =
      boxscoreTeams.find(
        (team) =>
          team?.homeAway ===
          "home"
      );

    const awayBox =
      boxscoreTeams.find(
        (team) =>
          team?.homeAway ===
          "away"
      );

    const homeStatsSource =
      homeBox ||
      {
        team: home.name,
        statistics:
          homeCoreStats?.items ||
          homeCoreStats
            ?.statistics ||
          [],
      };

    const awayStatsSource =
      awayBox ||
      {
        team: away.name,
        statistics:
          awayCoreStats?.items ||
          awayCoreStats
            ?.statistics ||
          [],
      };

    const homeStats =
      normalizeTeamStatistics(
        homeStatsSource
      );

    const awayStats =
      normalizeTeamStatistics(
        awayStatsSource
      );

    homeStats.penalties =
      extractPenaltyStats(
        homeStatsSource
          ?.statistics
      );

    awayStats.penalties =
      extractPenaltyStats(
        awayStatsSource
          ?.statistics
      );

    /* =====================================================
       9. EVENTS
    ===================================================== */

    const rawPlays =
      getArray(
        summary?.plays
      );

    const events =
      rawPlays
        .map(
          normalizeEvent
        )
        .filter(Boolean);

    /* =====================================================
       10. PENALTIES
    ===================================================== */

    const penalties =
      normalizePenalties(
        summary,
        rawPlays
      );

    /* =====================================================
       11. VENUE
    ===================================================== */

    const venue =
      normalizeVenue(
        competition,
        summary
      );

    /* =====================================================
       12. OFFICIALS
    ===================================================== */

    const officials =
      normalizeOfficials(
        summary,
        coreOfficials
      );

    /* =====================================================
       13. TV
    ===================================================== */

    const tv =
      normalizeBroadcasts(
        summary,
        competition
      );

    /* =====================================================
       14. MVP
    ===================================================== */

    const mvp =
      normalizeMVP(
        summary
      );

    /* =====================================================
       15. DATE / TIME
    ===================================================== */

    const matchDate =
      firstDefined(
        competition?.date,
        selectedEvent?.date
      );

    const {
      date: formattedDate,
      time: formattedTime,
    } =
      formatDateTime(
        matchDate
      );

    /* =====================================================
       16. COMPETITION NAME
    ===================================================== */

    const competitionName =
      cleanString(
        firstDefined(
          selectedEvent
            ?.league?.name,
          competition
            ?.league?.name,
          summary?.header
            ?.league?.name,
          "Serie A"
        )
      );

    const competitionEspnId =
      cleanString(
        firstDefined(
          selectedEvent
            ?.league?.id,
          competition
            ?.league?.id,
          league
        )
      );

    /* =====================================================
       17. FINAL RESPONSE
    ===================================================== */

    const response = {
      success: true,

      source: "ESPN",

      timezone: TIMEZONE,

      competition: {
        id:
          competitionEspnId,

        name:
          competitionName,

        espnLeague:
          league,

        season:
          cleanString(
            firstDefined(
              selectedEvent
                ?.season?.year,
              competition
                ?.season?.year,
              selectedEvent
                ?.season?.displayName
            )
          ),
      },

      match: {
        id:
          actualEventId,

        date:
          formattedDate ||
          cleanString(
            matchDate
          ),

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

      /*
       * FORMAZIONI
       */

      lineups: {
        home:
          homeLineup,

        away:
          awayLineup,
      },

      /*
       * STATISTICHE
       */

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

      /*
       * RIGORI
       */

      penalties,

      /*
       * STADIO
       */

      venue,

      /*
       * TERNA ARBITRALE
       */

      officials,

      /*
       * TV
       */

      tv,

      /*
       * MVP
       */

      mvp,

      /*
       * EVENTI
       */

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

        details:
          process.env.NODE_ENV ===
          "development"
            ? String(
                error?.message ||
                error
              )
            : undefined,
      },
      {
        status: 500,
      }
    );
  }
}
