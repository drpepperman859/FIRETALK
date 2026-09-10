const { AccessToken } = require('livekit-server-sdk');

module.exports = async function (context, req) {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const livekitUrl = process.env.LIVEKIT_URL;

  if (!apiKey || !apiSecret || !livekitUrl) {
    context.res = { status: 500, jsonBody: { error: 'LiveKit server secrets are not configured.' } };
    return;
  }

  const room = req.body?.room;
  const participantName = req.body?.participantName;
  if (!room || !participantName) {
    context.res = { status: 400, jsonBody: { error: 'room and participantName are required.' } };
    return;
  }

  const participantIdentity = `${participantName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${crypto.randomUUID().slice(0, 6)}`;
  const token = new AccessToken(apiKey, apiSecret, { identity: participantIdentity, name: participantName, ttl: '10m' });
  token.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true });

  context.res = {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    jsonBody: { token: await token.toJwt(), url: livekitUrl, room, participantIdentity },
  };
};
