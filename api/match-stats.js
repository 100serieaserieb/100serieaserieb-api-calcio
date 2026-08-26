const https = require("https");

const { getCompetition } = require("../lib/competitions");

function richiesta(url) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            "User-Agent": "Mozilla/5.0",
            Accept: "application/json",
          },
        },
        (res) => {
          let dati = "";

          res.on("data", (chunk) => {
            dati += chunk;
          });

          res.on("end", () => {
            if (res.statusCode < 200 || res.statusCode >= 300) {
              return reject(
                new Error(`ESPN HTTP ${res.statusCode}`)
              );
            }

            try {
              resolve(JSON.parse(dati));
            } catch (errore) {
              reject(
                new Error("Risposta ESPN non valida")
              );
            }
          });
        }
      )
      .on("error", reject);
  });
}

/* =========================================================
   TRADUZIONE POSIZIONI
========================================================= */

function traduciPosizione(posizione) {
  if (!posizione) {
    return "Non specificata";
  }

  const posizioni = {
    Goalkeeper: "Portiere",
    "Center Back": "Difensore centrale",
    "Center Left Defender": "Difensore centrale sinistro",
    "Center Right Defender": "Difensore centrale destro",
    "Left Back": "Terzino sinistro",
    "Right Back": "Terzino destro",

    "Left Midfielder": "Centrocampista sinistro",
    "Right Midfielder": "Centrocampista destro",
    "Center Left Midfielder": "Centrocampista sinistro",
    "Center Right Midfielder": "Centrocampista destro",
    "Central Midfielder": "Centrocampista centrale",

    "Attacking Midfielder": "Trequartista",
    "Attacking Midfielder Left": "Trequartista sinistro",
    "Attacking Midfielder Right": "Trequartista destro",

    "Left Forward": "Attaccante sinistro",
    "Right Forward": "Attaccante destro",
    "Center Left Forward": "Attaccante sinistro",
    "Center Right Forward": "Attaccante destro",

    Striker: "Attaccante",
    Forward: "Attaccante",

    Goalkeeper: "Portiere",

    Attaccante: "Attaccante",
    Portiere: "Portiere",
    Riserva: "Riserva",
  };

  return posizioni[posizione] || posizione;
}

/* =========================================================
   TRADUZIONE STATISTICHE
========================================================= */

function traduciStatistica(nome) {
  const traduzioni = {
    appearances: "Presenze",
    foulsCommitted: "Falli commessi",
    foulsSuffered: "Falli subiti",
    ownGoals: "Autogol",
    redCards: "Cartellini rossi",
    yellowCards: "Cartellini gialli",
    subIns: "Entrate dalla panchina",
    goalsConceded: "Gol subiti",
    saves: "Parate",
    shotsFaced: "Tiri subiti",
    goalAssists: "Assist",
    offsides: "Fuorigioco",
    shotsOnTarget: "Tiri nello specchio",
    totalGoals: "Gol",
    totalShots: "Tiri",
    minutesPlayed: "Minuti",
    touches: "Tocchi",
    passes: "Passaggi",
    accuratePasses: "Passaggi riusciti",
    possessionPct: "Possesso %",
    tackles: "Contrasti",
    interceptions: "Intercetti",
    blocks: "Blocchi",
    clearances: "Disimpegni",
  };

  return traduzioni[nome] || nome;
}

function traduciStatistiche(statistiche) {
  const risultato = {};

  if (!statistiche) {
    return risultato;
  }

  for (const [chiave, valore] of Object.entries(statistiche)) {
    risultato[traduciStatistica(chiave)] = valore;
  }

  return risultato;
}

/* =========================================================
   GIOCATORE
========================================================= */

function preparaGiocatore(atleta, titolare = false) {
  const nome =
    atleta?.athlete?.displayName ||
    atleta?.athlete?.fullName ||
    atleta?.displayName ||
    atleta?.fullName ||
    "Giocatore sconosciuto";

  const numero =
    atleta?.jersey ??
    atleta?.athlete?.jersey ??
    null;

  const posizione =
    atleta?.position?.name ||
    atleta?.athlete?.position?.name ||
    atleta?.position?.displayName ||
    atleta?.athlete?.position?.displayName ||
    null;

  const statistiche = {};

  if (Array.isArray(atleta?.statistics)) {
    for (const gruppo of atleta.statistics) {
      if (!Array.isArray(gruppo?.stats)) {
        continue;
      }

      for (const stat of gruppo.stats) {
        if (stat?.name) {
          statistiche[stat.name] = stat.value;
        }
      }
    }
  }

  return {
    id: String(
      atleta?.athlete?.id ||
      atleta?.id ||
      ""
    ),

    nome,

    numero:
      numero !== null
        ? String(numero)
        : null,

    posizione: titolare
      ? traduciPosizione(posizione)
      : "Riserva",

    titolare,

    entrato:
      Boolean(atleta?.subbedIn),

    uscito:
      Boolean(atleta?.subbedOut),

    minuti:
      atleta?.minutesPlayed ??
      atleta?.stats?.minutesPlayed ??
      null,

    statistiche:
      traduciStatistiche(statistiche),
  };
}

/* =========================================================
   FORMAZIONE
========================================================= */

function estraiFormazione(roster, squadra) {
  const titolari = [];
  const riserve = [];

  if (!roster) {
    return {
      squadra,
      modulo: null,
      allenatore: null,
      titolari,
      riserve,
      totaleGiocatori: 0,
    };
  }

  const formazione =
    roster.formations ||
    roster.formation ||
    null;

  const modulo =
    formazione?.formation ||
    formazione?.displayName ||
    null;

  let allenatore = null;

  if (
    Array.isArray(roster.coaches) &&
    roster.coaches.length > 0
  ) {
    const coach = roster.coaches[0];

    allenatore =
      coach?.coach?.displayName ||
      coach?.displayName ||
      coach?.fullName ||
      null;
  }

  const atleti =
    roster.roster ||
    roster.athletes ||
    [];

  if (Array.isArray(atleti)) {
    for (const atleta of atleti) {
      const titolare =
        atleta?.starter === true ||
        atleta?.starter === "true";

      const giocatore =
        preparaGiocatore(
          atleta,
          titolare
        );

      if (titolare) {
        titolari.push(giocatore);
      } else {
        riserve.push(giocatore);
      }
    }
  }

  return {
    squadra,
    modulo,
    allenatore,
    titolari,
    riserve,
    totaleGiocatori:
      titolari.length +
      riserve.length,
  };
}

/* =========================================================
   EVENTI DELLA PARTITA
========================================================= */

function estraiEventi(dati) {
  const eventi =
    dati?.plays ||
    dati?.keyEvents ||
    [];

  if (!Array.isArray(eventi)) {
    return [];
  }

  return eventi.map((evento) => ({
    id:
      evento?.id ||
      null,

    tipo:
      evento?.type?.text ||
      evento?.type?.name ||
      evento?.type?.id ||
      null,

    minuto:
      evento?.clock?.displayValue ||
      evento?.clock?.value ||
      null,

    periodo:
      evento?.period?.number ||
      null,

    descrizione:
      evento?.text ||
      evento?.shortText ||
      null,

    giocatore:
      evento?.participants?.[0]?.athlete?.displayName ||
      evento?.athlete?.displayName ||
      null,

    squadra:
      evento?.team?.displayName ||
      null,
  }));
}

/* =========================================================
   MAIN
========================================================= */

module.exports = async (req, res) => {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({
        success: false,
        error: "Metodo non consentito",
      });
    }

    const competitionId =
      req.query?.competition;

    const eventId =
      req.query?.id ||
      req.query?.event;

    if (!competitionId) {
      return res.status(400).json({
        success: false,
        error:
          "Parametro competition obbligatorio",
      });
    }

    if (!eventId) {
      return res.status(400).json({
        success: false,
        error:
          "Parametro id obbligatorio",
      });
    }

    const competition =
      getCompetition(
        competitionId
      );

    if (!competition) {
      return res.status(404).json({
        success: false,
        error:
          "Competizione non trovata",
      });
    }

    if (!competition.espnLeague) {
      return res.status(400).json({
        success: false,
        error:
          "Codice ESPN della competizione non configurato",
      });
    }

    const url =
      `https://site.api.espn.com/apis/site/v2/sports/soccer/${competition.espnLeague}/summary?event=${encodeURIComponent(
        eventId
      )}`;

    const dati =
      await richiesta(url);

    const competizione =
      dati?.header?.competitions?.[0];

    if (!competizione) {
      return res.status(404).json({
        success: false,
        error:
          "Partita non trovata",
      });
    }

    const concorrenti =
      competizione?.competitors || [];

    const casa =
      concorrenti.find(
        (squadra) =>
          squadra.homeAway === "home"
      );

    const trasferta =
      concorrenti.find(
        (squadra) =>
          squadra.homeAway === "away"
      );

    const nomeCasa =
      casa?.team?.displayName ||
      casa?.team?.name ||
      "Squadra casa";

    const nomeTrasferta =
      trasferta?.team?.displayName ||
      trasferta?.team?.name ||
      "Squadra trasferta";

    /* =====================================================
       ROSTER
    ===================================================== */

    const roster =
      dati?.roster ||
      dati?.boxscore?.players ||
      [];

    let formazioneCasa = null;
    let formazioneTrasferta = null;

    if (Array.isArray(roster)) {
      for (const squadra of roster) {
        const nome =
          squadra?.team?.displayName ||
          squadra?.team?.name ||
          "";

        const id =
          String(
            squadra?.team?.id ||
            ""
          );

        if (
          id ===
          String(casa?.team?.id || "")
          ||
          nome === nomeCasa
        ) {
          formazioneCasa =
            estraiFormazione(
              squadra,
              nomeCasa
            );
        }

        if (
          id ===
          String(
            trasferta?.team?.id ||
            ""
          )
          ||
          nome === nomeTrasferta
        ) {
          formazioneTrasferta =
            estraiFormazione(
              squadra,
              nomeTrasferta
            );
        }
      }
    }

    if (!formazioneCasa) {
      formazioneCasa =
        estraiFormazione(
          null,
          nomeCasa
        );
    }

    if (!formazioneTrasferta) {
      formazioneTrasferta =
        estraiFormazione(
          null,
          nomeTrasferta
        );
    }

    /* =====================================================
       DATA PARTITA
    ===================================================== */

    const dataPartita =
      dati?.header?.competitions?.[0]?.date ||
      null;

    /* =====================================================
       RISPOSTA
    ===================================================== */

    res.setHeader(
      "Cache-Control",
      "s-maxage=15, stale-while-revalidate=30"
    );

    return res.status(200).json({
      success: true,

      fonte: "ESPN",

      timezone:
        "Europe/Rome",

      competizione: {
        id:
          competition.id,

        nome:
          competition.name,

        espnLeague:
          competition.espnLeague,
      },

      partita: {
        id:
          String(eventId),

        data:
          dataPartita,

        casa: {
          id:
            casa?.team?.id ||
            null,

          nome:
            nomeCasa,

          logo:
            casa?.team?.logo ||
            casa?.team?.logos?.[0]?.href ||
            null,

          gol:
            casa?.score ??
            "0",
        },

        trasferta: {
          id:
            trasferta?.team?.id ||
            null,

          nome:
            nomeTrasferta,

          logo:
            trasferta?.team?.logo ||
            trasferta?.team?.logos?.[0]?.href ||
            null,

          gol:
            trasferta?.score ??
            "0",
        },

        status: {
          state:
            dati?.header?.competitions?.[0]?.status?.type?.state ||
            null,

          description:
            dati?.header?.competitions?.[0]?.status?.type?.description ||
            null,

          detail:
            dati?.header?.competitions?.[0]?.status?.type?.detail ||
            null,

          completed:
            dati?.header?.competitions?.[0]?.status?.type?.completed ||
            false,
        },
      },

      formazioni: {
        casa:
          formazioneCasa,

        trasferta:
          formazioneTrasferta,
      },

      eventi:
        estraiEventi(dati),

      riepilogo: {
        titolariCasa:
          formazioneCasa.titolari.length,

        titolariTrasferta:
          formazioneTrasferta.titolari.length,

        riserveCasa:
          formazioneCasa.riserve.length,

        riserveTrasferta:
          formazioneTrasferta.riserve.length,

        allenatoreCasa:
          Boolean(
            formazioneCasa.allenatore
          ),

        allenatoreTrasferta:
          Boolean(
            formazioneTrasferta.allenatore
          ),
      },

      messaggio:
        "MatchStats ESPN completato",
    });

  } catch (errore) {
    console.error(
      "MATCHSTATS ESPN ERROR:",
      errore
    );

    return res.status(500).json({
      success: false,

      fonte: "ESPN",

      error:
        "Errore durante il recupero delle statistiche della partita",

      dettaglio:
        errore?.message ||
        "Errore sconosciuto",
    });
  }
};
