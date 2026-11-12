export function createMatchApi(http) {
  if (!http || typeof http.get !== 'function' || typeof http.post !== 'function') {
    throw new TypeError('A configured HTTP client is required.');
  }

  return {
    createAiMatch: () => http.post('/matches/ai'),
    getMatch: (matchId) => http.get(`/matches/${encodeURIComponent(matchId)}`),
    markRoundReady: (matchId, roundId) => http.post(
      `/matches/${encodeURIComponent(matchId)}/rounds/${encodeURIComponent(roundId)}/ready`,
    ),
    getRoundQuestion: (matchId, roundId, language = 'en') => {
      const query = new URLSearchParams({ language });
      return http.get(
        `/matches/${encodeURIComponent(matchId)}/rounds/${encodeURIComponent(roundId)}/question?${query}`,
      );
    },
    submitAnswer: (matchId, roundId, responseText, idempotencyKey) => http.post(
      `/matches/${encodeURIComponent(matchId)}/rounds/${encodeURIComponent(roundId)}/answers`,
      { responseText, idempotencyKey },
    ),
    getQuestionRecovery: (matchId) => http.get(
      `/matches/${encodeURIComponent(matchId)}/question-recovery`,
    ),
  };
}
