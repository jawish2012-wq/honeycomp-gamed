(function () {
  console.log('✅ wheel-spinner.js loaded');

  var WHEEL_SPINNER = (function () {
    /**
     * Picks one player using round-robin fairness and no immediate repeat when possible.
     * @param {Array<Object>} teamPlayers Team players list.
     * @param {Array<string>} previouslySelected Selected ids in current cycle.
     * @returns {{selectedPlayer:Object|null,candidates:Array<Object>,nextHistory:Array<string>}} Selection payload.
     */
    function spinWheel(teamPlayers, previouslySelected) {
      var players = Array.isArray(teamPlayers) ? teamPlayers.slice() : [];
      var history = Array.isArray(previouslySelected) ? previouslySelected.slice() : [];

      if (players.length === 0) {
        return { selectedPlayer: null, candidates: [], nextHistory: history };
      }

      if (players.length === 1) {
        return {
          selectedPlayer: players[0],
          candidates: players,
          nextHistory: [players[0].id]
        };
      }

      var usedMap = {};
      history.forEach(function (id) {
        usedMap[id] = true;
      });

      var available = players.filter(function (p) {
        return !usedMap[p.id];
      });

      if (available.length === 0) {
        history = [];
        available = players.slice();
      }

      var lastSelected = history.length > 0 ? history[history.length - 1] : null;
      if (available.length > 1 && lastSelected) {
        var withoutLast = available.filter(function (p) {
          return p.id !== lastSelected;
        });
        if (withoutLast.length > 0) {
          available = withoutLast;
        }
      }

      var selected = available[Math.floor(Math.random() * available.length)];
      var nextHistory = history.concat(selected.id);

      return {
        selectedPlayer: selected,
        candidates: players,
        nextHistory: nextHistory
      };
    }


    /**
     * Returns online players for one team using fresh heartbeat data.
     * @param {Object} playersMap Full players map.
     * @param {'team1'|'team2'} teamId Team id.
     * @param {number} now Current timestamp.
     * @returns {Array<Object>} Online team players.
     */
    function getLiveTeamCandidates(playersMap, teamId, now) {
      var current = Number(now || Date.now());
      return Object.values(playersMap || {}).filter(function (player) {
        var safeTeam = player.teamId || player.team;
        if (safeTeam !== teamId) return false;
        if (player.online === false || player.connected === false) return false;
        var lastSeen = Number(player.lastSeen || 0);
        if (!lastSeen) {
          // Backward compatibility: older player objects may not store heartbeat flags yet.
          return true;
        }
        return current - lastSeen < 15000;
      }).sort(function (a, b) {
        return Number(a.joinedAt || 0) - Number(b.joinedAt || 0);
      });
    }

    /**
     * Renders wheel animation strip and stops at selected name.
     * @param {HTMLElement} container Target container.
     * @param {Array<string>} candidates Names list.
     * @param {string} selectedName Selected name.
     * @param {string} teamColor Team color.
     * @param {Function} onDone Callback after animation.
     */
    function renderWheelAnimation(container, candidates, selectedName, teamColor, onDone) {
      if (!container) return;
      var names = Array.isArray(candidates) ? candidates.slice() : [];

      container.innerHTML = '';
      container.classList.add('wheel-active');

      if (names.length <= 1) {
        var single = document.createElement('div');
        single.className = 'wheel-single-name';
        single.textContent = selectedName || (names[0] || '—');
        single.style.color = teamColor || '#ffd700';
        container.appendChild(single);
        setTimeout(function () {
          if (typeof onDone === 'function') onDone();
        }, 300);
        return;
      }

      var viewport = document.createElement('div');
      viewport.className = 'wheel-viewport';

      var strip = document.createElement('div');
      strip.className = 'wheel-strip';

      var repeated = [];
      for (var i = 0; i < 8; i += 1) {
        repeated = repeated.concat(names);
      }

      repeated.forEach(function (name) {
        var item = document.createElement('span');
        item.className = 'wheel-name';
        item.textContent = name;
        strip.appendChild(item);
      });

      viewport.appendChild(strip);
      container.appendChild(viewport);

      requestAnimationFrame(function () {
        var stopIndexBase = repeated.length - names.length;
        var relativeIndex = Math.max(0, names.indexOf(selectedName));
        var finalIndex = stopIndexBase + relativeIndex;
        strip.style.setProperty('--wheel-team-color', teamColor || '#ffd700');
        strip.style.transform = 'translateX(' + (-1 * finalIndex * 136) + 'px)';

        setTimeout(function () {
          var allItems = strip.querySelectorAll('.wheel-name');
          if (allItems[finalIndex]) {
            allItems[finalIndex].classList.add('selected');
          }
          if (typeof onDone === 'function') onDone();
        }, 3050);
      });
    }

    return {
      spinWheel: spinWheel,
      getLiveTeamCandidates: getLiveTeamCandidates,
      renderWheelAnimation: renderWheelAnimation
    };
  })();

  window.WHEEL_SPINNER = WHEEL_SPINNER;
})();
