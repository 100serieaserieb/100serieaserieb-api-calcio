const teamNameMap = {
  "Inter Milan": "Inter",
  "Internazionale": "Inter",

  "AC Milan": "Milan",
  "Milan": "Milan",

  "Juventus FC": "Juventus",
  "Juventus": "Juventus",

  "AS Roma": "Roma",
  "Roma": "Roma",

  "SS Lazio": "Lazio",
  "Lazio": "Lazio",

  "Athletic Club": "Atletico Bilbao",

  "Napoli": "Napoli",

  "Atalanta": "Atalanta",

  "Bologna": "Bologna",

  "Fiorentina": "Fiorentina",

  "Torino": "Torino",

  "Genoa": "Genoa",

  "Udinese": "Udinese",

  "Cagliari": "Cagliari",

  "Como": "Como",

  "Parma": "Parma",

  "Venezia": "Venezia",

  "Lecce": "Lecce",

  "Empoli": "Empoli",

  "Verona": "Verona",

  "Sassuolo": "Sassuolo",

  "Pisa": "Pisa",

  "Cremonese": "Cremonese",

  "Monza": "Monza"
};

function normalizeTeamName(name) {
  if (!name) {
    return null;
  }

  return teamNameMap[name] || name;
}

module.exports = {
  teamNameMap,
  normalizeTeamName
};
