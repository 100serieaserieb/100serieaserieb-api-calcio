import { createClient } from "@base44/sdk";

const API_BASE = "https://100serieaserieb-api-calcio.vercel.app/api";

const COMPETITIONS = [
  { api: "serie-a", entity: "Match", competition: "serie_a" },
  { api: "serie-b", entity: "Match", competition: "serie_b" },
  { api: "champions-league", entity: "Match", competition: "champions_league" },
  { api: "europa-league", entity: "Match", competition: "europa_league" },
  { api: "conference-league", entity: "Match", competition: "conference_league" },
  { api: "coppa-italia", entity: "CoppaItaliaMatch", competition: null },
  { api: "italia", entity: "NazionaleMatch", competition: null },
];

function convertDate(date) {
  if (!date) return null;

  const parts = String(date).split("/");

  if (parts.length !== 3) return null;

  const [day, month, year] = parts;

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(
    2,
    "0"
  )}`;
}

function mapStatus(state) {
  if (state === "in") return "live";
  if (state === "post") return "finished";
  return "scheduled";
}

function parseScore(score) {
  if (
    score === null ||
    score === undefined ||
    score === "" ||
    score === "-"
  ) {
    return null;
  }

  const value = parseInt(String(score), 10);

  return Number.isNaN(value) ? null : value;
}

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} - ${url}`);
  }

  return response.json();
}

function getErrorMessage(error) {
  if (!error) return "Errore sconosciuto";

  return (
    error?.message ||
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    String(error)
  );
}

export default async function handler(req, res) {
  const startedAt = new Date().toISOString();

  const stats = {
    competitions: 0,
    fetched: 0,
    created: 0,
    updated: 0,
    details: 0,
    errors: 0,
  };

  const errors = [];

  // Controllo variabili ambiente
  const appId = process.env.BASE44_APP_ID;
  const email = process.env.BASE44_ADMIN_EMAIL;
  const password = process.env.BASE44_ADMIN_PASSWORD;

  if (!appId) {
    return res.status(500).json({
      success: false,
      error: "BASE44_APP_ID non configurato su Vercel",
    });
  }

  if (!email) {
    return res.status(500).json({
      success: false,
      error: "BASE44_ADMIN_EMAIL non configurato su Vercel",
    });
  }

  if (!password) {
    return res.status(500).json({
      success: false,
      error: "BASE44_ADMIN_PASSWORD non configurato su Vercel",
    });
  }

  let base44;

  // Connessione Base44
  try {
    base44 = createClient({
      appId,
    });

    await base44.auth.loginViaEmailPassword(email, password);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Autenticazione Base44 fallita",
      details: getErrorMessage(error),
    });
  }

  // Sincronizzazione
  for (const competition of COMPETITIONS) {
    try {
      console.log(`Sincronizzazione ${competition.api}...`);

      const data = await fetchJson(
        `${API_BASE}/matches?competition=${encodeURIComponent(
          competition.api
        )}`
      );

      if (!data?.success || !Array.isArray(data.matches)) {
        throw new Error(
          `Risposta non valida dall'API per ${competition.api}`
        );
      }

      stats.competitions++;

      const entity = base44.entities[competition.entity];

      if (!entity) {
        throw new Error(
          `Entity Base44 non trovata: ${competition.entity}`
        );
      }

      for (const match of data.matches) {
        try {
          const externalId = String(match.id);

          const homeTeam = match.home?.name || "";
          const awayTeam = match.away?.name || "";

          const matchDate = convertDate(match.date);
          const matchTime = match.time || null;

          const status = mapStatus(match.status?.state);

          const homeScore = parseScore(match.home?.score);
          const awayScore = parseScore(match.away?.score);

          const payload = {
            external_id: externalId,
            home_team: homeTeam,
            away_team: awayTeam,
            match_date: matchDate,
            match_time: matchTime,
            status,
            home_score: homeScore,
            away_score: awayScore,
          };

          if (competition.competition) {
            payload.competition = competition.competition;
          }

          let existing = null;

          // Ricerca tramite external_id
          try {
            const found = await entity.filter({
              external_id: externalId,
            });

            if (Array.isArray(found) && found.length > 0) {
              existing = found[0];
            }
          } catch (error) {
            console.log(
              `Ricerca external_id fallita ${externalId}:`,
              getErrorMessage(error)
            );
          }

          // Fallback tramite squadra + data
          if (
            !existing &&
            matchDate &&
            homeTeam &&
            awayTeam
          ) {
            try {
              const found = await entity.filter({
                home_team: homeTeam,
                away_team: awayTeam,
                match_date: matchDate,
              });

              if (Array.isArray(found) && found.length > 0) {
                existing = found[0];
              }
            } catch (error) {
              console.log(
                `Fallback ricerca fallito ${externalId}:`,
                getErrorMessage(error)
              );
            }
          }

          if (existing) {
            await entity.update(existing.id, payload);
            stats.updated++;
          } else {
            await entity.create(payload);
            stats.created++;
          }

          stats.fetched++;

          // Dettagli per partite live o finite
          if (status === "live" || status === "finished") {
            try {
              const detail = await fetchJson(
                `${API_BASE}/match?competition=${encodeURIComponent(
                  competition.api
                )}&id=${encodeURIComponent(externalId)}`
              );

              const matchStats = await fetchJson(
                `${API_BASE}/match-stats?competition=${encodeURIComponent(
                  competition.api
                )}&id=${encodeURIComponent(externalId)}`
              );

              const detailPayload = {};

              if (detail?.success) {
                if (detail.venue?.name) {
                  detailPayload.stadium = detail.venue.name;
                }

                if (Array.isArray(detail.goals)) {
                  const homeScorers = [];
                  const awayScorers = [];

                  for (const goal of detail.goals) {
                    const name =
                      goal.athlete?.displayName ||
                      goal.scorer?.displayName ||
                      goal.player?.displayName ||
                      goal.athlete?.name ||
                      goal.scorer?.name ||
                      goal.player?.name ||
                      "";

                    if (!name) continue;

                    const parts = String(name).trim().split(/\s+/);
                    const surname = parts[parts.length - 1];

                    const minute =
                      goal.clock ??
                      goal.minute ??
                      goal.time ??
                      "";

                    const side =
                      String(
                        goal.team ||
                          goal.side ||
                          ""
                      ).toLowerCase();

                    const entry = `${minute} ${surname}`.trim();

                    if (
                      side.includes("away") ||
                      side === awayTeam.toLowerCase()
                    ) {
                      awayScorers.push(entry);
                    } else {
                      homeScorers.push(entry);
                    }
                  }

                  if (homeScorers.length) {
                    detailPayload.home_scorers =
                      homeScorers.join("\n");
                  }

                  if (awayScorers.length) {
                    detailPayload.away_scorers =
                      awayScorers.join("\n");
                  }
                }

                if (detail.mvp) {
                  detailPayload.mvp =
                    typeof detail.mvp === "string"
                      ? detail.mvp
                      : detail.mvp.displayName ||
                        detail.mvp.name ||
                        "";
                }
              }

              if (matchStats?.success) {
                const formations =
                  matchStats.formazioni || {};

                const home =
                  formations.casa || {};

                const away =
                  formations.trasferta || {};

                if (home.modulo) {
                  detailPayload.home_lineup_module =
                    home.modulo;
                }

                if (away.modulo) {
                  detailPayload.away_lineup_module =
                    away.modulo;
                }

                if (home.allenatore) {
                  detailPayload.home_coach =
                    home.allenatore;
                }

                if (away.allenatore) {
                  detailPayload.away_coach =
                    away.allenatore;
                }

                const getPlayers = (team) => {
                  const starters = Array.isArray(team.titolari)
                    ? team.titolari
                    : [];

                  const substitutes = Array.isArray(team.riserve)
                    ? team.riserve
                    : [];

                  return [...starters, ...substitutes]
                    .map((player) => player?.nome)
                    .filter(Boolean)
                    .join("\n");
                };

                const homePlayers = getPlayers(home);
                const awayPlayers = getPlayers(away);

                if (homePlayers) {
                  detailPayload.home_lineup_players =
                    homePlayers;
                }

                if (awayPlayers) {
                  detailPayload.away_lineup_players =
                    awayPlayers;
                }
              }

              if (Object.keys(detailPayload).length > 0) {
                let record = null;

                const found = await entity.filter({
                  external_id: externalId,
                });

                if (Array.isArray(found) && found.length) {
                  record = found[0];
                }

                if (record) {
                  await entity.update(
                    record.id,
                    detailPayload
                  );

                  stats.details++;
                }
              }
            } catch (error) {
              stats.errors++;

              errors.push({
                competition: competition.api,
                match: externalId,
                type: "details",
                error: getErrorMessage(error),
              });
            }
          }
        } catch (error) {
          stats.errors++;

          errors.push({
            competition: competition.api,
            match: String(match?.id || "unknown"),
            type: "match",
            error: getErrorMessage(error),
          });
        }
      }
    } catch (error) {
      stats.errors++;

      errors.push({
        competition: competition.api,
        type: "competition",
        error: getErrorMessage(error),
      });
    }
  }

  return res.status(200).json({
    success: true,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    stats,
    errors,
  });
}
