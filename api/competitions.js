const {
  getAllCompetitions
} = require("../lib/competitions");

module.exports = (req, res) => {
  try {
    const competitions = getAllCompetitions();

    res.status(200).json({
      success: true,
      source: "ESPN",
      count: competitions.length,
      competitions
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
