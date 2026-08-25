module.exports = (req, res) => {
  res.status(200).json({
    success: true,
    message: "100%SerieA&SerieB API funzionante",
    source: "ESPN",
    timezone: "Europe/Rome"
  });
};
