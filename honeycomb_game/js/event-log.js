(function () {
  console.log('✅ event-log.js loaded');

  var EVENT_TYPES = {
    PHASE_CHANGE: 'PHASE_CHANGE',
    BUZZ: 'BUZZ',
    ANSWER_CORRECT: 'ANSWER_CORRECT',
    ANSWER_WRONG: 'ANSWER_WRONG',
    CELL_CAPTURED: 'CELL_CAPTURED',
    SURPRISE_TRIGGERED: 'SURPRISE_TRIGGERED',
    ROUND_WIN: 'ROUND_WIN',
    MATCH_WIN: 'MATCH_WIN'
  };
  var queueTail = Promise.resolve();

  /**
   * Returns safe array from unknown value.
   * @param {*} value Any value.
   * @returns {Array} Safe array.
   */
  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  /**
   * Logs one gameplay event.
   * @param {{type:string,payload:Object}} input Event input.
   * @returns {Promise<Object|null>} Appended entry.
   */
  async function logEvent(input) {
    queueTail = queueTail.then(async function () {
      if (!window.DATA_LAYER) return null;
      var type = input && input.type ? String(input.type) : '';
      if (!type) return null;

      var existing = asArray(await DATA_LAYER.readData('game.event_log'));
      var lastSeq = existing.length ? Number(existing[existing.length - 1].seq || 0) : 0;
      var entry = {
        seq: lastSeq + 1,
        type: type,
        payload: (input && input.payload) || {},
        ts: Date.now()
      };

      var next = existing.concat([entry]);
      await DATA_LAYER.writeData('game.event_log', next);
      await DATA_LAYER.pushData('game.event_log_index', entry);
      return entry;
    });

    return queueTail;
  }

  /**
   * Returns current gameplay event log.
   * @returns {Promise<Array<Object>>} Event entries.
   */
  async function getEventLog() {
    if (!window.DATA_LAYER) return [];
    return asArray(await DATA_LAYER.readData('game.event_log'));
  }

  window.EVENT_LOG = {
    EVENT_TYPES: EVENT_TYPES,
    logEvent: logEvent,
    getEventLog: getEventLog
  };
})();
