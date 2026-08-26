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

function convertDate(d) {
  if (!d) return null;
  const parts = d.split("/");
  if (parts.length !== 3) return null;
  const [day, month, year] = parts;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function mapStatus(state) {
  if (state === "in") return "live";
  if (state === "post") return "finished";
  return "scheduled";
}

function parseScore(s) {
  if (s == null || s === "-" || s === "") return null;
  const n = parseInt(String(s), 10);
  return isNaN(n) ? null : n;
}

function parseMinute(val) {
  if (val == null) return 0;
  if (typeof val === "number") return val;
  if (typeof val === "object") {
    if (typeof val.value === "number") return Math.floor(val.value);
    if (val.display) return parseInt(String(val.display).replace(/\D/g, "").split("+")[0], 10) || 0;
  }
  if (typeof val === "string") return parseInt(val.replace(/\D/g, "").split("+")[0], 10) || 0;
  return 0;
}

function getAthleteName(item) {
  const a = item.athlete || item.scorer || item.player || item;
  const name = a?.displayName || a?.name || a?.shortName || "";
  return String(name).trim();
}

function surnameOf(fullName) {
  if (!fullName) return "";
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1];
}

function detectSide(item, homeName, awayName) {
  const team = item.team || item.side;

  if (typeof team === "string") {
    const t = team.toLowerCase();
    if (t.includes("home")) return "home";
    if (t.includes("away")) return "away";
    if (homeName && t === homeName.toLowerCase()) return "home";
    if (awayName && t === awayName.toLowerCase()) return "away";
  }

  if (team && typeof team === "object") {
    const name = team.name || team.displayName || "";
    const n = String(name).toLowerCase();
    if (homeName && n === homeName.toLowerCase()) return "home";
    if (awayName && n === awayName.toLowerCase()) return "away";
  }

  return "home";
}

function isOwnGoal(item) {
  const t = item.type;
  if (typeof t === "string") return /own/i.test(t);
  if (t && typeof t === "object") {
    const name = t.name || t.displayName || "";
    return /own/i.test(String(name));
  }
  return false;
}

function isRedCard(item) {
  const c = item.card || item.type || item.color;
  if (typeof c === "string") return /red/i.test(c);
  if (c && typeof c === "object") {
    const name = c.name || c.displayName || "";
    return /red/i.test(String(name));
  }
  return false;
}

function buildDetailPayload(detail, homeName, awayName) {
  const p = {};
  const venue = detail.venue;

  if (venue && venue.name) p.stadium = venue.name;

  const homeScorers = [];
  const awayScorers = [];

  if (Array.isArray(detail.goals)) {
    for (const g of detail.goals) {
      try {
        const minute = parseMinute(g.clock ?? g.minute ?? g.time);
        const fullName = getAthleteName(g);
        const surname = surnameOf(fullName) || fullName;
        const side = detectSide(g, homeName, awayName);
        const own = isOwnGoal(g);
        const entry = `${minute || ""} ${surname}`.trim();

        if (!entry) continue;

        if (own) {
          if (side === "home") awayScorers.push(entry);
          else homeScorers.push(entry);
        } else {
          if (side === "home") homeScorers.push(entry);
          else awayScorers.push(entry);
        }
      } catch {}
    }
  }

  if (homeScorers.length) p.home_scorers = homeScorers.join("\n");
  if (awayScorers.length) p.away_scorers = awayScorers.join("\n");

  const homeRed = [];
  const awayRed = [];

  if (Array.isArray(detail.cards)) {
    for (const c of detail.cards) {
      try {
        if (!isRedCard(c)) continue;

        const minute = parseMinute(c.clock ?? c.minute ?? c.time);
        const fullName = getAthleteName(c);
        const surname = surnameOf(fullName) || fullName;
        const side = detectSide(c, homeName, awayName);
        const entry = `${minute || ""} ${surname}`.trim();

        if (!entry) continue;

        if (side === "home") homeRed.push(entry);
        else awayRed.push(entry);
      } catch {}
    }
  }

  if (homeRed.length) p.home_red_cards = JSON.stringify(homeRed);
  if (awayRed.length) p.away_red_cards = JSON.stringify(awayRed);

  if (Array.isArray(detail.officials) && detail.officials.length) {
    const offMap = {};

    const idxMap = [
      "referee",
      "assistant_referee_1",
      "assistant_referee_2",
      "fourth_official",
      "var_referee",
      "avar_referee"
    ];

    detail.officials.forEach((o, i) => {
      const name = String(o.displayName || o.name || "").trim();
      if (!name) return;

      const role = String(o.role || o.position || "").toLowerCase();

      if (/avar/.test(role)) offMap.avar_referee = name;
      else if (/var/.test(role)) offMap.var_referee = name;
      else if (/fourth|quarto/.test(role)) offMap.fourth_official = name;
      else if (/assistant.*2|linesman.*2|2.*assist/.test(role)) offMap.assistant_referee_2 = name;
      else if (/assistant.*1|linesman.*1|1.*assist/.test(role)) offMap.assistant_referee_1 = name;
      else if (/referee|arbitro/.test(role)) offMap.referee = name;
      else if (i < idxMap.length && !offMap[idxMap[i]]) {
        offMap[idxMap[i]] = name;
      }
    });

    Object.assign(p, offMap);
  }

  if (detail.mvp) {
    const mvpName =
      typeof detail.mvp === "string"
        ? detail.mvp
        : String(detail.mvp.displayName || detail.mvp.name || "");

    if (mvpName) p.mvp = mvpName;
  }

  if (detail.penalties) {
    const hp = detail.penalties.home;
    const ap = detail.penalties.away;

    if (Array.isArray(hp) && Array.isArray(ap) && (hp.length || ap.length)) {
      p.finish_type = "dcr";

      p.home_pen_score = hp.filter(
        (x) => x === true || x?.scored === true || x?.scored === "scored"
      ).length;

      p.away_pen_score = ap.filter(
        (x) => x === true || x?.scored === true || x?.scored === "scored"
      ).length;
    }
  }

  return p;
}

function buildStatsPayload(stats) {
  const p = {};

  const form = stats.formazioni || {};
  const casa = form.casa || {};
  const trasferta = form.trasferta || {};

  if (casa.modulo) p.home_lineup_module = casa.modulo;
  if (trasferta.modulo) p.away_lineup_module = trasferta.modulo;

  if (casa.allenatore) p.home_coach = casa.allenatore;
  if (trasferta.allenatore) p.away_coach = trasferta.allenatore;

  const buildPlayers = (side) => {
    const titolari = Array.isArray(side.titolari)
      ? side.titolari.map((x) => x.nome).filter(Boolean)
      : [];

    const riserve = Array.isArray(side.riserve)
      ? side.riserve.map((x) => x.nome).filter(Boolean)
      : [];

    const all = [...titolari, ...riserve];

    return all.length ? all.join("\n") : null;
  };

  const homePlayers = buildPlayers(casa);
  const awayPlayers = buildPlayers(trasferta);

  if (homePlayers) p.home_lineup_players = homePlayers;
  if (awayPlayers) p.away_lineup_players = awayPlayers;

  return p;
}

async function fetchJson(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  const stats = {
    competitions: 0,
    fetched: 0,
    created: 0,
    updated: 0,
    details: 0,
    errors: 0
  };

  let base44;

  try {
    base44 = createClient({
      appId: process.env.BASE44_APP_ID
    });

    await base44.auth.loginViaEmailPassword(
      process.env.BASE44_ADMIN_EMAIL,
      process.env.BASE44_ADMIN_PASSWORD
    );
  } catch (e) {
    return res.status(500).json({
      success: false,
      error: "Auth fallita: " + String(e?.message || e)
    });
  }

  for (const comp of COMPETITIONS) {
    try {
      const data = await fetchJson(
        `${API_BASE}/matches?competition=${comp.api}`
      );

      if (!data || !data.success || !Array.isArray(data.matches)) continue;

      stats.competitions++;

      const entity = base44.entities[comp.entity];

      for (const m of data.matches) {
        try {
          const externalId = String(m.id);
          const homeTeam = m.home?.name || "";
          const awayTeam = m.away?.name || "";
          const matchDate = m.date ? convertDate(m.date) : null;
          const matchTime = m.time || null;
          const status = mapStatus(m.status?.state);
          const homeScore = parseScore(m.home?.score);
          const awayScore = parseScore(m.away?.score);

          const payload = {
            external_id: externalId,
            home_team: homeTeam,
            away_team: awayTeam,
            match_date: matchDate,
            match_time: matchTime,
            status,
            home_score: homeScore,
            away_score: awayScore
          };

          if (comp.competition) {
            payload.competition = comp.competition;
          }

          let existing = null;

          try {
            const found = await entity.filter(
              { external_id: externalId },
              "-created_date",
              5
            );

            if (found && found.length > 0) {
              existing = found[0];
            }
          } catch {}

          if (!existing && matchDate && homeTeam && awayTeam) {
            try {
              const found = await entity.filter(
                {
                  home_team: homeTeam,
                  away_team: awayTeam,
                  match_date: matchDate
                },
                "-created_date",
                5
              );

              if (found && found.length > 0) {
                existing = found[0];
              }
            } catch {}
          }

          let recordId = null;

          if (existing) {
            await entity.update(existing.id, payload);
            recordId = existing.id;
            stats.updated++;
          } else {
            const created = await entity.create(payload);
            recordId = created?.id || null;
            stats.created++;
          }

          stats.fetched++;

          if (
            (status === "live" || status === "finished") &&
            recordId
          ) {
            try {
              const [detail, matchStats] = await Promise.all([
                fetchJson(
                  `${API_BASE}/match?competition=${comp.api}&id=${externalId}`
                ),
                fetchJson(
                  `${API_BASE}/match-stats?competition=${comp.api}&id=${externalId}`
                )
              ]);

              const detailPayload = {};

              if (detail && detail.success) {
                Object.assign(
                  detailPayload,
                  buildDetailPayload(detail, homeTeam, awayTeam)
                );
              }

              if (matchStats && matchStats.success) {
                Object.assign(
                  detailPayload,
                  buildStatsPayload(matchStats)
                );
              }

              if (Object.keys(detailPayload).length > 0) {
                await entity.update(recordId, detailPayload);
                stats.details++;
              }
            } catch {}
          }
        } catch {
          stats.errors++;
        }
      }
    } catch {
      stats.errors++;
    }
  }

  return res.status(200).json({
    success: true,
    stats
  });
            }
