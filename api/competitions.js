const {
  getAllCompetitions
} = require("../lib/competitions");

module.exports = (req, res) => {
  try {
    const competitions = getAllCompetitions();

    return res.status(200).json({
      success: true,
      source: "ESPN",
      count: competitions.length,
      competitions
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
