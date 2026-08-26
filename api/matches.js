const {
  getCompetition
} = require("../lib/competitions");

const {
  getScoreboard
} = require("../lib/espn");

const {
  normalizeTeamName
} = require("../lib/teams");

const { DateTime } = require("luxon");

const TIMEZONE = "Europe/Rome";

/*
 * Restituisce la finestra:
 *
 * GIOVEDÌ -> MARTEDÌ SUCCESSIVO
 *
 * Esempio:
 * Giovedì 27/08/2026
 * fino a Martedì 01/09/2026
 *
 * Vengono incluse:
 * - partite già giocate
 * - partite in corso
 * - partite future
 */
function getNextMatchWindow() {
  const now = DateTime.now().setZone(TIMEZONE);

  const daysUntilThursday =
    (4 - now.weekday + 7) % 7;

  const start = now
    .startOf("day")
    .plus({
      days: daysUntilThursday
    });

  const end = start.plus({
    days: 5
  });

  return {
    start,
    end
  };
}

/*
 * ESPN vuole le date nel formato:
 *
 * YYYYMMDD
 *
 * Esempio:
 * 27/08/2026
 * ->
 * 20260827
 */
function formatDateForESPN(date) {
  return date.toFormat("yyyyMMdd");
}

/*
 * Converte correttamente la data ESPN
 * nel fuso orario italiano.
 *
 * IMPORTANTE:
 * Non forziamo zone: "utc".
 *
 * ESPN restituisce normalmente event.date
 * come timestamp ISO con il relativo offset.
 *
 * Luxon legge direttamente il timestamp
 * e poi lo converte in Europe/Rome.
 */
function convertToRome(eventDate) {
  if (!eventDate) {
    return null;
  }

  const dateTime =
    DateTime.fromISO(eventDate)
      .setZone(TIMEZONE);

  if (!dateTime.isValid) {
    return null;
  }

  return dateTime;
}

/*
 * Trasforma un evento ESPN
 * nel formato utilizzato dalla nostra API.
 */
function formatMatch(event, competition) {
  const competitionInfo =
    event?.competitions?.[0];

  if (!competitionInfo) {
    return null;
  }

  const homeTeam =
    competitionInfo.competitors?.find(
      team =>
        team.homeAway === "home"
    );

  const awayTeam =
    competitionInfo.competitors?.find(
      team =>
        team.homeAway === "away"
    );

  if (!homeTeam || !awayTeam) {
    return null;
  }

  const dateTime =
    convertToRome(event.date);

  if (!dateTime) {
    return null;
  }

  /*
   * Stato della partita:
   *
   * pre  = futura
   * in   = in corso
   * post = terminata
   */
  const state =
    event?.status?.type?.state || null;

  const isStarted =
    state !== "pre";

  /*
   * NON utilizziamo:
   *
   * event.status.type.detail
   *
   * perché ESPN può mostrarlo in EDT,
   * EST o altro fuso.
   *
   * L'orario viene sempre creato
   * dal timestamp event.date.
   */
  return {
    id: String(event.id),

    date:
      dateTime.toFormat("dd/MM/yyyy"),

    time:
      dateTime.toFormat("HH:mm"),

    timezone: TIMEZONE,

    competition: {
      id: competition.id,
      name: competition.name
    },

    home: {
      name:
        normalizeTeamName(
          homeTeam.team?.displayName
        ),

      score:
        isStarted
          ? (homeTeam.score ?? "-")
          : "-",

      logo:
        homeTeam.team?.logo || null
    },

    away: {
      name:
        normalizeTeamName(
          awayTeam.team?.displayName
        ),

      score:
        isStarted
          ? (awayTeam.score ?? "-")
          : "-",

      logo:
        awayTeam.team?.logo || null
    },

    status: {
      state,

      name:
        event?.status?.type?.name ||
        null,

      description:
        event?.status?.type?.description ||
        null,

      /*
       * Manteniamo il detail ESPN
       * solo come informazione originale.
       *
       * NON viene utilizzato per
       * determinare date e orari.
       */
      detail:
        event?.status?.type?.detail ||
        null,

      clock:
        event?.status?.displayClock ||
        null,

      completed:
        event?.status?.type?.completed ||
        false
    }
  };
}

module.exports = async (req, res) => {
  try {

    /*
     * Controllo metodo HTTP.
     */
    if (req.method !== "GET") {
      return res.status(405).json({
        success: false,
        error: "Metodo non consentito"
      });
    }

    /*
     * ID della competizione.
     *
     * Esempio:
     *
     * /api/matches?competition=serie-a
     */
    const competitionId =
      req.query.competition;

    if (!competitionId) {
      return res.status(400).json({
        success: false,
        error:
          "Parametro competition obbligatorio"
      });
    }

    /*
     * Recupera la competizione
     * dal nostro file competitions.js.
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

    /*
     * Controlliamo che sia configurato
     * il codice ESPN.
     *
     * Serie A:
     *
     * ita.1
     */
    if (!competition.espnLeague) {
      return res.status(400).json({
        success: false,
        error:
          "Codice ESPN della competizione non ancora configurato"
      });
    }

    /*
     * Calcoliamo la finestra
     * GIOVEDÌ -> MARTEDÌ.
     */
    const {
      start,
      end
    } = getNextMatchWindow();

    /*
     * Creiamo una richiesta ESPN
     * per ogni giorno della finestra.
     */
    const requests = [];

    let currentDate = start;

    while (
      currentDate.toMillis() <=
      end.toMillis()
    ) {

      const date =
        formatDateForESPN(
          currentDate
        );

      requests.push(
        getScoreboard(
          competition.espnLeague,
          date
        )
      );

      currentDate =
        currentDate.plus({
          days: 1
        });
    }

    /*
     * Aspettiamo tutte le richieste ESPN.
     */
    const responses =
      await Promise.all(
        requests
      );

    /*
     * Estraiamo tutti gli eventi.
     */
    const events =
      responses.flatMap(
        response =>
          Array.isArray(
            response?.events
          )
            ? response.events
            : []
      );

    /*
     * Convertiamo gli eventi
     * nel nostro formato.
     */
    const matches =
      events
        .map(event =>
          formatMatch(
            event,
            competition
          )
        )
        .filter(Boolean);

    /*
     * Evitiamo eventuali duplicati.
     *
     * Usiamo l'ID ESPN della partita.
     */
    const uniqueMatches =
      Array.from(
        new Map(
          matches.map(match => [
            match.id,
            match
          ])
        ).values()
      );

    /*
     * Ordiniamo tutte le partite
     * cronologicamente.
     *
     * IMPORTANTE:
     * usiamo direttamente date e orari
     * già convertiti in Europe/Rome.
     */
    uniqueMatches.sort(
      (a, b) => {

        const dateA =
          DateTime.fromFormat(
            `${a.date} ${a.time}`,
            "dd/MM/yyyy HH:mm",
            {
              zone: TIMEZONE
            }
          );

        const dateB =
          DateTime.fromFormat(
            `${b.date} ${b.time}`,
            "dd/MM/yyyy HH:mm",
            {
              zone: TIMEZONE
            }
          );

        return (
          dateA.toMillis() -
          dateB.toMillis()
        );
      }
    );

    /*
     * Risposta finale.
     */
    return res.status(200).json({

      success: true,

      source: "ESPN",

      timezone: TIMEZONE,

      window: {
        from:
          start.toFormat(
            "dd/MM/yyyy"
          ),

        to:
          end.toFormat(
            "dd/MM/yyyy"
          )
      },

      league:
        competition.espnLeague,

      count:
        uniqueMatches.length,

      matches:
        uniqueMatches
    });

  } catch (error) {

    console.error(
      "Errore recupero partite ESPN:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        error?.message ||
        "Errore durante il recupero delle partite ESPN"
    });
  }
};
