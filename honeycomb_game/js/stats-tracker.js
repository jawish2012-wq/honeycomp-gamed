(function () {
  console.log('✅ stats-tracker.js loaded');

  var STATS_TRACKER = (function () {
    var ROOT_PATH = 'game.stats';

    /**
     * Returns default stats object.
     * @returns {Object} Default stats.
     */
    function defaults() {
      var now = DATA_LAYER.getTimestamp();
      return {
        startedAt: now,
        updatedAt: now,
        totalQuestions: 0,
        totalCorrect: 0,
        totalWrong: 0,
        hotDefended: 0,
        hotBurned: 0,
        mirrorsActivated: 0,
        vouchersIssued: 0,
        vouchersTriggered: 0,
        fastestBuzzEver: null,
        surprisesRevealed: { queen: 0, raid: 0, shield: 0, freeze: 0, double: 0, hot: 0, mirror: 0 },
        teams: {
          team1: { correctAnswers: 0, wrongAnswers: 0, steals: 0, cellsCaptured: 0, cellsLost: 0 },
          team2: { correctAnswers: 0, wrongAnswers: 0, steals: 0, cellsCaptured: 0, cellsLost: 0 }
        },
        players: {},
        round: { questions: 0, revealedSurprises: 0, steals: { team1: 0, team2: 0 } }
      };
    }

    /**
     * Loads all stats.
     * @returns {Promise<Object>} Stats object.
     */
    async function getAllStats() {
      var stats = await DATA_LAYER.readData(ROOT_PATH);
      if (!stats || typeof stats !== 'object') {
        stats = defaults();
        await DATA_LAYER.writeData(ROOT_PATH, stats);
        return stats;
      }
      var normalized = normalizeStats(stats);
      return normalized;
    }

    /**
     * Persists stats to data layer.
     * @param {Object} stats Stats object.
     */
    async function save(stats) {
      stats = normalizeStats(stats);
      stats.updatedAt = DATA_LAYER.getTimestamp();
      await DATA_LAYER.writeData(ROOT_PATH, stats);
    }

    /**
     * Normalizes stats schema to avoid undefined access.
     * @param {Object} stats Raw stats object.
     * @returns {Object} Normalized stats.
     */
    function normalizeStats(stats) {
      var safe = stats && typeof stats === 'object' ? stats : {};
      var base = defaults();

      if (typeof safe.startedAt !== 'number') safe.startedAt = base.startedAt;
      if (typeof safe.updatedAt !== 'number') safe.updatedAt = base.updatedAt;
      safe.totalQuestions = Number(safe.totalQuestions || 0);
      safe.totalCorrect = Number(safe.totalCorrect || 0);
      safe.totalWrong = Number(safe.totalWrong || 0);
      safe.hotDefended = Number(safe.hotDefended || 0);
      safe.hotBurned = Number(safe.hotBurned || 0);
      safe.mirrorsActivated = Number(safe.mirrorsActivated || 0);
      safe.vouchersIssued = Number(safe.vouchersIssued || 0);
      safe.vouchersTriggered = Number(safe.vouchersTriggered || 0);

      if (!safe.fastestBuzzEver || typeof safe.fastestBuzzEver !== 'object') {
        safe.fastestBuzzEver = null;
      }

      if (!safe.surprisesRevealed || typeof safe.surprisesRevealed !== 'object') {
        safe.surprisesRevealed = {};
      }
      Object.keys(base.surprisesRevealed).forEach(function (key) {
        safe.surprisesRevealed[key] = Number(safe.surprisesRevealed[key] || 0);
      });

      if (!safe.teams || typeof safe.teams !== 'object') {
        safe.teams = {};
      }
      ensureTeam(safe, 'team1');
      ensureTeam(safe, 'team2');

      if (!safe.players || typeof safe.players !== 'object') {
        safe.players = {};
      }

      if (!safe.round || typeof safe.round !== 'object') {
        safe.round = {};
      }
      safe.round.questions = Number(safe.round.questions || 0);
      safe.round.revealedSurprises = Number(safe.round.revealedSurprises || 0);
      if (!safe.round.steals || typeof safe.round.steals !== 'object') {
        safe.round.steals = { team1: 0, team2: 0 };
      }
      safe.round.steals.team1 = Number(safe.round.steals.team1 || 0);
      safe.round.steals.team2 = Number(safe.round.steals.team2 || 0);

      return safe;
    }

    /**
     * Ensures player stats object exists.
     * @param {Object} stats Stats root.
     * @param {string} id Player id.
     * @param {string} name Player name.
     * @param {string} team Team id.
     * @returns {Object} Player stats.
     */
    function ensurePlayer(stats, id, name, team) {
      if (!stats || typeof stats !== 'object') {
        stats = normalizeStats({});
      }
      if (!stats.players || typeof stats.players !== 'object' || Array.isArray(stats.players)) {
        stats.players = {};
      }
      if (!id) id = 'unknown';
      if (!stats.players[id] || typeof stats.players[id] !== 'object') {
        stats.players[id] = {
          id: id,
          playerName: name || '\u0644\u0627\u0639\u0628',
          team: team || 'unknown',
          buzzCount: 0,
          correctCount: 0,
          wrongCount: 0,
          fastestBuzz: null,
          trapsTriggered: 0,
          queenBeesFound: 0
        };
      }
      var player = stats.players[id];
      if (name) player.playerName = name;
      if (team) player.team = team;
      player.buzzCount = Number(player.buzzCount || 0);
      player.correctCount = Number(player.correctCount || 0);
      player.wrongCount = Number(player.wrongCount || 0);
      player.trapsTriggered = Number(player.trapsTriggered || 0);
      player.queenBeesFound = Number(player.queenBeesFound || 0);
      if (player.fastestBuzz !== null && player.fastestBuzz !== undefined) {
        player.fastestBuzz = Number(player.fastestBuzz || 0) || null;
      } else {
        player.fastestBuzz = null;
      }
      return player;
    }

    /**
     * Ensures team stats object exists.
     * @param {Object} stats Stats root.
     * @param {string} team Team id.
     * @returns {Object|null} Team stats or null.
     */
    function ensureTeam(stats, team) {
      if (team !== 'team1' && team !== 'team2') return null;
      if (!stats.teams || typeof stats.teams !== 'object') {
        stats.teams = {};
      }
      if (!stats.teams[team] || typeof stats.teams[team] !== 'object') {
        stats.teams[team] = {
          correctAnswers: 0,
          wrongAnswers: 0,
          steals: 0,
          cellsCaptured: 0,
          cellsLost: 0
        };
      }
      stats.teams[team].correctAnswers = Number(stats.teams[team].correctAnswers || 0);
      stats.teams[team].wrongAnswers = Number(stats.teams[team].wrongAnswers || 0);
      stats.teams[team].steals = Number(stats.teams[team].steals || 0);
      stats.teams[team].cellsCaptured = Number(stats.teams[team].cellsCaptured || 0);
      stats.teams[team].cellsLost = Number(stats.teams[team].cellsLost || 0);
      return stats.teams[team];
    }

    /**
     * Records a correct answer.
     * @param {string} id Player id.
     * @param {string} name Player name.
     * @param {string} team Team id.
     */
    async function recordCorrectAnswer(id, name, team) {
      var stats = normalizeStats(await getAllStats());
      var teamStats = ensureTeam(stats, team);
      var player = ensurePlayer(stats, id, name, team);
      if (teamStats) teamStats.correctAnswers += 1;
      player.correctCount += 1;
      stats.totalCorrect += 1;
      stats.totalQuestions += 1;
      stats.round.questions += 1;
      await save(stats);
    }

    /**
     * Records a wrong answer.
     * @param {string} id Player id.
     * @param {string} name Player name.
     * @param {string} team Team id.
     */
    async function recordWrongAnswer(id, name, team) {
      var stats = normalizeStats(await getAllStats());
      var teamStats = ensureTeam(stats, team);
      var player = ensurePlayer(stats, id, name, team);
      if (teamStats) teamStats.wrongAnswers += 1;
      player.wrongCount += 1;
      stats.totalWrong += 1;
      await save(stats);
    }

    /**
     * Records buzz speed.
     * @param {string} id Player id.
     * @param {string} name Player name.
     * @param {number} time Time in ms.
     */
    async function recordBuzzTime(id, name, time, team) {
      var value = Number(time || 0);
      if (value <= 0) return;
      var stats = normalizeStats(await getAllStats());
      var player = ensurePlayer(stats, id, name, team);
      player.buzzCount += 1;
      if (!player.fastestBuzz || value < player.fastestBuzz) player.fastestBuzz = value;
      if (!stats.fastestBuzzEver || value < Number(stats.fastestBuzzEver.time || Number.MAX_SAFE_INTEGER)) {
        stats.fastestBuzzEver = { playerId: id, playerName: name || 'لاعب', time: value };
      }
      await save(stats);
    }

    /**
     * Records a successful steal.
     * @param {string} team Team id.
     */
    async function recordSteal(team) {
      var stats = normalizeStats(await getAllStats());
      var safeTeam = team === 'team2' ? 'team2' : 'team1';
      var teamStats = ensureTeam(stats, safeTeam);
      if (teamStats) teamStats.steals += 1;
      if (!stats.round || typeof stats.round !== 'object') stats.round = {};
      if (!stats.round.steals || typeof stats.round.steals !== 'object') stats.round.steals = { team1: 0, team2: 0 };
      stats.round.steals[safeTeam] = Number(stats.round.steals[safeTeam] || 0) + 1;
      await save(stats);
    }

    /**
     * Records freeze trap trigger.
     * @param {string} id Player id.
     * @param {string} name Player name.
     */
    async function recordTrapTriggered(id, name, team) {
      var stats = normalizeStats(await getAllStats());
      ensurePlayer(stats, id, name, team).trapsTriggered += 1;
      await save(stats);
    }

    /**
     * Records queen bee discovery.
     * @param {string} id Player id.
     * @param {string} name Player name.
     */
    async function recordQueenBee(id, name, team) {
      var stats = normalizeStats(await getAllStats());
      ensurePlayer(stats, id, name, team).queenBeesFound += 1;
      await save(stats);
    }

    /**
     * Records cell capture event.
     * @param {string} team Team id.
     */
    async function recordCellCaptured(team) {
      var stats = normalizeStats(await getAllStats());
      var teamStats = ensureTeam(stats, team);
      if (teamStats) teamStats.cellsCaptured += 1;
      await save(stats);
    }

    /**
     * Records cell lost event.
     * @param {string} team Team id.
     */
    async function recordCellLost(team) {
      var stats = normalizeStats(await getAllStats());
      var teamStats = ensureTeam(stats, team);
      if (teamStats) teamStats.cellsLost += 1;
      await save(stats);
    }

    /**
     * Records revealed surprise type.
     * @param {string} type Surprise type.
     */
    async function recordSurprise(type) {
      var stats = normalizeStats(await getAllStats());
      if (!stats.surprisesRevealed || typeof stats.surprisesRevealed !== 'object') stats.surprisesRevealed = {};
      if (!stats.surprisesRevealed[type]) stats.surprisesRevealed[type] = 0;
      stats.surprisesRevealed[type] += 1;
      if (!stats.round || typeof stats.round !== 'object') stats.round = {};
      if (typeof stats.round.revealedSurprises !== 'number') stats.round.revealedSurprises = 0;
      stats.round.revealedSurprises += 1;
      await save(stats);
    }

    /**
     * Records successful hot-cell defense.
     */
    async function recordHotDefended() {
      var stats = normalizeStats(await getAllStats());
      stats.hotDefended = Number(stats.hotDefended || 0) + 1;
      await save(stats);
    }

    /**
     * Records hot-cell burnout event.
     */
    async function recordHotBurned() {
      var stats = normalizeStats(await getAllStats());
      stats.hotBurned = Number(stats.hotBurned || 0) + 1;
      await save(stats);
    }

    /**
     * Records mirror activation.
     */
    async function recordMirrorActivated() {
      var stats = normalizeStats(await getAllStats());
      stats.mirrorsActivated = Number(stats.mirrorsActivated || 0) + 1;
      await save(stats);
    }

    /**
     * Records raid voucher issue event.
     */
    async function recordVoucherIssued() {
      var stats = normalizeStats(await getAllStats());
      stats.vouchersIssued = Number(stats.vouchersIssued || 0) + 1;
      await save(stats);
    }

    /**
     * Records raid voucher trigger event.
     */
    async function recordVoucherTriggered() {
      var stats = normalizeStats(await getAllStats());
      stats.vouchersTriggered = Number(stats.vouchersTriggered || 0) + 1;
      await save(stats);
    }

    /**
     * Returns board control percentages.
     * @param {Array<Object>} cells Cells array.
     * @returns {{team1:number,team2:number}} Percentages.
     */
    function getControlPercentage(cells) {
      var board = Array.isArray(cells) ? cells : [];
      var total = board.length || 25;
      var team1 = 0;
      var team2 = 0;
      for (var i = 0; i < board.length; i += 1) {
        if (board[i].owner === 'team1') team1 += 1;
        if (board[i].owner === 'team2') team2 += 1;
      }
      return { team1: Math.round(team1 * 100 / total), team2: Math.round(team2 * 100 / total) };
    }

    /** @returns {Promise<Object|null>} */
    async function getFastestBuzz() { return (await getAllStats()).fastestBuzzEver || null; }

    /** @param {string} teamId @returns {Promise<Object|null>} */
    async function getTeamStats(teamId) {
      var stats = normalizeStats(await getAllStats());
      return stats.teams[teamId] || null;
    }

    /** @param {string} playerId @returns {Promise<Object|null>} */
    async function getPlayerStats(playerId) {
      var stats = normalizeStats(await getAllStats());
      return stats.players[playerId] || null;
    }

    /**
     * Resets round-only stats.
     */
    async function resetRoundStats() {
      var stats = await getAllStats();
      stats.round = { questions: 0, revealedSurprises: 0, steals: { team1: 0, team2: 0 } };
      await save(stats);
    }

    /**
     * Resets all match stats.
     */
    async function resetMatchStats() {
      await DATA_LAYER.writeData(ROOT_PATH, defaults());
    }

    /**
     * Formats elapsed duration as mm:ss.
     * @param {number} ms Duration in ms.
     * @returns {string} Formatted duration.
     */
    function formatDuration(ms) {
      var total = Math.floor(ms / 1000);
      var minutes = Math.floor(total / 60);
      var seconds = total % 60;
      return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
    }

    /**
     * Builds end-of-match achievements.
     * @param {Object} settings Game settings.
     * @returns {Promise<Array<Object>>} Achievement cards.
     */
    async function getAchievements(settings) {
      var stats = await getAllStats();
      var result = [];
      var players = Object.values(stats.players || {});
      var t1 = stats.teams.team1 || {};
      var t2 = stats.teams.team2 || {};
      var team1Name = settings && settings.team1 ? settings.team1.name : 'الفريق الأول';
      var team2Name = settings && settings.team2 ? settings.team2.name : 'الفريق الثاني';

      if (stats.fastestBuzzEver) {
        result.push({ icon: '⚡', title: 'أسرع إصبع', winner: stats.fastestBuzzEver.playerName, value: stats.fastestBuzzEver.time + 'ms' });
      }

      var sniper = players.slice().sort(function (a, b) { return Number(b.correctCount || 0) - Number(a.correctCount || 0); })[0];
      if (sniper && Number(sniper.correctCount || 0) > 0) {
        result.push({ icon: '🎯', title: 'القناص', winner: sniper.playerName, value: sniper.correctCount + ' إجابة صحيحة' });
      }

      var totalSteals = Number(t1.steals || 0) + Number(t2.steals || 0);
      if (totalSteals > 0) {
        var thiefTeam = Number(t1.steals || 0) >= Number(t2.steals || 0) ? 'team1' : 'team2';
        var stealsCount = thiefTeam === 'team1' ? Number(t1.steals || 0) : Number(t2.steals || 0);
        result.push({ icon: '🏴‍☠️', title: 'السارق المحترف', winner: thiefTeam === 'team1' ? team1Name : team2Name, value: stealsCount + ' سرقة' });
      }

      var unlucky = players.slice().sort(function (a, b) { return Number(b.trapsTriggered || 0) - Number(a.trapsTriggered || 0); })[0];
      if (unlucky && Number(unlucky.trapsTriggered || 0) > 0) {
        result.push({ icon: '🧊', title: 'سيء الحظ', winner: unlucky.playerName, value: unlucky.trapsTriggered + ' فخ' });
      }

      var queen = players.slice().sort(function (a, b) { return Number(b.queenBeesFound || 0) - Number(a.queenBeesFound || 0); })[0];
      if (queen && Number(queen.queenBeesFound || 0) > 0) {
        result.push({ icon: '👑', title: 'مكتشف الملكة', winner: queen.playerName, value: 'كشف ' + queen.queenBeesFound });
      }

      var attempts1 = Number(t1.correctAnswers || 0) + Number(t1.wrongAnswers || 0);
      var attempts2 = Number(t2.correctAnswers || 0) + Number(t2.wrongAnswers || 0);
      var acc1 = attempts1 ? Math.round(Number(t1.correctAnswers || 0) * 100 / attempts1) : 0;
      var acc2 = attempts2 ? Math.round(Number(t2.correctAnswers || 0) * 100 / attempts2) : 0;
      if (attempts1 || attempts2) {
        result.push({ icon: '🎯', title: 'نسبة الدقة', winner: acc1 >= acc2 ? team1Name : team2Name, value: (acc1 >= acc2 ? acc1 : acc2) + '%' });
      }

      var totalSurprises = Object.keys(stats.surprisesRevealed || {}).reduce(function (sum, key) {
        return sum + Number(stats.surprisesRevealed[key] || 0);
      }, 0);
      var duration = formatDuration(Math.max(0, DATA_LAYER.getTimestamp() - Number(stats.startedAt || DATA_LAYER.getTimestamp())));

      result.push({
        icon: '📊',
        title: 'إحصائية المباراة',
        winner: 'المجمل',
        value: 'أسئلة: ' + Number(stats.totalQuestions || 0) + ' | صحيحة: ' + Number(stats.totalCorrect || 0) + ' | خاطئة: ' + Number(stats.totalWrong || 0) + ' | مفاجآت: ' + totalSurprises + ' | مدة: ' + duration
      });

      return result;
    }

    return {
      recordCorrectAnswer: recordCorrectAnswer,
      recordWrongAnswer: recordWrongAnswer,
      recordBuzzTime: recordBuzzTime,
      recordSteal: recordSteal,
      recordTrapTriggered: recordTrapTriggered,
      recordQueenBee: recordQueenBee,
      recordCellCaptured: recordCellCaptured,
      recordCellLost: recordCellLost,
      recordSurprise: recordSurprise,
      recordHotDefended: recordHotDefended,
      recordHotBurned: recordHotBurned,
      recordMirrorActivated: recordMirrorActivated,
      recordVoucherIssued: recordVoucherIssued,
      recordVoucherTriggered: recordVoucherTriggered,
      getControlPercentage: getControlPercentage,
      getFastestBuzz: getFastestBuzz,
      getTeamStats: getTeamStats,
      getPlayerStats: getPlayerStats,
      getAllStats: getAllStats,
      resetRoundStats: resetRoundStats,
      resetMatchStats: resetMatchStats,
      getAchievements: getAchievements
    };
  })();

  window.STATS_TRACKER = STATS_TRACKER;
})();


