const { getCompetition } = require("../lib/competitions");
const { getMatchSummary } = require("../lib/espn");
const { normalizeTeamName } = require("../lib/teams");
const { DateTime } = require("luxon");

/*
|--------------------------------------------------------------------------
| DATA / ORA
|--------------------------------------------------------------------------
*/

function getRomeDateTime(date) {
  if (!date) return null;

  const parsed = DateTime.fromISO(String(date), {
    zone: "utc"
  });

  if (!parsed.isValid) return null;

  return parsed.setZone("Europe/Rome");
}

/*
|--------------------------------------------------------------------------
| UTILITY
|--------------------------------------------------------------------------
*/

function cleanText(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    return String(value);
  }

  return value
    .replace(/\s+/g, " ")
    .trim();
}

function firstNonEmpty(...values) {
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

function toNumber(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const normalized = String(value)
    .replace("%", "")
    .replace(",", ".")
    .trim();

  const number = Number(normalized);

  return Number.isFinite(number)
    ? number
    : null;
}

function normalizePercentage(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();

  if (text.includes("%")) {
    return text;
  }

  const number = toNumber(value);

  if (number === null) {
    return null;
  }

  return `${number}%`;
}

function uniqueArray(array) {
  if (!Array.isArray(array)) {
    return [];
  }

  return [
    ...new Set(
      array
        .filter(
          value =>
            value !== null &&
            value !== undefined &&
            value !== ""
        )
        .map(value => String(value).trim())
        .filter(Boolean)
    )
  ];
}

/*
|--------------------------------------------------------------------------
| TEAM
|--------------------------------------------------------------------------
*/

function getCompetitor(competitors, side) {
  if (!Array.isArray(competitors)) {
    return null;
  }

  return (
    competitors.find(
      item => item?.homeAway === side
    ) || null
  );
}

function getTeamName(competitor) {
  const name =
    competitor?.team?.displayName ||
    competitor?.team?.name ||
    competitor?.team?.shortDisplayName ||
    competitor?.team?.abbreviation ||
    null;

  return name
    ? normalizeTeamName(name)
    : null;
}

function getTeamLogo(competitor) {
  return (
    competitor?.team?.logos?.[0]?.href ||
    competitor?.team?.logo ||
    null
  );
}

/*
|--------------------------------------------------------------------------
| EVENTI ESPN
|--------------------------------------------------------------------------
*/

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
      event.type.description ||
      event.type.id ||
      ""
    );
  }

  return "";
}

function getEventMinute(event) {
  if (!event) return null;

  if (
    event.clock &&
    typeof event.clock === "object"
  ) {
    return (
      event.clock.displayValue ||
      event.clock.value ||
      null
    );
  }

  if (typeof event.clock === "string") {
    return event.clock;
  }

  return (
    event.minute ||
    event.time ||
    null
  );
}

function getRawEventText(event) {
  if (!event) return "";

  return (
    event.text ||
    event.shortText ||
    event.description ||
    event.shortDescription ||
    ""
  );
}

/*
|--------------------------------------------------------------------------
| NOME GIOCATORE DAGLI EVENTI
|--------------------------------------------------------------------------
*/

function extractPlayerName(text) {
  if (!text) return null;

  const patterns = [
    /*
     * Italiano
     */
    /infortunio a ([^(.,]+?)(?:\s*\(|\.|,|$)/i,

    /*
     * ESPN:
     * Player (Team) is shown...
     */
    /^([^(]+?)\s*\([^)]*\)\s+(?:is|was)\s+shown/i,

    /*
     * Gol:
     * Gol! Udinese 1, Como 0. Hassane Kamara (Udinese)...
     */
    /(?:Gol!|Goal!)[^.]*\.\s*([^()]+?)\s*\(/i,

    /*
     * Gol di Player
     */
    /Gol di\s+([^,.]+?)(?:\s+per|\s*,|\.|$)/i,

    /*
     * sostituzione:
     * Player entra...
     */
    /^([A-ZÀ-ÖØ-Ý][^,.]+?)\s+entra\s+al posto/i,

    /*
     * replaces
     */
    /Sostituzione.*?([A-ZÀ-ÖØ-Ý][^,.]+?)\s+replaces/i,

    /*
     * shown the yellow card
     */
    /^([A-ZÀ-ÖØ-Ý][^()]+?)\s*\([^)]*\).*?(?:shown|riceve).*?(?:cartellino|yellow|red)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match?.[1]) {
      return cleanText(match[1]);
    }
  }

  return null;
}

function extractAssist(text) {
  if (!text) return null;

  const patterns = [
    /assist(?:ito)?\s+(?:di|da)\s+([^.,]+?)(?:\s+con|\s+following|\.|,|$)/i,
    /Assisted by\s+([^.,]+?)(?:\s+with|\s+following|\.|,|$)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match?.[1]) {
      return cleanText(match[1]);
    }
  }

  return null;
}

function extractSubstitution(text) {
  if (!text) {
    return {
      playerIn: null,
      playerOut: null
    };
  }

  let match = text.match(
    /(?:Sostituzione.*?,?\s*)?(.+?)\s+entra\s+al posto di\s+(.+?)(?:\s+per\s+.+)?\.?$/i
  );

  if (match) {
    return {
      playerIn: cleanText(match[1]),
      playerOut: cleanText(match[2])
    };
  }

  match = text.match(
    /(.+?)\s+replaces\s+(.+?)(?:\.|$)/i
  );

  if (match) {
    return {
      playerIn: cleanText(match[1]),
      playerOut: cleanText(match[2])
    };
  }

  match = text.match(
    /Sostituzione.*?([A-ZÀ-ÖØ-Ý][^,.]+?)\s+replaces\s+(.+?)(?:\.|$)/i
  );

  if (match) {
    return {
      playerIn: cleanText(match[1]),
      playerOut: cleanText(match[2])
    };
  }

  return {
    playerIn: null,
    playerOut: null
  };
}

/*
|--------------------------------------------------------------------------
| TRADUZIONE EVENTI
|--------------------------------------------------------------------------
*/

function translateEventType(type) {
  const value = String(type || "")
    .toLowerCase()
    .trim();

  if (
    value.includes("kickoff") ||
    value.includes("start 1st") ||
    value.includes("inizio primo")
  ) {
    return "Inizio primo tempo";
  }

  if (
    value.includes("start 2nd") ||
    value.includes("inizio secondo")
  ) {
    return "Inizio secondo tempo";
  }

  if (
    value.includes("end regular") ||
    value.includes("game over") ||
    value.includes("fine partita")
  ) {
    return "Fine partita";
  }

  if (
    value.includes("first half ends") ||
    value.includes("fine primo")
  ) {
    return "Fine primo tempo";
  }

  if (
    value.includes("goal") ||
    value.includes("gol")
  ) {
    return "Gol";
  }

  if (
    value.includes("yellow") ||
    value.includes("cartellino giallo")
  ) {
    return "Cartellino giallo";
  }

  if (
    value.includes("red") ||
    value.includes("cartellino rosso")
  ) {
    return "Cartellino rosso";
  }

  if (
    value.includes("substitution") ||
    value.includes("sostituzione")
  ) {
    return "Sostituzione";
  }

  if (
    value.includes("penalty") ||
    value.includes("rigore")
  ) {
    return "Rigore";
  }

  if (
    value.includes("offside") ||
    value.includes("fuorigioco")
  ) {
    return "Fuorigioco";
  }

  if (
    value.includes("delay") ||
    value.includes("interruption") ||
    value.includes("interruzione")
  ) {
    return "Interruzione";
  }

  if (
    value.includes("resume") ||
    value.includes("ripresa")
  ) {
    return "Ripresa del gioco";
  }

  return cleanText(type) || "Evento";
}

function translateText(text, event) {
  if (!text) {
    return null;
  }

  let result = cleanText(text);

  /*
   * Rimuove alcune frasi inglesi ricorrenti di ESPN
   */

  result = result
    .replace(
      /Delay in match because of an injury\s*/gi,
      "gioco interrotto per un infortunio a "
    )
    .replace(
      /Delay over\. They are ready to continue\.?/gi,
      "Gioco ripreso."
    )
    .replace(
      /First Half ends,.*?\./gi,
      "Fine del primo tempo."
    )
    .replace(
      /End Regular Time/gi,
      "Fine della partita."
    )
    .replace(
      /Start 2nd Half/gi,
      "Inizio del secondo tempo."
    )
    .replace(
      /Kickoff/gi,
      "Inizio del primo tempo."
    )
    .replace(
      /is shown the Cartellino giallo for a bad foul/gi,
      "riceve il cartellino giallo per un fallo."
    )
    .replace(
      /is shown the Cartellino giallo/gi,
      "riceve il cartellino giallo."
    )
    .replace(
      /is shown the red card/gi,
      "riceve il cartellino rosso."
    )
    .replace(
      /replaces/gi,
      "entra al posto di"
    )
    .replace(
      /because of an injury/gi,
      "a causa di un infortunio"
    )
    .replace(
      /following a corner/gi,
      "dopo un calcio d'angolo"
    )
    .replace(
      /following a fast break/gi,
      "dopo un contropiede"
    )
    .replace(
      /with a through ball/gi,
      "con un passaggio filtrante"
    )
    .replace(
      /left footed shot/gi,
      "tiro di sinistro"
    )
    .replace(
      /right footed shot/gi,
      "tiro di destro"
    )
    .replace(
      /shot from very close range/gi,
      "tiro da distanza ravvicinata"
    )
    .replace(
      /shot from the centre of the box/gi,
      "tiro dal centro dell'area"
    )
    .replace(
      /to the bottom right corner/gi,
      "nell'angolo basso destro"
    )
    .replace(
      /to the bottom left corner/gi,
      "nell'angolo basso sinistro"
    )
    .replace(
      /Goal!/gi,
      "Gol!"
    )
    .replace(
      /Goal/gi,
      "Gol"
    )
    .replace(
      /Assisted by/gi,
      "Assist di"
    )
    .replace(
      /First Half ends/gi,
      "Fine del primo tempo"
    );

  /*
   * Normalizzazione finale
   */

  result = result
    .replace(/\s+/g, " ")
    .replace(/\s+\./g, ".")
    .trim();

  return result || null;
}

/*
|--------------------------------------------------------------------------
| EVENTO
|--------------------------------------------------------------------------
*/

function parseEvent(event) {
  if (!event) {
    return null;
  }

  const rawType = getEventType(event);
  const rawText = getRawEventText(event);

  const type = translateEventType(rawType);

  const team =
    typeof event.team === "string"
      ? normalizeTeamName(event.team)
      : event.team?.displayName
        ? normalizeTeamName(
            event.team.displayName
          )
        : null;

  let player =
    event.player?.displayName ||
    event.player?.fullName ||
    event.player?.name ||
    event.athlete?.displayName ||
    event.athlete?.fullName ||
    null;

  let assist =
    event.assist?.displayName ||
    event.assist?.fullName ||
    event.assist?.name ||
    null;

  /*
   * GOL
   */

  if (type === "Gol") {
    player =
      player ||
      extractPlayerName(rawText);

    assist =
      assist ||
      extractAssist(rawText);
  }

  /*
   * CARTELLINI
   */

  if (
    type === "Cartellino giallo" ||
    type === "Cartellino rosso"
  ) {
    player =
      player ||
      extractPlayerName(rawText);
  }

  /*
   * INFORTUNI
   */

  if (type === "Interruzione") {
    player =
      player ||
      extractPlayerName(rawText);
  }

  /*
   * SOSTITUZIONI
   */

  let playerIn = null;
  let playerOut = null;

  if (type === "Sostituzione") {
    const substitution =
      extractSubstitution(rawText);

    playerIn =
      event.substitution?.in?.displayName ||
      event.substitution?.in?.fullName ||
      substitution.playerIn;

    playerOut =
      event.substitution?.out?.displayName ||
      event.substitution?.out?.fullName ||
      substitution.playerOut;
  }

  let text =
    translateText(rawText, event);

  /*
   * Se ESPN non restituisce il testo,
   * creiamo una descrizione italiana pulita
   */

  if (!text) {
    if (type === "Inizio primo tempo") {
      text = "Inizio del primo tempo.";
    } else if (
      type === "Inizio secondo tempo"
    ) {
      text = "Inizio del secondo tempo.";
    } else if (
      type === "Fine primo tempo"
    ) {
      text = "Fine del primo tempo.";
    } else if (
      type === "Fine partita"
    ) {
      text = "Fine della partita.";
    } else if (
      type === "Sostituzione" &&
      playerIn &&
      playerOut
    ) {
      text =
        `${playerIn} entra al posto di ${playerOut}.`;
    } else if (
      type === "Cartellino giallo" &&
      player
    ) {
      text =
        `${player} riceve il cartellino giallo.`;
    } else if (
      type === "Cartellino rosso" &&
      player
    ) {
      text =
        `${player} riceve il cartellino rosso.`;
    }
  }

  return {
    id: event.id || null,

    type,

    minute:
      getEventMinute(event),

    team,

    player:
      player
        ? cleanText(player)
        : null,

    assist:
      assist
        ? cleanText(assist)
        : null,

    playerIn:
      playerIn
        ? cleanText(playerIn)
        : null,

    playerOut:
      playerOut
        ? cleanText(playerOut)
        : null,

    text:
      text || null
  };
}

/*
|--------------------------------------------------------------------------
| STATISTICHE
|--------------------------------------------------------------------------
*/

function getStatisticValue(stat) {
  if (!stat) return null;

  if (
    stat.displayValue !== undefined &&
    stat.displayValue !== null
  ) {
    return stat.displayValue;
  }

  if (
    stat.value !== undefined &&
    stat.value !== null
  ) {
    return stat.value;
  }

  if (
    stat.statistics?.value !== undefined
  ) {
    return stat.statistics.value;
  }

  return null;
}

function normalizeStatisticName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function extractStatsFromArray(stats) {
  const result = {};

  if (!Array.isArray(stats)) {
    return result;
  }

  for (const stat of stats) {
    const name =
      stat?.name ||
      stat?.label ||
      stat?.displayName ||
      stat?.abbreviation ||
      "";

    const key =
      normalizeStatisticName(name);

    const value =
      getStatisticValue(stat);

    if (!key || value === null) {
      continue;
    }

    result[key] = value;
  }

  return result;
}

function findStatistic(stats, names) {
  if (!Array.isArray(stats)) {
    return null;
  }

  const normalizedNames =
    names.map(normalizeStatisticName);

  for (const stat of stats) {
    const name =
      normalizeStatisticName(
        stat?.name ||
        stat?.label ||
        stat?.displayName ||
        stat?.abbreviation ||
        ""
      );

    if (
      normalizedNames.includes(name)
    ) {
      return getStatisticValue(stat);
    }
  }

  return null;
}

function getTeamStatistics(
  summary,
  competitor,
  side
) {
  const result = {
    team:
      getTeamName(competitor),

    tiri: null,

    tiriInPorta: null,

    possesso: null,

    calciDangolo: null,

    fuorigioco: null,

    rigori: null
  };

  /*
   * Possibili posizioni dei dati ESPN.
   */

  const sources = [
    competitor?.statistics,
    competitor?.stats,
    summary?.statistics?.[side],
    summary?.boxscore?.teams?.find(
      team =>
        team?.team?.id ===
        competitor?.team?.id
    )?.statistics
  ];

  for (const stats of sources) {
    if (!Array.isArray(stats)) {
      continue;
    }

    const tiri =
      findStatistic(stats, [
        "shots",
        "totalshots",
        "tiri",
        "total shots"
      ]);

    const tiriInPorta =
      findStatistic(stats, [
        "shotsontarget",
        "shots on target",
        "tiri in porta"
      ]);

    const possesso =
      findStatistic(stats, [
        "possession",
        "possession percentage",
        "possesso"
      ]);

    const calciDangolo =
      findStatistic(stats, [
        "corners",
        "corner kicks",
        "calci dangolo"
      ]);

    const fuorigioco =
      findStatistic(stats, [
        "offsides",
        "offside",
        "fuorigioco"
      ]);

    const rigori =
      findStatistic(stats, [
        "penalties",
        "penalty kicks",
        "rigori"
      ]);

    if (result.tiri === null) {
      result.tiri = toNumber(tiri);
    }

    if (result.tiriInPorta === null) {
      result.tiriInPorta =
        toNumber(tiriInPorta);
    }

    if (result.possesso === null) {
      result.possesso =
        normalizePercentage(possesso);
    }

    if (result.calciDangolo === null) {
      result.calciDangolo =
        toNumber(calciDangolo);
    }

    if (result.fuorigioco === null) {
      result.fuorigioco =
        toNumber(fuorigioco);
    }

    if (result.rigori === null) {
      result.rigori =
        toNumber(rigori);
    }
  }

  return result;
}

/*
|--------------------------------------------------------------------------
| RIGORI
|--------------------------------------------------------------------------
*/

function parsePenalty(penalty) {
  if (!penalty) {
    return null;
  }

  const player =
    penalty.player?.displayName ||
    penalty.player?.fullName ||
    penalty.athlete?.displayName ||
    penalty.athlete?.fullName ||
    penalty.player ||
    null;

  const team =
    typeof penalty.team === "string"
      ? normalizeTeamName(penalty.team)
      : penalty.team?.displayName
        ? normalizeTeamName(
            penalty.team.displayName
          )
        : null;

  const result =
    penalty.result ||
    penalty.outcome ||
    penalty.description ||
    null;

  let esito = null;

  const resultText =
    String(result || "").toLowerCase();

  if (
    resultText.includes("miss") ||
    resultText.includes("save") ||
    resultText.includes("parato") ||
    resultText.includes("sbagliato")
  ) {
    esito = "Sbagliato/Parato";
  } else if (
    resultText.includes("goal") ||
    resultText.includes("scored") ||
    resultText.includes("segnato")
  ) {
    esito = "Segnato";
  } else if (result) {
    esito = cleanText(result);
  }

  return {
    id: penalty.id || null,

    minute:
      penalty.clock?.displayValue ||
      penalty.minute ||
      null,

    team,

    player:
      player
        ? cleanText(player)
        : null,

    esito,

    risultato:
      result
        ? cleanText(result)
        : null
  };
}

function getPenalties(summary, events) {
  const penalties = [];

  const possibleSources = [
    summary?.penalties,
    summary?.penaltyShootout,
    summary?.shootout?.penalties,
    summary?.plays?.filter(
      event =>
        String(
          getEventType(event)
        )
          .toLowerCase()
          .includes("penalty")
    )
  ];

  for (const source of possibleSources) {
    if (!Array.isArray(source)) {
      continue;
    }

    for (const item of source) {
      const parsed =
        parsePenalty(item);

      if (parsed) {
        penalties.push(parsed);
      }
    }
  }

  /*
   * Cerca anche i rigori negli eventi
   */

  for (const event of events) {
    if (
      event.type === "Rigore"
    ) {
      penalties.push({
        id: event.id,

        minute:
          event.minute,

        team:
          event.team,

        player:
          event.player,

        esito:
          event.text,

        risultato:
          event.text
      });
    }
  }

  const unique = [];
  const ids = new Set();

  for (const penalty of penalties) {
    const key =
      penalty.id ||
      `${penalty.minute}-${penalty.team}-${penalty.player}`;

    if (ids.has(key)) {
      continue;
    }

    ids.add(key);
    unique.push(penalty);
  }

  return unique;
}

/*
|--------------------------------------------------------------------------
| STADIO
|--------------------------------------------------------------------------
*/

function getVenue(summary, competitionInfo) {
  const venue =
    competitionInfo?.venue ||
    summary?.header?.venue ||
    summary?.venue ||
    null;

  if (!venue) {
    return null;
  }

  return {
    name:
      firstNonEmpty(
        venue.fullName,
        venue.displayName,
        venue.name
      ),

    city:
      firstNonEmpty(
        venue.address?.city,
        venue.city
      ),

    country:
      firstNonEmpty(
        venue.address?.country,
        venue.country
      ),

    capacity:
      toNumber(
        firstNonEmpty(
          venue.capacity,
          venue.capacity?.value
        )
      )
  };
}

/*
|--------------------------------------------------------------------------
| UFFICIALI
|--------------------------------------------------------------------------
*/

function getOfficialName(official) {
  if (!official) return null;

  if (typeof official === "string") {
    return cleanText(official);
  }

  return firstNonEmpty(
    official.displayName,
    official.fullName,
    official.name,
    official.athlete?.displayName,
    official.athlete?.fullName
  );
}

function normalizeOfficialRole(official) {
  const role = String(
    firstNonEmpty(
      official?.role,
      official?.type,
      official?.position,
      official?.displayName,
      ""
    )
  ).toLowerCase();

  if (
    role.includes("referee") ||
    role.includes("arbitro")
  ) {
    return "arbitro";
  }

  if (
    role.includes("assistant") ||
    role.includes("assistente")
  ) {
    return "assistente";
  }

  if (
    role.includes("fourth") ||
    role.includes("quarto")
  ) {
    return "quartoUomo";
  }

  if (
    role.includes("var")
  ) {
    return "var";
  }

  if (
    role.includes("avar")
  ) {
    return "avar";
  }

  return null;
}

function getOfficials(summary, competitionInfo) {
  const sources = [
    competitionInfo?.officials,
    summary?.header?.competitions?.[0]?.officials,
    summary?.officials
  ];

  const officials = [];

  for (const source of sources) {
    if (!Array.isArray(source)) {
      continue;
    }

    officials.push(...source);
  }

  const result = {
    referee: null,
    assistantReferee1: null,
    assistantReferee2: null,
    fourthOfficial: null,
    var: null,
    avar: null
  };

  let assistantIndex = 0;

  for (const official of officials) {
    const name =
      getOfficialName(official);

    if (!name) {
      continue;
    }

    const role =
      normalizeOfficialRole(official);

    if (
      role === "arbitro" &&
      !result.referee
    ) {
      result.referee = name;
      continue;
    }

    if (
      role === "assistente"
    ) {
      if (
        assistantIndex === 0 &&
        !result.assistantReferee1
      ) {
        result.assistantReferee1 = name;
        assistantIndex++;
      } else if (
        assistantIndex === 1 &&
        !result.assistantReferee2
      ) {
        result.assistantReferee2 = name;
        assistantIndex++;
      }

      continue;
    }

    if (
      role === "quartoUomo" &&
      !result.fourthOfficial
    ) {
      result.fourthOfficial = name;
      continue;
    }

    if (
      role === "var" &&
      !result.var
    ) {
      result.var = name;
      continue;
    }

    if (
      role === "avar" &&
      !result.avar
    ) {
      result.avar = name;
    }
  }

  /*
   * Fallback per ESPN quando il ruolo
   * non viene esposto correttamente.
   */

  if (!result.referee) {
    const referee =
      officials.find(
        official =>
          String(
            official?.role ||
            official?.type ||
            ""
          )
            .toLowerCase()
            .includes("referee")
      );

    result.referee =
      getOfficialName(referee);
  }

  return result;
}

/*
|--------------------------------------------------------------------------
| TV
|--------------------------------------------------------------------------
*/

function getTV(summary) {
  const sources = [
    summary?.header?.competitions?.[0]?.broadcasts,
    summary?.header?.competitions?.[0]?.broadcast,
    summary?.broadcasts,
    summary?.tv
  ];

  const channels = [];

  for (const source of sources) {
    if (!Array.isArray(source)) {
      continue;
    }

    for (const item of source) {
      const name =
        typeof item === "string"
          ? item
          : firstNonEmpty(
              item?.names?.[0],
              item?.name,
              item?.shortName,
              item?.displayName
            );

      if (name) {
        channels.push(cleanText(name));
      }
    }
  }

  return uniqueArray(channels);
}

/*
|--------------------------------------------------------------------------
| MVP
|--------------------------------------------------------------------------
*/

function getMVP(summary) {
  const candidates = [
    summary?.mvp,
    summary?.playerOfTheMatch,
    summary?.bestPlayer,
    summary?.header?.competitions?.[0]?.playerOfTheMatch,
    summary?.leaders?.playerOfTheMatch
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    if (typeof candidate === "string") {
      return {
        player: cleanText(candidate),
        team: null,
        rating: null
      };
    }

    const player =
      firstNonEmpty(
        candidate.displayName,
        candidate.fullName,
        candidate.name,
        candidate.athlete?.displayName,
        candidate.athlete?.fullName
      );

    if (player) {
      return {
        player: cleanText(player),

        team:
          candidate.team?.displayName
            ? normalizeTeamName(
                candidate.team.displayName
              )
            : null,

        rating:
          firstNonEmpty(
            candidate.rating,
            candidate.score
          )
      };
    }
  }

  /*
   * Alcuni endpoint ESPN inseriscono il
   * Player of the Match dentro players.
   */

  const players =
    summary?.players;

  if (Array.isArray(players)) {
    for (const group of players) {
      const athletes =
        group?.statistics ||
        group?.players ||
        [];

      if (!Array.isArray(athletes)) {
        continue;
      }

      for (const item of athletes) {
        if (
          item?.playerOfTheMatch ||
          item?.isMVP ||
          item?.mvp
        ) {
          const athlete =
            item?.athlete ||
            item?.player ||
            item;

          return {
            player:
              firstNonEmpty(
                athlete?.displayName,
                athlete?.fullName,
                athlete?.name
              ),

            team:
              athlete?.team?.displayName
                ? normalizeTeamName(
                    athlete.team.displayName
                  )
                : null,

            rating:
              firstNonEmpty(
                item?.rating,
                item?.score
              )
          };
        }
      }
    }
  }

  return null;
}

/*
|--------------------------------------------------------------------------
| FORMAZIONI
|--------------------------------------------------------------------------
*/

function getLineup(competitor) {
  const formation =
    firstNonEmpty(
      competitor?.formation?.displayName,
      competitor?.formation?.name,
      competitor?.formation,
      competitor?.form
    );

  const players = [];

  const roster =
    competitor?.roster ||
    competitor?.lineup ||
    competitor?.players ||
    [];

  if (Array.isArray(roster)) {
    for (const item of roster) {
      const player =
        firstNonEmpty(
          item?.athlete?.displayName,
          item?.athlete?.fullName,
          item?.player?.displayName,
          item?.player?.fullName,
          item?.displayName,
          item?.fullName,
          item?.name
        );

      if (player) {
        players.push(
          cleanText(player)
        );
      }
    }
  }

  return {
    formation:
      formation
        ? cleanText(formation)
        : null,

    players:
      uniqueArray(players)
  };
}

/*
|--------------------------------------------------------------------------
| STATO PARTITA
|--------------------------------------------------------------------------
*/

function getMatchStatus(
  competitionInfo
) {
  const status =
    competitionInfo?.status;

  const type =
    status?.type;

  let state =
    type?.state ||
    null;

  let name =
    type?.name ||
    null;

  let description =
    type?.description ||
    null;

  let detail =
    type?.detail ||
    null;

  /*
   * Traduzione stato
   */

  const stateLower =
    String(state || "")
      .toLowerCase();

  const nameLower =
    String(name || "")
      .toLowerCase();

  if (
    stateLower === "post" ||
    nameLower.includes("full_time") ||
    nameLower.includes("final")
  ) {
    state = "terminata";
    name = "Partita terminata";
    description = "Fine partita";
    detail = "Fine partita";
  } else if (
    stateLower === "in" ||
    stateLower === "live"
  ) {
    state = "in corso";
    name = "Partita in corso";
    description = "Partita in corso";
  } else if (
    stateLower === "pre"
  ) {
    state = "non iniziata";
    name = "Partita non iniziata";
    description = "In attesa dell'inizio";
  }

  return {
    state,

    name,

    description,

    detail,

    clock:
      status?.displayClock ||
      null,

    completed:
      type?.completed === true
  };
}

/*
|--------------------------------------------------------------------------
| MODULO PRINCIPALE
|--------------------------------------------------------------------------
*/

module.exports = async (req, res) => {
  try {
    const competitionId =
      req.query.competition;

    const eventId =
      req.query.id;

    /*
     * CONTROLLO PARAMETRI
     */

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

    /*
     * COMPETIZIONE
     */

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

    /*
     * ESPN
     */

    const summary =
      await getMatchSummary(
        competition.espnLeague,
        eventId
      );

    if (!summary) {
      return res.status(404).json({
        success: false,
        error:
          "Dati della partita non trovati"
      });
    }

    /*
     * HEADER
     */

    const header =
      summary.header || {};

    const competitionInfo =
      header.competitions?.[0] ||
      summary.competitions?.[0] ||
      null;

    const competitors =
      competitionInfo?.competitors ||
      [];

    /*
     * SQUADRE
     */

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

    /*
     * DATA
     */

    const matchDate =
      header.date ||
      competitionInfo?.date ||
      null;

    const dateTime =
      getRomeDateTime(
        matchDate
      );

    /*
     * EVENTI RAW
     */

    const rawEvents = [
      ...(Array.isArray(
        summary.keyEvents
      )
        ? summary.keyEvents
        : []),

      ...(Array.isArray(
        summary.plays
      )
        ? summary.plays
        : [])
    ];

    /*
     * Evita duplicati ESPN
     */

    const uniqueRawEvents = [];
    const eventIds = new Set();

    for (const event of rawEvents) {
      const key =
        event?.id ||
        JSON.stringify(event);

      if (eventIds.has(key)) {
        continue;
      }

      eventIds.add(key);
      uniqueRawEvents.push(event);
    }

    const events =
      uniqueRawEvents
        .map(parseEvent)
        .filter(Boolean);

    /*
     * STATISTICHE
     */

    const homeStatistics =
      getTeamStatistics(
        summary,
        home,
        "home"
      );

    const awayStatistics =
      getTeamStatistics(
        summary,
        away,
        "away"
      );

    /*
     * RIGORI
     */

    const penalties =
      getPenalties(
        summary,
        events
      );

    /*
     * STADIO
     */

    const venue =
      getVenue(
        summary,
        competitionInfo
      );

    /*
     * UFFICIALI
     */

    const officials =
      getOfficials(
        summary,
        competitionInfo
      );

    /*
     * TV
     */

    const tv =
      getTV(summary);

    /*
     * MVP
     */

    const mvp =
      getMVP(summary);

    /*
     * FORMAZIONI
     */

    const homeLineup =
      getLineup(home);

    const awayLineup =
      getLineup(away);

    /*
     * RISPOSTA
     */

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
          eventId,

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

          name:
            getTeamName(home),

          score:
            home?.score ?? "-",

          logo:
            getTeamLogo(home)
        },

        away: {

          name:
            getTeamName(away),

          score:
            away?.score ?? "-",

          logo:
            getTeamLogo(away)
        },

        status:
          getMatchStatus(
            competitionInfo
          )
      },

      /*
       * FORMAZIONI
       */

      lineups: {

        home:
          homeLineup,

        away:
          awayLineup
      },

      /*
       * STATISTICHE
       */

      statistics: {

        home:
          homeStatistics,

        away:
          awayStatistics
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
       * ARBITRI
       */

      referee:
        officials.referee,

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

      events

    });

  } catch (error) {

    console.error(
      "ESPN MATCH ERROR:",
      error
    );

    return res.status(500).json({

      success: false,

      error:
        error?.message ||
        "Errore interno del server"
    });
  }
};
