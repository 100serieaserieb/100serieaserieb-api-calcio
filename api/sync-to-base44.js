export default function handler(req, res) {
  res.status(200).json({
    success: true,
    message: "SYNC BASE44 ENDPOINT ONLINE",
    endpoint: "/api/sync-to-base44",
    timestamp: new Date().toISOString()
  });
}
