// api/match-stats.js
// Endpoint statistiche, formazioni, rose e allenatori
// 100%SerieA&SerieB
//
// Esempio:
// /api/match-stats?competition=serie-a&id=401874745

export default async function handler(req, res) {
  try {
    const { competition = "serie-a", id } = req.query;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: "Parametro 'id' mancante"
      });
    }

    const competitionMap = {
      "serie-a": "ita.1",
      "serie-b": "ita.2"
    };

    const espnLeague = competitionMap[String(competition).toLowerCase()];

    if (!espnLeague) {
      return res.status(400).json({
        success: false,
        error: "Competizione non supportata",
        competizioniSupportate: ["serie-a", "serie-b"]
      });
    }

    const url =
      `https://site.api.espn.com/apis/site/v2/sports/soccer/${espnLeague}/summary?event=${encodeURIComponent(id)}`;

    const response = await fetch(url);

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: "ESPN ha restituito un errore",
        status: response.status
      });
    }

    const data = await response.json();

    const header = data.header || {};
    const competitionData =
      header.competitions && header.competitions.length
        ? header.competitions[0]
        : {};

    const competitors = competitionData.competitors || [];

    const homeCompetitor =
      competitors.find(c => c.homeAway === "home") || {};

    const awayCompetitor =
      competitors.find(c => c.homeAway === "away") || {};

    // ---------------------------------------------------------
    // FUNZIONI DI SUPPORTO
    // ---------------------------------------------------------

    function safeString(value, fallback = null) {
      if (value === undefined || value === null) {
        return fallback;
      }

      const text = String(value).trim();

      return text.length ? text : fallback;
    }

    function numberOrString(value) {
      if (value === undefined || value === null) {
        return null;
      }

      return value;
    }

    function getTeamName(competitor) {
      return (
        competitor.team?.displayName ||
        competitor.team?.shortDisplayName ||
        competitor.team?.name ||
        null
      );
    }

    function getTeamLogo(competitor) {
      return (
        competitor.team?.logo ||
        competitor.team?.logos?.[0]?.href ||
        null
      );
    }

    function getTeamId(competitor) {
      return competitor.team?.id || null;
    }

    function getScore(competitor) {
      return competitor.score ?? null;
    }

    function translatePosition(position) {
      if (!position) return null;

      const value = String(position).toLowerCase();

      const positions = {
        goalkeeper: "Portiere",
        goalkeepers: "Portiere",
        keeper: "Portiere",

        defender: "Difensore",
        defenders: "Difensore",
        back: "Difensore",

        midfielder: "Centrocampista",
        midfielders: "Centrocampista",
        midfielder_left: "Centrocampista",
        midfielder_right: "Centrocampista",

        forward: "Attaccante",
        forwards: "Attaccante",
        striker: "Attaccante",
        attacker: "Attaccante",

        substitute: "Riserva"
      };

      return positions[value] || position;
    }

    function translateStatName(name) {
      if (!name) return name;

      const dictionary = {
        possession: "Possesso palla",
        possessionPct: "Possesso palla",

        shots: "Tiri",
        shotsOnTarget: "Tiri nello specchio",
        shotsOffTarget: "Tiri fuori",
        blockedShots: "Tiri respinti",

        corners: "Calci d'angolo",
        fouls: "Falli",
        offsides: "Fuorigioco",

        saves: "Parate",
        tackles: "Contrasti",
        interceptions: "Intercetti",
        clearances: "Spazzate",

        passes: "Passaggi",
        passingPct: "Percentuale passaggi",
        crosses: "Cross",

        yellowCards: "Cartellini gialli",
        redCards: "Cartellini rossi",

        totalPasses: "Passaggi totali",
        accuratePasses: "Passaggi completati",

        goals: "Gol",
        assists: "Assist",

        minutesPlayed: "Minuti giocati"
      };

      return dictionary[name] || name;
    }

    function extractStatValue(stat) {
      if (!stat) return null;

      if (stat.displayValue !== undefined) {
        return stat.displayValue;
      }

      if (stat.value !== undefined) {
        return stat.value;
      }

      if (stat.displayValue === 0 || stat.value === 0) {
        return 0;
      }

      return null;
    }

    // ---------------------------------------------------------
    // FORMAZIONI ESPN
    // ---------------------------------------------------------

    function getFormationFromCompetitor(competitor) {
      return (
        competitor.formations?.[0]?.formation ||
        competitor.formation ||
        null
      );
    }

    // ---------------------------------------------------------
    // ROSE / TITOLARI / RISERVE
    // ---------------------------------------------------------

    function normalizePlayer(player, isStarter = false) {
      const athlete = player.athlete || player;

      const fullName =
        athlete.displayName ||
        athlete.fullName ||
        athlete.shortName ||
        player.displayName ||
        player.fullName ||
        null;

      const jersey =
        player.jersey ||
        athlete.jersey ||
        null;

      const position =
        player.position?.displayName ||
        player.position?.name ||
        athlete.position?.displayName ||
        athlete.position?.name ||
        null;

      const stats = {};

      const playerStats =
        player.statistics ||
        player.stats ||
        [];

      if (Array.isArray(playerStats)) {
        for (const stat of playerStats) {
          const name =
            stat.name ||
            stat.displayName ||
            stat.label;

          if (!name) continue;

          stats[translateStatName(name)] =
            extractStatValue(stat);
        }
      }

      return {
        id: athlete.id || player.id || null,
        nome: fullName,
        numero: jersey,
        posizione: translatePosition(position),
        titolare: Boolean(isStarter),
        entrato: player.subbedIn === true || player.entered === true,
        uscito: player.subbedOut === true || player.exited === true,
        minuti: player.minutesPlayed ?? null,
        statistiche: stats
      };
    }

    function extractRoster(teamId, isHome) {
      const rosters = Array.isArray(data.rosters)
        ? data.rosters
        : [];

      let roster = rosters.find(r => {
        const id =
          r.team?.id ||
          r.teamId ||
          r.team?.uid;

        return String(id) === String(teamId);
      });

      if (!roster) {
        roster = rosters[isHome ? 0 : 1] || {};
      }

      const athletes =
        roster.roster ||
        roster.athletes ||
        roster.players ||
        [];

      const titolari = [];
      const riserve = [];

      for (const player of athletes) {
        const starter =
          player.starter === true ||
          player.starter === "true" ||
          player.isStarter === true;

        const normalized = normalizePlayer(player, starter);

        if (starter) {
          titolari.push(normalized);
        } else {
          riserve.push(normalized);
        }
      }

      return {
        titolari,
        riserve,
        giocatori: athletes.length
      };
    }

    // ---------------------------------------------------------
    // ALLENATORI
    // ---------------------------------------------------------

    function extractCoach(teamId, isHome) {
      const coaches = Array.isArray(data.coaches)
        ? data.coaches
        : [];

      let coach = coaches.find(c => {
        const id =
          c.team?.id ||
          c.teamId ||
          c.team?.uid;

        return String(id) === String(teamId);
      });

      if (!coach) {
        coach = coaches[isHome ? 0 : 1] || null;
      }

      if (!coach) {
        return null;
      }

      const athlete = coach.athlete || coach;

      return {
        id: athlete.id || coach.id || null,
        nome:
          athlete.displayName ||
          athlete.fullName ||
          athlete.shortName ||
          null,
        ruolo: "Allenatore"
      };
    }

    // ---------------------------------------------------------
    // STATISTICHE DI SQUADRA
    // ---------------------------------------------------------

    function extractTeamStats(teamId, isHome) {
      const boxscore = data.boxscore || {};

      const teams = Array.isArray(boxscore.teams)
        ? boxscore.teams
        : [];

      let teamBox = teams.find(t => {
        const id =
          t.team?.id ||
          t.teamId ||
          t.team?.uid;

        return String(id) === String(teamId);
      });

      if (!teamBox) {
        teamBox = teams[isHome ? 0 : 1] || {};
      }

      const statistics = {};

      const statsArray =
        teamBox.statistics ||
        teamBox.stats ||
        [];

      if (Array.isArray(statsArray)) {
        for (const stat of statsArray) {
          const name =
            stat.name ||
            stat.displayName ||
            stat.label;

          if (!name) continue;

          statistics[translateStatName(name)] =
            extractStatValue(stat);
        }
      }

      // Alcuni dati possono arrivare direttamente dal competitor
      if (
        statistics["Possesso palla"] === null ||
        statistics["Possesso palla"] === undefined
      ) {
        const possession =
          competitionData.competitors?.find(c => {
            const id = c.team?.id;
            return String(id) === String(teamId);
          })?.possession;

        if (possession !== undefined) {
          statistics["Possesso palla"] =
            `${possession}%`;
        }
      }

      return statistics;
    }

    // ---------------------------------------------------------
    // STATISTICHE INDIVIDUALI
    // ---------------------------------------------------------

    function extractPlayerStats(teamId, isHome) {
      const boxscore = data.boxscore || {};

      const players = Array.isArray(boxscore.players)
        ? boxscore.players
        : [];

      let teamPlayers = players.find(p => {
        const id =
          p.team?.id ||
          p.teamId;

        return String(id) === String(teamId);
      });

      if (!teamPlayers) {
        teamPlayers = players[isHome ? 0 : 1] || {};
      }

      const groups =
        teamPlayers.statistics ||
        teamPlayers.groups ||
        [];

      const result = [];

      if (!Array.isArray(groups)) {
        return result;
      }

      for (const group of groups) {
        const athletes =
          group.athletes ||
          group.players ||
          [];

        if (!Array.isArray(athletes)) continue;

        for (const item of athletes) {
          const athlete =
            item.athlete ||
            item.player ||
            {};

          const stats = {};

          const labels =
            group.labels ||
            group.names ||
            [];

          const values =
            item.statistics ||
            item.stats ||
            [];

          values.forEach((value, index) => {
            const label =
              labels[index] ||
              `Statistica ${index + 1}`;

            stats[translateStatName(label)] = value;
          });

          result.push({
            id: athlete.id || item.id || null,
            nome:
              athlete.displayName ||
              athlete.fullName ||
              athlete.shortName ||
              null,
            numero:
              item.jersey ||
              athlete.jersey ||
              null,
            gruppo:
              group.displayName ||
              group.name ||
              null,
            statistiche: stats
          });
        }
      }

      return result;
    }

    // ---------------------------------------------------------
    // DATI SQUADRE
    // ---------------------------------------------------------

    const homeTeamId = getTeamId(homeCompetitor);
    const awayTeamId = getTeamId(awayCompetitor);

    const homeRoster =
      extractRoster(homeTeamId, true);

    const awayRoster =
      extractRoster(awayTeamId, false);

    const homeCoach =
      extractCoach(homeTeamId, true);

    const awayCoach =
      extractCoach(awayTeamId, false);

    const homeTeamStats =
      extractTeamStats(homeTeamId, true);

    const awayTeamStats =
      extractTeamStats(homeTeamId, false);

    const homePlayerStats =
      extractPlayerStats(homeTeamId, true);

    const awayPlayerStats =
      extractPlayerStats(awayTeamId, false);

    // ---------------------------------------------------------
    // RISPOSTA FINALE
    // ---------------------------------------------------------

    return res.status(200).json({
      success: true,

      fonte: "ESPN",
      fusoOrario: "Europe/Rome",

      competizione: {
        id: competition,
        nome:
          competition === "serie-b"
            ? "Serie B"
            : "Serie A",
        campionatoESPN: espnLeague
      },

      partita: {
        id: String(id),

        casa: {
          id: homeTeamId,
          nome: getTeamName(homeCompetitor),
          abbreviazione:
            homeCompetitor.team?.abbreviation ||
            null,
          logo: getTeamLogo(homeCompetitor),
          gol: getScore(homeCompetitor)
        },

        trasferta: {
          id: awayTeamId,
          nome: getTeamName(awayCompetitor),
          abbreviazione:
            awayCompetitor.team?.abbreviation ||
            null,
          logo: getTeamLogo(awayCompetitor),
          gol: getScore(awayCompetitor)
        },

        stato: {
          stato:
            competitionData.status?.type?.state ||
            null,

          descrizione:
            competitionData.status?.type?.description ||
            null,

          dettaglio:
            competitionData.status?.type?.shortDetail ||
            competitionData.status?.type?.detail ||
            null,

          completata:
            competitionData.status?.type?.completed === true
        }
      },

      formazioni: {
        casa: {
          squadra: getTeamName(homeCompetitor),
          modulo: getFormationFromCompetitor(homeCompetitor),

          allenatore: homeCoach,

          titolari: homeRoster.titolari,

          riserve: homeRoster.riserve,

          totaleGiocatori:
            homeRoster.giocatori
        },

        trasferta: {
          squadra: getTeamName(awayCompetitor),
          modulo: getFormationFromCompetitor(awayCompetitor),

          allenatore: awayCoach,

          titolari: awayRoster.titolari,

          riserve: awayRoster.riserve,

          totaleGiocatori:
            awayRoster.giocatori
        }
      },

      statistiche: {
        squadre: {
          casa: homeTeamStats,
          trasferta: awayTeamStats
        },

        giocatori: {
          casa: homePlayerStats,
          trasferta: awayPlayerStats
        }
      },

      riepilogo: {
        formazioneCasa:
          getFormationFromCompetitor(homeCompetitor),

        formazioneTrasferta:
          getFormationFromCompetitor(awayCompetitor),

        titolariCasa:
          homeRoster.titolari.length,

        titolariTrasferta:
          awayRoster.titolari.length,

        riserveCasa:
          homeRoster.riserve.length,

        riserveTrasferta:
          awayRoster.riserve.length,

        statisticheSquadraCasa:
          Object.keys(homeTeamStats).length,

        statisticheSquadraTrasferta:
          Object.keys(awayTeamStats).length,

        statisticheGiocatoriCasa:
          homePlayerStats.length,

        statisticheGiocatoriTrasferta:
          awayPlayerStats.length,

        allenatoreCasa:
          Boolean(homeCoach),

        allenatoreTrasferta:
          Boolean(awayCoach)
      }
    });

  } catch (error) {
    console.error("Errore /api/match-stats:", error);

    return res.status(500).json({
      success: false,
      error: "Errore interno dell'API",
      messaggio: error?.message || "Errore sconosciuto"
    });
  }
                         }
