(function () {
  console.log('✅ buzzer-app.js loaded');

  var TAB_KEYS = {
    ID: 'hcg_playerId',
    NAME: 'hcg_playerName',
    TEAM: 'hcg_playerTeam',
    REGISTERED: 'hcg_registered',
    ROOM: 'hcg_roomPin'
  };

  var localPlayer = {
    id: sessionStorage.getItem(TAB_KEYS.ID) || null,
    name: sessionStorage.getItem(TAB_KEYS.NAME) || localStorage.getItem(TAB_KEYS.NAME) || '',
    teamId: sessionStorage.getItem(TAB_KEYS.TEAM) || localStorage.getItem(TAB_KEYS.TEAM) || null,
    registered: sessionStorage.getItem(TAB_KEYS.REGISTERED) === 'true'
  };

  var appState = {
    heartbeatTimer: null,
    categoryTimer: null,
    letterTimer: null,
    rewardTimer: null,
    lastGame: null,
    lastThemeColor: '',
    roomConnected: false,
    pressQueue: window.CommandQueue ? new CommandQueue() : {
      enqueue: function (fn) { return Promise.resolve().then(fn); }
    }
  };

  /**
   * Initializes buzzer app and listeners.
   * @returns {Promise<void>} Completion promise.
   */
  async function initBuzzerApp() {
    SOUND_EFFECTS.init();

    bindUI();
    bindLifecycle();
    prefillRegistrationFields();
    showScreen('registration');

    try {
      await DATA_LAYER.initDataLayer();
    } catch (error) {
      console.error('❌ Data layer init failed on buzzer:', error);
      setText('joinMessage', 'فشل الاتصال بقاعدة البيانات');
      return;
    }

    try {
      await QUESTION_MANAGER.loadAllQuestions();
    } catch (_error) {
      setText('loadingState', 'تعذّر تحميل الأسئلة');
    }

    DATA_LAYER.onDataChange('game.settings', function (settings) {
      renderTeamOptions(settings || null);
      applyPlayerTheme(settings || null);
    });

    DATA_LAYER.onDataChange('game', function (game) {
      appState.lastGame = game || {};
      renderByGameState(game || {});
    });

    var game = await DATA_LAYER.readData('game') || {};
    appState.lastGame = game;
    renderTeamOptions(game.settings || null);
    applyPlayerTheme(game.settings || null);
    await restoreRegistration(game);
    renderByGameState(game);
    if (localPlayer.registered) {
      startHeartbeat();
    }
  }

  /**
   * Binds button interactions.
   */
  function bindUI() {
    var joinBtn = document.getElementById('joinBtn');
    var buzzBtn = document.getElementById('buzzBtn');
    var roomPinInput = document.getElementById('roomPinInput');

    if (joinBtn) joinBtn.addEventListener('click', joinGame);
    if (buzzBtn) buzzBtn.addEventListener('click', pressBuzz);
    if (roomPinInput) {
      roomPinInput.addEventListener('input', function () {
        roomPinInput.value = sanitizePin(roomPinInput.value);
      });
    }
  }

  /**
   * Binds page lifecycle events.
   */
  function bindLifecycle() {
    window.addEventListener('beforeunload', function () {
      if (!localPlayer.id || !localPlayer.registered) return;
      DATA_LAYER.updateData('game.players.' + localPlayer.id, {
        online: false,
        lastSeen: DATA_LAYER.getTimestamp()
      });
    });
  }

  /**
   * Restores previous player registration.
   * @param {Object} game Game object.
   * @returns {Promise<void>} Completion promise.
   */
  async function restoreRegistration(game) {
    if (!localPlayer.id) return;

    var players = game && game.players ? game.players : {};
    var existing = players[localPlayer.id];
    var wasRegistered = sessionStorage.getItem(TAB_KEYS.REGISTERED) === 'true';

    if (existing && wasRegistered) {
      hydratePlayerFromRow(existing);
      localPlayer.registered = true;
      persistPlayerIdentity(localPlayer.id, localPlayer.name, localPlayer.teamId, true);
      await DATA_LAYER.updateData('game.players.' + localPlayer.id, {
        online: true,
        lastSeen: DATA_LAYER.getTimestamp()
      });
      return;
    }

    if (!wasRegistered) {
      localPlayer.registered = false;
      return;
    }

    if (!game || !game.settings || !localPlayer.name || !localPlayer.teamId) {
      localPlayer.registered = false;
      return;
    }

    var joinedAt = DATA_LAYER.getTimestamp();
    await DATA_LAYER.writeData('game.players.' + localPlayer.id, {
      id: localPlayer.id,
      name: localPlayer.name,
      team: localPlayer.teamId,
      teamId: localPlayer.teamId,
      online: true,
      joinedAt: joinedAt,
      lastSeen: joinedAt
    });
    localPlayer.registered = true;
    persistPlayerIdentity(localPlayer.id, localPlayer.name, localPlayer.teamId, true);
  }

  /**
   * Registers player with chosen team.
   * @returns {Promise<void>} Completion promise.
   */
  async function joinGame() {
    try {
      var roomPinInput = document.getElementById('roomPinInput');
      var pin = sanitizePin(roomPinInput ? roomPinInput.value : '');
      if (!pin || pin.length !== 4) {
        setText('joinMessage', 'أدخل رمز اللعبة أولاً');
        return;
      }

      var roomOk = await DATA_LAYER.joinRoom(pin);
      if (!roomOk) {
        setText('joinMessage', '❌ رمز اللعبة غير صحيح');
        return;
      }
      appState.roomConnected = true;
      localStorage.setItem(TAB_KEYS.ROOM, pin);
      sessionStorage.setItem(TAB_KEYS.ROOM, pin);

      var game = {};
      try {
        game = await DATA_LAYER.readData('game') || {};
      } catch (readError) {
        console.warn('⚠️ buzzer read game after join failed:', readError);
        game = {};
      }

      if (!game.settings) {
        setText('joinMessage', 'انتظر الحكم لإعداد المباراة...');
        return;
      }

      var name = (document.getElementById('playerNameInput').value || '').trim();
      var teamId = normalizeTeam(document.getElementById('teamSelect').value);

      if (!name || !teamId) {
        setText('joinMessage', 'اكتب الاسم واختر الفريق');
        return;
      }

      console.log('🔵 BUZZER: Attempting registration...');

      var playerId = generatePlayerId();
      var existing = game.players && game.players[playerId];
      if (existing && (String(existing.name || '') !== name || normalizeTeam(existing.teamId || existing.team) !== teamId)) {
        sessionStorage.removeItem(TAB_KEYS.ID);
        playerId = generatePlayerId();
      }

      localPlayer.id = playerId;
      localPlayer.name = name;
      localPlayer.teamId = teamId;
      localPlayer.registered = true;

      var joinedAt = existing && existing.joinedAt ? Number(existing.joinedAt) : DATA_LAYER.getTimestamp();
      var playerData = {
        id: playerId,
        name: name,
        team: teamId,
        teamId: teamId,
        online: true,
        joinedAt: joinedAt,
        lastSeen: DATA_LAYER.getTimestamp()
      };

      console.log('🔵 BUZZER: PlayerId:', playerId);
      console.log('🔵 BUZZER: Writing to path: game.players.' + playerId);
      console.log('🔵 BUZZER: Data:', playerData);

      await DATA_LAYER.writeData('game.players.' + playerId, playerData);
      console.log('🔵 BUZZER: Write complete. Verifying...');
      var verify = await DATA_LAYER.readData('game.players.' + playerId);
      console.log('🔵 BUZZER: Verification read:', verify);

      persistPlayerIdentity(playerId, name, teamId, true);

      setText('joinMessage', '✅ تم الانضمام');
      showScreen('waiting');
      startHeartbeat();
    } catch (error) {
      console.error('❌ joinGame failed:', error);
      setText('joinMessage', '❌ تعذّر الانضمام الآن. أعد المحاولة');
    }
  }

  /**
   * Sends periodic player heartbeat.
   */
  function startHeartbeat() {
    clearInterval(appState.heartbeatTimer);
    if (!localPlayer.id || !localPlayer.registered) return;

    appState.heartbeatTimer = setInterval(function () {
      DATA_LAYER.updateData('game.players.' + localPlayer.id, {
        id: localPlayer.id,
        name: localPlayer.name,
        team: localPlayer.teamId,
        teamId: localPlayer.teamId,
        online: true,
        lastSeen: DATA_LAYER.getTimestamp()
      });
    }, 5000);
  }

  /**
   * Handles buzzer press with queue guard.
   * @returns {Promise<void>} Completion promise.
   */
  async function pressBuzz() {
    if (!localPlayer.id) return;

    await appState.pressQueue.enqueue(async function () {
      var game = await DATA_LAYER.readData('game') || {};
      var turn = game.currentTurn || {};
      if (turn.phase !== 'buzzerOpen' || !turn.buzzerOpen) return;

      SOUND_EFFECTS.playBuzzerPress();
      if (navigator.vibrate) navigator.vibrate(180);

      var order = await BUZZER_SYSTEM.registerBuzz(localPlayer.id, localPlayer.name, localPlayer.teamId);
      var rank = order.findIndex(function (item) { return item.playerId === localPlayer.id; }) + 1;

      if (rank > 0) {
        setText('pressedText', '✅ ضغطت! أنت رقم ' + rank);
        setText('pressedHint', 'انتظر قرار الحكم');
        showScreen('pressed');
      }
    });
  }

  /**
   * Renders team options from settings.
   * @param {Object|null} settings Game settings.
   */
  function renderTeamOptions(settings) {
    var teamSelect = document.getElementById('teamSelect');
    var joinBtn = document.getElementById('joinBtn');
    if (!teamSelect) return;

    var selectedBeforeRender = normalizeTeam(teamSelect.value);
    teamSelect.innerHTML = '<option value="">اختر فريقك...</option>';

    if (!settings) {
      setText('joinMessage', 'انتظر الحكم لإعداد المباراة...');
      teamSelect.disabled = true;
      if (joinBtn) joinBtn.disabled = true;
      return;
    }

    teamSelect.disabled = false;
    if (joinBtn) joinBtn.disabled = false;

    var t1 = document.createElement('option');
    t1.value = 'team1';
    t1.textContent = '🔴 ' + settings.team1.name;
    teamSelect.appendChild(t1);

    var t2 = document.createElement('option');
    t2.value = 'team2';
    t2.textContent = '🟢 ' + settings.team2.name;
    teamSelect.appendChild(t2);

    if (selectedBeforeRender === 'team1' || selectedBeforeRender === 'team2') {
      teamSelect.value = selectedBeforeRender;
    } else if (localPlayer.teamId === 'team1' || localPlayer.teamId === 'team2') {
      teamSelect.value = localPlayer.teamId;
    }

    if (localPlayer.name) {
      var nameInput = document.getElementById('playerNameInput');
      if (nameInput && !nameInput.value) {
        nameInput.value = localPlayer.name;
      }
    }

    if (settings.team1 && settings.team2) {
      setText('joinMessage', '');
    }
  }

  /**
   * Renders app state by current game phase.
   * @param {Object} game Game object.
   */
  function renderByGameState(game) {
    clearDynamicTimers();

    var players = game.players || {};
    setPlayersCount(getOnlinePlayersCount(players));
    applyPlayerTheme(game.settings || null);

    if (!localPlayer.id || !localPlayer.registered || !(players[localPlayer.id])) {
      if (localPlayer.registered && localPlayer.id && !(players[localPlayer.id])) {
        localPlayer.registered = false;
        persistPlayerIdentity(localPlayer.id, localPlayer.name, localPlayer.teamId, false);
      }
      showScreen('registration');
      return;
    }

    var player = players[localPlayer.id];
    localPlayer.name = player.name || localPlayer.name;
    localPlayer.teamId = normalizeTeam(player.teamId || player.team) || localPlayer.teamId;
    applyPlayerTheme(game.settings || null);

    var turn = game.currentTurn || {};
    var phase = turn.phase || game.phase || 'setup';
    var presses = game.buzzer && Array.isArray(game.buzzer.presses) ? game.buzzer.presses : [];

    if (phase === 'selectCell') {
      renderLetterSelection(game, turn);
      return;
    }

    if (phase === 'selectCategory') {
      renderCategorySelection(game, turn);
      return;
    }

    if (phase === 'queenReward') {
      renderQueenReward(turn);
      return;
    }

    if (phase === 'buzzerOpen' && turn.buzzerOpen) {
      var pressed = presses.some(function (p) { return p.playerId === localPlayer.id; });
      if (pressed) {
        var rank = getPressRank(presses, localPlayer.id);
        setText('pressedText', '✅ ضغطت! أنت رقم ' + rank);
        setText('pressedHint', 'انتظر قرار الحكم');
        showScreen('pressed');
      } else {
        setText('buzzFeedback', 'اضغط بسرعة!');
        showScreen('active');
      }
      return;
    }

    if (phase === 'waitingPlayers' || phase === 'setup') {
      setText('waitingHint', 'انتظر بدء الجولة...');
      showScreen('waiting');
      return;
    }

    if (phase === 'wheelLetter') {
      setText('lockedHint', '🎲 يتم اختيار لاعب لاختيار الحرف');
      showScreen('locked');
      return;
    }

    if (phase === 'wheelCategory') {
      setText('lockedHint', '🎲 يتم اختيار لاعب لاختيار الفئة');
      showScreen('locked');
      return;
    }

    if (phase === 'showQuestion' || phase === 'opening') {
      setText('lockedHint', 'السؤال يُقرأ الآن...');
      showScreen('locked');
      return;
    }

    if (phase === 'roundEnd') {
      setText('waitingHint', 'انتهت الجولة، انتظر التالية...');
      showScreen('waiting');
      return;
    }

    if (phase === 'matchEnd') {
      setText('waitingHint', 'انتهت المباراة 🎉');
      showScreen('waiting');
      return;
    }

    setText('lockedHint', 'انتظر التعليمات...');
    showScreen('locked');
  }

  /**
   * Renders letter selection phase for selected player.
   * @param {Object} game Game object.
   * @param {Object} turn Turn state.
   */
  function renderLetterSelection(game, turn) {
    var letterPickerId = resolveTurnPlayerId(turn, 'letter');
    if (letterPickerId !== localPlayer.id || typeof turn.selectedCell === 'number') {
      setText('spectatorCategoryText', 'اللاعب المختار يحدد الحرف الآن...');
      showScreen('spectatorCategory');
      return;
    }

    showScreen('letterSelect');
    setText('letterSelectHint', 'اختر خلية فارغة للحرف');

    var cells = (game.board && Array.isArray(game.board.cells)) ? game.board.cells : [];
    var letterGrid = document.getElementById('letterSelectGrid');

    var selectable = cells.map(function (cell) {
      var copy = Object.assign({}, cell);
      copy.selectable = !cell.owner && !cell.frozen;
      return copy;
    });

    HEX_GRID.renderGrid(letterGrid, selectable, {
      clickable: true,
      miniMode: true,
      showLetters: true,
      onCellClick: function (index) {
        var cell = cells[index];
        if (!cell || cell.owner || cell.frozen) return;
        submitSelectedCell(index, cell.letter || '');
      }
    });

    var deadline = Number(turn.letterDeadline || (Date.now() + 15000));
    appState.letterTimer = setInterval(function () {
      var left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setText('letterSelectCountdown', String(left));
      if (left <= 0) {
        clearInterval(appState.letterTimer);
        appState.letterTimer = null;

        var empties = cells.map(function (cell, idx) {
          return { idx: idx, cell: cell };
        }).filter(function (entry) {
          return entry.cell && !entry.cell.owner && !entry.cell.frozen;
        });

        if (!empties.length) return;
        var randomPick = empties[Math.floor(Math.random() * empties.length)];
        submitSelectedCell(randomPick.idx, randomPick.cell.letter || '');
      }
    }, 250);
  }

  /**
   * Persists selected cell for letter phase.
   * @param {number} index Cell index.
   * @param {string} letter Cell letter.
   */
  async function submitSelectedCell(index, letter) {
    await DATA_LAYER.updateData('game.currentTurn', {
      selectedCell: Number(index),
      selectedLetter: String(letter || ''),
      letterSelectedAt: DATA_LAYER.getTimestamp()
    });
    showScreen('locked');
    setText('lockedHint', 'تم اختيار الحرف بنجاح');
  }

  /**
   * Renders category selection phase.
   * @param {Object} game Game object.
   * @param {Object} turn Turn state.
   */
  function renderCategorySelection(game, turn) {
    var categoryPickerId = resolveTurnPlayerId(turn, 'category');
    if (categoryPickerId !== localPlayer.id || turn.selectedCategory) {
      setText('spectatorCategoryText', 'اللاعب المختار يحدد الفئة الآن...');
      showScreen('spectatorCategory');
      return;
    }

    showScreen('category');
    setText('letterHint', 'الحرف: ' + (turn.selectedLetter || '-'));

    var categories = QUESTION_MANAGER.getSelectableCategories();
    var container = document.getElementById('categoryButtons');
    container.innerHTML = '';

    for (var i = 0; i < categories.length; i += 1) {
      var cat = categories[i];
      var btn = document.createElement('button');
      btn.className = 'category-btn';
      btn.textContent = (cat.icon || '') + ' ' + cat.name;
      btn.dataset.id = cat.id;
      btn.addEventListener('click', function (event) {
        submitCategory(event.currentTarget.dataset.id);
      });
      container.appendChild(btn);
    }

    var deadline = Number(turn.categoryDeadline || (Date.now() + 10000));
    appState.categoryTimer = setInterval(function () {
      var left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setText('countdownText', String(left));
      if (left <= 3 && left > 0) SOUND_EFFECTS.playTimerWarning();
      if (left <= 0) {
        clearInterval(appState.categoryTimer);
        appState.categoryTimer = null;
        if (!categories.length) return;
        var random = categories[Math.floor(Math.random() * categories.length)];
        submitCategory(random.id);
      }
    }, 250);
  }

  /**
   * Persists chosen category.
   * @param {string} categoryId Category id.
   */
  async function submitCategory(categoryId) {
    await DATA_LAYER.updateData('game.currentTurn', {
      selectedCategory: categoryId,
      categorySelectedAt: DATA_LAYER.getTimestamp()
    });
    showScreen('locked');
    setText('lockedHint', 'تم اختيار الفئة');
  }

  /**
   * Renders queen reward options for selected player.
   * @param {Object} turn Turn state.
   */
  function renderQueenReward(turn) {
    var rewardPickerId = turn.selectedRewardPlayer || turn.selectedPlayer || null;
    if (rewardPickerId !== localPlayer.id || turn.selectedReward) {
      setText('spectatorCategoryText', 'اللاعب المختار يحدد مكافأة الملكة...');
      showScreen('spectatorCategory');
      return;
    }

    showScreen('queenReward');

    var options = [
      { id: 'raid', label: '🏴‍☠️ سرقة خلية' },
      { id: 'double', label: '💥 خلية إضافية' },
      { id: 'freeze', label: '❄️ تجميد خلية' },
      { id: 'shield', label: '🛡️ حماية خلية' }
    ];

    var wrap = document.getElementById('queenRewardButtons');
    wrap.innerHTML = '';

    options.forEach(function (opt) {
      var btn = document.createElement('button');
      btn.className = 'category-btn';
      btn.textContent = opt.label;
      btn.addEventListener('click', function () {
        submitQueenReward(opt.id);
      });
      wrap.appendChild(btn);
    });

    var deadline = Number(turn.rewardDeadline || (Date.now() + 15000));
    appState.rewardTimer = setInterval(function () {
      var left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setText('queenRewardCountdown', String(left));
      if (left <= 0) {
        clearInterval(appState.rewardTimer);
        appState.rewardTimer = null;
        var random = options[Math.floor(Math.random() * options.length)];
        submitQueenReward(random.id);
      }
    }, 250);
  }

  /**
   * Sends queen reward selection.
   * @param {string} rewardId Reward id.
   */
  async function submitQueenReward(rewardId) {
    await DATA_LAYER.updateData('game.currentTurn', {
      selectedReward: rewardId,
      rewardSelectedAt: DATA_LAYER.getTimestamp()
    });
    showScreen('locked');
    setText('lockedHint', 'تم اختيار مكافأة الملكة');
  }

  /**
   * Returns ordered press rank for player.
   * @param {Array<Object>} presses Press list.
   * @param {string} playerId Player id.
   * @returns {number} Rank.
   */
  function getPressRank(presses, playerId) {
    var ordered = (presses || []).slice().sort(function (a, b) {
      return Number(a.timestamp || 0) - Number(b.timestamp || 0);
    });

    for (var i = 0; i < ordered.length; i += 1) {
      if (ordered[i].playerId === playerId) return i + 1;
    }
    return 0;
  }

  /**
   * Returns normalized team id.
   * @param {*} team Raw team value.
   * @returns {'team1'|'team2'|null} Team id.
   */
  function normalizeTeam(team) {
    var safe = String(team || '').toLowerCase().trim();
    if (safe === 'team1' || safe === '1' || safe === 'red' || safe === 'الفريق الأول') return 'team1';
    if (safe === 'team2' || safe === '2' || safe === 'green' || safe === 'الفريق الثاني') return 'team2';
    return null;
  }

  /**
   * Returns count of online players.
   * @param {Object} players Players map.
   * @returns {number} Online count.
   */
  function getOnlinePlayersCount(players) {
    var now = Date.now();
    return Object.values(players || {}).filter(function (player) {
      if (!player) return false;
      if (player.online === false || player.connected === false) return false;
      var lastSeen = Number(player.lastSeen || 0);
      if (!lastSeen) return true;
      return now - lastSeen < 15000;
    }).length;
  }

  /**
   * Updates player count labels.
   * @param {number} count Online players count.
   */
  function setPlayersCount(count) {
    var text = 'أنت واحد من ' + count + ' لاعبين';
    ['regPlayersCount', 'waitingPlayersCount', 'lockedPlayersCount', 'activePlayersCount', 'pressedPlayersCount'].forEach(function (id) {
      setText(id, text);
    });
  }

  /**
   * Clears active countdown timers.
   */
  function clearDynamicTimers() {
    clearInterval(appState.categoryTimer);
    clearInterval(appState.letterTimer);
    clearInterval(appState.rewardTimer);
    appState.categoryTimer = null;
    appState.letterTimer = null;
    appState.rewardTimer = null;
  }

  /**
   * Shows one screen and hides others.
   * @param {'registration'|'waiting'|'locked'|'active'|'pressed'|'category'|'spectatorCategory'|'letterSelect'|'queenReward'} key Screen key.
   */
  function showScreen(key) {
    var map = {
      registration: 'registrationScreen',
      waiting: 'waitingScreen',
      locked: 'lockedScreen',
      active: 'activeScreen',
      pressed: 'pressedScreen',
      category: 'categoryScreen',
      spectatorCategory: 'spectatorCategoryScreen',
      letterSelect: 'letterSelectScreen',
      queenReward: 'queenRewardScreen'
    };

    Object.keys(map).forEach(function (name) {
      var screen = document.getElementById(map[name]);
      if (!screen) return;
      screen.classList.toggle('hidden', name !== key);
    });
  }

  /**
   * Writes text content for target element.
   * @param {string} id Element id.
   * @param {string} text Text value.
   */
  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  /**
   * Resolves selected player id for letter/category phases.
   * @param {Object} turn Turn state object.
   * @param {'letter'|'category'} mode Selection mode.
   * @returns {string|null} Player id.
   */
  function resolveTurnPlayerId(turn, mode) {
    if (!turn || typeof turn !== 'object') return null;
    if (mode === 'letter') {
      return turn.selectedLetterPlayer || turn.letterPickerPlayer || turn.selectedPlayer || null;
    }
    return turn.selectedCategoryPlayer || turn.categoryPickerPlayer || turn.selectedPlayer || null;
  }

  /**
   * Applies selected team color to buzzer visuals.
   * @param {Object|null} settings Game settings.
   */
  function applyPlayerTheme(settings) {
    var teamId = normalizeTeam(localPlayer.teamId);
    var buzzBtn = document.getElementById('buzzBtn');
    if (!buzzBtn || !teamId) return;

    var color = teamId === 'team2'
      ? ((settings && settings.team2 && settings.team2.color) || '#27ae60')
      : ((settings && settings.team1 && settings.team1.color) || '#e74c3c');
    if (!color || color === appState.lastThemeColor) return;

    appState.lastThemeColor = color;
    var darker = shiftColor(color, -30);
    buzzBtn.style.background = 'linear-gradient(180deg, ' + color + ', ' + darker + ')';
  }

  /**
   * Brightens or darkens a hex color.
   * @param {string} hexColor Hex color string.
   * @param {number} amount Positive/negative shift.
   * @returns {string} Shifted hex color.
   */
  function shiftColor(hexColor, amount) {
    var safe = String(hexColor || '').replace('#', '').trim();
    if (!/^[0-9a-fA-F]{6}$/.test(safe)) return '#1f2a44';
    var r = Math.max(0, Math.min(255, parseInt(safe.slice(0, 2), 16) + amount));
    var g = Math.max(0, Math.min(255, parseInt(safe.slice(2, 4), 16) + amount));
    var b = Math.max(0, Math.min(255, parseInt(safe.slice(4, 6), 16) + amount));
    return '#' + [r, g, b].map(function (value) {
      return value.toString(16).padStart(2, '0');
    }).join('');
  }

  /**
   * Prefills registration fields from stored values.
   */
  function prefillRegistrationFields() {
    var nameInput = document.getElementById('playerNameInput');
    var teamSelect = document.getElementById('teamSelect');
    var roomPinInput = document.getElementById('roomPinInput');
    var pinFromUrl = sanitizePin(readPinFromUrl());
    if (nameInput && localPlayer.name) {
      nameInput.value = localPlayer.name;
    }
    if (teamSelect && localPlayer.teamId) {
      teamSelect.value = localPlayer.teamId;
    }
    if (roomPinInput) {
      var rememberedPin = pinFromUrl || sanitizePin(sessionStorage.getItem(TAB_KEYS.ROOM) || localStorage.getItem(TAB_KEYS.ROOM) || DATA_LAYER.getRoomPin() || '');
      if (rememberedPin) {
        roomPinInput.value = rememberedPin;
        appState.roomConnected = true;
        sessionStorage.setItem(TAB_KEYS.ROOM, rememberedPin);
        localStorage.setItem(TAB_KEYS.ROOM, rememberedPin);
      }
    }
  }

  /**
   * Generates or reuses the current tab player id.
   * @returns {string} Unique player id.
   */
  function generatePlayerId() {
    var id = sessionStorage.getItem(TAB_KEYS.ID);
    if (id) return id;
    id = 'player_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    sessionStorage.setItem(TAB_KEYS.ID, id);
    return id;
  }

  /**
   * Persists player identity in session/local storage.
   * @param {string} id Player id.
   * @param {string} name Player name.
   * @param {'team1'|'team2'|null} teamId Team id.
   * @param {boolean} isRegistered Registration state.
   */
  function persistPlayerIdentity(id, name, teamId, isRegistered) {
    if (id) {
      sessionStorage.setItem(TAB_KEYS.ID, id);
      localStorage.setItem(TAB_KEYS.ID, id);
    }
    if (name) {
      sessionStorage.setItem(TAB_KEYS.NAME, name);
      localStorage.setItem(TAB_KEYS.NAME, name);
    }
    if (teamId) {
      sessionStorage.setItem(TAB_KEYS.TEAM, teamId);
      localStorage.setItem(TAB_KEYS.TEAM, teamId);
    }
    var roomPin = sanitizePin(DATA_LAYER.getRoomPin() || localStorage.getItem(TAB_KEYS.ROOM) || '');
    if (roomPin) {
      sessionStorage.setItem(TAB_KEYS.ROOM, roomPin);
      localStorage.setItem(TAB_KEYS.ROOM, roomPin);
    }
    sessionStorage.setItem(TAB_KEYS.REGISTERED, isRegistered ? 'true' : 'false');
    localStorage.setItem(TAB_KEYS.REGISTERED, isRegistered ? 'true' : 'false');
  }

  /**
   * Hydrates local player cache from game row.
   * @param {Object} row Player row from game.players.
   */
  function hydratePlayerFromRow(row) {
    if (!row) return;
    localPlayer.id = row.id || localPlayer.id || generatePlayerId();
    localPlayer.name = row.name || localPlayer.name;
    localPlayer.teamId = normalizeTeam(row.teamId || row.team) || localPlayer.teamId;
    localPlayer.registered = true;
  }

  /**
   * Sanitizes room pin value.
   * @param {string} value Raw pin value.
   * @returns {string} 4-digit sanitized pin.
   */
  function sanitizePin(value) {
    return String(value || '').replace(/\D/g, '').slice(0, 4);
  }

  /**
   * Reads pin query parameter from URL.
   * @returns {string} Pin value from URL or empty string.
   */
  function readPinFromUrl() {
    try {
      var params = new URLSearchParams(window.location.search || '');
      return String(params.get('pin') || '');
    } catch (_error) {
      return '';
    }
  }

  initBuzzerApp();
})();
