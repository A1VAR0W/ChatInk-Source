import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import type { PoolClient } from 'pg';
import type { Database } from '../database/database.js';

export type FriendTier = 'normal' | 'close';
export type FriendshipStatus = 'pending' | 'accepted' | 'rejected' | 'blocked';
export type AppTheme = 'system' | 'light' | 'dark';

export interface PublicAccount {
  id: string;
  username: string;
  profilePhotoKey: string | null;
  createdAt: string;
}

export interface AccountIdentity extends PublicAccount {
  email: string;
}

export interface AccountSettings {
  theme: AppTheme;
  fontScale: number;
  reducedMotion: boolean;
  highContrast: boolean;
  notifyMessages: boolean;
  notifyFriendRequests: boolean;
  updatedAt: string;
}

export interface AccountSettingsUpdate {
  theme?: AppTheme | undefined;
  fontScale?: number | undefined;
  reducedMotion?: boolean | undefined;
  highContrast?: boolean | undefined;
  notifyMessages?: boolean | undefined;
  notifyFriendRequests?: boolean | undefined;
}

export interface FriendRecord extends PublicAccount {
  friendshipId: string;
  status: FriendshipStatus;
  tier: FriendTier;
  requestedByMe: boolean;
}

interface UserRow {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  profile_photo_key: string | null;
  created_at: Date;
}

interface SettingsRow {
  theme: AppTheme;
  font_scale: string;
  reduced_motion: boolean;
  high_contrast: boolean;
  notify_messages: boolean;
  notify_friend_requests: boolean;
  updated_at: Date;
}

interface FriendRow extends UserRow {
  friendship_id: string;
  status: FriendshipStatus;
  tier: FriendTier;
  requested_by_me: boolean;
}

export class AccountError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

export function normalizeUsername(username: string): string {
  return username.trim().normalize('NFKC').toLocaleLowerCase('es-ES');
}

const passwordHashOptions = {
  type: argon2.argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
} as const;

function publicAccount(row: UserRow): PublicAccount {
  return {
    id: row.id,
    username: row.username,
    profilePhotoKey: row.profile_photo_key,
    createdAt: row.created_at.toISOString(),
  };
}

function accountIdentity(row: UserRow): AccountIdentity {
  return { ...publicAccount(row), email: row.email };
}

export function normalizeEmail(email: string): string {
  return email.trim().normalize('NFKC').toLocaleLowerCase('en-US');
}

function settings(row: SettingsRow): AccountSettings {
  return {
    theme: row.theme,
    fontScale: Number(row.font_scale),
    reducedMotion: row.reduced_motion,
    highContrast: row.high_contrast,
    notifyMessages: row.notify_messages,
    notifyFriendRequests: row.notify_friend_requests,
    updatedAt: row.updated_at.toISOString(),
  };
}

export class AccountRepository {
  constructor(private readonly database: Database) {}

  async register(username: string, email: string, password: string): Promise<AccountIdentity> {
    const id = randomUUID();
    const normalized = normalizeUsername(username);
    const passwordHash = await argon2.hash(password, passwordHashOptions);

    try {
      return await this.database.transaction(async (client) => {
        const result = await client.query<UserRow>(`
          INSERT INTO users (id, username, username_normalized, email, email_normalized, password_hash)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id, username, email, password_hash, profile_photo_key, created_at
        `, [id, username.trim(), normalized, email.trim(), normalizeEmail(email), passwordHash]);
        await client.query('INSERT INTO user_settings (user_id) VALUES ($1)', [id]);
        const row = result.rows[0];
        if (row === undefined) throw new Error('No se pudo crear el usuario');
        return accountIdentity(row);
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
        if ('constraint' in error && error.constraint === 'users_email_normalized_unique') {
          throw new AccountError('EMAIL_TAKEN', 'Ese correo electronico ya esta en uso', 409);
        }
        throw new AccountError('USERNAME_TAKEN', 'Ese nombre de usuario ya esta en uso', 409);
      }
      throw error;
    }
  }

  async authenticate(email: string, password: string): Promise<AccountIdentity> {
    const result = await this.database.query<UserRow>(`
      SELECT id, username, email, password_hash, profile_photo_key, created_at
      FROM users
      WHERE email_normalized = $1
    `, [normalizeEmail(email)]);
    const row = result.rows[0];
    if (row === undefined) {
      await argon2.hash(password, passwordHashOptions);
      throw new AccountError('INVALID_CREDENTIALS', 'Correo o contrasena incorrectos', 401);
    }
    if (!(await argon2.verify(row.password_hash, password))) {
      throw new AccountError('INVALID_CREDENTIALS', 'Correo o contrasena incorrectos', 401);
    }
    return accountIdentity(row);
  }

  async findById(userId: string): Promise<AccountIdentity> {
    const result = await this.database.query<UserRow>(`
      SELECT id, username, email, password_hash, profile_photo_key, created_at
      FROM users WHERE id = $1
    `, [userId]);
    const row = result.rows[0];
    if (row === undefined) throw new AccountError('ACCOUNT_NOT_FOUND', 'La cuenta no existe', 404);
    return accountIdentity(row);
  }

  async getSettings(userId: string): Promise<AccountSettings> {
    const result = await this.database.query<SettingsRow>(`
      SELECT theme, font_scale, reduced_motion, high_contrast,
             notify_messages, notify_friend_requests, updated_at
      FROM user_settings WHERE user_id = $1
    `, [userId]);
    const row = result.rows[0];
    if (row === undefined) throw new AccountError('ACCOUNT_NOT_FOUND', 'La cuenta no existe', 404);
    return settings(row);
  }

  async updateSettings(userId: string, input: AccountSettingsUpdate): Promise<AccountSettings> {
    const result = await this.database.query<SettingsRow>(`
      UPDATE user_settings
      SET theme = COALESCE($2, theme),
          font_scale = COALESCE($3, font_scale),
          reduced_motion = COALESCE($4, reduced_motion),
          high_contrast = COALESCE($5, high_contrast),
          notify_messages = COALESCE($6, notify_messages),
          notify_friend_requests = COALESCE($7, notify_friend_requests),
          updated_at = now()
      WHERE user_id = $1
      RETURNING theme, font_scale, reduced_motion, high_contrast,
                notify_messages, notify_friend_requests, updated_at
    `, [
      userId,
      input.theme ?? null,
      input.fontScale ?? null,
      input.reducedMotion ?? null,
      input.highContrast ?? null,
      input.notifyMessages ?? null,
      input.notifyFriendRequests ?? null,
    ]);
    const row = result.rows[0];
    if (row === undefined) throw new AccountError('ACCOUNT_NOT_FOUND', 'La cuenta no existe', 404);
    return settings(row);
  }

  async requestFriend(userId: string, username: string): Promise<FriendRecord> {
    return this.database.transaction(async (client) => {
      const targetResult = await client.query<UserRow>(`
        SELECT id, username, email, password_hash, profile_photo_key, created_at
        FROM users WHERE username_normalized = $1
      `, [normalizeUsername(username)]);
      const target = targetResult.rows[0];
      if (target === undefined) throw new AccountError('ACCOUNT_NOT_FOUND', 'No existe ese usuario', 404);
      if (target.id === userId) throw new AccountError('SELF_FRIENDSHIP', 'No puedes agregarte a ti mismo', 400);

      const [userA, userB] = [userId, target.id].sort();
      const id = randomUUID();
      const inserted = await client.query<{ id: string; status: FriendshipStatus }>(`
        INSERT INTO friendships (id, user_a_id, user_b_id, requested_by)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_a_id, user_b_id) DO NOTHING
        RETURNING id, status
      `, [id, userA, userB, userId]);
      const friendship = inserted.rows[0];
      if (friendship === undefined) {
        throw new AccountError('FRIENDSHIP_EXISTS', 'Ya existe una solicitud o amistad con ese usuario', 409);
      }
      return {
        ...publicAccount(target),
        friendshipId: friendship.id,
        status: friendship.status,
        tier: 'normal',
        requestedByMe: true,
      };
    });
  }

  async acceptFriend(userId: string, friendshipId: string): Promise<void> {
    await this.database.transaction(async (client) => {
      const result = await client.query<{ user_a_id: string; user_b_id: string }>(`
        UPDATE friendships
        SET status = 'accepted', accepted_at = now(), updated_at = now()
        WHERE id = $1 AND status = 'pending' AND requested_by <> $2
          AND $2 IN (user_a_id, user_b_id)
        RETURNING user_a_id, user_b_id
      `, [friendshipId, userId]);
      const friendship = result.rows[0];
      if (friendship === undefined) {
        throw new AccountError('FRIEND_REQUEST_NOT_FOUND', 'La solicitud no existe o no puedes aceptarla', 404);
      }
      await this.#ensureFriendPreferences(client, friendship.user_a_id, friendship.user_b_id);
    });
  }

  async listFriends(userId: string): Promise<FriendRecord[]> {
    const result = await this.database.query<FriendRow>(`
      SELECT u.id, u.username, u.email, u.password_hash, u.profile_photo_key, u.created_at,
             f.id AS friendship_id, f.status,
             COALESCE(fp.tier, 'normal') AS tier,
             (f.requested_by = $1) AS requested_by_me
      FROM friendships f
      JOIN users u ON u.id = CASE WHEN f.user_a_id = $1 THEN f.user_b_id ELSE f.user_a_id END
      LEFT JOIN friend_preferences fp ON fp.owner_id = $1 AND fp.friend_id = u.id
      WHERE $1 IN (f.user_a_id, f.user_b_id)
        AND f.status IN ('pending', 'accepted')
      ORDER BY CASE WHEN f.status = 'accepted' THEN 0 ELSE 1 END, lower(u.username)
    `, [userId]);
    return result.rows.map((row) => ({
      ...publicAccount(row),
      friendshipId: row.friendship_id,
      status: row.status,
      tier: row.tier,
      requestedByMe: row.requested_by_me,
    }));
  }

  async setFriendTier(userId: string, friendId: string, tier: FriendTier): Promise<void> {
    const result = await this.database.query(`
      INSERT INTO friend_preferences (owner_id, friend_id, tier)
      SELECT $1, $2, $3
      WHERE EXISTS (
        SELECT 1 FROM friendships
        WHERE status = 'accepted'
          AND (($1 = user_a_id AND $2 = user_b_id) OR ($1 = user_b_id AND $2 = user_a_id))
      )
      ON CONFLICT (owner_id, friend_id)
      DO UPDATE SET tier = EXCLUDED.tier, updated_at = now()
      RETURNING owner_id
    `, [userId, friendId, tier]);
    if (result.rowCount === 0) throw new AccountError('FRIEND_NOT_FOUND', 'Ese usuario no es amigo tuyo', 404);
  }

  async #ensureFriendPreferences(client: PoolClient, userA: string, userB: string): Promise<void> {
    await client.query(`
      INSERT INTO friend_preferences (owner_id, friend_id)
      VALUES ($1, $2), ($2, $1)
      ON CONFLICT (owner_id, friend_id) DO NOTHING
    `, [userA, userB]);
  }
}
