const competitions = {
  "serie-a": {
    id: "serie-a",
    name: "Serie A",
    country: "Italia",
    espnLeague: "ita.1",
    type: "league"
  },

  "serie-b": {
    id: "serie-b",
    name: "Serie B",
    country: "Italia",
    espnLeague: "ita.2",
    type: "league"
  },

  "coppa-italia": {
    id: "coppa-italia",
    name: "Coppa Italia",
    country: "Italia",
    espnLeague: "ita.coppa_italia",
    type: "cup"
  },

  "italia": {
    id: "italia",
    name: "Nazionale Italiana",
    country: "Italia",
    espnLeague: "ita",
    type: "national-team"
  },

  "premier-league": {
    id: "premier-league",
    name: "Premier League",
    country: "Inghilterra",
    espnLeague: "eng.1",
    type: "league"
  },

  "la-liga": {
    id: "la-liga",
    name: "La Liga",
    country: "Spagna",
    espnLeague: "esp.1",
    type: "league"
  },

  "ligue-1": {
    id: "ligue-1",
    name: "Ligue 1",
    country: "Francia",
    espnLeague: "fra.1",
    type: "league"
  },

  "bundesliga": {
    id: "bundesliga",
    name: "Bundesliga",
    country: "Germania",
    espnLeague: "ger.1",
    type: "league"
  },

  "champions-league": {
    id: "champions-league",
    name: "Champions League",
    country: "Europa",
    espnLeague: "uefa.champions",
    type: "cup"
  },

  "europa-league": {
    id: "europa-league",
    name: "Europa League",
    country: "Europa",
    espnLeague: "uefa.europa",
    type: "cup"
  },

  "conference-league": {
    id: "conference-league",
    name: "Conference League",
    country: "Europa",
    espnLeague: "uefa.europa.conf",
    type: "cup"
  },

  "saudi-pro-league": {
    id: "saudi-pro-league",
    name: "Saudi Pro League",
    country: "Arabia Saudita",
    espnLeague: "ksa.1",
    type: "league"
  }
};

function getCompetition(id) {
  return competitions[id] || null;
}

function getAllCompetitions() {
  return Object.values(competitions);
}

module.exports = {
  competitions,
  getCompetition,
  getAllCompetitions
};
