const https = require("https");

const { getCompetition } = require("../lib/competitions");

/* =========================================================
   RICHIESTA ESPN
========================================================= */

function richiesta(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
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
    );

    req.on("error", reject);

    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error("Timeout richiesta ESPN"));
    });
  });
}

/* =========================================================
   POSIZIONI
========================================================= */

function traduciPosizione(posizione) {
  if (!posizione) return "Non specificata";

  const p = String(posizione).trim();

  const posizioni = {
    Goalkeeper: "Portiere",
    GoalkeeperCenter: "Portiere",

    Defender: "Difensore",
    "Center Back": "Difensore centrale",
    "Center Defender": "Difensore centrale",
    "Center Left Defender": "Difensore centrale sinistro",
    "Center Right Defender": "Difensore centrale destro",

    "Left Back": "Terzino sinistro",
    "Right Back": "Terzino destro",

    "Left Wing Back": "Esterno sinistro",
    "Right Wing Back": "Esterno destro",

    "Defensive Midfielder": "Centrocampista difensivo",
    "Center Defensive Midfielder": "Centrocampista difensivo",

    "Central Midfielder": "Centrocampista centrale",
    "Center Midfielder": "Centrocampista centrale",
    "Center Left Midfielder": "Centrocampista sinistro",
    "Center Right Midfielder": "Centrocampista destro",

    "Left Midfielder": "Centrocampista sinistro",
    "Right Midfielder": "Centrocampista destro",

    "Attacking Midfielder": "Trequartista",
    "Attacking Midfielder Left": "Trequartista sinistro",
    "Attacking Midfielder Right": "Trequartista destro",

    "Left Forward": "Attaccante sinistro",
    "Right Forward": "Attaccante destro",
    "Center Left Forward": "Attaccante sinistro",
    "Center Right Forward": "Attaccante destro",

    Forward: "Attaccante",
    Striker: "Attaccante",

    Attaccante: "Attaccante",
    Portiere: "Portiere",
    Riserva: "Riserva",
  };

  return posizioni[p] || p;
}

/* =========================================================
   STATISTICHE
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
    assists: "Assist",

    offsides: "Fuorigioco",

    totalGoals: "Gol",
    goals: "Gol",

    totalShots: "Tiri",
    shots: "Tiri",

    minutesPlayed: "Minuti",
    touches: "Tocchi",

    passes: "Passaggi",
    accuratePasses: "Passaggi riusciti",

    possessionPct: "Possesso %",
    possession: "Possesso %",

    tackles: "Contrasti",
    interceptions: "Intercetti",
    blocks: "Blocchi",

    clearances: "Disimpegni",
    effectiveClearance: "Disimpegni riusciti",
    totalClearance: "Disimpegni totali",

    totalTackles: "Contrasti totali",
    effectiveTackles: "Contrasti riusciti",

    totalShots: "Tiri",
    shotsOnTarget: "Tiri nello specchio",
    shotPct: "Percentuale tiro",

    wonCorners: "Calci d'angolo",

    penaltyKickGoals: "Rigori segnati",
    penaltyKickShots: "Rigori calciati",

    passPct: "Percentuale passaggi",

    accurateCrosses: "Cross riusciti",
    totalCrosses: "Cross",
    crossPct: "Percentuale cross",

    totalLongBalls: "Lanci lunghi",
    accurateLongBalls: "Lanci lunghi riusciti",
    longballPct: "Percentuale lanci lunghi",

    fouls: "Falli",
  };

  return traduzioni[nome] || nome;
}

function traduciStatistiche(statistiche) {
  const risultato = {};

  if (!statistiche) return risultato;

  for (const [chiave, valore] of Object.entries(statistiche)) {
    if (
      valore === undefined ||
      valore === null ||
      valore === ""
    ) {
      continue;
    }

    const nomeTradotto =
      traduciStatistica(chiave);

    risultato[nomeTradotto] = valore;
  }

  return risultato;
}

/* =========================================================
   ESTRAZIONE STATISTICHE ATLETA
========================================================= */

function estraiStatisticheAtleta(atleta) {
  const risultato = {};

  const gruppi = [
    atleta?.statistics,
    atleta?.stats,
    atleta?.athlete?.statistics,
    atleta?.athlete?.stats,
  ];

  for (const gruppo of gruppi) {
    if (!Array.isArray(gruppo)) continue;

    for (const elemento of gruppo) {
      if (!elemento) continue;

      if (elemento?.name) {
        risultato[elemento.name] =
          elemento.value ??
          elemento.displayValue ??
          null;
      }

      if (Array.isArray(elemento?.stats)) {
        for (const stat of elemento.stats) {
          if (!stat?.name) continue;

          risultato[stat.name] =
            stat.value ??
            stat.displayValue ??
            null;
        }
      }
    }
  }

  return traduciStatistiche(risultato);
}

/* =========================================================
   GIOCATORE
========================================================= */

function preparaGiocatore(
  atleta,
  titolare = false
) {
  const datiAtleta =
    atleta?.athlete ||
    atleta;

  const nome =
    datiAtleta?.displayName ||
    datiAtleta?.fullName ||
    atleta?.displayName ||
    atleta?.fullName ||
    "Giocatore sconosciuto";

  const numero =
    atleta?.jersey ??
    atleta?.jerseyNumber ??
    datiAtleta?.jersey ??
    datiAtleta?.jerseyNumber ??
    null;

  const posizione =
    atleta?.position?.name ||
    atleta?.position?.displayName ||
    atleta?.position?.abbreviation ||
    datiAtleta?.position?.name ||
    datiAtleta?.position?.displayName ||
    null;

  const minuti =
    atleta?.minutesPlayed ??
    atleta?.stats?.minutesPlayed ??
    atleta?.statistics?.minutesPlayed ??
    null;

  return {
    id: String(
      datiAtleta?.id ||
      atleta?.id ||
      ""
    ),

    nome,

    numero:
      numero !== null &&
      numero !== undefined
        ? String(numero)
        : null,

    posizione: titolare
      ? traduciPosizione(posizione)
      : "Riserva",

    posizioneOriginale:
      posizione || null,

    titolare,

    entrato:
      Boolean(
        atleta?.subbedIn ||
        atleta?.substitutionIn
      ),

    uscito:
      Boolean(
        atleta?.subbedOut ||
        atleta?.substitutionOut
      ),

    minuti,

    statistiche:
      estraiStatisticheAtleta(atleta),
  };
}

/* =========================================================
   TROVA ROSTER DI UNA SQUADRA
========================================================= */

function trovaRosterSquadra(
  dati,
  teamId,
  teamName
) {
  const possibili = [];

  if (Array.isArray(dati?.roster)) {
    possibili.push(...dati.roster);
  }

  if (Array.isArray(dati?.boxscore?.players)) {
    possibili.push(...dati.boxscore.players);
  }

  if (Array.isArray(dati?.gameInfo?.roster)) {
    possibili.push(...dati.gameInfo.roster);
  }

  const idString =
    teamId !== null &&
    teamId !== undefined
      ? String(teamId)
      : null;

  for (const elemento of possibili) {
    const id =
      elemento?.team?.id ??
      elemento?.teamId ??
      elemento?.id;

    const nome =
      elemento?.team?.displayName ||
      elemento?.team?.name ||
      elemento?.displayName ||
      elemento?.name ||
      "";

    if (
      idString &&
      id !== undefined &&
      id !== null &&
      String(id) === idString
    ) {
      return elemento;
    }

    if (
      teamName &&
      nome &&
      String(nome).toLowerCase() ===
        String(teamName).toLowerCase()
    ) {
      return elemento;
    }
  }

  return null;
}

/* =========================================================
   FORMAZIONE
========================================================= */

function estraiFormazione(
  roster,
  squadra,
  datiCompleti
) {
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

  /* -------------------------------------------------------
     MODULO
  ------------------------------------------------------- */

  let modulo =
    roster?.formation?.displayName ||
    roster?.formation?.name ||
    roster?.formation?.formation ||
    roster?.formations?.displayName ||
    roster?.formations?.name ||
    roster?.formations?.formation ||
    null;

  if (!modulo) {
    const atletiPossibili =
      roster?.roster ||
      roster?.athletes ||
      roster?.players ||
      [];

    if (Array.isArray(atletiPossibili)) {
      for (const atleta of atletiPossibili) {
        modulo =
          atleta?.formation?.displayName ||
          atleta?.formation?.name ||
          atleta?.formation?.formation ||
          modulo;

        if (modulo) break;
      }
    }
  }

  /* -------------------------------------------------------
     ALLENATORE
  ------------------------------------------------------- */

  let allenatore = null;

  const coaches =
    roster?.coaches ||
    roster?.coach ||
    [];

  if (Array.isArray(coaches) && coaches.length) {
    const coach = coaches[0];

    allenatore =
      coach?.coach?.displayName ||
      coach?.coach?.fullName ||
      coach?.displayName ||
      coach?.fullName ||
      coach?.name ||
      null;
  }

  if (!allenatore && roster?.coach) {
    const coach = roster.coach;

    allenatore =
      coach?.displayName ||
      coach?.fullName ||
      coach?.name ||
      null;
  }

  /* -------------------------------------------------------
     GIOCATORI
  ------------------------------------------------------- */

  const atleti =
    roster?.roster ||
    roster?.athletes ||
    roster?.players ||
    [];

  if (Array.isArray(atleti)) {
    for (const atleta of atleti) {
      const titolare =
        atleta?.starter === true ||
        atleta?.starter === "true" ||
        atleta?.starter === 1;

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
   FUNZIONI DI SUPPORTO STATISTICHE SQUADRA
========================================================= */

/*
   Estrae un singolo valore da una statistica ESPN.
*/
function valoreStatistica(stat) {
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

  return null;
}

/*
   Aggiunge una statistica evitando duplicati.
*/
function aggiungiStatistica(
  risultato,
  nome,
  valore
) {
  if (!nome) return;

  if (
    valore === undefined ||
    valore === null ||
    valore === ""
  ) {
    return;
  }

  /*
     Manteniamo la prima statistica valida.
     In questo modo un eventuale duplicato
     proveniente da ESPN non sovrascrive
     inutilmente il valore.
  */
  if (
    risultato[nome] === undefined ||
    risultato[nome] === null
  ) {
    risultato[nome] = valore;
  }
}

/*
   Estrae ricorsivamente le statistiche da
   una struttura ESPN conosciuta.
*/
function estraiArrayStatistiche(
  array,
  risultato
) {
  if (!Array.isArray(array)) return;

  for (const elemento of array) {
    if (!elemento) continue;

    /*
       Caso:
       {
         name: "totalShots",
         value: 10,
         displayValue: "10"
       }
    */
    if (elemento.name) {
      const valore =
        valoreStatistica(elemento);

      if (valore !== null) {
        aggiungiStatistica(
          risultato,
          elemento.name,
          valore
        );
      }
    }

    /*
       Caso:
       {
         name: "...",
         statistics: [...]
       }
    */
    if (Array.isArray(elemento.statistics)) {
      estraiArrayStatistiche(
        elemento.statistics,
        risultato
      );
    }

    /*
       Caso:
       {
         stats: [...]
       }
    */
    if (Array.isArray(elemento.stats)) {
      estraiArrayStatistiche(
        elemento.stats,
        risultato
      );
    }
  }
}

/* =========================================================
   STATISTICHE SQUADRA
========================================================= */

function estraiStatisticheSquadra(
  dati,
  teamId,
  teamName
) {
  const risultato = {};

  /*
     =======================================================
     IMPORTANTE
     =======================================================

     Cerchiamo SEMPRE prima la squadra tramite ID.

     Non prendiamo mai:
     - statistiche della prima squadra
     - statistiche della seconda squadra
     - statistiche generiche della partita

     e non le copiamo sull'altra squadra.

     Questo impedisce che casa e trasferta
     ricevano gli stessi valori.
  */

  const idCercato =
    teamId !== null &&
    teamId !== undefined
      ? String(teamId)
      : null;

  const nomeCercato =
    teamName
      ? String(teamName).trim().toLowerCase()
      : null;

  /* =======================================================
     1. BOX SCORE PLAYERS
  ======================================================= */

  const players =
    dati?.boxscore?.players;

  if (Array.isArray(players)) {
    for (const gruppoSquadra of players) {
      const id =
        gruppoSquadra?.team?.id ??
        gruppoSquadra?.teamId;

      const nome =
        gruppoSquadra?.team?.displayName ||
        gruppoSquadra?.team?.name ||
        "";

      const idCoincide =
        idCercato &&
        id !== null &&
        id !== undefined &&
        String(id) === idCercato;

      const nomeCoincide =
        nomeCercato &&
        nome &&
        String(nome).trim().toLowerCase() ===
          nomeCercato;

      /*
         Se l'ID esiste, utilizziamo SOLO l'ID.
         Il nome viene usato soltanto quando
         l'ID non è disponibile.
      */
      const corrisponde =
        idCercato
          ? idCoincide
          : nomeCoincide;

      if (!corrisponde) continue;

      const statistics =
        gruppoSquadra?.statistics ||
        gruppoSquadra?.teamStatistics ||
        [];

      estraiArrayStatistiche(
        statistics,
        risultato
      );

      /*
         Alcune versioni ESPN possono avere
         statistiche direttamente sotto il gruppo.
      */
      if (
        Array.isArray(
          gruppoSquadra?.stats
        )
      ) {
        estraiArrayStatistiche(
          gruppoSquadra.stats,
          risultato
        );
      }
    }
  }

  /* =======================================================
     2. COMPETITION -> COMPETITORS
  ======================================================= */

  /*
     Questo NON è un fallback che copia dati.

     Cerchiamo esclusivamente il competitor
     appartenente alla squadra richiesta.
  */

  const competizione =
    dati?.header?.competitions?.[0];

  const concorrenti =
    competizione?.competitors;

  if (Array.isArray(concorrenti)) {
    const concorrente =
      concorrenti.find((c) => {
        const id =
          c?.team?.id;

        const nome =
          c?.team?.displayName ||
          c?.team?.name ||
          "";

        if (idCercato) {
          return (
            id !== null &&
            id !== undefined &&
            String(id) === idCercato
          );
        }

        return (
          nomeCercato &&
          String(nome).trim().toLowerCase() ===
            nomeCercato
        );
      });

    /*
       Se ESPN ha trovato il competitor corretto,
       estraiamo SOLO le sue statistiche.
    */
    if (
      concorrente &&
      Array.isArray(
        concorrente.statistics
      )
    ) {
      estraiArrayStatistiche(
        concorrente.statistics,
        risultato
      );
    }

    if (
      concorrente &&
      Array.isArray(
        concorrente.stats
      )
    ) {
      estraiArrayStatistiche(
        concorrente.stats,
        risultato
      );
    }
  }

  /* =======================================================
     3. ALTRE STRUTTURE ESPN
  ======================================================= */

  /*
     Alcune risposte possono contenere una struttura
     statistics direttamente dentro il competitor.

     Anche qui controlliamo SEMPRE l'ID.
  */

  if (Array.isArray(concorrenti)) {
    for (const concorrente of concorrenti) {
      const id =
        concorrente?.team?.id;

      if (
        !idCercato ||
        id === null ||
        id === undefined ||
        String(id) !== idCercato
      ) {
        continue;
      }

      if (
        Array.isArray(
          concorrente?.statistics
        )
      ) {
        estraiArrayStatistiche(
          concorrente.statistics,
          risultato
        );
      }

      if (
        Array.isArray(
          concorrente?.stats
        )
      ) {
        estraiArrayStatistiche(
          concorrente.stats,
          risultato
        );
      }
    }
  }

  /* =======================================================
     TRADUZIONE
  ======================================================= */

  return traduciStatistiche(
    risultato
  );
}

/* =========================================================
   CONTROLLO STATISTICHE UGUALI
========================================================= */

/*
   Questa funzione NON copia statistiche.

   Serve solo a diagnosticare un eventuale problema
   della risposta ESPN.

   Se due squadre hanno statistiche completamente
   identiche, segnaliamo quali statistiche sono uguali.
*/

function confrontaStatistiche(
  casa,
  trasferta
) {
  const uguali = [];

  const chiaviCasa =
    Object.keys(casa || {});

  for (const chiave of chiaviCasa) {
    if (
      trasferta &&
      trasferta[chiave] !== undefined &&
      String(casa[chiave]) ===
        String(trasferta[chiave])
    ) {
      uguali.push(chiave);
    }
  }

  return uguali;
}

/* =========================================================
   STATISTICHE GIOCATORI
========================================================= */

function estraiStatisticheGiocatori(
  formazione
) {
  if (!formazione) return [];

  return [
    ...formazione.titolari,
    ...formazione.riserve,
  ].filter(
    (giocatore) =>
      giocatore &&
      Object.keys(
        giocatore.statistiche || {}
      ).length > 0
  );
}

/* =========================================================
   EVENTI
========================================================= */

function estraiEventi(dati) {
  const eventi =
    dati?.plays ||
    dati?.keyEvents ||
    dati?.leaders ||
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
      evento?.description ||
      null,

    giocatore:
      evento?.participants?.[0]?.athlete?.displayName ||
      evento?.athlete?.displayName ||
      evento?.participant?.athlete?.displayName ||
      null,

    assist:
      evento?.participants?.[1]?.athlete?.displayName ||
      null,

    squadra:
      evento?.team?.displayName ||
      evento?.team?.name ||
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

    /* =====================================================
       URL ESPN
    ===================================================== */

    const url =
      `https://site.api.espn.com/apis/site/v2/sports/soccer/${competition.espnLeague}/summary?event=${encodeURIComponent(
        eventId
      )}`;

    const dati =
      await richiesta(url);

    /* =====================================================
       PARTITA
    ===================================================== */

    const competizioneESPN =
      dati?.header?.competitions?.[0];

    if (!competizioneESPN) {
      return res.status(404).json({
        success: false,
        error:
          "Partita non trovata",
      });
    }

    const concorrenti =
      competizioneESPN?.competitors || [];

    const casa =
      concorrenti.find(
        (squadra) =>
          squadra?.homeAway === "home"
      );

    const trasferta =
      concorrenti.find(
        (squadra) =>
          squadra?.homeAway === "away"
      );

    if (!casa || !trasferta) {
      return res.status(404).json({
        success: false,
        error:
          "Squadre della partita non trovate",
      });
    }

    const nomeCasa =
      casa?.team?.displayName ||
      casa?.team?.name ||
      "Squadra casa";

    const nomeTrasferta =
      trasferta?.team?.displayName ||
      trasferta?.team?.name ||
      "Squadra trasferta";

    const idCasa =
      casa?.team?.id ||
      null;

    const idTrasferta =
      trasferta?.team?.id ||
      null;

    /* =====================================================
       ROSTER
    ===================================================== */

    const rosterCasa =
      trovaRosterSquadra(
        dati,
        idCasa,
        nomeCasa
      );

    const rosterTrasferta =
      trovaRosterSquadra(
        dati,
        idTrasferta,
        nomeTrasferta
      );

    const formazioneCasa =
      estraiFormazione(
        rosterCasa,
        nomeCasa,
        dati
      );

    const formazioneTrasferta =
      estraiFormazione(
        rosterTrasferta,
        nomeTrasferta,
        dati
      );

    /* =====================================================
       STATISTICHE SQUADRE
    ===================================================== */

    const statisticheCasa =
      estraiStatisticheSquadra(
        dati,
        idCasa,
        nomeCasa
      );

    const statisticheTrasferta =
      estraiStatisticheSquadra(
        dati,
        idTrasferta,
        nomeTrasferta
      );

    /* =====================================================
       CONTROLLO STATISTICHE
    ===================================================== */

    const statisticheUguali =
      confrontaStatistiche(
        statisticheCasa,
        statisticheTrasferta
      );

    /*
       NON modifichiamo i dati.

       Le statistiche uguali possono essere realmente
       uguali (es. cartellini rossi = 0, falli = 10 ecc.).

       Vengono solamente riportate nel debug.
    */

    /* =====================================================
       STATISTICHE GIOCATORI
    ===================================================== */

    const statisticheGiocatoriCasa =
      estraiStatisticheGiocatori(
        formazioneCasa
      );

    const statisticheGiocatoriTrasferta =
      estraiStatisticheGiocatori(
        formazioneTrasferta
      );

    /* =====================================================
       EVENTI
    ===================================================== */

    const eventi =
      estraiEventi(dati);

    /* =====================================================
       DATA
    ===================================================== */

    const dataPartita =
      competizioneESPN?.date ||
      dati?.header?.competitions?.[0]?.date ||
      null;

    /* =====================================================
       STATO
    ===================================================== */

    const statoESPN =
      competizioneESPN?.status?.type ||
      {};

    /* =====================================================
       CACHE
    ===================================================== */

    res.setHeader(
      "Cache-Control",
      "s-maxage=15, stale-while-revalidate=30"
    );

    /* =====================================================
       RISPOSTA
    ===================================================== */

    return res.status(200).json({
      success: true,

      fonte: "ESPN",

      fusoOrario: "Europe/Rome",

      competizione: {
        id:
          competition.id,

        nome:
          competition.name,

        campionatoESPN:
          competition.espnLeague,
      },

      partita: {
        id:
          String(eventId),

        data:
          dataPartita,

        casa: {
          id:
            idCasa,

          nome:
            nomeCasa,

          abbreviazione:
            casa?.team?.abbreviation ||
            null,

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
            idTrasferta,

          nome:
            nomeTrasferta,

          abbreviazione:
            trasferta?.team?.abbreviation ||
            null,

          logo:
            trasferta?.team?.logo ||
            trasferta?.team?.logos?.[0]?.href ||
            null,

          gol:
            trasferta?.score ??
            "0",
        },

        stato: {
          stato:
            statoESPN?.state ||
            null,

          descrizione:
            statoESPN?.description ||
            null,

          dettaglio:
            statoESPN?.detail ||
            null,

          completata:
            Boolean(
              statoESPN?.completed
            ),
        },
      },

      formazioni: {
        casa:
          formazioneCasa,

        trasferta:
          formazioneTrasferta,
      },

      statistiche: {
        squadre: {
          casa:
            statisticheCasa,

          trasferta:
            statisticheTrasferta,
        },

        giocatori: {
          casa:
            statisticheGiocatoriCasa,

          trasferta:
            statisticheGiocatoriTrasferta,
        },
      },

      eventi,

      riepilogo: {
        formazioneCasa:
          formazioneCasa.modulo,

        formazioneTrasferta:
          formazioneTrasferta.modulo,

        titolariCasa:
          formazioneCasa.titolari.length,

        titolariTrasferta:
          formazioneTrasferta.titolari.length,

        riserveCasa:
          formazioneCasa.riserve.length,

        riserveTrasferta:
          formazioneTrasferta.riserve.length,

        statisticheSquadraCasa:
          Object.keys(
            statisticheCasa
          ).length,

        statisticheSquadraTrasferta:
          Object.keys(
            statisticheTrasferta
          ).length,

        /*
           Elenco delle statistiche che hanno
           casualmente lo stesso valore per entrambe
           le squadre.

           NON significa che siano sbagliate:
           ad esempio entrambe possono avere 2 cartellini.
        */ 
        statisticheConValoreUguale:
          statisticheUguali,

        statisticheGiocatoriCasa:
          statisticheGiocatoriCasa.length,

        statisticheGiocatoriTrasferta:
          statisticheGiocatoriTrasferta.length,

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
