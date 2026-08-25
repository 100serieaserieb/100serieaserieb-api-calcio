const { getCompetition } = require("../lib/competitions");
const { getMatchSummary } = require("../lib/espn");
const { normalizeTeamName } = require("../lib/teams");

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

/* =========================================================
   TRADUZIONI
========================================================= */

function translatePosition(value) {
  const text =
    String(value || "")
      .toLowerCase()
      .trim();

  if (
    text === "gk" ||
    text.includes("goalkeeper") ||
    text.includes("portiere")
  ) {
    return "Portiere";
  }

  if (
    text === "df" ||
    text.includes("defender") ||
    text.includes("difensore")
  ) {
    return "Difensore";
  }

  if (
    text === "mf" ||
    text.includes("midfielder") ||
    text.includes("centrocampista")
  ) {
    return "Centrocampista";
  }

  if (
    text === "fw" ||
    text.includes("forward") ||
    text.includes("attaccante")
  ) {
    return "Attaccante";
  }

  if (
    text.includes("goalkeeper") ||
    text.includes("keeper")
  ) {
    return "Portiere";
  }

  if (
    text.includes("defender") ||
    text.includes("back")
  ) {
    return "Difensore";
  }

  if (
    text.includes("midfielder") ||
    text.includes("midfield")
  ) {
    return "Centrocampista";
  }

  if (
    text.includes("forward") ||
    text.includes("striker")
  ) {
    return "Attaccante";
  }

  return clean(value);
}

/* =========================================================
   STATISTICHE GIOCATORE
========================================================= */

function translateStatisticName(name) {
  const value =
    String(name || "")
      .toLowerCase()
      .trim();

  const map = [
    ["minutes", "minutiGiocati"],
    ["minute", "minutiGiocati"],

    ["goals", "gol"],
    ["goal", "gol"],

    ["assists", "assist"],
    ["assist", "assist"],

    ["shots on target", "tiriInPorta"],
    ["shots on goal", "tiriInPorta"],
    ["shotsontarget", "tiriInPorta"],

    ["shots", "tiri"],

    ["fouls committed", "falliComessi"],
    ["fouls drawn", "falliSubiti"],
    ["fouls", "falli"],

    ["yellow cards", "cartelliniGialli"],
    ["yellow", "cartelliniGialli"],

    ["red cards", "cartelliniRossi"],
    ["red", "cartelliniRossi"],

    ["saves", "parate"],

    ["passes completed", "passaggiCompletati"],
    ["passes attempted", "passaggiTentati"],
    ["passes", "passaggi"],

    ["passing accuracy", "precisionePassaggi"],

    ["crosses", "cross"],

    ["tackles", "contrasti"],

    ["interceptions", "intercetti"],

    ["clearances", "respinte"],

    ["blocked shots", "tiriBloccati"],

    ["offsides", "fuorigioco"],

    ["corner kicks", "calciDangolo"],
    ["corners", "calciDangolo"],

    ["possession", "possesso"],

    ["duels won", "duelliVinti"],

    ["duels lost", "duelliPersi"],

    ["touches", "tocchi"],

    ["recoveries", "palloniRecuperati"],

    ["dispossessed", "palloniPersi"],

    ["errors leading to goal", "erroriChePortanoAlGol"],

    ["own goals", "autogol"],

    ["penalty kicks", "rigori"],

    ["penalties won", "rigoriOttenuti"],

    ["penalties conceded", "rigoriConcessi"],

    ["offsides", "fuorigioco"]
  ];

  for (const [english, italian] of map) {
    if (value.includes(english)) {
      return italian;
    }
  }

  return null;
}

function statisticValue(stat) {
  return first(
    stat?.displayValue,
    stat?.value,
    stat?.displayValueText
  );
}

function extractPlayerStatistics(player) {
  const result = {};

  const sources = [
    player?.statistics,
    player?.stats,
    player?.athlete?.statistics,
    player?.athlete?.stats
  ];

  let stats = [];

  for (const source of sources) {
    if (arr(source).length) {
      stats = source;
      break;
    }
  }

  for (const stat of stats) {
    const name = first(
      stat?.name,
      stat?.label,
      stat?.displayName,
      stat?.abbreviation,
      stat?.type
    );

    const key =
      translateStatisticName(name);

    if (!key) continue;

    result[key] =
      statisticValue(stat);
  }

  return result;
}

/* =========================================================
   GIOCATORE
========================================================= */

function extractPlayer(item) {
  const athlete =
    item?.athlete ||
    item?.player ||
    item;

  if (!athlete) {
    return null;
  }

  const name = first(
    athlete?.displayName,
    athlete?.fullName,
    athlete?.shortName,
    item?.displayName,
    item?.fullName
  );

  if (!name) {
    return null;
  }

  const positionObject =
    item?.position ||
    athlete?.position ||
    {};

  const position =
    first(
      positionObject?.displayName,
      positionObject?.name,
      positionObject?.abbreviation,
      typeof positionObject === "string"
        ? positionObject
        : null
    );

  const starter =
    item?.starter === true ||
    item?.starter === "true";

  const substitute =
    item?.substitute === true ||
    item?.substitute === "true";

  const stats =
    extractPlayerStatistics(item);

  return {
    id:
      clean(
        athlete?.id ||
        item?.id
      ),

    nome:
      clean(name),

    numero:
      clean(
        first(
          item?.jersey,
          athlete?.jersey,
          item?.uniformNumber
        )
      ),

    posizione:
      translatePosition(position),

    titolare:
      starter,

    riserva:
      substitute,

    statistiche:
      stats
  };
}

/* =========================================================
   ROSTER
========================================================= */

function extractPlayers(source) {
  const players = [];

  for (const item of arr(source)) {
    const player =
      extractPlayer(item);

    if (!player) continue;

    players.push(player);
  }

  return players;
}

function findTeamData(
  summary,
  competitor,
  side
) {
  const id =
    teamId(competitor);

  const sources = [
    summary?.boxscore?.players,
    summary?.boxscore?.teams,
    summary?.rosters,
    summary?.roster,
    summary?.lineups,
    summary?.header?.competitions?.[0]?.competitors,
    competitor
  ];

  for (const source of sources) {
    for (const item of arr(source)) {
      const itemId =
        teamId(item);

      if (
        id &&
        itemId &&
        String(id) ===
          String(itemId)
      ) {
        return item;
      }

      if (
        !id &&
        item?.homeAway === side
      ) {
        return item;
      }
    }
  }

  return null;
}

/* =========================================================
   RICERCA PROFONDA ROSTER ESPN
========================================================= */

function collectPossiblePlayers(
  summary,
  competitor,
  side
) {
  const result = [];

  const teamIdValue =
    teamId(competitor);

  function add(source) {
    for (const player of extractPlayers(source)) {
      result.push(player);
    }
  }

  /* boxscore.players */

  for (
    const teamBlock of arr(
      summary?.boxscore?.players
    )
  ) {
    if (
      teamBlock?.homeAway === side ||
      String(teamId(teamBlock)) ===
        String(teamIdValue)
    ) {
      add(
        teamBlock?.statistics
      );

      add(
        teamBlock?.players
      );

      add(
        teamBlock?.roster?.athletes
      );

      add(
        teamBlock?.athletes
      );
    }
  }

  /* boxscore.teams */

  for (
    const teamBlock of arr(
      summary?.boxscore?.teams
    )
  ) {
    if (
      teamBlock?.homeAway === side ||
      String(teamId(teamBlock)) ===
        String(teamIdValue)
    ) {
      add(
        teamBlock?.roster?.athletes
      );

      add(
        teamBlock?.roster?.players
      );

      add(
        teamBlock?.athletes
      );

      add(
        teamBlock?.players
      );
    }
  }

  /* rosters */

  for (
    const roster of arr(
      summary?.rosters
    )
  ) {
    if (
      roster?.homeAway === side ||
      String(teamId(roster)) ===
        String(teamIdValue)
    ) {
      add(
        roster?.roster?.athletes
      );

      add(
        roster?.roster?.players
      );

      add(
        roster?.athletes
      );

      add(
        roster?.players
      );
    }
  }

  /* lineup */

  for (
    const lineup of arr(
      summary?.lineups
    )
  ) {
    if (
      lineup?.homeAway === side ||
      String(teamId(lineup)) ===
        String(team
