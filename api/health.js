module.exports = async (req, res) => {
  try {
    const response = await fetch(
      "https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/scoreboard"
    );

    if (!response.ok) {
      throw new Error(`ESPN HTTP ${response.status}`);
    }

    const data = await response.json();

    return res.status(200).json({
      success: true,
      message: "Aggiornamento ESPN eseguito correttamente",
      source: "ESPN",
      timezone: "Europe/Rome",
      updatedAt: new Date().toISOString(),
      matches: data.events ? data.events.length : 0
    });

  } catch (error) {
    console.error("Errore aggiornamento ESPN:", error);

    return res.status(500).json({
      success: false,
      message: "Errore durante il collegamento a ESPN",
      error: error.message
    });
  }
};
