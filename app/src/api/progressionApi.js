export function createProgressionApi(http) {
  if (!http || typeof http.get !== 'function') {
    throw new TypeError('A configured HTTP client is required.');
  }

  return {
    getMyProgress: () => http.get('/progression/me'),
    getGlobalRanking: () => http.get('/ranking/global'),
    getCurrentSeasonRanking: () => http.get('/ranking/seasonal/current'),
  };
}
