import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountRepository } from '../domain/account-repository.js';
import { Database } from './database.js';

const connectionString = process.env.TEST_DATABASE_URL;

describe.skipIf(connectionString === undefined)('PostgreSQL account persistence', () => {
  let database: Database;
  let accounts: AccountRepository;

  beforeAll(async () => {
    database = new Database(connectionString as string);
    await database.initialize();
    accounts = new AccountRepository(database);
  });

  afterAll(async () => {
    await database.close();
  });

  it('stores accounts, synchronized settings and per-user friendship tiers', async () => {
    const suffix = randomUUID().slice(0, 8);
    const alice = await accounts.register(`Alice_${suffix}`, `alice_${suffix}@example.com`, 'a-secure-password-123');
    const bob = await accounts.register(`Bob_${suffix}`, `bob_${suffix}@example.com`, 'another-secure-password-456');

    await expect(accounts.authenticate(`alice_${suffix}`, 'a-secure-password-123')).resolves.toMatchObject({ id: alice.id });
    expect(alice.email).toBe(`alice_${suffix}@example.com`);
    await expect(accounts.authenticate(`alice_${suffix}`, 'wrong-password')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });

    const updated = await accounts.updateSettings(alice.id, {
      theme: 'dark',
      reducedMotion: true,
      notifyMessages: false,
    });
    expect(updated).toMatchObject({ theme: 'dark', reducedMotion: true, notifyMessages: false });

    const request = await accounts.requestFriend(alice.id, bob.username);
    expect(request).toMatchObject({ status: 'pending', requestedByMe: true });
    await accounts.acceptFriend(bob.id, request.friendshipId);
    await accounts.setFriendTier(alice.id, bob.id, 'close');

    await expect(accounts.listFriends(alice.id)).resolves.toEqual([
      expect.objectContaining({ id: bob.id, status: 'accepted', tier: 'close' }),
    ]);
    await expect(accounts.listFriends(bob.id)).resolves.toEqual([
      expect.objectContaining({ id: alice.id, status: 'accepted', tier: 'normal' }),
    ]);
  }, 30_000);
});
