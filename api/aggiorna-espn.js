module.exports = async (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Aggiornamento ESPN funzionante",
    source: "ESPN",
    timezone: "Europe/Rome"
  });
};
