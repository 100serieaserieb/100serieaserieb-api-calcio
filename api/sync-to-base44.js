import { createClient } from "@base44/sdk";

const API_BASE = "https://100serieaserieb-api-calcio.vercel.app/api";

const COMPETITIONS = [
  { api: "serie-a", entity: "Match", competition: "serie_a" },
  { api: "serie-b", entity: "Match", competition: "serie_b" },
  { api: "champions-league", entity: "Match", competition: "champions_league" },
  { api: "europa-league", entity: "Match", competition: "europa_league" },
  { api: "conference-league", entity: "Match", competition: "conference_league" },
  { api: "coppa-italia", entity: "CoppaItaliaMatch", competition: null },
  { api: "italia", entity: "NazionaleMatch", competition: null }
];

function convertDate(value) {
  if (!value) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const parts = String(value).split("/");

  if (parts.length !== 3) return null;

  const [day, month, year] = parts;

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function mapStatus(state) {
  if (state === "in") return "live";
  if (state === "post") return "finished";
  return "scheduled";
}

function parseScore(value) {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    value === "-"
  ) {
    return null;
  }

  const number = Number.parseInt(String(value), 10);

  return Number.isNaN(number) ? null : number;
}

function parseMinute(value) {
  if (value === null || value === undefined) return 0;

  if (typeof value === "number") {
    return Math.floor(value);
  }

  if (typeof value === "object") {
    if (typeof value.value === "number") {
      return Math.floor(value.value);
    }

    if (value.display) {
      const match = String(value.display).match(/\d+/);
      return match ? Number.parseInt(match[0], 10) : 0;
    }
  }

  const match = String(value).match(/\d+/);

  return match ? Number.parseInt(match[0], 10) : 0;
}

function getPlayerName(item) {
  const player =
    item?.athlete ||
    item?.scorer ||
    item?.player ||
    item;

  return String(
    player?.displayName ||
    player?.name ||
    player?.shortName ||
    ""
  ).trim();
}

function surname(fullName) {
  if (!fullName) return "";

  const parts = fullName.trim().split(/\s+/);

  return parts[parts.length - 1];
}

function detectSide(item, homeName, awayName) {
  const team = item?.team || item?.side;

  if (typeof team === "string") {
    const value = team.toLowerCase();

    if (value.includes("home")) return "home";
    if (value.includes("away")) return "away";

    if (homeName && value === homeName.toLowerCase()) {
      return "home";
    }

    if (awayName && value === awayName.toLowerCase()) {
      return "away";
    }
  }

  if (team && typeof team === "object") {
    const name = String(
      team.name ||
      team.displayName ||
      ""
    ).toLowerCase();

    if (homeName && name === homeName.toLowerCase()) {
      return "home";
    }

    if (awayName && name === awayName.toLowerCase()) {
      return "away";
    }
  }

  return "home";
}

function isOwnGoal(item) {
  const type = item?.type;

  if (typeof type === "string") {
    return /own|autogol/i.test(type);
  }

  if (type && typeof type === "object") {
    return /own|autogol/i.test(
      String(type.name || type.displayName || "")
    );
  }

  return false;
}

function isRedCard(item) {
  const card =
    item?.card ||
    item?.type ||
    item?.color;

  if (typeof card === "string") {
    return /red|rosso/i.test(card);
  }

  if (card && typeof card === "object") {
    return /red|rosso/i.test(
      String(card.name || card.displayName || "")
    );
  }

  return false;
}

function buildDetailPayload(detail, homeName, awayName) {
  const payload = {};

  if (detail?.venue?.name) {
    payload.stadium = detail.venue.name;
  }

  const homeScorers = [];
  const awayScorers = [];

  if (Array.isArray(detail?.goals)) {
    for (const goal of detail.goals) {
      const minute = parseMinute(
        goal.clock ??
        goal.minute ??
        goal.time
      );

      const fullName = getPlayerName(goal);
      const playerSurname = surname(fullName) || fullName;

      if (!playerSurname) continue;

      const side = detectSide(
        goal,
        homeName,
        awayName
      );

      const entry = `${minute || ""} ${playerSurname}`.trim();

      if (isOwnGoal(goal)) {
        if (side === "home") {
          awayScorers.push(entry);
        } else {
          homeScorers.push(entry);
        }
      } else {
        if (side === "home") {
          homeScorers.push(entry);
        } else {
          awayScorers.push(entry);
        }
      }
    }
  }

  if (homeScorers.length) {
    payload.home_scorers = homeScorers.join("\n");
  }

  if (awayScorers.length) {
    payload.away_scorers = awayScorers.join("\n");
  }

  const homeRed = [];
  const awayRed = [];

  if (Array.isArray(detail?.cards)) {
    for (const card of detail.cards) {
      if (!isRedCard(card)) continue;

      const minute = parseMinute(
        card.clock ??
        card.minute ??
        card.time
      );

      const fullName = getPlayerName(card);
      const playerSurname = surname(fullName) || fullName;

      if (!playerSurname) continue;

      const side = detectSide(
        card,
        homeName,
        awayName
      );

      const entry = `${minute || ""} ${playerSurname}`.trim();

      if (side === "home") {
        homeRed.push(entry);
      } else {
        awayRed.push(entry);
      }
    }
  }

  if (homeRed.length) {
    payload.home_red_cards = JSON.stringify(homeRed);
  }

  if (awayRed.length) {
    payload.away_red_cards = JSON.stringify(awayRed);
  }

  if (Array.isArray(detail?.officials)) {
    const roles = [
      "referee",
      "assistant_referee_1",
      "assistant_referee_2",
      "fourth_official",
      "var_referee",
      "avar_referee"
    ];

    const officials = {};

    detail.officials.forEach((official, index) => {
      const name = String(
        official?.displayName ||
        official?.name ||
        ""
      ).trim();

      if (!name) return;

      const role = String(
        official?.role ||
        official?.position ||
        ""
      ).toLowerCase();

      if (/avar/.test(role)) {
        officials.avar_referee = name;
      } else if (/var/.test(role)) {
        officials.var_referee = name;
      } else if (/fourth|quarto/.test(role)) {
        officials.fourth_official = name;
      } else if (/assistant.*2|linesman.*2/.test(role)) {
        officials.assistant_referee_2 = name;
      } else if (/assistant.*1|linesman.*1/.test(role)) {
        officials.assistant_referee_1 = name;
      } else if (/referee|arbitro/.test(role)) {
        officials.referee = name;
      } else if (
        roles[index] &&
        !officials[roles[index]]
      ) {
        officials[roles[index]] = name;
      }
    });

    Object.assign(payload, officials);
  }

  if (detail?.mvp) {
    const mvp =
      typeof detail.mvp === "string"
        ? detail.mvp
        : detail.mvp.displayName ||
          detail.mvp.name ||
          "";

    if (mvp) {
      payload.mvp = String(mvp).trim();
    }
  }

  if (detail?.penalties) {
    const homePenalties = detail.penalties.home;
    const awayPenalties = detail.penalties.away;

    if (
      Array.isArray(homePenalties) &&
      Array.isArray(awayPenalties)
    ) {
      payload.finish_type = "dcr";

      payload.home_pen_score =
        homePenalties.filter(
          item =>
            item === true ||
            item?.scored === true ||
            item?.scored === "scored"
        ).length;

      payload.away_pen_score =
        awayPenalties.filter(
          item =>
            item === true ||
            item?.scored === true ||
            item?.scored === "scored"
        ).length;
    }
  }

  return payload;
}

function buildStatsPayload(stats) {
  const payload = {};

  const formations = stats?.formazioni || {};

  const home = formations.casa || {};
  const away = formations.trasferta || {};

  if (home.modulo) {
    payload.home_lineup_module = home.modulo;
  }

  if (away.modulo) {
    payload.away_lineup_module = away.modulo;
  }

  if (home.allenatore) {
    payload.home_coach = home.allenatore;
  }

  if (away.allenatore) {
    payload.away_coach = away.allenatore;
  }

  function players(side) {
    const starters = Array.isArray(side.titolari)
      ? side.titolari
          .map(player => surname(player.nome || ""))
          .filter(Boolean)
      : [];

    const substitutes = Array.isArray(side.riserve)
      ? side.riserve
          .map(player => surname(player.nome || ""))
          .filter(Boolean)
      : [];

    return [
      ...starters,
      ...substitutes
    ];
  }

  const homePlayers = players(home);
  const awayPlayers = players(away);

  if (homePlayers.length) {
    payload.home_lineup_players =
      homePlayers.join("\n");
  }

  if (awayPlayers.length) {
    payload.away_lineup_players =
      awayPlayers.join("\n");
  }

  return payload;
}

async function fetchJson(url) {
  try {
    const response = await fetch(url);

    const text = await response.text();

    if (!response.ok) {
      console.error(
        `API ${response.status}: ${url}`
      );

      return null;
    }

    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  } catch (error) {
    console.error(
      "Errore fetch:",
      error?.message || error
    );

    return null;
  }
}

export default async function handler(req, res) {
  // TEST ENDPOINT
  if (req.method === "GET" && req.query.test === "1") {
    return res.status(200).json({
      success: true,
      message: "SYNC BASE44 ONLINE",
      appIdConfigured:
        Boolean(process.env.BASE44_APP_ID),
      emailConfigured:
        Boolean(process.env.BASE44_ADMIN_EMAIL),
      passwordConfigured:
        Boolean(process.env.BASE44_ADMIN_PASSWORD),
      timestamp: new Date().toISOString()
    });
  }

  const stats = {
    competitions: 0,
    fetched: 0,
    created: 0,
    updated: 0,
    details: 0,
    errors: 0
  };

  // Controllo variabili
  if (!process.env.BASE44_APP_ID) {
    return res.status(500).json({
      success: false,
      error: "BASE44_APP_ID non configurato"
    });
  }

  if (!process.env.BASE44_ADMIN_EMAIL) {
    return res.status(500).json({
      success: false,
      error: "BASE44_ADMIN_EMAIL non configurato"
    });
  }

  if (!process.env.BASE44_ADMIN_PASSWORD) {
    return res.status(500).json({
      success: false,
      error: "BASE44_ADMIN_PASSWORD non configurato"
    });
  }

  let base44;

  try {
    base44 = createClient({
      appId: process.env.BASE44_APP_ID
    });

    await base44.auth.loginViaEmailPassword(
      process.env.BASE44_ADMIN_EMAIL,
      process.env.BASE44_ADMIN_PASSWORD
    );
  } catch (error) {
    console.error(
      "Errore autenticazione Base44:",
      error
    );

    return res.status(401).json({
      success: false,
      error: "Autenticazione Base44 fallita",
      details:
        error?.message ||
        String(error)
    });
  }

  for (const competition of COMPETITIONS) {
    try {
      const url =
        `${API_BASE}/matches?competition=${competition.api}`;

      const data = await fetchJson(url);

      if (
        !data ||
        data.success !== true ||
        !Array.isArray(data.matches)
      ) {
        continue;
      }

      stats.competitions++;

      const entity =
        base44.entities[competition.entity];

      if (!entity) {
        console.error(
          `Entità Base44 non trovata: ${competition.entity}`
        );

        stats.errors++;

        continue;
      }

      for (const match of data.matches) {
        try {
          const externalId =
            String(match.id);

          const homeTeam =
            match.home?.name || "";

          const awayTeam =
            match.away?.name || "";

          const matchDate =
            convertDate(match.date);

          const payload = {
            external_id: externalId,
            home_team: homeTeam,
            away_team: awayTeam,
            match_date: matchDate,
            match_time: match.time || null,
            status: mapStatus(
              match.status?.state
            ),
            home_score: parseScore(
              match.home?.score
            ),
            away_score: parseScore(
              match.away?.score
            )
          };

          if (competition.competition) {
            payload.competition =
              competition.competition;
          }

          let existing = null;

          try {
            const found =
              await entity.filter(
                {
                  external_id: externalId
                },
                "-created_date",
                5
              );

            if (found?.length) {
              existing = found[0];
            }
          } catch (error) {
            console.error(
              "Errore ricerca external_id:",
              error?.message || error
            );
          }

          if (
            !existing &&
            matchDate &&
            homeTeam &&
            awayTeam
          ) {
            try {
              const found =
                await entity.filter(
                  {
                    home_team: homeTeam,
                    away_team: awayTeam,
                    match_date: matchDate
                  },
                  "-created_date",
                  5
                );

              if (found?.length) {
                existing = found[0];
              }
            } catch {}
          }

          let recordId = null;

          if (existing) {
            await entity.update(
              existing.id,
              payload
            );

            recordId = existing.id;

            stats.updated++;
          } else {
            const created =
              await entity.create(payload);

            recordId =
              created?.id || null;

            stats.created++;
          }

          stats.fetched++;

          const status =
            payload.status;

          if (
            (status === "live" ||
              status === "finished") &&
            recordId
          ) {
            try {
              const [
                detail,
                matchStats
              ] = await Promise.all([
                fetchJson(
                  `${API_BASE}/match?competition=${competition.api}&id=${externalId}`
                ),
                fetchJson(
                  `${API_BASE}/match-stats?competition=${competition.api}&id=${externalId}`
                )
              ]);

              const details = {};

              if (
                detail?.success
              ) {
                Object.assign(
                  details,
                  buildDetailPayload(
                    detail,
                    homeTeam,
                    awayTeam
                  )
                );
              }

              if (
                matchStats?.success
              ) {
                Object.assign(
                  details,
                  buildStatsPayload(
                    matchStats
                  )
                );
              }

              if (
                Object.keys(details)
                  .length
              ) {
                await entity.update(
                  recordId,
                  details
                );

                stats.details++;
              }
            } catch (error) {
              console.error(
                "Errore dettagli partita:",
                error?.message || error
              );
            }
          }
        } catch (error) {
          console.error(
            "Errore partita:",
            error?.message || error
          );

          stats.errors++;
        }
      }
    } catch (error) {
      console.error(
        `Errore competizione ${competition.api}:`,
        error?.message || error
      );

      stats.errors++;
    }
  }

  return res.status(200).json({
    success: true,
    message: "Sincronizzazione completata",
    stats,
    timestamp: new Date().toISOString()
  });
                      }
