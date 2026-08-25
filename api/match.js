const { getCompetition } = require("../lib/competitions");
const { getMatchSummary } = require("../lib/espn");
const { normalizeTeamName } = require("../lib/teams");
const { DateTime } = require("luxon");

/*
 * ============================================================
 * MATCH API
 * ============================================================
 *
 * Restituisce:
 * - informazioni partita
 * - squadre e loghi
 * - risultato
 * - stato
 * - formazioni
 * - eventi
 * - gol e assist
 * - cartellini
 * - sostituzioni
 * - statistiche
 * - stadio
 * - arbitro
 * - canali TV
 * - MVP / migliore giocatore
 *
 * Tutti i testi principali vengono restituiti in italiano.
 *
 * Parametri:
 * ?competition=serie-a&id=401874745
 *
 * ============================================================
 */

function getRomeDateTime(date) {
  if (!date) return null;

  const parsed = DateTime.fromISO(date, {
    zone: "utc"
  });

  if (!parsed.isValid) return null;

  return parsed.setZone("Europe/Rome");
}

function getCompetitor(competitors, side) {
  if (!Array.isArray(competitors)) {
    return null;
  }

  return (
    competitors.find(
      item => item.homeAway === side
    ) || null
  );
}

/*
 * ============================================================
 * TRADUZIONE
 * ============================================================
 */

function translateStatus(value) {
  if (!value) return null;

  const text = String(value).toLowerCase();

  const translations = {
    scheduled: "Programmato",
    pre: "In programma",
    in_progress: "In corso",
    halftime: "Intervallo",
    post: "Terminata",
    postponed: "Rinviata",
    canceled: "Annullata",
    cancelled: "Annullata",
    suspended: "Sospesa",
    delayed: "Rinviata",
    final: "Partita terminata",
    completed: "Partita terminata",
    "match finished": "Partita terminata",
    "game finished": "Partita terminata"
  };

  return translations[text] || value;
}

function translateEventType(type) {
  if (!type) return "";

  const text = String(type).toLowerCase();

  if (text.includes("goal")) return "Gol";
  if (text.includes("yellow")) return "Cartellino giallo";
  if (text.includes("red")) return "Cartellino rosso";
  if (text.includes("substitution")) return "Sostituzione";
  if (text.includes("injury")) return "Infortunio";
  if (text.includes("delay")) return "Interruzione";
  if (text.includes("resume")) return "Ripresa del gioco";
  if (text.includes("start")) return "Inizio partita";
  if (text.includes("end")) return "Fine partita";
  if (text.includes("halftime")) return "Fine primo tempo";

  return type;
}

function translateText(text) {
  if (!text) return null;

  let result = String(text);

  /*
   * Frasi ESPN più comuni
   */

  result = result
    .replace(
      /Delay in match because of an injury/gi,
      "gioco interrotto per un infortunio a"
    )
    .replace(
      /because of an injury/gi,
      "a causa di un infortunio"
    )
    .replace(
      /Assisted by/gi,
      "assist di"
    )
    .replace(
      /Goal!/gi,
      "Gol!"
    )
    .replace(
      /Yellow card/gi,
      "Cartellino giallo"
    )
    .replace(
      /Red card/gi,
      "Cartellino rosso"
    )
    .replace(
      /Substitution/gi,
      "Sostituzione"
    )
    .replace(
      /End of the first half/gi,
      "Fine del primo tempo"
    )
    .replace(
      /End of the second half/gi,
      "Fine della partita"
    )
    .replace(
      /Match ends/gi,
      "Fine della partita"
    )
    .replace(
      /Kickoff/gi,
      "Inizio della partita"
    )
    .replace(
      /Second Half begins/gi,
      "Inizio del secondo tempo"
    )
    .replace(
      /First Half begins/gi,
      "Inizio del primo tempo"
    );

  return result;
}

/*
 * ============================================================
 * EVENTI
 * ============================================================
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

  return null;
}

function getEventText(event) {
  if (!event) return "";

  if (typeof event.text === "string") {
    return event.text;
  }

  return "";
}

/*
 * ============================================================
 * GIOCATORE EVENTO
 * ============================================================
 */

function getPlayerFromText(text) {
  if (!text) return null;

  /*
   * Evita di prendere frasi come:
   * "Delay in match because of an injury Jesús Rodríguez"
   */

  const injuryMatch = text.match(
    /injury\s+([^()]+?)(?:\s*\(|$)/i
  );

  if (injuryMatch) {
    return injuryMatch[1].trim();
  }

  /*
   * GOL
   */

  if (
    text.startsWith("Goal!") ||
    text.startsWith("Gol!")
  ) {
    const goalMatch = text.match(
      /(?:Goal!|Gol!)[^.]*\.\s*([^()]+)\s*\(/
    );

    if (goalMatch) {
      return goalMatch[1].trim();
    }
  }

  /*
   * CARTELLINI
   */

  const cardMatch = text.match(
    /^.*?(?:for|per)\s+([^()]+)\s*\(/
  );

  if (cardMatch) {
    return cardMatch[1].trim();
  }

  /*
   * FORMATO GENERICO
   */

  const match = text.match(
    /^([^(]+)\s*\(/
  );

  if (!match) {
    return null;
  }

  return match[1]
    .replace(/^Al\s+\d+'?:\s*/i, "")
    .trim();
}

/*
 * ============================================================
 * ASSIST
 * ============================================================
 */

function getAssistFromText(text) {
  if (!text) return null;

  const match = text.match(
    /(?:Assisted by|assist(?:ito)?\s+(?:di|da))\s+([^.]+?)(?:\s+with|\s+following|\.|$)/i
  );

  if (!match) {
    return null;
  }

  return match[1].trim();
}

/*
 * ============================================================
 * PARSE EVENTO
 * ============================================================
 */

function parseEvent(event) {
  if (!event) {
    return null;
  }

  const originalType =
    getEventType(event);

  const originalText =
    getEventText(event);

  const translatedType =
    translateEventType(originalType);

  const translatedText =
    translateText(originalText);

  const lowerType =
    String(originalType).toLowerCase();

  const result = {
    id:
      event.id || null,

    type:
      translatedType || null,

    minute:
      getEventMinute(event),

    team:
      typeof event.team === "string"
        ? normalizeTeamName(event.team)
        : event.team?.displayName
          ? normalizeTeamName(
              event.team.displayName
            )
          : null,

    player: null,

    assist: null,

    text:
      translatedText || null
  };

  /*
   * GOL
   */

  if (
    lowerType.includes("goal")
  ) {
    result.player =
      getPlayerFromText(originalText);

    result.assist =
      getAssistFromText(originalText);

    return result;
  }

  /*
   * CARTELLINO GIALLO
   */

  if (
    lowerType.includes("yellow")
  ) {
    result.player =
      getPlayerFromText(originalText);

    return result;
  }

  /*
   * CARTELLINO ROSSO
   */

  if (
    lowerType.includes("red")
  ) {
    result.player =
      getPlayerFromText(originalText);

    return result;
  }

  /*
   * INFORTUNIO
   */

  if (
    lowerType.includes("injury") ||
    originalText
      .toLowerCase()
      .includes("injury")
  ) {
    result.player =
      getPlayerFromText(originalText);

    return result;
  }

  return result;
}

/*
 * ============================================================
 * FORMAZIONI
 * ============================================================
 */

function parseLineup(competitor) {
  if (!competitor) {
    return {
      formation: null,
      players: []
    };
  }

  const formation =
    competitor.formations?.[0]?.formation ||
    competitor.formation ||
    null;

  const athletes =
    Array.isArray(competitor.roster)
      ? competitor.roster
      : Array.isArray(competitor.players)
        ? competitor.players
        : [];

  const players = athletes
    .map(item => {
      const athlete =
        item.athlete ||
        item.player ||
        item;

      return (
        athlete?.fullName ||
        athlete?.displayName ||
        athlete?.shortName ||
        athlete?.name ||
        null
      );
    })
    .filter(Boolean);

  return {
    formation,
    players
  };
}

/*
 * ============================================================
 * STATISTICHE
 * ============================================================
 */

function findStatisticValue(stats, names) {
  if (!Array.isArray(stats)) {
    return null;
  }

  for (const statistic of stats) {
    const name =
      String(
        statistic.name ||
        statistic.displayName ||
        statistic.label ||
        ""
      ).toLowerCase();

    if (
      names.some(
        item =>
          name.includes(
            item.toLowerCase()
          )
      )
    ) {
      return (
        statistic.displayValue ??
        statistic.value ??
        null
      );
    }
  }

  return null;
}

function parseTeamStatistics(teamStats) {
  const stats =
    Array.isArray(teamStats)
      ? teamStats
      : [];

  return {
    tiri:
      findStatisticValue(
        stats,
        ["shots", "total shots"]
      ),

    tiriInPorta:
      findStatisticValue(
        stats,
        [
          "shots on target",
          "shots on goal"
        ]
      ),

    possesso:
      findStatisticValue(
        stats,
        [
          "possession",
          "possession pct"
        ]
      ),

    calciDangolo:
      findStatisticValue(
        stats,
        [
          "corners",
          "corner kicks"
        ]
      ),

    fuorigioco:
      findStatisticValue(
        stats,
        ["offsides"]
      ),

    rigori:
      findStatisticValue(
        stats,
        ["penalty kicks"]
      )
  };
}

function parseStatistics(summary, home, away) {
  const competitions =
    summary.header?.competitions || [];

  const competition =
    competitions[0];

  const competitors =
    competition?.competitors || [];

  const homeCompetitor =
    competitors.find(
      item =>
        item.homeAway === "home"
    );

  const awayCompetitor =
    competitors.find(
      item =>
        item.homeAway === "away"
    );

  const homeStats =
    homeCompetitor?.statistics ||
    [];

  const awayStats =
    awayCompetitor?.statistics ||
    [];

  return {
    home: {
      team:
        home?.team?.displayName
          ? normalizeTeamName(
              home.team.displayName
            )
          : null,

      ...parseTeamStatistics(
        homeStats
      )
    },

    away: {
      team:
        away?.team?.displayName
          ? normalizeTeamName(
              away.team.displayName
            )
          : null,

      ...parseTeamStatistics(
        awayStats
      )
    }
  };
}

/*
 * ============================================================
 * STADIO
 * ============================================================
 */

function parseVenue(summary) {
  const competition =
    summary.header
      ?.competitions?.[0];

  const venue =
    competition?.venue ||
    summary.header?.venue ||
    null;

  if (!venue) {
    return null;
  }

  return {
    nome:
      venue.fullName ||
      venue.displayName ||
      venue.name ||
      null,

    citta:
      venue.address?.city ||
      venue.city ||
      null,

    paese:
      venue.address?.country ||
      null
  };
}

/*
 * ============================================================
 * ARBITRO
 * ============================================================
 */

function parseOfficials(summary) {
  const competition =
    summary.header
      ?.competitions?.[0];

  const officials =
    competition?.officials ||
    summary.header?.officials ||
    [];

  if (!Array.isArray(officials)) {
    return [];
  }

  return officials
    .map(official => {
      const person =
        official.official ||
        official;

      return {
        nome:
          person.displayName ||
          person.fullName ||
          person.name ||
          null,

        ruolo:
          translateOfficialRole(
            official.position ||
            official.role ||
            official.type ||
            null
          )
      };
    })
    .filter(
      official => official.nome
    );
}

function translateOfficialRole(role) {
  if (!role) return null;

  const text =
    String(role).toLowerCase();

  if (
    text.includes("referee") ||
    text.includes("main")
  ) {
    return "Arbitro";
  }

  if (
    text.includes("assistant")
  ) {
    return "Assistente";
  }

  if (
    text.includes("fourth")
  ) {
    return "Quarto ufficiale";
  }

  if (
    text.includes("var")
  ) {
    return "VAR";
  }

  if (
    text.includes("avard")
  ) {
    return "Assistente VAR";
  }

  return role;
}

/*
 * ============================================================
 * CANALI TV
 * ============================================================
 */

function parseBroadcasts(summary) {
  const competition =
    summary.header
      ?.competitions?.[0];

  const broadcasts =
    competition?.broadcasts ||
    summary.broadcasts ||
    [];

  if (!Array.isArray(broadcasts)) {
    return [];
  }

  const result = [];

  for (const broadcast of broadcasts) {
    const names = [];

    if (
      broadcast.names &&
      Array.isArray(
        broadcast.names
      )
    ) {
      names.push(
        ...broadcast.names
      );
    }

    if (
      broadcast.name
    ) {
      names.push(
        broadcast.name
      );
    }

    if (
      broadcast.media?.shortName
    ) {
      names.push(
        broadcast.media.shortName
      );
    }

    for (const name of names) {
      if (
        name &&
        !result.includes(name)
      ) {
        result.push(name);
      }
    }
  }

  return result;
}

/*
 * ============================================================
 * MVP / MIGLIORE GIOCATORE
 * ============================================================
 */

function parseMVP(summary) {
  const competition =
    summary.header
      ?.competitions?.[0];

  const competitors =
    competition?.competitors ||
    [];

  for (const competitor of competitors) {
    const leaders =
      competitor.leaders ||
      [];

    for (const leader of leaders) {
      const category =
        String(
          leader.name ||
          leader.displayName ||
          leader.label ||
          ""
        ).toLowerCase();

      if (
        category.includes("man of the match") ||
        category.includes("player of the match") ||
        category.includes("best player") ||
        category.includes("mvp")
      ) {
        const athlete =
          leader.athlete ||
          leader.player ||
          leader;

        if (athlete) {
          return {
            nome:
              athlete.displayName ||
              athlete.fullName ||
              athlete.name ||
              null,

            squadra:
              competitor.team?.displayName
                ? normalizeTeamName(
                    competitor.team.displayName
                  )
                : null,

            voto:
              leader.value ??
              leader.displayValue ??
              null
          };
        }
      }
    }
  }

  /*
   * Alcune risposte ESPN possono avere
   * il migliore giocatore direttamente
   * nell'oggetto gameInfo.
   */

  const gameInfo =
    summary.gameInfo ||
    summary.header?.gameInfo ||
    {};

  const player =
    gameInfo.playerOfTheGame ||
    gameInfo.mvp ||
    gameInfo.bestPlayer ||
    null;

  if (player) {
    const athlete =
      player.athlete ||
      player.player ||
      player;

    return {
      nome:
        athlete.displayName ||
        athlete.fullName ||
        athlete.name ||
        null,

      squadra:
        player.team?.displayName
          ? normalizeTeamName(
              player.team.displayName
            )
          : null,

      voto:
        player.value ??
        player.displayValue ??
        null
    };
  }

  return null;
}

/*
 * ============================================================
 * RIGORI
 * ============================================================
 */

function parsePenalties(events) {
  return events
    .filter(event => {
      const text =
        String(
          event.text || ""
        ).toLowerCase();

      const type =
        String(
          event.type || ""
        ).toLowerCase();

      return (
        text.includes("penalty") ||
        text.includes("rigore") ||
        type.includes("penalty")
      );
    })
    .map(event => ({
      minuto:
        event.minute || null,

      squadra:
        event.team || null,

      giocatore:
        event.player || null,

      esito:
        getPenaltyOutcome(
          event.text
        ),

      testo:
        event.text || null
    }));
}

function getPenaltyOutcome(text) {
  if (!text) return null;

  const lower =
    text.toLowerCase();

  if (
    lower.includes("missed") ||
    lower.includes("saved") ||
    lower.includes("parato") ||
    lower.includes("sbagliato")
  ) {
    return "Sbagliato/Parato";
  }

  if (
    lower.includes("scored") ||
    lower.includes("gol") ||
    lower.includes("goal")
  ) {
    return "Segnato";
  }

  return null;
}

/*
 * ============================================================
 * ENDPOINT
 * ============================================================
 */

module.exports = async (req, res) => {
  try {
    /*
     * PARAMETRI
     */

    const competitionId =
      req.query.competition;

    const eventId =
      req.query.id;

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

    /*
     * HEADER
     */

    const header =
      summary.header || {};

    const competitionInfo =
      header.competitions?.[0] ||
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
     * DATA E ORA
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
     * LOGHI
     */

    const homeLogo =
      home?.team?.logos?.[0]?.href ||
      home?.team?.logo ||
      null;

    const awayLogo =
      away?.team?.logos?.[0]?.href ||
      away?.team?.logo ||
      null;

    /*
     * EVENTI
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
     * Evita duplicati
     */

    const uniqueEvents =
      Array.from(
        new Map(
          rawEvents.map(
            event => [
              event.id ||
                JSON.stringify(event),
              event
            ]
          )
        ).values()
      );

    const events =
      uniqueEvents
        .map(parseEvent)
        .filter(Boolean);

    /*
     * FORMAZIONI
     */

    const homeLineup =
      parseLineup(home);

    const awayLineup =
      parseLineup(away);

    /*
     * STATISTICHE
     */

    const statistics =
      parseStatistics(
        summary,
        home,
        away
      );

    /*
     * RIGORI
     */

    const penalties =
      parsePenalties(events);

    /*
     * STADIO
     */

    const venue =
      parseVenue(summary);

    /*
     * ARBITRI
     */

    const officials =
      parseOfficials(summary);

    const referee =
      officials.find(
        official =>
          official.ruolo ===
          "Arbitro"
      ) || null;

    /*
     * TV
     */

    const broadcasts =
      parseBroadcasts(summary);

    /*
     * MVP
     */

    const mvp =
      parseMVP(summary);

    /*
     * RISPOSTA FINALE
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
            home?.team?.displayName
              ? normalizeTeamName(
                  home.team.displayName
                )
              : null,

          score:
            home?.score ?? "-",

          logo:
            homeLogo
        },

        away: {

          name:
            away?.team?.displayName
              ? normalizeTeamName(
                  away.team.displayName
                )
              : null,

          score:
            away?.score ?? "-",

          logo:
            awayLogo
        },

        status: {

          state:
            competitionInfo
              ?.status
              ?.type
              ?.state ||
            null,

          name:
            translateStatus(
              competitionInfo
                ?.status
                ?.type
                ?.name
            ),

          description:
            translateStatus(
              competitionInfo
                ?.status
                ?.type
                ?.description
            ),

          detail:
            translateStatus(
              competitionInfo
                ?.status
                ?.type
                ?.detail
            ),

          clock:
            competitionInfo
              ?.status
              ?.displayClock ||
            null,

          completed:
            competitionInfo
              ?.status
              ?.type
              ?.completed ||
            false
        }
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

      statistics,

      /*
       * RIGORI
       */

      penalties,

      /*
       * STADIO
       */

      venue,

      /*
       * ARBITRO
       */

      referee,

      /*
       * ALTRI UFFICIALI
       */

      officials,

      /*
       * CANALI TV
       */

      tv:
        broadcasts,

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
        error.message ||
        "Errore interno del server"
    });
  }
};
