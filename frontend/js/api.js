// API client — thin wrappers around fetch() for all backend endpoints
const API = (() => {
  const BASE = '/api';

  async function request(method, path, body) {
    const opts = { method, headers: {} };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(BASE + path, opts);
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { const j = await res.json(); msg = j.detail || msg; } catch {}
      throw new Error(msg);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  return {
    // Decks
    getDecks: () => request('GET', '/decks'),

    uploadDeck: (file) => {
      const fd = new FormData();
      fd.append('file', file);
      return fetch(BASE + '/decks', { method: 'POST', body: fd })
        .then(async res => {
          if (!res.ok) {
            let msg = `HTTP ${res.status}`;
            try { const j = await res.json(); msg = j.detail || msg; } catch {}
            throw new Error(msg);
          }
          return res.json();
        });
    },

    renameDeck: (deckId, title) => request('PATCH', `/decks/${deckId}`, { title }),
    getSlideText: (deckId, slideN) => request('GET', `/decks/${deckId}/slides/${slideN}`),
    deleteDeck: (deckId) => request('DELETE', `/decks/${deckId}`),

    // Sessions
    getSessions: () => request('GET', '/sessions'),
    createSession: (name = 'New conversation') => request('POST', '/sessions', { name }),
    renameSession: (sessionId, name) => request('PATCH', `/sessions/${sessionId}`, { name }),
    deleteSession: (sessionId) => request('DELETE', `/sessions/${sessionId}`),

    // Sources
    getSources: (sessionId) => request('GET', `/sessions/${sessionId}/sources`),
    setSources: (sessionId, deckIds) => request('PUT', `/sessions/${sessionId}/sources`, { deck_ids: deckIds }),

    // Messages
    getMessages: (sessionId) => request('GET', `/sessions/${sessionId}/messages`),

    // Ask
    ask: (sessionId, question) => request('POST', `/sessions/${sessionId}/ask`, { question }),

    // Stats
    getStats: () => request('GET', '/stats'),
  };
})();

window.API = API;
