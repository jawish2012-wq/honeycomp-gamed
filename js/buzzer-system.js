(function () {
  console.log('✅ buzzer-system.js loaded');

  var BUZZER_SYSTEM = (function () {
    /**
     * Ensures a normalized buzzer object structure.
     * @param {Object} buzzer Raw buzzer object.
     * @returns {Object} Normalized buzzer state.
     */
    function normalizeBuzzer(buzzer) {
      var safe = buzzer && typeof buzzer === 'object' ? buzzer : {};
      if (!Array.isArray(safe.presses)) {
        safe.presses = [];
      }
      if (!safe.byKey || typeof safe.byKey !== 'object') {
        safe.byKey = {};
      }
      return safe;
    }

    /**
     * Opens buzzer and clears old presses.
     * @returns {Promise<void>} Completion promise.
     */
    async function openBuzzer() {
      var now = DATA_LAYER.getTimestamp();
      var buzzer = {
        open: true,
        openedAt: now,
        closedAt: null,
        presses: [],
        byKey: {}
      };
      await DATA_LAYER.writeData('game.buzzer', buzzer);
      await DATA_LAYER.writeData('game.currentTurn.buzzerOpen', true);
      await DATA_LAYER.writeData('game.currentTurn.currentResponderIndex', 0);
    }

    /**
     * Closes buzzer while keeping current presses for judging.
     * @returns {Promise<void>} Completion promise.
     */
    async function closeBuzzer() {
      var buzzer = normalizeBuzzer(await DATA_LAYER.readData('game.buzzer'));
      buzzer.open = false;
      buzzer.closedAt = DATA_LAYER.getTimestamp();
      await DATA_LAYER.writeData('game.buzzer', buzzer);
      await DATA_LAYER.writeData('game.currentTurn.buzzerOpen', false);
    }

    /**
     * Returns ordered presses list sorted by timestamp.
     * @returns {Promise<Array<Object>>} Ordered presses.
     */
    async function getPresses() {
      var buzzer = normalizeBuzzer(await DATA_LAYER.readData('game.buzzer'));
      var ordered = buzzer.presses.slice();
      ordered.sort(function (a, b) {
        return Number(a.timestamp || 0) - Number(b.timestamp || 0);
      });
      return ordered;
    }

    /**
     * Returns ranked buzzer order.
     * @returns {Promise<Array<Object>>} Ranked order array.
     */
    async function getBuzzerOrder() {
      var presses = await getPresses();
      return presses.map(function (item, index) {
        return Object.assign({}, item, { rank: index + 1 });
      });
    }

    /**
     * Determines whether a specific team is frozen for the current question.
     * @param {string} teamId Team id.
     * @returns {Promise<boolean>} True when frozen.
     */
    async function isTeamFrozen(teamId) {
      var turn = await DATA_LAYER.readData('game.currentTurn') || {};
      if (!turn.freezeActive) return false;
      if (!turn.frozenTeam || !turn.freezeUntil) return false;
      if (turn.frozenTeam !== teamId) return false;
      return DATA_LAYER.getTimestamp() < Number(turn.freezeUntil);
    }

    /**
     * Freezes a team for a number of seconds for the next question.
     * @param {string} teamId Team id.
     * @param {number} durationSeconds Freeze duration in seconds.
     * @returns {Promise<void>} Completion promise.
     */
    async function freezeTeam(teamId, durationSeconds) {
      var now = DATA_LAYER.getTimestamp();
      var until = now + Math.max(0, Number(durationSeconds || 0) * 1000);
      await DATA_LAYER.updateData('game.currentTurn', {
        frozenTeam: teamId,
        freezeUntil: until,
        freezePending: true,
        freezeActive: false
      });
    }

    /**
     * Registers one buzzer press if player is eligible.
     * @param {string} playerId Player id.
     * @param {string} playerName Player name.
     * @param {string} team Team id.
     * @returns {Promise<Array<Object>>} Updated ranked order.
     */
    async function registerBuzz(playerId, playerName, team) {
      var buzzer = normalizeBuzzer(await DATA_LAYER.readData('game.buzzer'));
      if (!buzzer.open) {
        return getBuzzerOrder();
      }

      if (await isTeamFrozen(team)) {
        return getBuzzerOrder();
      }

      var alreadyPressed = buzzer.presses.some(function (entry) {
        return entry.playerId === playerId;
      });
      if (alreadyPressed) {
        return getBuzzerOrder();
      }

      var now = DATA_LAYER.getTimestamp();
      var press = {
        playerId: playerId,
        playerName: playerName,
        team: team,
        timestamp: now
      };

      buzzer.presses.push(press);
      buzzer.presses.sort(function (a, b) {
        return Number(a.timestamp || 0) - Number(b.timestamp || 0);
      });
      buzzer.byKey['t_' + now + '_' + playerId] = press;

      await DATA_LAYER.writeData('game.buzzer', buzzer);
      return getBuzzerOrder();
    }

    return {
      openBuzzer: openBuzzer,
      closeBuzzer: closeBuzzer,
      registerBuzz: registerBuzz,
      getBuzzerOrder: getBuzzerOrder,
      isTeamFrozen: isTeamFrozen,
      freezeTeam: freezeTeam
    };
  })();

  window.BUZZER_SYSTEM = BUZZER_SYSTEM;
})();
