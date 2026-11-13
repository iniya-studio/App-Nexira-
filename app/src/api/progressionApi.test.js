import { createProgressionApi } from './progressionApi.js';

describe('createProgressionApi', () => {
  it('requires a configured HTTP client', () => {
    expect(() => createProgressionApi(null)).toThrow('A configured HTTP client is required.');
  });

  it('reads server-authoritative progression and leaderboard resources', async () => {
    const http = { get: jest.fn(async (path) => ({ path })) };
    const api = createProgressionApi(http);

    await expect(api.getMyProgress()).resolves.toEqual({ path: '/progression/me' });
    await expect(api.getGlobalRanking()).resolves.toEqual({ path: '/ranking/global' });
    await expect(api.getCurrentSeasonRanking()).resolves.toEqual({
      path: '/ranking/seasonal/current',
    });
    expect(http.get).toHaveBeenCalledTimes(3);
  });
});
