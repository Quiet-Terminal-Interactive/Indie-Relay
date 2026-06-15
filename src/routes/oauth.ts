import { FastifyInstance } from 'fastify';
import { randomBytes } from 'crypto';
import { db } from '../db/client.js';
import { oauthVerifications } from '../db/schema.js';
import { eq, and, gt, isNull } from 'drizzle-orm';

type Provider = 'twitch' | 'youtube' | 'tiktok';

interface ProviderConfig {
  clientId: string;
  clientSecret: string;
  authUrl: string;
  tokenUrl: string;
  scope: string;
  buildAuthParams: (clientId: string, redirectUri: string, state: string) => Record<string, string>;
  exchangeCode: (clientId: string, clientSecret: string, code: string, redirectUri: string) => Promise<string>;
  getProfile: (accessToken: string, clientId: string) => Promise<{ userId: string; username: string; profileUrl: string }>;
}

function getProviderConfig(provider: Provider): ProviderConfig | null {
  if (provider === 'twitch') {
    const clientId = process.env.TWITCH_CLIENT_ID;
    const clientSecret = process.env.TWITCH_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;
    return {
      clientId, clientSecret,
      authUrl: 'https://id.twitch.tv/oauth2/authorize',
      tokenUrl: 'https://id.twitch.tv/oauth2/token',
      scope: '',
      buildAuthParams: (id, redirect, state) => ({
        client_id: id, redirect_uri: redirect, response_type: 'code', scope: '', state,
      }),
      async exchangeCode(id, secret, code, redirect) {
        const res = await fetch('https://id.twitch.tv/oauth2/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ client_id: id, client_secret: secret, code, grant_type: 'authorization_code', redirect_uri: redirect }).toString(),
        });
        const data = await res.json() as { access_token?: string };
        if (!data.access_token) throw new Error('Twitch token exchange failed');
        return data.access_token;
      },
      async getProfile(token, id) {
        const res = await fetch('https://api.twitch.tv/helix/users', {
          headers: { Authorization: `Bearer ${token}`, 'Client-Id': id },
        });
        const data = await res.json() as { data: Array<{ id: string; login: string; display_name: string }> };
        const user = data.data?.[0];
        if (!user) throw new Error('No Twitch user found');
        return { userId: user.id, username: user.display_name, profileUrl: `https://twitch.tv/${user.login}` };
      },
    };
  }

  if (provider === 'youtube') {
    const clientId = process.env.YOUTUBE_CLIENT_ID;
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;
    return {
      clientId, clientSecret,
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scope: 'https://www.googleapis.com/auth/youtube.readonly',
      buildAuthParams: (id, redirect, state) => ({
        client_id: id, redirect_uri: redirect, response_type: 'code',
        scope: 'https://www.googleapis.com/auth/youtube.readonly',
        access_type: 'online', state,
      }),
      async exchangeCode(id, secret, code, redirect) {
        const res = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ client_id: id, client_secret: secret, code, grant_type: 'authorization_code', redirect_uri: redirect }).toString(),
        });
        const data = await res.json() as { access_token?: string };
        if (!data.access_token) throw new Error('YouTube token exchange failed');
        return data.access_token;
      },
      async getProfile(token) {
        const res = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json() as { items?: Array<{ id: string; snippet: { title: string; customUrl?: string } }> };
        const channel = data.items?.[0];
        if (!channel) throw new Error('No YouTube channel found on this account');
        const handle = channel.snippet.customUrl ?? channel.id;
        return { userId: channel.id, username: channel.snippet.title, profileUrl: `https://youtube.com/${handle}` };
      },
    };
  }

  if (provider === 'tiktok') {
    const clientId = process.env.TIKTOK_CLIENT_ID;
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;
    return {
      clientId, clientSecret,
      authUrl: 'https://www.tiktok.com/v2/auth/authorize/',
      tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
      scope: 'user.info.basic',
      buildAuthParams: (id, redirect, state) => ({
        client_key: id, redirect_uri: redirect, response_type: 'code', scope: 'user.info.basic', state,
      }),
      async exchangeCode(id, secret, code, redirect) {
        const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ client_key: id, client_secret: secret, code, grant_type: 'authorization_code', redirect_uri: redirect }).toString(),
        });
        const data = await res.json() as { data?: { access_token?: string } };
        const token = data.data?.access_token;
        if (!token) throw new Error('TikTok token exchange failed');
        return token;
      },
      async getProfile(token) {
        const res = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,username', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json() as { data?: { user?: { open_id: string; display_name: string; username?: string } } };
        const user = data.data?.user;
        if (!user) throw new Error('No TikTok user found');
        const handle = user.username ?? user.open_id;
        return { userId: user.open_id, username: user.display_name, profileUrl: `https://tiktok.com/@${handle}` };
      },
    };
  }

  return null;
}

const VALID_PROVIDERS: Provider[] = ['twitch', 'youtube', 'tiktok'];

export async function oauthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/auth/oauth/providers', async (_req, reply) => {
    const available = VALID_PROVIDERS.filter(p => getProviderConfig(p) !== null);
    return reply.send(available);
  });

  app.get('/api/auth/oauth/:provider/start', async (req, reply) => {
    const provider = (req.params as { provider: string }).provider as Provider;
    const state = (req.query as { state?: string }).state ?? '';

    if (!VALID_PROVIDERS.includes(provider)) return reply.code(400).send({ error: 'Unknown provider' });

    const config = getProviderConfig(provider);
    if (!config) return reply.code(400).send({ error: `${provider} is not configured` });

    const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
    const redirectUri = `${appUrl}/api/auth/oauth/${provider}/callback`;

    const params = new URLSearchParams(config.buildAuthParams(config.clientId, redirectUri, state));
    return reply.redirect(`${config.authUrl}?${params.toString()}`);
  });

  app.get('/api/auth/oauth/:provider/callback', async (req, reply) => {
    const provider = (req.params as { provider: string }).provider as Provider;
    const { code, state, error } = req.query as { code?: string; state?: string; error?: string };

    const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
    const fail = (reason: string) => reply.redirect(`${appUrl}/apply.html?oauth_error=${reason}${state ? `&state=${state}` : ''}`);

    if (error || !code) return fail('cancelled');

    if (!VALID_PROVIDERS.includes(provider)) return fail('unknown_provider');

    const config = getProviderConfig(provider);
    if (!config) return fail('not_configured');

    const redirectUri = `${appUrl}/api/auth/oauth/${provider}/callback`;

    try {
      const accessToken = await config.exchangeCode(config.clientId, config.clientSecret, code, redirectUri);
      const profile = await config.getProfile(accessToken, config.clientId);

      const verificationId = randomBytes(16).toString('hex');

      await db.insert(oauthVerifications).values({
        id: verificationId,
        platform: provider,
        platformUserId: profile.userId,
        platformUsername: profile.username,
        platformUrl: profile.profileUrl,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      });

      const params = new URLSearchParams({
        verificationId,
        platform: provider,
        username: profile.username,
        ...(state ? { state } : {}),
      });
      return reply.redirect(`${appUrl}/apply.html?${params.toString()}`);
    } catch (err) {
      console.error(`OAuth ${provider} callback error:`, err);
      return fail('failed');
    }
  });
}

export async function validateOauthVerification(verificationId: string): Promise<{ platformUrl: string; platformUsername: string; platform: string } | null> {
  const [row] = await db
    .select()
    .from(oauthVerifications)
    .where(and(
      eq(oauthVerifications.id, verificationId),
      isNull(oauthVerifications.usedAt),
      gt(oauthVerifications.expiresAt, new Date()),
    ))
    .limit(1);

  if (!row) return null;

  await db.update(oauthVerifications).set({ usedAt: new Date() }).where(eq(oauthVerifications.id, verificationId));
  return { platformUrl: row.platformUrl, platformUsername: row.platformUsername, platform: row.platform };
}
