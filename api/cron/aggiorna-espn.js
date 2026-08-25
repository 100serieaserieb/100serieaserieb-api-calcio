export default async function handler(req, res) {
  try {
    const response = await fetch(
      "https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/scoreboard"
    );

    if (!response.ok) {
      throw new Error(`ESPN HTTP ${response.status}`);
    }

    const data = await response.json();

    console.log("✅ ESPN aggiornato:", new Date().toISOString());
    console.log(`📊 Partite trovate: ${data.events?.length || 0}`);

    return res.status(200).json({
      success: true,
      fonte: "ESPN",
      aggiornato: new Date().toISOString(),
      partite: data.events?.length || 0
    });

  } catch (error) {
    console.error("❌ Errore ESPN:", error);

    return res.status(500).json({
      success: false,
      errore: error.message
    });
  }
}
