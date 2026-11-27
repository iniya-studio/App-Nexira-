export function createQuickBattleApi(http) {
  if (!http || typeof http.get !== 'function' || typeof http.post !== 'function') {
    throw new TypeError('A configured HTTP client is required.');
  }

  const matchPath = (matchId) => '/quick-battles/' + encodeURIComponent(matchId);

  return Object.freeze({
    createOrRecover: (language) => http.post('/quick-battles', { language }),
    getActive: () => http.get('/quick-battles/active'),
    getMatch: (matchId) => http.get(matchPath(matchId)),
    getCurrentRound: (matchId) => http.get(matchPath(matchId) + '/current-round'),
    submitAnswer: (matchId, roundNumber, responseText, idempotencyKey) => http.post(
      matchPath(matchId) + '/rounds/' + encodeURIComponent(roundNumber) + '/answers',
      { responseText, idempotencyKey },
    ),
    getResult: (matchId) => http.get(matchPath(matchId) + '/result'),
  });
}
