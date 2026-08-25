const { getCompetition } = require("../lib/competitions");
const { getMatchSummary } = require("../lib/espn");
const { normalizeTeamName } = require("../lib/teams");
const { DateTime } = require("luxon");

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
      competitor => competitor.homeAway === side
    ) || null
  );
}

function getEventType(event) {
  if (!event) return "";

  if (typeof event.type === "string") {
    return event.type;
  }

  if (event.type && typeof event.type === "object") {
    return (
      event.type.text ||
      event.type.name ||
      event.type.id ||
      ""
    );
  }

  return "";
}

function getEventText(event) {
  if (!event) return "";

  if (typeof event.text === "string") {
    return event.text;
  }

  return "";
}

function getPlayerFromText(text) {
  if (!text) return null;

  const match = text.match(
    /([A-ZÀ-ÖØ-Ý][^.(]+)\s*[^)]*/
  );

  if (!match) {
    return null;
  }

  return match[1].trim();
}

function getAssistFromText(text) {
  if (!text) return null;

  const match = text.match(
    /Assisted by ([^.]+?)(?:\s+with|\s+following|\.|$)/
  );

  if (!match) {
    return null;
  }

  return match[1].trim();
}

function getSubstitutionPlayers(text) {
  if (!text) {
    return {
      playerIn: null,
      playerOut: null
    };
  }

  const match = text.match(
    /replaces\s+(.+?)(?:\.|$)/
  );

  if (!match) {
    return {
      playerIn: null,
      playerOut: null
    };
  }

  const beforeReplaces =
    text.split("replaces")[0];

  const playerInMatch =
    beforeReplaces.match(
      /Substitution,\s*[^.]+\.\s*(.+?)\s*$/
    );

  return {
    playerIn: playerInMatch
      ? playerInMatch[1].trim()
      : null,

    playerOut: match[1].trim()
  };
}

function parseEvent(event) {
  if (!event) {
    return null;
  }

  const type = getEventType(event);
  const text = getEventText(event);

  const lowerType =
    type.toLowerCase();

  const result = {
    id: event.id || null,

    type: type || null,

    minute:
      event.clock || null,

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

    playerIn: null,

    playerOut: null,

    text: text || null
  };

  /*
   * GOL
   */

  if (lowerType.includes("goal")) {
    result.player =
      getPlayerFromText(text);

    result.assist =
      getAssistFromText(text);

    return result;
  }

  /*
   * CARTELLINO GIALLO
   */

  if (
    lowerType.includes("yellow")
  ) {
    result.player =
      getPlayerFromText(text);

    return result;
  }

  /*
   * CARTELLINO ROSSO
   */

  if (
    lowerType.includes("red")
  ) {
    result.player =
      getPlayerFromText(text);

    return result;
  }

  /*
   * SOSTITUZIONE
   */

  if (
    lowerType.includes("substitution")
  ) {
    const substitution =
      getSubstitutionPlayers(text);

    result.playerIn =
      substitution.playerIn;

    result.playerOut =
      substitution.playerOut;

    return result;
  }

  return result;
}

function getLineups(summary) {
  if (
    !summary ||
    !Array.isArray(summary.lineups) ||
    summary.lineups.length === 0
  ) {
    return null;
  }

  const result = [];

  for (const lineup of summary
