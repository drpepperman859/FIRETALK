import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { AccessToken } from 'livekit-server-sdk';

function livekitDevApi() {
  return {
    name: 'livekit-dev-api',
    configureServer(server: any) {
      server.middlewares.use('/api/livekit-token', async (request: any, response: any) => {
        if (request.method !== 'POST') {
          response.statusCode = 405;
          response.end();
          return;
        }
        const body = await new Promise<string>((resolve) => {
          let content = '';
          request.on('data', (chunk: Buffer) => content += chunk.toString());
          request.on('end', () => resolve(content));
        });
        const { room, participantName } = JSON.parse(body || '{}');
        const { LIVEKIT_API_KEY: apiKey, LIVEKIT_API_SECRET: apiSecret, LIVEKIT_URL: url } = process.env;
        if (!apiKey || !apiSecret || !url || !room || !participantName) {
          response.statusCode = 500;
          response.end(JSON.stringify({ error: 'LiveKit secrets and room details are required.' }));
          return;
        }
        const identity = `${participantName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${crypto.randomUUID().slice(0, 6)}`;
        const token = new AccessToken(apiKey, apiSecret, { identity, name: participantName, ttl: '10m' });
        token.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true });
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ token: await token.toJwt(), url, room, participantIdentity: identity }));
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  base: "/FIRETALK/",
  build: {
    sourcemap: true,
    assetsDir: "code",
    target: ["esnext"],
    cssMinify: true,
    lib: false
  },
  plugins: [
    livekitDevApi(),
    VitePWA({
      strategies: "injectManifest",
      injectManifest: {
        swSrc: 'public/sw.js',
        swDest: 'dist/sw.js',
        globDirectory: 'dist',
        globPatterns: [
          '**/*.{html,js,css,json,png,jpg,jpeg,gif,svg,webp,ico,woff,woff2}',
        ],
      },
      injectRegister: false,
      manifest: false,
      devOptions: {
        enabled: true
      }
    })
  ]
})
