export interface DatabaseMigration {
  id: string;
  sql: string;
}

export const databaseMigrations: DatabaseMigration[] = [
  {
    id: '001_accounts_and_friendships',
    sql: `
      CREATE TABLE users (
        id uuid PRIMARY KEY,
        username varchar(24) NOT NULL,
        username_normalized varchar(64) NOT NULL UNIQUE,
        password_hash text NOT NULL,
        profile_photo_key text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT users_username_length CHECK (char_length(username) BETWEEN 2 AND 24)
      );

      CREATE TYPE friendship_status AS ENUM ('pending', 'accepted', 'rejected', 'blocked');
      CREATE TYPE friend_tier AS ENUM ('normal', 'close');

      CREATE TABLE friendships (
        id uuid PRIMARY KEY,
        user_a_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_b_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        requested_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status friendship_status NOT NULL DEFAULT 'pending',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        accepted_at timestamptz,
        CONSTRAINT friendships_distinct_users CHECK (user_a_id <> user_b_id),
        CONSTRAINT friendships_canonical_order CHECK (user_a_id::text < user_b_id::text),
        CONSTRAINT friendships_requester_is_member CHECK (requested_by IN (user_a_id, user_b_id)),
        CONSTRAINT friendships_unique_pair UNIQUE (user_a_id, user_b_id)
      );

      CREATE INDEX friendships_user_a_idx ON friendships(user_a_id, status);
      CREATE INDEX friendships_user_b_idx ON friendships(user_b_id, status);

      CREATE TABLE friend_preferences (
        owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        friend_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        tier friend_tier NOT NULL DEFAULT 'normal',
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (owner_id, friend_id),
        CONSTRAINT friend_preferences_distinct_users CHECK (owner_id <> friend_id)
      );

      CREATE TYPE app_theme AS ENUM ('system', 'light', 'dark');

      CREATE TABLE user_settings (
        user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        theme app_theme NOT NULL DEFAULT 'system',
        font_scale numeric(3,2) NOT NULL DEFAULT 1.00,
        reduced_motion boolean NOT NULL DEFAULT false,
        high_contrast boolean NOT NULL DEFAULT false,
        notify_messages boolean NOT NULL DEFAULT true,
        notify_friend_requests boolean NOT NULL DEFAULT true,
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT user_settings_font_scale CHECK (font_scale BETWEEN 0.80 AND 2.00)
      );
    `,
  },
  {
    id: '002_account_email',
    sql: `
      ALTER TABLE users ADD COLUMN email varchar(254);
      ALTER TABLE users ADD COLUMN email_normalized varchar(254);

      UPDATE users
      SET email = 'legacy+' || replace(id::text, '-', '') || '@chatink.invalid',
          email_normalized = 'legacy+' || replace(id::text, '-', '') || '@chatink.invalid';

      ALTER TABLE users ALTER COLUMN email SET NOT NULL;
      ALTER TABLE users ALTER COLUMN email_normalized SET NOT NULL;
      ALTER TABLE users ADD CONSTRAINT users_email_normalized_unique UNIQUE (email_normalized);
      ALTER TABLE users ADD CONSTRAINT users_email_length CHECK (char_length(email) BETWEEN 3 AND 254);
    `,
  },
];
