(function () {
  console.log('✅ snapshot.js loaded');

  var SNAPSHOT_KEY = 'hq_snapshot';
  var MAX_AGE_MS = 2 * 60 * 60 * 1000;

  /**
   * Saves crash-recovery snapshot.
   * @param {Object} gameState Current game state.
   */
  function saveSnapshot(gameState) {
    var payload = {
      ts: Date.now(),
      data: gameState || {}
    };
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(payload));
  }

  /**
   * Restores snapshot payload if available.
   * @returns {{ts:number,data:Object}|null} Snapshot payload.
   */
  function restoreSnapshot() {
    try {
      var raw = localStorage.getItem(SNAPSHOT_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      if (Date.now() - Number(parsed.ts || 0) > MAX_AGE_MS) return null;
      return parsed;
    } catch (_error) {
      return null;
    }
  }

  /**
   * Clears saved snapshot.
   */
  function clearSnapshot() {
    localStorage.removeItem(SNAPSHOT_KEY);
  }

  window.SNAPSHOT = {
    saveSnapshot: saveSnapshot,
    restoreSnapshot: restoreSnapshot,
    clearSnapshot: clearSnapshot,
    MAX_AGE_MS: MAX_AGE_MS
  };
})();
