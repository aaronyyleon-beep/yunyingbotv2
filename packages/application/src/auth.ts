import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { AppDbClient } from './db/client.js';

const SCRYPT_KEYLEN = 64;
const SALT_LEN = 32;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  tenantId: string | null;
  discordId: string | null;
  discordUsername: string | null;
  discordAvatar: string | null;
}

export interface DiscordUser {
  id: string;
  username: string;
  email: string | null;
  avatar: string | null;
  discriminator: string;
  global_name: string | null;
}

export interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
}

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, SCRYPT_KEYLEN, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const key = await scryptAsync(plain, salt);
  return `${salt.toString('hex')}:${key.toString('hex')}`;
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  const [saltHex, keyHex] = hash.split(':');
  if (!saltHex || !keyHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const storedKey = Buffer.from(keyHex, 'hex');
  const derivedKey = await scryptAsync(plain, salt);
  return timingSafeEqual(storedKey, derivedKey);
}

export async function createSession(db: AppDbClient, userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.execute(
    `INSERT INTO user_sessions (id, user_id, token, expires_at) VALUES (gen_random_uuid()::TEXT, $1, $2, $3)`,
    [userId, token, expiresAt.toISOString()]
  );
  return token;
}

export async function validateSession(db: AppDbClient, token: string): Promise<AuthUser | null> {
  const row = await db.one<{
    id: string;
    email: string;
    display_name: string | null;
    tenant_id: string | null;
    discord_id: string | null;
    discord_username: string | null;
    discord_avatar: string | null;
  }>(
    `SELECT u.id, u.email, u.display_name, u.tenant_id, u.discord_id, u.discord_username, u.discord_avatar
     FROM user_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = $1 AND s.expires_at > now()`,
    [token]
  );
  if (!row) return null;
  return {
    id: row.id, email: row.email, displayName: row.display_name, tenantId: row.tenant_id,
    discordId: row.discord_id, discordUsername: row.discord_username, discordAvatar: row.discord_avatar,
  };
}

export async function loginUser(db: AppDbClient, email: string, password: string): Promise<{ token: string; user: AuthUser } | null> {
  const row = await db.one<{ id: string; email: string; password_hash: string; display_name: string | null; tenant_id: string | null }>(
    `SELECT id, email, password_hash, display_name, tenant_id FROM users WHERE email = $1`,
    [email]
  );
  if (!row) return null;
  const valid = await verifyPassword(password, row.password_hash);
  if (!valid) return null;
  const token = await createSession(db, row.id);
  return { token, user: { id: row.id, email: row.email, displayName: row.display_name, tenantId: row.tenant_id, discordId: null, discordUsername: null, discordAvatar: null } };
}

export async function invalidateSession(db: AppDbClient, token: string): Promise<void> {
  await db.execute(`DELETE FROM user_sessions WHERE token = $1`, [token]);
}

export async function createUser(db: AppDbClient, email: string, password: string, displayName?: string, tenantId?: string): Promise<AuthUser> {
  const passwordHash = await hashPassword(password);
  const rows = await db.query<{ id: string; email: string; display_name: string | null; tenant_id: string | null }>(
    `INSERT INTO users (email, password_hash, display_name, tenant_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, display_name, tenant_id`,
    [email, passwordHash, displayName ?? null, tenantId ?? null]
  );
  const row = rows[0]!;
  return { id: row.id, email: row.email, displayName: row.display_name, tenantId: row.tenant_id, discordId: null, discordUsername: null, discordAvatar: null };
}

// ═══════ Discord OAuth2 ═══════

const DISCORD_API = 'https://discord.com/api/v10';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const oauthStates = new Map<string, number>();

// Prune expired states every 60s
setInterval(() => {
  const now = Date.now();
  for (const [key, createdAt] of oauthStates) {
    if (now - createdAt > OAUTH_STATE_TTL_MS) oauthStates.delete(key);
  }
}, 60_000).unref();

export function generateOAuthState(): string {
  const state = randomBytes(24).toString('hex');
  oauthStates.set(state, Date.now());
  return state;
}

export function validateOAuthState(state: string): boolean {
  const createdAt = oauthStates.get(state);
  if (createdAt == null) return false;
  oauthStates.delete(state); // one-time use
  return Date.now() - createdAt < OAUTH_STATE_TTL_MS;
}

export function getDiscordAuthUrl(): { url: string; state: string } {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const redirectUri = process.env.DISCORD_REDIRECT_URI;
  if (!clientId || !redirectUri) throw new Error('DISCORD_CLIENT_ID and DISCORD_REDIRECT_URI must be set');
  const state = generateOAuthState();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'identify guilds email',
    state,
    prompt: 'consent',
  });
  return { url: `https://discord.com/oauth2/authorize?${params}`, state };
}

export async function exchangeDiscordCode(code: string): Promise<{ access_token: string; token_type: string }> {
  const clientId = process.env.DISCORD_CLIENT_ID!;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET!;
  const redirectUri = process.env.DISCORD_REDIRECT_URI!;

  const res = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord token exchange failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<{ access_token: string; token_type: string }>;
}

export async function fetchDiscordUser(accessToken: string): Promise<DiscordUser> {
  const res = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch Discord user (${res.status})`);
  return res.json() as Promise<DiscordUser>;
}

export async function fetchDiscordGuilds(accessToken: string): Promise<DiscordGuild[]> {
  const res = await fetch(`${DISCORD_API}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch Discord guilds (${res.status})`);
  return res.json() as Promise<DiscordGuild[]>;
}

export async function loginOrCreateDiscordUser(
  db: AppDbClient,
  discordUser: DiscordUser,
): Promise<{ token: string; user: AuthUser; isNewUser: boolean }> {
  // Try to find existing user by discord_id
  const existing = await db.one<{
    id: string; email: string; display_name: string | null; tenant_id: string | null;
    discord_id: string | null; discord_username: string | null; discord_avatar: string | null;
  }>(
    `SELECT id, email, display_name, tenant_id, discord_id, discord_username, discord_avatar FROM users WHERE discord_id = $1`,
    [discordUser.id]
  );

  if (existing) {
    // Update discord profile fields
    await db.execute(
      `UPDATE users SET discord_username = $1, discord_avatar = $2, discord_email = $3, updated_at = now() WHERE id = $4`,
      [discordUser.username, discordUser.avatar, discordUser.email, existing.id]
    );
    const token = await createSession(db, existing.id);
    return {
      token,
      user: {
        id: existing.id, email: existing.email, displayName: existing.display_name, tenantId: existing.tenant_id,
        discordId: discordUser.id, discordUsername: discordUser.username, discordAvatar: discordUser.avatar,
      },
      isNewUser: false,
    };
  }

  // Try to link by email if Discord provided one
  if (discordUser.email) {
    const byEmail = await db.one<{
      id: string; email: string; display_name: string | null; tenant_id: string | null;
    }>(
      `SELECT id, email, display_name, tenant_id FROM users WHERE email = $1`,
      [discordUser.email]
    );
    if (byEmail) {
      await db.execute(
        `UPDATE users SET discord_id = $1, discord_username = $2, discord_avatar = $3, discord_email = $4, updated_at = now() WHERE id = $5`,
        [discordUser.id, discordUser.username, discordUser.avatar, discordUser.email, byEmail.id]
      );
      const token = await createSession(db, byEmail.id);
      return {
        token,
        user: {
          id: byEmail.id, email: byEmail.email, displayName: byEmail.display_name, tenantId: byEmail.tenant_id,
          discordId: discordUser.id, discordUsername: discordUser.username, discordAvatar: discordUser.avatar,
        },
        isNewUser: false,
      };
    }
  }

  // Create new user
  const email = discordUser.email ?? `${discordUser.id}@discord.user`;
  const displayName = discordUser.global_name ?? discordUser.username;
  const rows = await db.query<{
    id: string; email: string; display_name: string | null; tenant_id: string | null;
  }>(
    `INSERT INTO users (email, password_hash, display_name, discord_id, discord_username, discord_avatar, discord_email)
     VALUES ($1, NULL, $2, $3, $4, $5, $6)
     RETURNING id, email, display_name, tenant_id`,
    [email, displayName, discordUser.id, discordUser.username, discordUser.avatar, discordUser.email]
  );
  const row = rows[0]!;
  const token = await createSession(db, row.id);
  return {
    token,
    user: {
      id: row.id, email: row.email, displayName: row.display_name, tenantId: row.tenant_id,
      discordId: discordUser.id, discordUsername: discordUser.username, discordAvatar: discordUser.avatar,
    },
    isNewUser: true,
  };
}
