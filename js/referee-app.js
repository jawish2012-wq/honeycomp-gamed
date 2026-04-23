
(function () {
  console.log('✅ referee-app.js loaded');

  var PHASES = {
    SETUP: 'setup',
    WAITING_PLAYERS: 'waitingPlayers',
    OPENING: 'opening',
    WHEEL_LETTER: 'wheelLetter',
    WHEEL_CATEGORY: 'wheelCategory',
    SELECT_CELL: 'selectCell',
    SELECT_CATEGORY: 'selectCategory',
    QUEEN_REWARD: 'queenReward',
    SHOW_QUESTION: 'showQuestion',
    BUZZER_OPEN: 'buzzerOpen',
    JUDGING: 'judging',
    CELL_RESULT: 'cellResult',
    SURPRISE_REVEAL: 'surpriseReveal',
    SELECT_STEAL: 'selectSteal',
    ROUND_END: 'roundEnd',
    MATCH_END: 'matchEnd'
  };

  var appState = {
    categoryTimer: null,
    letterTimer: null,
    rewardTimer: null,
    stealTimer: null,
    blitzTimer: null,
    processingCategory: false,
    processingCellPick: false,
    processingSteal: false,
    lastPhase: null,
    debugOpen: false,
    presenceTimer: null,
    snapshotTimer: null,
    restoreBannerShown: false,
    lastBuzzAlertKey: null,
    overrideMode: false,
    overrideSelectedCell: null,
    overrideHistory: [],
    pendingTargetMode: null,
    isAuthenticated: false,
    isStartingMatch: false,
    roomSelected: false,
    activeRoomPin: null,
    roomsIndex: {}
  };

  /**
   * Initializes referee app.
   */
  async function initRefereeApp() {
    SOUND_EFFECTS.init();
    bindEvents();
    try {
      await DATA_LAYER.initDataLayer();
    } catch (error) {
      console.error('❌ Data layer init failed on referee:', error);
      setText('loginMessage', 'فشل الاتصال بقاعدة البيانات');
      showScreen('login');
      return;
    }
    try {
      await QUESTION_MANAGER.loadAllQuestions();
    } catch (error) {
      console.error('⚠️ Question library load failed on referee:', error);
      setText('loginMessage', '⚠️ تعذّر تحميل مكتبة الأسئلة الآن');
    }
    DATA_LAYER.onRoomChange(function (pin) {
      appState.activeRoomPin = pin || null;
      renderRoomPin(pin);
      refreshLobbyHighlight();
    });
    renderRoomPin(DATA_LAYER.getRoomPin());
    appState.activeRoomPin = DATA_LAYER.getRoomPin() || null;
    DATA_LAYER.onDataChange('game', handleGameChange);
    DATA_LAYER.onDataChange('game.players', function (playersData) {
      var safePlayers = playersData && typeof playersData === 'object' ? playersData : {};
      console.log('🟡 REFEREE: Player data change detected');
      console.log('🟡 REFEREE: Raw data:', safePlayers);
      console.log('🟡 REFEREE: Player count:', Object.keys(safePlayers).length);
      renderPlayers(safePlayers);
      if (appState.roomSelected && appState.activeRoomPin) {
        var gameForIndex = appState.lastGame && typeof appState.lastGame === 'object'
          ? Object.assign({}, appState.lastGame, { players: safePlayers })
          : { players: safePlayers };
        updateRoomIndexFromGame(appState.activeRoomPin, gameForIndex).catch(function () {});
      }
    });
    DATA_LAYER.onDataChange('rooms_index', function (roomsData) {
      appState.roomsIndex = roomsData && typeof roomsData === 'object' ? roomsData : {};
      renderRoomsLobby();
    });
    startPresenceMonitor();
    startSnapshotAutoSave();
    maybeShowSnapshotBanner();

    var authenticated = sessionStorage.getItem('hcg_referee_auth') === '1';
    appState.isAuthenticated = authenticated;
    if (!authenticated) {
      showScreen('login');
      return;
    }

    enterLobby('اختر غرفة للاستئناف أو أنشئ غرفة جديدة.');
    await loadRoomsIndexNow();
  }

  /**
   * Binds static event handlers.
   */
  function bindEvents() {
    document.getElementById('loginBtn').addEventListener('click', function (event) {
      if (event && event.preventDefault) event.preventDefault();
      handleLogin();
    });
    var createLobbyRoomBtn = document.getElementById('createLobbyRoomBtn');
    if (createLobbyRoomBtn) {
      createLobbyRoomBtn.addEventListener('click', function (event) {
        if (event && event.preventDefault) event.preventDefault();
        handleCreateRoom();
      });
    }
    var createRoomBtn = document.getElementById('createRoomBtn');
    if (createRoomBtn) createRoomBtn.addEventListener('click', function (event) {
      if (event && event.preventDefault) event.preventDefault();
      handleCreateRoom();
    });
    var roomsList = document.getElementById('roomsList');
    if (roomsList) {
      roomsList.addEventListener('click', onLobbyRoomAction);
    }
    var backToLobbyFromSetupBtn = document.getElementById('backToLobbyFromSetupBtn');
    if (backToLobbyFromSetupBtn) backToLobbyFromSetupBtn.addEventListener('click', backToLobby);
    var backToLobbyFromWaitingBtn = document.getElementById('backToLobbyFromWaitingBtn');
    if (backToLobbyFromWaitingBtn) backToLobbyFromWaitingBtn.addEventListener('click', backToLobby);
    var backToLobbyFromGameBtn = document.getElementById('backToLobbyFromGameBtn');
    if (backToLobbyFromGameBtn) backToLobbyFromGameBtn.addEventListener('click', function () {
      var goBack = window.confirm('الرجوع للغرف سيُبقي هذه المباراة محفوظة. متابعة؟');
      if (!goBack) return;
      backToLobby();
    });
    document.getElementById('startMatchBtn').addEventListener('click', function (event) {
      if (event && event.preventDefault) event.preventDefault();
      startMatch();
    });
    document.getElementById('startRoundBtn').addEventListener('click', function (event) {
      if (event && event.preventDefault) event.preventDefault();
      startOpeningRound();
    });
    document.getElementById('askQuestionBtn').addEventListener('click', askQuestion);
    document.getElementById('correctBtn').addEventListener('click', markCorrect);
    document.getElementById('wrongBtn').addEventListener('click', markWrong);
    document.getElementById('skipBtn').addEventListener('click', skipQuestion);
    document.getElementById('nextRoundBtn').addEventListener('click', advanceToNextRound);
    document.getElementById('newMatchBtn').addEventListener('click', resetMatch);
    var toggleOverride = document.getElementById('toggleOverrideBtn');
    if (toggleOverride) {
      toggleOverride.addEventListener('click', toggleOverridePanel);
    }
    var overrideTeam1 = document.getElementById('overrideTeam1Btn');
    var overrideTeam2 = document.getElementById('overrideTeam2Btn');
    var overrideClear = document.getElementById('overrideClearBtn');
    var overrideUndo = document.getElementById('overrideUndoBtn');
    if (overrideTeam1) overrideTeam1.addEventListener('click', function () { applyManualOverride('team1'); });
    if (overrideTeam2) overrideTeam2.addEventListener('click', function () { applyManualOverride('team2'); });
    if (overrideClear) overrideClear.addEventListener('click', function () { applyManualOverride(null); });
    if (overrideUndo) overrideUndo.addEventListener('click', undoManualOverride);
    var toggleDebug = document.getElementById('toggleDebugBtn');
    if (toggleDebug) {
      toggleDebug.addEventListener('click', toggleDebugPanel);
    }
  }

  /**
   * Handles login validation.
   */
  function handleLogin() {
    try {
      console.log('🔑 Login button clicked');

      var inputEl = document.getElementById('passwordInput');
      var enteredPassword = inputEl ? String(inputEl.value || '').trim() : '';
      var fallbackPassword = 'admin123';
      var isValid = enteredPassword === fallbackPassword;

      console.log('🔑 Password entered:', enteredPassword);
      console.log('🔑 Validation result:', isValid);

      if (!isValid) {
        setText('loginMessage', 'كلمة المرور غير صحيحة');
        return;
      }

      localStorage.setItem('hcg_referee_auth', '1');
      sessionStorage.setItem('hcg_referee_auth', '1');
      appState.isAuthenticated = true;
      setText('loginMessage', 'تم تسجيل الدخول بنجاح');
      enterLobby('اختر غرفة للاستئناف أو أنشئ غرفة جديدة.');
      loadRoomsIndexNow().catch(function (error) {
        console.error('❌ Failed to load rooms after login:', error);
      });
    } catch (error) {
      console.error('❌ handleLogin fatal error:', error);
      setText('loginMessage', 'حدث خطأ أثناء تسجيل الدخول');
    }
  }

  /**
   * Creates a fresh multiplayer room and switches referee context to it.
   * @returns {Promise<void>} Completion promise.
   */
  async function handleCreateRoom() {
    var createBtn = document.getElementById('createRoomBtn');
    var lobbyCreateBtn = document.getElementById('createLobbyRoomBtn');
    try {
      if (createBtn) createBtn.disabled = true;
      if (lobbyCreateBtn) lobbyCreateBtn.disabled = true;
      setText('lobbyStatus', '⏳ جاري إنشاء غرفة جديدة...');
      setText('setupStatus', '⏳ جاري إنشاء اللعبة...');
      var pin = await DATA_LAYER.createRoom();
      appState.roomSelected = true;
      appState.activeRoomPin = pin;
      renderRoomPin(pin);
      await updateRoomIndexFromGame(pin, null);
      setText('setupStatus', '✅ تم إنشاء غرفة جديدة: ' + pin);
      setText('startRoundHint', '🎮 الغرفة جاهزة. أكمل إعداد المباراة.');
      setText('lobbyStatus', '✅ تم إنشاء غرفة #' + pin + '. أكمل إعدادها الآن.');
      showScreen('setup');
    } catch (error) {
      console.error('Failed to create room:', error);
      var fallbackPin = generateNumericGameCode();
      DATA_LAYER.setRoomPin(fallbackPin);
      appState.roomSelected = true;
      appState.activeRoomPin = fallbackPin;
      renderRoomPin(fallbackPin);
      updateRoomIndexFromGame(fallbackPin, null).catch(function () {});
      setText('setupStatus', '⚠️ تعذّر إنشاء غرفة تلقائيًا، تم التبديل إلى: ' + fallbackPin);
      setText('lobbyStatus', '⚠️ تعذّر إنشاء غرفة على Firebase، استخدم الرمز: ' + fallbackPin);
    } finally {
      if (createBtn) createBtn.disabled = false;
      if (lobbyCreateBtn) lobbyCreateBtn.disabled = false;
      loadRoomsIndexNow().catch(function () {});
    }
  }

  /**
   * Shows lobby screen and clears active room rendering lock.
   * @param {string=} message Optional status message.
   */
  function enterLobby(message) {
    appState.roomSelected = false;
    setText('lobbyStatus', message || 'اختر غرفة لاستكمال اللعبة أو أنشئ غرفة جديدة.');
    showScreen('lobby');
    renderRoomsLobby();
  }

  /**
   * Handles "back to lobby" actions.
   */
  function backToLobby() {
    enterLobby('تم الرجوع للغرف. يمكنك استكمال أو إنشاء مباراة أخرى.');
    loadRoomsIndexNow().catch(function (error) {
      console.warn('⚠️ rooms refresh failed on backToLobby:', error);
    });
  }

  /**
   * Handles clicks inside room cards.
   * @param {MouseEvent} event Click event.
   */
  function onLobbyRoomAction(event) {
    var target = event && event.target ? event.target : null;
    if (!target) return;
    var button = target.closest('button[data-action][data-pin]');
    if (!button) return;

    var pin = sanitizeRoomPin(button.dataset.pin || '');
    if (!pin) return;
    var action = String(button.dataset.action || '');

    if (action === 'resume') {
      resumeRoomFromLobby(pin).catch(function (error) {
        console.error('❌ resumeRoomFromLobby failed:', error);
        setText('lobbyStatus', '❌ تعذّر فتح الغرفة #' + pin);
      });
      return;
    }

    if (action === 'delete') {
      deleteRoomFromLobby(pin).catch(function (error) {
        console.error('❌ deleteRoomFromLobby failed:', error);
        setText('lobbyStatus', '❌ تعذّر حذف الغرفة #' + pin);
      });
    }
  }

  /**
   * Joins selected room and restores its current screen state.
   * @param {string} pin Room pin.
   * @returns {Promise<void>} Completion promise.
   */
  async function resumeRoomFromLobby(pin) {
    var normalized = sanitizeRoomPin(pin);
    if (!normalized) return;

    setText('lobbyStatus', '⏳ جارٍ فتح الغرفة #' + normalized + '...');
    var joined = await DATA_LAYER.joinRoom(normalized);
    if (!joined) {
      setText('lobbyStatus', '❌ الغرفة #' + normalized + ' غير متاحة');
      return;
    }

    appState.roomSelected = true;
    appState.activeRoomPin = normalized;
    renderRoomPin(normalized);

    var game = await readGame();
    if (game && typeof game === 'object') {
      handleGameChange(game);
      setText('lobbyStatus', '✅ تم فتح الغرفة #' + normalized);
      return;
    }

    setText('setupStatus', 'الغرفة #' + normalized + ' جاهزة. أدخل بيانات الفرق ثم ابدأ المباراة.');
    setText('startRoundHint', '🎮 بانتظار إعداد المباراة في هذه الغرفة.');
    showScreen('setup');
  }

  /**
   * Deletes room and its index entry.
   * @param {string} pin Room pin.
   * @returns {Promise<void>} Completion promise.
   */
  async function deleteRoomFromLobby(pin) {
    var normalized = sanitizeRoomPin(pin);
    if (!normalized) return;

    var confirmed = window.confirm('هل تريد حذف الغرفة #' + normalized + ' نهائيًا؟');
    if (!confirmed) return;

    if (typeof DATA_LAYER.deleteRoom === 'function') {
      await DATA_LAYER.deleteRoom(normalized);
    } else {
      await DATA_LAYER.removeData('games.' + normalized);
      await DATA_LAYER.removeData('rooms_index.' + normalized);
    }

    if (appState.activeRoomPin === normalized) {
      appState.roomSelected = false;
      appState.activeRoomPin = null;
    }
    setText('lobbyStatus', '🗑️ تم حذف الغرفة #' + normalized);
    await loadRoomsIndexNow();
  }

  /**
   * Loads room index snapshot immediately for lobby rendering.
   * @returns {Promise<void>} Completion promise.
   */
  async function loadRoomsIndexNow() {
    var list = [];
    if (typeof DATA_LAYER.listRooms === 'function') {
      list = await DATA_LAYER.listRooms();
      var mapped = {};
      (list || []).forEach(function (room) {
        var pin = sanitizeRoomPin(room && room.pin);
        if (!pin) return;
        mapped[pin] = room;
      });
      appState.roomsIndex = mapped;
      renderRoomsLobby();
      return;
    }

    var roomsData = await DATA_LAYER.readData('rooms_index');
    appState.roomsIndex = roomsData && typeof roomsData === 'object' ? roomsData : {};
    renderRoomsLobby();
  }

  /**
   * Renders lobby room cards.
   */
  function renderRoomsLobby() {
    var listEl = document.getElementById('roomsList');
    if (!listEl) return;

    var entries = Object.keys(appState.roomsIndex || {}).map(function (pin) {
      return buildRoomSummary(pin, appState.roomsIndex[pin]);
    }).filter(function (room) {
      return !!room.pin;
    }).sort(function (a, b) {
      return Number(b.updatedAt || 0) - Number(a.updatedAt || 0);
    });

    listEl.innerHTML = '';

    if (!entries.length) {
      var empty = document.createElement('div');
      empty.className = 'room-empty';
      empty.textContent = 'لا توجد غرف بعد. أنشئ غرفة جديدة للبدء.';
      listEl.appendChild(empty);
      return;
    }

    entries.forEach(function (room) {
      var card = document.createElement('article');
      card.className = 'room-card' + (room.pin === appState.activeRoomPin ? ' active' : '');

      var top = document.createElement('div');
      top.className = 'room-card-top';
      var pinText = document.createElement('div');
      pinText.className = 'room-pin';
      pinText.textContent = '#'+ room.pin;
      var badge = document.createElement('span');
      badge.className = 'room-badge status-' + room.status;
      badge.textContent = room.statusLabel;
      top.appendChild(pinText);
      top.appendChild(badge);

      var teams = document.createElement('p');
      teams.className = 'room-meta';
      teams.textContent = room.team1Name + ' ضد ' + room.team2Name;

      var score = document.createElement('p');
      score.className = 'room-meta';
      score.textContent = 'النتيجة: ' + room.scoreText + ' | المتصلون: ' + room.playersOnline;

      var updated = document.createElement('p');
      updated.className = 'room-meta';
      updated.textContent = 'آخر تحديث: ' + formatRoomTime(room.updatedAt);

      var actions = document.createElement('div');
      actions.className = 'room-actions';

      var resumeBtn = document.createElement('button');
      resumeBtn.type = 'button';
      resumeBtn.className = 'btn btn-small';
      resumeBtn.dataset.action = 'resume';
      resumeBtn.dataset.pin = room.pin;
      resumeBtn.textContent = '▶️ فتح الغرفة';

      var deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn btn-small btn-danger';
      deleteBtn.dataset.action = 'delete';
      deleteBtn.dataset.pin = room.pin;
      deleteBtn.textContent = '🗑️ حذف';

      actions.appendChild(resumeBtn);
      actions.appendChild(deleteBtn);

      card.appendChild(top);
      card.appendChild(teams);
      card.appendChild(score);
      card.appendChild(updated);
      card.appendChild(actions);
      listEl.appendChild(card);
    });
  }

  /**
   * Marks active room card style after room changes.
   */
  function refreshLobbyHighlight() {
    var cards = document.querySelectorAll('.room-card');
    cards.forEach(function (card) {
      var pinEl = card.querySelector('.room-pin');
      var pinText = pinEl ? pinEl.textContent.replace('#', '').trim() : '';
      card.classList.toggle('active', !!pinText && pinText === appState.activeRoomPin);
    });
  }

  /**
   * Builds safe room summary for lobby cards.
   * @param {string} pin Room pin.
   * @param {Object} row Room index row.
   * @returns {Object} Normalized room info.
   */
  function buildRoomSummary(pin, row) {
    var raw = row && typeof row === 'object' ? row : {};
    var status = String(raw.status || '').toLowerCase();
    var phase = String(raw.phase || '').toLowerCase();
    if (!status && phase) {
      if (phase === 'matchend') status = 'finished';
      else if (phase === 'setup' || phase === 'waitingplayers') status = 'setup';
      else status = 'playing';
    }
    if (status !== 'setup' && status !== 'playing' && status !== 'finished') {
      status = 'setup';
    }
    var statusLabelMap = {
      setup: '🔧 إعداد',
      playing: '⏳ جارية',
      finished: '✅ منتهية'
    };
    return {
      pin: sanitizeRoomPin(pin),
      status: status,
      statusLabel: statusLabelMap[status],
      team1Name: raw.team1Name || 'الفريق الأول',
      team2Name: raw.team2Name || 'الفريق الثاني',
      scoreText: raw.scoreText || '0 - 0',
      playersOnline: Number(raw.playersOnline || 0),
      updatedAt: Number(raw.updatedAt || 0)
    };
  }

  /**
   * Formats room timestamp for lobby.
   * @param {number} value Unix timestamp ms.
   * @returns {string} Human readable time.
   */
  function formatRoomTime(value) {
    var ts = Number(value || 0);
    if (!ts) return '—';
    try {
      return new Date(ts).toLocaleString('ar-SA', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit'
      });
    } catch (_error) {
      return String(ts);
    }
  }

  /**
   * Starts a new match.
   */
  async function startMatch() {
    try {
      appState.isStartingMatch = true;
      var roomPin = sanitizeRoomPin(DATA_LAYER.getRoomPin() || appState.activeRoomPin || '');
      if (!roomPin) {
        setText('setupStatus', '❌ اختر غرفة أولاً من صفحة الغرف.');
        enterLobby('اختر غرفة أولاً قبل بدء المباراة.');
        return;
      }

      appState.roomSelected = true;
      appState.activeRoomPin = roomPin;
      setText('setupStatus', '⏳ جاري بدء المباراة...');
      showScreen('waiting');
      setText('refereeStatus', '⏳ تجهيز بيانات المباراة...');
      setText('startRoundHint', 'يرجى الانتظار...');
      var team1Name = document.getElementById('team1Name').value.trim() || 'الصقور';
      var team2Name = document.getElementById('team2Name').value.trim() || 'النسور';
      var team1Color = document.getElementById('team1Color').value || '#e74c3c';
      var team2Color = document.getElementById('team2Color').value || '#27ae60';
      var bestOf = Number(document.getElementById('bestOfSelect').value || 3);

      DATA_LAYER.setRoomPin(roomPin);
      renderRoomPin(roomPin);
      var existingGame = null;
      try {
        existingGame = await readGame();
      } catch (readExistingError) {
        console.warn('⚠️ read existing game failed in startMatch, continuing with empty players:', readExistingError);
      }
      var existingPlayers = existingGame && existingGame.players && typeof existingGame.players === 'object'
        ? existingGame.players
        : {};

      var game = {
        phase: PHASES.WAITING_PLAYERS,
        settings: {
          password: 'admin123',
          gameCode: roomPin,
          bestOf: bestOf,
          currentRound: 1,
          team1: { id: 'team1', name: team1Name, color: team1Color, direction: 'horizontal' },
          team2: { id: 'team2', name: team2Name, color: team2Color, direction: 'vertical' }
        },
        players: existingPlayers,
        scores: { team1Stars: 0, team2Stars: 0 },
        surpriseConfig: { usedPairs: [] },
        board: {
          cells: HEX_GRID.generateGrid(),
          surpriseMap: Array.from({ length: 25 }, function () { return null; }),
          revealedMap: {},
          roundType: 'normal',
          selectedPair: null,
          totalSurprises: 0,
          revealedCount: 0
        },
        wheelHistory: { team1: [], team2: [] },
        wheelSpin: null,
        buzzer: { open: false, presses: [], byKey: {} },
        currentTurn: createFreshTurn(PHASES.WAITING_PLAYERS)
      };

      await writeGame(game);
      await updateRoomIndexFromGame(roomPin, game);
      await loadRoomsIndexNow();
      safeLog('PHASE_CHANGE', { from: null, to: PHASES.WAITING_PLAYERS });
      setText('setupStatus', '✅ تم إنشاء المباراة بنجاح');
      setText('refereeStatus', 'بانتظار انضمام اللاعبين');
      setText('startRoundHint', 'يمكنك البدء عند جاهزية اللاعبين');
      STATS_TRACKER.resetMatchStats().catch(function (statsError) {
        console.warn('⚠️ resetMatchStats delayed/failed:', statsError);
      });
    } catch (error) {
      console.error('❌ startMatch failed:', error);
      setText('setupStatus', '❌ تعذّر بدء المباراة. تأكد من اتصال Firebase');
      setText('refereeStatus', '❌ فشل حفظ المباراة على Firebase');
      setText('startRoundHint', 'تحقق من الاتصال وقواعد Firebase ثم حاول مجددًا');
    } finally {
      appState.isStartingMatch = false;
    }
  }

  /**
   * Starts round opening after validating teams.
   */
  async function startOpeningRound() {
    try {
      var game = await readGame();
      if (!game) {
        setText('startRoundHint', '❌ لا توجد بيانات مباراة في هذا الرقم');
        return;
      }
      game = ensureGameDefaults(game);

      var summary = buildPlayersSummary(game.players || {});
      if (!summary.onlineTotal) {
        setText('refereeStatus', '⚠️ لا يوجد لاعبين متصلين! يمكنك البدء للاختبار.');
        var proceed = window.confirm('⚠️ لا يوجد لاعبين! هل تريد البدء؟');
        if (!proceed) return;
      } else if (!summary.team1Online || !summary.team2Online) {
        setText('refereeStatus', '⚠️ الفرق غير مكتملة (مطلوب لاعب واحد على الأقل في كل فريق).');
        var confirmStart = window.confirm('⚠️ الفرق غير مكتملة. هل تريد بدء الجولة رغم ذلك؟');
        if (!confirmStart) return;
      } else {
        setText('refereeStatus', 'بدء الجولة الافتتاحية...');
      }

      await setupRoundBoard(game);
      await STATS_TRACKER.resetRoundStats();
      await beginOpeningQuestion(game);
    } catch (error) {
      console.error('❌ startOpeningRound failed:', error);
      setText('startRoundHint', '❌ تعذّر بدء الجولة. تحقق من اتصال Firebase');
    }
  }

  /**
   * Generates surprise distribution and resets board.
   * @param {Object} game Game state.
   */
  async function setupRoundBoard(game) {
    game = ensureGameDefaults(game);
    var roundType = isFinaleRound(game) ? 'finale' : 'normal';
    var usedPairs = game.surpriseConfig && Array.isArray(game.surpriseConfig.usedPairs)
      ? game.surpriseConfig.usedPairs
      : [];

    var surpriseData = SURPRISE_ENGINE.generateSmartSurprises(
      Number(game.settings.currentRound || 1),
      roundType,
      usedPairs,
      Number(game.settings.bestOf || 3)
    );

    game.board = {
      cells: HEX_GRID.generateGrid(),
      surpriseMap: surpriseData.surprises,
      revealedMap: {},
      roundType: surpriseData.roundType,
      selectedPair: surpriseData.selectedPair,
      totalSurprises: surpriseData.totalSurprises,
      revealedCount: 0,
      heatMap: surpriseData.heatMap
    };
    game.surpriseConfig.usedPairs = surpriseData.usedPairsNext || usedPairs;
    game.wheelHistory = { team1: [], team2: [] };
    game.wheelSpin = null;
    game.buzzer = { open: false, presses: [], byKey: {} };
  }

  /**
   * Ensures critical game branches exist before nested access.
   * @param {Object} game Raw game state.
   * @returns {Object} Normalized game state.
   */

  /**
   * Ensures nested object path exists and returns final object.
   * @param {Object} root Root object.
   * @param {...string} keys Path keys.
   * @returns {Object} Final nested object.
   */
  function ensurePath(root) {
    var keys = Array.prototype.slice.call(arguments, 1);
    var safeRoot = root && typeof root === 'object' ? root : {};
    var current = safeRoot;
    for (var i = 0; i < keys.length; i += 1) {
      var key = keys[i];
      if (!current[key] || typeof current[key] !== 'object' || Array.isArray(current[key])) {
        current[key] = {};
      }
      current = current[key];
    }
    return current;
  }

  function ensureGameDefaults(game) {
    var safeGame = game && typeof game === 'object' ? game : {};

    if (!safeGame.settings || typeof safeGame.settings !== 'object') {
      safeGame.settings = {};
    }
    if (!safeGame.settings.team1 || typeof safeGame.settings.team1 !== 'object') {
      safeGame.settings.team1 = { id: 'team1', name: 'الفريق الأول', color: '#e74c3c', direction: 'horizontal' };
    }
    if (!safeGame.settings.team2 || typeof safeGame.settings.team2 !== 'object') {
      safeGame.settings.team2 = { id: 'team2', name: 'الفريق الثاني', color: '#27ae60', direction: 'vertical' };
    }
    if (!safeGame.settings.bestOf) safeGame.settings.bestOf = 3;
    if (!safeGame.settings.currentRound) safeGame.settings.currentRound = 1;

    if (!safeGame.players || typeof safeGame.players !== 'object') {
      safeGame.players = {};
    }

    if (!safeGame.scores || typeof safeGame.scores !== 'object') {
      safeGame.scores = { team1Stars: 0, team2Stars: 0 };
    }
    if (typeof safeGame.scores.team1Stars !== 'number') safeGame.scores.team1Stars = Number(safeGame.scores.team1Stars || 0);
    if (typeof safeGame.scores.team2Stars !== 'number') safeGame.scores.team2Stars = Number(safeGame.scores.team2Stars || 0);

    if (!safeGame.surpriseConfig || typeof safeGame.surpriseConfig !== 'object') {
      safeGame.surpriseConfig = {};
    }
    if (!Array.isArray(safeGame.surpriseConfig.usedPairs)) {
      safeGame.surpriseConfig.usedPairs = [];
    }

    if (!safeGame.board || typeof safeGame.board !== 'object') {
      safeGame.board = {};
    }
    if (!Array.isArray(safeGame.board.cells) || safeGame.board.cells.length !== 25) {
      safeGame.board.cells = HEX_GRID.generateGrid();
    }
    if (!Array.isArray(safeGame.board.surpriseMap)) {
      safeGame.board.surpriseMap = Array.from({ length: 25 }, function () { return null; });
    }
    if (!safeGame.board.revealedMap || typeof safeGame.board.revealedMap !== 'object') {
      safeGame.board.revealedMap = {};
    }
    if (!safeGame.board.roundType) safeGame.board.roundType = 'normal';
    if (typeof safeGame.board.totalSurprises !== 'number') safeGame.board.totalSurprises = Number(safeGame.board.totalSurprises || 0);
    if (typeof safeGame.board.revealedCount !== 'number') safeGame.board.revealedCount = Number(safeGame.board.revealedCount || 0);

    if (!safeGame.wheelHistory || typeof safeGame.wheelHistory !== 'object') {
      safeGame.wheelHistory = { team1: [], team2: [] };
    }

    if (!safeGame.buzzer || typeof safeGame.buzzer !== 'object') {
      safeGame.buzzer = { open: false, presses: [], byKey: {} };
    } else {
      if (!Array.isArray(safeGame.buzzer.presses)) safeGame.buzzer.presses = [];
      if (!safeGame.buzzer.byKey || typeof safeGame.buzzer.byKey !== 'object') safeGame.buzzer.byKey = {};
      if (typeof safeGame.buzzer.open !== 'boolean') safeGame.buzzer.open = !!safeGame.buzzer.open;
    }

    if (!safeGame.currentTurn || typeof safeGame.currentTurn !== 'object') {
      safeGame.currentTurn = createFreshTurn(safeGame.phase || PHASES.SETUP);
    }
    if (!safeGame.phase) {
      safeGame.phase = safeGame.currentTurn.phase || PHASES.SETUP;
    }

    return safeGame;
  }

  /**
   * Starts opening question phase.
   * @param {Object} game Game state.
   */
  async function beginOpeningQuestion(game) {
    var opening = QUESTION_MANAGER.getOpeningQuestion();
    if (!opening) {
      await QUESTION_MANAGER.loadAllQuestions();
      opening = QUESTION_MANAGER.getOpeningQuestion();
    }
    if (!opening) {
      setText('refereeStatus', 'نفذت أسئلة الافتتاح');
      return;
    }

    game.currentTurn = Object.assign(createFreshTurn(PHASES.OPENING), {
      activeTeam: game.currentTurn && game.currentTurn.activeTeam ? game.currentTurn.activeTeam : null,
      selectedCategory: 'opening',
      currentQuestion: opening,
      message: '🎯 سؤال افتتاحي!'
    });
    game.phase = PHASES.OPENING;
    safeLog('PHASE_CHANGE', { to: PHASES.OPENING });
    if (game.board && game.board.roundType === 'finale') {
      setFeed(game, null, 'finaleStart', {});
    }
    await writeGame(game);
  }

  /**
   * Opens buzzer for current question.
   */
  async function askQuestion() {
    var game = await readGame();
    if (!game) return;

    var phase = game.currentTurn.phase;
    if (phase !== PHASES.OPENING && phase !== PHASES.SHOW_QUESTION && phase !== PHASES.JUDGING) {
      flashStateWarning();
      setText('refereeStatus', 'لا يمكن فتح البازر في هذه المرحلة');
      return;
    }

    await BUZZER_SYSTEM.openBuzzer();
    game = await readGame();

    var now = DATA_LAYER.getTimestamp();
    game.currentTurn.phase = PHASES.BUZZER_OPEN;
    game.phase = PHASES.BUZZER_OPEN;
    game.currentTurn.currentResponderIndex = 0;
    game.currentTurn.buzzerOpen = true;

    if (game.currentTurn.nextQuestionBlitz) {
      game.currentTurn.nextQuestionBlitz = false;
      game.currentTurn.blitzActive = true;
      game.currentTurn.blitzDeadline = now + 7000;
      game.currentTurn.buzzerDeadline = game.currentTurn.blitzDeadline;
    } else {
      game.currentTurn.blitzActive = false;
      game.currentTurn.blitzDeadline = null;
      game.currentTurn.buzzerDeadline = now + 10000;
    }

    if (game.currentTurn.freezePending && now < Number(game.currentTurn.freezeUntil || 0)) {
      game.currentTurn.freezePending = false;
      game.currentTurn.freezeActive = true;
    } else if (game.currentTurn.freezePending) {
      game.currentTurn.freezePending = false;
      game.currentTurn.freezeActive = false;
      game.currentTurn.frozenTeam = null;
      game.currentTurn.freezeUntil = null;
    }

    game.currentTurn.message = game.currentTurn.blitzActive ? '⚡ وضع السرعة مفعل' : '🔴 البازر مفتوح';
    await writeGame(game);
    safeLog('PHASE_CHANGE', { to: PHASES.BUZZER_OPEN });

    scheduleBlitzTimeout(game.currentTurn.buzzerDeadline);
  }

  /**
   * Schedules blitz timeout behavior.
   * @param {number|null} deadline Countdown deadline.
   */
  function scheduleBlitzTimeout(deadline) {
    clearBlitzTimeout();
    if (!deadline) return;

    var waitMs = Math.max(0, Number(deadline) - Date.now()) + 40;
    appState.blitzTimer = setTimeout(async function () {
      var game = await readGame();
      if (!game || !game.currentTurn || game.currentTurn.phase !== PHASES.BUZZER_OPEN) return;

      var order = await BUZZER_SYSTEM.getBuzzerOrder();
      if (order.length > 0) return;

      if (game.currentTurn.blitzActive) {
        await BUZZER_SYSTEM.closeBuzzer();
        game = await readGame();
        consumeQuestionEffects(game);

        if (game.currentTurn.selectedCategory === 'opening') {
          await writeGame(game);
          await beginOpeningQuestion(game);
          return;
        }

        game.currentTurn.phase = PHASES.CELL_RESULT;
        game.phase = PHASES.CELL_RESULT;
        game.currentTurn.message = '⚡ انتهى الوقت - الخلية بقيت فارغة';
        await writeGame(game);
        await delay(650);
        await startWheelSpin(game.currentTurn.activeTeam || game.currentTurn.originalActiveTeam || 'team1');
        return;
      }

      await BUZZER_SYSTEM.openBuzzer();
      game = await readGame();
      if (!game) return;

      game.currentTurn.phase = PHASES.BUZZER_OPEN;
      game.phase = PHASES.BUZZER_OPEN;
      game.currentTurn.currentResponderIndex = 0;
      game.currentTurn.buzzerOpen = true;
      game.currentTurn.buzzerDeadline = DATA_LAYER.getTimestamp() + 10000;
      game.currentTurn.message = '⌛ لم يضغط أحد - جولة باز جديدة لنفس السؤال (10 ثواني)';
      await writeGame(game);
      scheduleBlitzTimeout(game.currentTurn.buzzerDeadline);
    }, waitMs);
  }

  function clearBlitzTimeout() {
    if (!appState.blitzTimer) return;
    clearTimeout(appState.blitzTimer);
    appState.blitzTimer = null;
  }

  /**
   * Reopens buzzer for the same question with a fresh 10-second window.
   * @param {string} message Status text to show.
   */
  async function reopenSameQuestionBuzzer(message) {
    await BUZZER_SYSTEM.openBuzzer();
    var game = await readGame();
    if (!game) return;

    var deadline = DATA_LAYER.getTimestamp() + 10000;
    game.currentTurn.phase = PHASES.BUZZER_OPEN;
    game.phase = PHASES.BUZZER_OPEN;
    game.currentTurn.currentResponderIndex = 0;
    game.currentTurn.buzzerOpen = true;
    game.currentTurn.buzzerDeadline = deadline;
    game.currentTurn.message = message || '🔴 البازر ما زال مفتوحًا لنفس السؤال';

    await writeGame(game);
    scheduleBlitzTimeout(deadline);
  }

  async function markCorrect() {
    clearBlitzTimeout();
    var game = await readGame();
    if (!game) return;
    game = ensureGameDefaults(game);

    var order = await BUZZER_SYSTEM.getBuzzerOrder();
    if (!order.length) {
      setText('refereeStatus', 'لا يوجد ضاغطون');
      return;
    }

    var responderIndex = Number(game.currentTurn.currentResponderIndex || 0);
    var responder = order[responderIndex] || order[0];
    if (!responder) {
      setText('refereeStatus', 'لا يوجد ضاغط صالح للحكم');
      return;
    }
    var responderTeam = normalizeTeamId(responder.team) || normalizeTeamId(game.currentTurn.activeTeam) || normalizeTeamId(game.currentTurn.originalActiveTeam) || 'team1';

    await BUZZER_SYSTEM.closeBuzzer();
    game = await readGame();
    if (!game) return;
    game = ensureGameDefaults(game);
    consumeQuestionEffects(game);
    var buzzMs = Number(responder.timestamp || 0) - Number(game.buzzer && game.buzzer.openedAt || responder.timestamp || 0);
    try {
      await STATS_TRACKER.recordBuzzTime(responder.playerId, responder.playerName, Math.max(1, buzzMs), responderTeam);
      await STATS_TRACKER.recordCorrectAnswer(responder.playerId, responder.playerName, responderTeam);
    } catch (statsError) {
      console.warn('⚠️ stats update skipped on correct answer', statsError);
    }

    if (game.currentTurn.selectedCategory === 'opening') {
      var openingLoser = responderTeam === 'team1' ? 'team2' : 'team1';
      game.currentTurn.activeTeam = responderTeam;
      game.currentTurn.letterTeam = responderTeam;
      game.currentTurn.categoryTeam = openingLoser;
      game.currentTurn.phase = PHASES.CELL_RESULT;
      game.phase = PHASES.CELL_RESULT;
      game.currentTurn.message = 'الفريق ' + getTeamName(game.settings, responderTeam) + ' يبدأ الدور';
      safeLog('ANSWER_CORRECT', { playerId: responder.playerId, playerName: responder.playerName, team: responderTeam, opening: true });
      setFeed(game, 'correct', 'correctAnswer', {
        player: responder.playerName,
        team: getTeamName(game.settings, responderTeam),
        opponent: getTeamName(game.settings, openingLoser)
      });
      await writeGame(game);
      await delay(700);
      await startWheelSpin(game.currentTurn.letterTeam, 'letter');
      return;
    }

    var selectedCell = Number(game.currentTurn.selectedCell);
    var cells = game.board && Array.isArray(game.board.cells) ? game.board.cells : [];
    if (!cells[selectedCell]) return;

    cells[selectedCell].owner = responderTeam;
    cells[selectedCell].selected = false;
    if (game.currentTurn.autoShieldPending && game.currentTurn.autoShieldTeam === responderTeam) {
      cells[selectedCell].shielded = true;
      game.currentTurn.autoShieldPending = false;
      game.currentTurn.autoShieldTeam = null;
      game.currentTurn.autoShieldConsumedAt = DATA_LAYER.getTimestamp();
    }
    await STATS_TRACKER.recordCellCaptured(responderTeam);

    game.currentTurn.activeTeam = responderTeam;
    game.currentTurn.lastCorrectResponder = {
      playerId: responder.playerId,
      playerName: responder.playerName,
      team: responderTeam
    };
    game.currentTurn.phase = PHASES.CELL_RESULT;
    game.phase = PHASES.CELL_RESULT;
    game.currentTurn.message = '✅ إجابة صحيحة: ' + responder.playerName;
    game.currentTurn.resolvedCapturedCells = [selectedCell];
    game.currentTurn.letterTeam = responderTeam;
    game.currentTurn.categoryTeam = responderTeam === 'team1' ? 'team2' : 'team1';
    safeLog('ANSWER_CORRECT', { playerId: responder.playerId, playerName: responder.playerName, team: responderTeam, opening: false });
    safeLog('CELL_CAPTURED', { cellIndex: selectedCell, team: responderTeam, playerId: responder.playerId });
    setFeed(game, 'correct', 'correctAnswer', {
      player: responder.playerName,
      team: getTeamName(game.settings, responderTeam),
      opponent: getTeamName(game.settings, responderTeam === 'team1' ? 'team2' : 'team1')
    });

    await processCapturedCell(game, selectedCell, Object.assign({}, responder, { team: responderTeam }));
  }

  async function markWrong() {
    clearBlitzTimeout();
    var game = await readGame();
    if (!game) return;

    var order = await BUZZER_SYSTEM.getBuzzerOrder();
    if (!order.length) {
      setText('refereeStatus', 'لا يوجد ضاغطون');
      return;
    }

    await BUZZER_SYSTEM.closeBuzzer();
    game = await readGame();

    var responderIndex = Number(game.currentTurn.currentResponderIndex || 0);
    var currentResponder = order[responderIndex] || order[0];
    if (!currentResponder) {
      setText('refereeStatus', 'لا يوجد ضاغط صالح للحكم');
      return;
    }
    var wrongTeam = normalizeTeamId(currentResponder.team) || normalizeTeamId(game.currentTurn.activeTeam) || 'team1';
    safeLog('ANSWER_WRONG', { playerId: currentResponder.playerId, playerName: currentResponder.playerName, team: wrongTeam });
    try {
      await STATS_TRACKER.recordWrongAnswer(currentResponder.playerId, currentResponder.playerName, wrongTeam);
    } catch (statsError) {
      console.warn('⚠️ stats update skipped on wrong answer', statsError);
    }

    if (game.currentTurn.selectedCategory === 'opening') {
      var oppositeIndex = findNextOppositeTeam(order, responderIndex, currentResponder.team);
      if (oppositeIndex !== -1) {
        game.currentTurn.currentResponderIndex = oppositeIndex;
        game.currentTurn.phase = PHASES.JUDGING;
        game.phase = PHASES.JUDGING;
        game.currentTurn.message = '❌ خاطئة - الفرصة الآن لخصمهم';
        setFeed(game, 'wrong', 'wrongAnswer', {
          player: currentResponder.playerName,
          team: getTeamName(game.settings, wrongTeam),
          opponent: getTeamName(game.settings, wrongTeam === 'team1' ? 'team2' : 'team1')
        });
        await writeGame(game);
        return;
      }

      await writeGame(game);
      await reopenSameQuestionBuzzer('❌ خاطئة - ما زال نفس السؤال قائمًا (10 ثواني باز جديدة)');
      return;
    }

    var nextOppositeIndex = findNextOppositeTeam(order, responderIndex, currentResponder.team);
    if (nextOppositeIndex !== -1) {
      game.currentTurn.currentResponderIndex = nextOppositeIndex;
      game.currentTurn.phase = PHASES.JUDGING;
      game.phase = PHASES.JUDGING;
      game.currentTurn.message = '❌ خاطئة - انتقلت الفرصة لأول لاعب من الفريق الخصم';
      setFeed(game, 'wrong', 'wrongAnswer', {
        player: currentResponder.playerName,
        team: getTeamName(game.settings, wrongTeam),
        opponent: getTeamName(game.settings, wrongTeam === 'team1' ? 'team2' : 'team1')
      });
      await writeGame(game);
      return;
    }

    await writeGame(game);
    await reopenSameQuestionBuzzer('❌ لا يوجد خصم في ترتيب الباز - نفس السؤال مستمر (10 ثواني)');
  }

  async function skipQuestion() {
    var game = await readGame();
    if (!game) return;

    if (game.currentTurn && game.currentTurn.selectedCategory === 'opening') {
      await BUZZER_SYSTEM.closeBuzzer();
      game = await readGame();
      if (!game) return;
      consumeQuestionEffects(game);
      game.currentTurn.currentResponderIndex = 0;
      await writeGame(game);
      await beginOpeningQuestion(game);
      return;
    }

    if (typeof game.currentTurn.selectedCell !== 'number') return;

    var letter = game.currentTurn.selectedLetter;
    var randomCategory = QUESTION_MANAGER.getRandomCategory(game.currentTurn.selectedCategory || null);
    var replacement = QUESTION_MANAGER.getQuestion(letter, randomCategory);
    if (!replacement) return;

    game.currentTurn.phase = PHASES.SHOW_QUESTION;
    game.phase = PHASES.SHOW_QUESTION;
    game.currentTurn.currentQuestion = replacement;
    game.currentTurn.selectedCategory = replacement.categoryId;
    game.currentTurn.currentResponderIndex = 0;
    game.currentTurn.message = '⏭️ تم سحب سؤال جديد';
    await writeGame(game);
  }

  async function processCapturedCell(game, cellIndex, responder) {
    var surpriseType = SURPRISE_ENGINE.revealSurprise(cellIndex, game.board.surpriseMap, game.board.revealedMap || {});

    if (!surpriseType) {
      await writeGame(game);
      await finalizeAfterBoardUpdate(game, responder.team);
      return;
    }

    game.board.revealedMap[cellIndex] = true;
    game.board.revealedCount = Number(game.board.revealedCount || 0) + 1;

    var effect = SURPRISE_ENGINE.executeSurprise(surpriseType, {
      board: game.board.cells,
      selectedCell: cellIndex,
      winnerTeam: responder.team,
      surpriseMap: game.board.surpriseMap
    });

    game.currentTurn.revealedSurprise = {
      id: 'rv_' + DATA_LAYER.getTimestamp() + '_' + cellIndex,
      type: surpriseType,
      cellIndex: cellIndex,
      team: responder.team,
      message: effect.message
    };
    safeLog('SURPRISE_TRIGGERED', {
      surprise: surpriseType,
      cellIndex: cellIndex,
      team: responder.team
    });
    game.currentTurn.phase = PHASES.SURPRISE_REVEAL;
    game.phase = PHASES.SURPRISE_REVEAL;
    game.currentTurn.message = effect.message;

    await writeGame(game);
    await delay(2200);

    game = await readGame();
    if (!game) return;

    if (effect.nextQuestionBlitz) {
      game.currentTurn.nextQuestionBlitz = true;
    }

    if (effect.freezeTeam) {
      game.currentTurn.frozenTeam = effect.freezeTeam;
      game.currentTurn.freezeUntil = DATA_LAYER.getTimestamp() + 10000;
      game.currentTurn.freezePending = true;
      game.currentTurn.freezeActive = false;
    }

    if (effect.requiresSteal) {
      await startRaidSteal(game, responder);
      return;
    }

    game.currentTurn.phase = PHASES.CELL_RESULT;
    game.phase = PHASES.CELL_RESULT;
    await writeGame(game);
    await finalizeAfterBoardUpdate(game, responder.team);
  }

  async function startRaidSteal(game, responder) {
    var winnerTeam = normalizeTeamId(responder.team) || normalizeTeamId(game.currentTurn.activeTeam) || 'team1';
    var targetTeam = winnerTeam === 'team1' ? 'team2' : 'team1';
    var opponentCells = (game.board.cells || []).filter(function (cell) {
      return normalizeTeamId(cell.owner) === targetTeam;
    });

    if (!opponentCells.length) {
      game.currentTurn.phase = PHASES.CELL_RESULT;
      game.phase = PHASES.CELL_RESULT;
      game.currentTurn.message = '🏴‍☠️ سطو... لكن لا يوجد ما يُسرق!';
      await writeGame(game);
      await finalizeAfterBoardUpdate(game, winnerTeam);
      return;
    }

    game.currentTurn.phase = PHASES.SELECT_STEAL;
    game.phase = PHASES.SELECT_STEAL;
    game.currentTurn.stealingPlayer = responder.playerId;
    game.currentTurn.stealingPlayerName = responder.playerName;
    game.currentTurn.stealFromTeam = targetTeam;
    game.currentTurn.stolenCell = null;
    game.currentTurn.stealDeadline = DATA_LAYER.getTimestamp() + 10000;
    game.currentTurn.message = '🏴‍☠️ ' + responder.playerName + ' يختار خلية للسطو';

    await writeGame(game);
    scheduleStealTimeout();
  }

  async function resolveStealSelection(game) {
    if (appState.processingSteal) return;
    appState.processingSteal = true;

    clearStealTimeout();

    try {
      var turn = game.currentTurn;
      var winnerTeam = normalizeTeamId(turn.lastCorrectResponder && turn.lastCorrectResponder.team) || normalizeTeamId(turn.activeTeam) || 'team1';
      var targetTeam = normalizeTeamId(turn.stealFromTeam) || (winnerTeam === 'team1' ? 'team2' : 'team1');
      var cells = game.board.cells || [];

      var target = Number(turn.stolenCell);
      if (!cells[target] || normalizeTeamId(cells[target].owner) !== targetTeam) {
        target = pickRandomOpponentCell(cells, targetTeam);
      }

      if (target === null || target === -1 || !cells[target]) {
        turn.message = '🏴‍☠️ السطو انتهى بدون هدف';
      } else if (cells[target].shielded) {
        turn.message = '🛡️ الدرع صد السطو!';
      } else {
        cells[target].owner = winnerTeam;
        turn.message = '🏴‍☠️ تم السطو بنجاح';
      }

      turn.phase = PHASES.CELL_RESULT;
      game.phase = PHASES.CELL_RESULT;
      await writeGame(game);
      await finalizeAfterBoardUpdate(game, winnerTeam);
    } finally {
      appState.processingSteal = false;
    }
  }

  async function startWheelSpin(teamId, mode) {
    var game = await readGame();
    if (!game) return;
    game = ensureGameDefaults(game);

    var safeMode = mode === 'category' ? 'category' : 'letter';
    var wheelPhase = safeMode === 'category' ? PHASES.WHEEL_CATEGORY : PHASES.WHEEL_LETTER;
    var nextPhase = safeMode === 'category' ? PHASES.SELECT_CATEGORY : PHASES.SELECT_CELL;
    var safeTeamId = normalizeTeamId(teamId) || 'team1';
    var players = WHEEL_SPINNER.getLiveTeamCandidates(game.players || {}, safeTeamId, Date.now());
    if (!players.length) {
      // Backward compatibility: if heartbeat flags are missing, allow team players to keep game flow moving.
      players = getTeamPlayers(game.players || {}, safeTeamId);
      if (!players.length) {
        setText('refereeStatus', '⚠️ لا يوجد لاعب متصل في ' + getTeamName(game.settings, safeTeamId));
        return;
      }
    }

    var history = game.wheelHistory && Array.isArray(game.wheelHistory[safeTeamId]) ? game.wheelHistory[safeTeamId] : [];
    var result = WHEEL_SPINNER.spinWheel(players, history);
    if (!result.selectedPlayer) return;

    ensurePath(game, 'wheelHistory')[safeTeamId] = result.nextHistory;
    var spinId = 'spin_' + DATA_LAYER.getTimestamp();

    game.currentTurn.phase = wheelPhase;
    game.phase = wheelPhase;
    safeLog('PHASE_CHANGE', { to: wheelPhase, team: safeTeamId, mode: safeMode });
    game.currentTurn.activeTeam = safeTeamId;
    game.currentTurn.selectedPlayer = null;
    if (safeMode === 'letter') {
      game.currentTurn.selectedCell = null;
      game.currentTurn.selectedLetter = null;
      game.currentTurn.selectedCategory = null;
      game.currentTurn.selectedCategoryPlayer = null;
      game.currentTurn.categoryDeadline = null;
      game.currentTurn.categorySelectedAt = null;
      game.currentTurn.currentQuestion = null;
      game.currentTurn.selectedLetterPlayer = null;
    } else {
      game.currentTurn.selectedCategory = null;
      game.currentTurn.currentQuestion = null;
      game.currentTurn.selectedCategoryPlayer = null;
    }
    game.currentTurn.message = safeMode === 'category' ? '🎲 تدوير عجلة اختيار الفئة...' : '🎲 تدوير عجلة اختيار الحرف...';

    game.wheelSpin = {
      spinId: spinId,
      kind: safeMode,
      spinning: true,
      teamId: safeTeamId,
      teamName: getTeamName(game.settings, safeTeamId),
      teamColor: getTeamColor(game.settings, safeTeamId),
      candidates: result.candidates.map(function (p) { return p.name; }),
      selectedPlayer: null,
      selectedPlayerName: null
    };

    await writeGame(game);
    await delay(350);

    game = await readGame();
    if (!game) return;
    game = ensureGameDefaults(game);
    if (!game.wheelSpin || typeof game.wheelSpin !== 'object') {
      game.wheelSpin = {
        spinId: spinId,
        kind: safeMode,
        spinning: false,
        teamId: safeTeamId,
        teamName: getTeamName(game.settings, safeTeamId),
        teamColor: getTeamColor(game.settings, safeTeamId),
        candidates: result.candidates.map(function (p) { return p.name; }),
        selectedPlayer: null,
        selectedPlayerName: null
      };
    }

    game.wheelSpin.spinning = false;
    game.wheelSpin.selectedPlayer = result.selectedPlayer.id;
    game.wheelSpin.selectedPlayerName = result.selectedPlayer.name;

    game.currentTurn.phase = nextPhase;
    game.phase = nextPhase;
    safeLog('PHASE_CHANGE', { to: nextPhase, team: safeTeamId, mode: safeMode });
    game.currentTurn.selectedPlayer = result.selectedPlayer.id;
    if (safeMode === 'category') {
      game.currentTurn.selectedCategoryPlayer = result.selectedPlayer.id;
      game.currentTurn.categoryDeadline = DATA_LAYER.getTimestamp() + 10000;
      game.currentTurn.message = '🎲 ' + result.selectedPlayer.name + ' - اختر التصنيف';
    } else {
      game.currentTurn.selectedLetterPlayer = result.selectedPlayer.id;
      game.currentTurn.letterDeadline = DATA_LAYER.getTimestamp() + 15000;
      game.currentTurn.message = '🎲 ' + result.selectedPlayer.name + ' - اختر خلية';
    }

    await writeGame(game);
  }

  async function finalizeAfterBoardUpdate(game, preferredTeam) {
    var safePreferred = normalizeTeamId(preferredTeam) || normalizeTeamId(game.currentTurn.activeTeam) || normalizeTeamId(game.currentTurn.originalActiveTeam);
    applyComebackShield(game);
    var winner = detectRoundWinner(game, safePreferred);
    if (winner.won) {
      await handleRoundWin(game, winner.team, winner.path);
      return;
    }

    await writeGame(game);
    await delay(650);
    await startWheelSpin(safePreferred || 'team1');
  }

  async function handleRoundWin(game, winnerTeam, path) {
    var needed = Math.floor(Number(game.settings.bestOf || 3) / 2) + 1;

    if (winnerTeam === 'team1') game.scores.team1Stars = Number(game.scores.team1Stars || 0) + 1;
    if (winnerTeam === 'team2') game.scores.team2Stars = Number(game.scores.team2Stars || 0) + 1;

    game.currentTurn.winningPath = path.slice();
    game.currentTurn.roundWinner = winnerTeam;
    game.currentTurn.roundWinAt = DATA_LAYER.getTimestamp();

    var stars = winnerTeam === 'team1' ? game.scores.team1Stars : game.scores.team2Stars;
    if (stars >= needed) {
      game.currentTurn.phase = PHASES.MATCH_END;
      game.phase = PHASES.MATCH_END;
      game.currentTurn.matchWinner = winnerTeam;
      game.currentTurn.message = '🏆🏆🏆 ' + getTeamName(game.settings, winnerTeam) + ' أبطال المباراة!';
      setFeed(game, 'matchWin', 'matchWin', {
        team: getTeamName(game.settings, winnerTeam)
      });
      safeLog('MATCH_WIN', { team: winnerTeam, round: Number(game.settings.currentRound || 1) });
      safeLog('PHASE_CHANGE', { to: PHASES.MATCH_END, team: winnerTeam });
    } else {
      game.currentTurn.phase = PHASES.ROUND_END;
      game.phase = PHASES.ROUND_END;
      game.currentTurn.message = '🏆 ' + getTeamName(game.settings, winnerTeam) + ' يفوز بالجولة!';
      setFeed(game, 'roundWin', 'roundWin', {
        team: getTeamName(game.settings, winnerTeam)
      });
      safeLog('ROUND_WIN', { team: winnerTeam, round: Number(game.settings.currentRound || 1) });
      safeLog('PHASE_CHANGE', { to: PHASES.ROUND_END, team: winnerTeam });
    }

    await writeGame(game);
  }

  async function advanceToNextRound() {
    var game = await readGame();
    if (!game || game.currentTurn.phase !== PHASES.ROUND_END) return;
    game.settings.currentRound = Number(game.settings.currentRound || 1) + 1;
    await setupRoundBoard(game);
    await beginOpeningQuestion(game);
  }

  async function resetMatch() {
    var game = await readGame();
    if (!game) return;

    game.settings.currentRound = 1;
    game.scores = { team1Stars: 0, team2Stars: 0 };
    game.surpriseConfig = { usedPairs: [] };
    game.board.cells = HEX_GRID.generateGrid();
    game.board.surpriseMap = Array.from({ length: 25 }, function () { return null; });
    game.board.revealedMap = {};
    game.board.roundType = 'normal';
    game.board.selectedPair = null;
    game.board.totalSurprises = 0;
    game.board.revealedCount = 0;
    game.currentTurn = createFreshTurn(PHASES.WAITING_PLAYERS);
    game.phase = PHASES.WAITING_PLAYERS;
    game.wheelHistory = { team1: [], team2: [] };
    game.wheelSpin = null;
    game.buzzer = { open: false, presses: [], byKey: {} };

    await writeGame(game);
  }

  function handleGameChange(game) {
    if (!appState.isAuthenticated) {
      return;
    }
    if (!appState.roomSelected) {
      return;
    }

    var activePin = sanitizeRoomPin(DATA_LAYER.getRoomPin() || appState.activeRoomPin || '');
    if (activePin) {
      appState.activeRoomPin = activePin;
    }

    if (!game || typeof game !== 'object') {
      renderGameCode(null);
      if (appState.isAuthenticated && appState.roomSelected && !appState.isStartingMatch) {
        showScreen('setup');
        setText('setupStatus', 'لا توجد مباراة محفوظة لهذه الغرفة. يمكنك إعداد مباراة جديدة.');
      }
      updateRoomIndexFromGame(activePin, null).catch(function (error) {
        console.warn('⚠️ room index sync failed for empty room:', error);
      });
      return;
    }
    appState.lastGame = game;
    updateRoomIndexFromGame(activePin, game).catch(function (error) {
      console.warn('⚠️ room index sync failed:', error);
    });

    var turn = game.currentTurn || createFreshTurn(PHASES.SETUP);
    var phase = turn.phase || PHASES.SETUP;

    if (phase === PHASES.SETUP) showScreen('setup');
    else if (phase === PHASES.WAITING_PLAYERS) showScreen('waiting');
    else showScreen('game');

    renderGameCode(game.settings || null);
    renderPlayers(game.players || {});
    renderMiniGrid(game);
    renderCurrentQuestion(turn);
    notifyBuzzArrival(game);
    renderBuzzerOrder(game.buzzer && game.buzzer.presses ? game.buzzer.presses : [], game.settings || null);
    renderPhaseUi(game, phase);
    renderDebugPanel(game, phase);

    var startRoundBtn = document.getElementById('startRoundBtn');
    if (startRoundBtn) {
      startRoundBtn.disabled = false;
    }

    var playersSummary = buildPlayersSummary(game.players || {});
    if (phase === PHASES.WAITING_PLAYERS) {
      if (!playersSummary.onlineTotal) {
        setText('startRoundHint', '⚠️ لا يوجد لاعبين! يمكنك البدء للاختبار');
      } else if (!playersSummary.team1Online || !playersSummary.team2Online) {
        setText('startRoundHint', '⚠️ الفرق غير مكتملة: يجب وجود لاعب واحد على الأقل في كل فريق');
      } else {
        setText('startRoundHint', '✅ اللاعبون جاهزون لبدء الجولة');
      }
    } else {
      setText('startRoundHint', '');
    }

    document.getElementById('nextRoundBtn').classList.toggle('hidden', phase !== PHASES.ROUND_END);
    document.getElementById('newMatchBtn').classList.toggle('hidden', phase !== PHASES.MATCH_END);

    if (phase === PHASES.SELECT_CELL) {
      if (typeof turn.selectedCell === 'number' && !turn.selectedCategory && !appState.processingCellPick) {
        resolveLetterSelection(game);
      }
    }

    if (phase === PHASES.SELECT_CATEGORY) {
      if (turn.selectedCategory && !turn.currentQuestion && !appState.processingCategory) resolveCategorySelection(game);
      if (!turn.selectedCategory) scheduleCategoryTimeout();
    } else {
      clearCategoryTimeout();
    }

    if (phase === PHASES.SELECT_STEAL) {
      if (turn.stolenCell !== null && turn.stolenCell !== undefined && !appState.processingSteal) resolveStealSelection(game);
      else scheduleStealTimeout();
    } else {
      clearStealTimeout();
    }

    appState.lastPhase = phase;
  }

  /**
   * Resolves player letter choice and moves flow to category wheel.
   * @param {Object} game Game state.
   */
  async function resolveLetterSelection(game) {
    if (appState.processingCellPick) return;
    appState.processingCellPick = true;
    try {
      var turn = game.currentTurn || {};
      if (turn.phase !== PHASES.SELECT_CELL) return;
      var selectedCell = Number(turn.selectedCell);
      if (!Number.isFinite(selectedCell)) return;
      var cells = game.board && Array.isArray(game.board.cells) ? game.board.cells : [];
      var cell = cells[selectedCell];
      if (!cell) return;

      game.currentTurn.selectedLetter = String(turn.selectedLetter || cell.letter || '');
      game.currentTurn.message = '🔤 تم اختيار الحرف: ' + game.currentTurn.selectedLetter;
      await writeGame(game);
      await delay(220);

      var categoryTeam = normalizeTeamId(game.currentTurn.categoryTeam) ||
        (normalizeTeamId(game.currentTurn.letterTeam) === 'team1' ? 'team2' : 'team1');
      await startWheelSpin(categoryTeam, 'category');
    } finally {
      appState.processingCellPick = false;
    }
  }

  /**
   * Plays alert when a new buzz is received.
   * @param {Object} game Game state.
   */
  function notifyBuzzArrival(game) {
    var ordered = (game.buzzer && Array.isArray(game.buzzer.presses) ? game.buzzer.presses : []).slice().sort(function (a, b) {
      return Number(a.timestamp || 0) - Number(b.timestamp || 0);
    });
    if (!ordered.length) {
      appState.lastBuzzAlertKey = null;
      return;
    }

    var first = ordered[0];
    var key = String(first.playerId || '') + '_' + String(first.timestamp || '');
    if (key === appState.lastBuzzAlertKey) return;
    appState.lastBuzzAlertKey = key;

    SOUND_EFFECTS.playBuzzerPress();
    if (navigator.vibrate) {
      navigator.vibrate(180);
    }
  }

  async function resolveCategorySelection(game) {
    appState.processingCategory = true;
    try {
      var question = QUESTION_MANAGER.getQuestion(game.currentTurn.selectedLetter, game.currentTurn.selectedCategory);
      if (!question) return;

      game.currentTurn.phase = PHASES.SHOW_QUESTION;
      game.phase = PHASES.SHOW_QUESTION;
      game.currentTurn.currentQuestion = question;
      game.currentTurn.currentResponderIndex = 0;
      game.currentTurn.buzzerOpen = false;
      game.currentTurn.originalActiveTeam = game.currentTurn.activeTeam;
      game.currentTurn.message = game.currentTurn.nextQuestionBlitz ? '⚡ السؤال القادم بسرعة' : 'السؤال جاهز';
      await writeGame(game);
      safeLog('PHASE_CHANGE', {
        to: PHASES.SHOW_QUESTION,
        category: game.currentTurn.selectedCategory,
        letter: game.currentTurn.selectedLetter
      });
    } finally {
      appState.processingCategory = false;
    }
  }

  function scheduleCategoryTimeout() {
    if (appState.categoryTimer) return;
    appState.categoryTimer = setTimeout(async function () {
      appState.categoryTimer = null;
      var game = await readGame();
      if (!game || game.currentTurn.phase !== PHASES.SELECT_CATEGORY || game.currentTurn.selectedCategory) return;
      var selectable = QUESTION_MANAGER.getSelectableCategories();
      if (!selectable.length) return;
      var random = selectable[Math.floor(Math.random() * selectable.length)];
      await DATA_LAYER.writeData('game.currentTurn.selectedCategory', random.id);
      await DATA_LAYER.writeData('game.currentTurn.categorySelectedAt', DATA_LAYER.getTimestamp());
    }, 10000);
  }

  function clearCategoryTimeout() {
    if (!appState.categoryTimer) return;
    clearTimeout(appState.categoryTimer);
    appState.categoryTimer = null;
  }

  function scheduleStealTimeout() {
    if (appState.stealTimer) return;
    appState.stealTimer = setTimeout(async function () {
      appState.stealTimer = null;
      var game = await readGame();
      if (!game || game.currentTurn.phase !== PHASES.SELECT_STEAL || game.currentTurn.stolenCell !== null) return;
      var randomTarget = pickRandomOpponentCell(game.board.cells || [], game.currentTurn.stealFromTeam);
      await DATA_LAYER.writeData('game.currentTurn.stolenCell', randomTarget);
    }, 10000);
  }

  function clearStealTimeout() {
    if (!appState.stealTimer) return;
    clearTimeout(appState.stealTimer);
    appState.stealTimer = null;
  }

  function renderPlayers(playersObj) {
    var game = appState.lastGame || {};
    var settings = game.settings || null;
    var team1Title = document.getElementById('team1PlayersTitle');
    var team2Title = document.getElementById('team2PlayersTitle');
    var team1List = document.getElementById('team1PlayersList');
    var team2List = document.getElementById('team2PlayersList');
    var fallbackList = document.getElementById('playersList');

    if (team1Title) {
      team1Title.textContent = '🔴 ' + (settings && settings.team1 ? settings.team1.name : 'الفريق الأول');
    }
    if (team2Title) {
      team2Title.textContent = '🟢 ' + (settings && settings.team2 ? settings.team2.name : 'الفريق الثاني');
    }
    if (team1List) team1List.innerHTML = '';
    if (team2List) team2List.innerHTML = '';
    if (fallbackList) fallbackList.innerHTML = '';

    var summary = buildPlayersSummary(playersObj || {});
    var sorted = summary.players.filter(function (player) { return !!player; }).slice().sort(function (a, b) {
      return Number(a.joinedAt || 0) - Number(b.joinedAt || 0);
    });

    sorted.forEach(function (player) {
      var teamId = normalizeTeamId(player.teamId || player.team) || 'team1';
      var targetList = teamId === 'team2' ? team2List : team1List;
      var row = document.createElement('li');
      row.className = summary.isOnline(player) ? 'player-online' : 'player-offline';

      var dot = document.createElement('span');
      dot.className = 'player-status-dot ' + (summary.isOnline(player) ? 'online' : 'offline');
      row.appendChild(dot);

      var text = document.createElement('span');
      text.textContent = (player.name || 'لاعب') + (summary.isOnline(player) ? '' : ' (غير متصل)');
      row.appendChild(text);

      if (Date.now() - Number(player.joinedAt || 0) < 30000) {
        var badge = document.createElement('span');
        badge.className = 'player-new-badge';
        badge.textContent = '🆕 جديد';
        row.appendChild(badge);
      }

      if (targetList) {
        targetList.appendChild(row);
      } else if (fallbackList) {
        fallbackList.appendChild(row);
      }
    });

    setText('playersCountText', '👥 ' + summary.onlineTotal + ' لاعبين متصلين');
    setText('teamsOnlineCountText', '🔴 ' + summary.team1Online + ' | 🟢 ' + summary.team2Online);
  }

  function renderMiniGrid(game) {
    HEX_GRID.renderGrid(document.getElementById('refereeMiniGrid'), game.board.cells || [], {
      clickable: true,
      miniMode: true,
      showLetters: true,
      onCellClick: handleCellSelection
    });

    if (Array.isArray(game.currentTurn.winningPath) && game.currentTurn.winningPath.length) {
      HEX_GRID.highlightWinningPath(game.currentTurn.winningPath, game.currentTurn.roundWinner || game.currentTurn.matchWinner || 'team1');
    }
  }

  async function handleCellSelection(cellIndex) {
    if (appState.overrideMode) {
      appState.overrideSelectedCell = Number(cellIndex);
      var gameForHint = await readGame();
      var hintLetter = gameForHint && gameForHint.board && gameForHint.board.cells && gameForHint.board.cells[cellIndex]
        ? gameForHint.board.cells[cellIndex].letter
        : '-';
      setText('overrideHint', 'تم اختيار الخلية [' + hintLetter + '] — اختر الإجراء الآن');
      HEX_GRID.clearHighlights();
      HEX_GRID.highlightCell(Number(cellIndex), '#ffd700');
      return;
    }

    var game = await readGame();
    if (!game || game.currentTurn.phase !== PHASES.SELECT_CELL) return;

    var cell = game.board.cells[cellIndex];
    if (!cell || normalizeTeamId(cell.owner)) return;

    game.currentTurn.selectedCell = cellIndex;
    game.currentTurn.selectedLetter = cell.letter;
    game.currentTurn.selectedCategory = null;
    game.currentTurn.currentQuestion = null;
    game.currentTurn.phase = PHASES.SELECT_CATEGORY;
    game.currentTurn.message = 'بانتظار اختيار التصنيف من اللاعب';
    game.phase = PHASES.SELECT_CATEGORY;
    safeLog('PHASE_CHANGE', { to: PHASES.SELECT_CATEGORY, cellIndex: cellIndex, letter: cell.letter });

    await writeGame(game);
  }

  /**
   * Toggles manual override panel visibility and mode.
   */
  function toggleOverridePanel() {
    appState.overrideMode = !appState.overrideMode;
    appState.overrideSelectedCell = null;
    var panel = document.getElementById('overridePanel');
    var btn = document.getElementById('toggleOverrideBtn');
    if (panel) {
      panel.classList.toggle('hidden', !appState.overrideMode);
    }
    if (btn) {
      btn.textContent = appState.overrideMode ? '✅ إنهاء التعديل' : '🎨 تعديل يدوي';
    }
    setText('overrideHint', appState.overrideMode ? 'اختر خلية من الشبكة ثم اختر الإجراء.' : 'وضع التعديل اليدوي متوقف');
    HEX_GRID.clearHighlights();
  }

  /**
   * Applies manual owner override to selected cell.
   * @param {'team1'|'team2'|null} newOwner Target owner or null.
   */
  async function applyManualOverride(newOwner) {
    if (!appState.overrideMode) return;
    if (appState.overrideSelectedCell === null || appState.overrideSelectedCell === undefined) {
      setText('overrideHint', 'اختر خلية أولاً من الشبكة');
      return;
    }

    var game = await readGame();
    if (!game || !game.board || !Array.isArray(game.board.cells)) return;
    var cell = game.board.cells[appState.overrideSelectedCell];
    if (!cell) return;

    var oldOwner = normalizeTeamId(cell.owner);
    var safeOwner = normalizeTeamId(newOwner);
    if (oldOwner === safeOwner) {
      setText('overrideHint', 'لا يوجد تغيير على هذه الخلية');
      return;
    }

    cell.owner = safeOwner;
    cell.selected = false;

    appState.overrideHistory.push({
      cellIndex: appState.overrideSelectedCell,
      letter: cell.letter || '',
      oldOwner: oldOwner,
      newOwner: safeOwner,
      timestamp: DATA_LAYER.getTimestamp()
    });
    if (appState.overrideHistory.length > 5) {
      appState.overrideHistory.shift();
    }

    var ownerLabel = safeOwner === 'team1' ? '🔴' : (safeOwner === 'team2' ? '🟢' : '⬡');
    setText('overrideLast', '📝 آخر تعديل: [' + (cell.letter || '-') + '] → ' + ownerLabel);
    setText('overrideHint', 'تم تطبيق التعديل اليدوي');

    var win = detectRoundWinner(game, safeOwner || oldOwner || 'team1');
    if (win.won) {
      game.currentTurn.winningPath = win.path || [];
    }

    await writeGame(game);
  }

  /**
   * Reverts the most recent manual override action.
   */
  async function undoManualOverride() {
    if (!appState.overrideHistory.length) {
      setText('overrideHint', 'لا يوجد تعديلات للتراجع');
      return;
    }

    var last = appState.overrideHistory.pop();
    var game = await readGame();
    if (!game || !game.board || !Array.isArray(game.board.cells)) return;

    var cell = game.board.cells[last.cellIndex];
    if (!cell) return;

    cell.owner = last.oldOwner;
    cell.selected = false;
    appState.overrideSelectedCell = last.cellIndex;
    setText('overrideLast', '📝 تراجع: [' + (cell.letter || '-') + ']');
    setText('overrideHint', 'تم التراجع عن آخر تعديل');

    var win = detectRoundWinner(game, last.oldOwner || last.newOwner || 'team1');
    game.currentTurn.winningPath = win.won ? (win.path || []) : [];
    await writeGame(game);
  }

  /**
   * Renders question/answer block.
   * @param {Object} turn Current turn.
   */
  function renderCurrentQuestion(turn) {
    if (!turn.currentQuestion) {
      setText('currentCategory', 'التصنيف');
      setText('currentQuestion', 'سيظهر السؤال هنا');
      setText('currentAnswer', 'الإجابة: —');
      return;
    }

    setText('currentCategory', turn.selectedCategory === 'opening' ? '🎯 سؤال افتتاحي' : (turn.currentQuestion.category || 'تصنيف'));
    setText('currentQuestion', turn.currentQuestion.question || '—');
    setText('currentAnswer', 'الإجابة: ' + (turn.currentQuestion.answer || '—'));
  }

  /**
   * Renders buzzer order list.
   * @param {Array<Object>} presses Presses list.
   */
  function renderBuzzerOrder(presses, settings) {
    var ordered = (presses || []).slice().sort(function (a, b) { return a.timestamp - b.timestamp; });
    var list = document.getElementById('buzzerOrderList');
    list.innerHTML = '';

    ordered.forEach(function (press, index) {
      var row = document.createElement('li');

      var safeTeam = normalizeTeamId(press.teamId || press.team) || 'team1';
      var teamName = getTeamName(settings, safeTeam);
      var teamColor = safeTeam === 'team1'
        ? ((settings && settings.team1 && settings.team1.color) || '#e74c3c')
        : ((settings && settings.team2 && settings.team2.color) || '#27ae60');

      var rank = document.createElement('span');
      rank.className = 'buzz-rank';
      rank.textContent = '#' + (index + 1);

      var name = document.createElement('span');
      name.className = 'buzz-name';
      name.textContent = press.playerName || 'لاعب';

      var team = document.createElement('span');
      team.className = 'buzz-team';

      var dot = document.createElement('span');
      dot.className = 'buzz-team-dot';
      dot.style.backgroundColor = teamColor;

      var teamText = document.createElement('span');
      teamText.textContent = teamName;

      team.appendChild(dot);
      team.appendChild(teamText);

      row.appendChild(rank);
      row.appendChild(name);
      row.appendChild(team);
      list.appendChild(row);
    });
  }

  /**
   * Renders phase, wheel, surprise and status info.
   * @param {Object} game Game state.
   * @param {string} phase Current phase.
   */
  function renderPhaseUi(game, phase) {
    var map = {
      setup: 'إعداد', waitingPlayers: 'انتظار اللاعبين', opening: 'سؤال افتتاحي', wheelLetter: 'اختيار لاعب للحرف', wheelCategory: 'اختيار لاعب للتصنيف', wheelSpin: 'عجلة الأسماء',
      selectCell: 'اختيار خلية', selectCategory: 'اختيار تصنيف', showQuestion: 'عرض السؤال', buzzerOpen: 'البازر مفتوح',
      judging: 'تحكيم الإجابة', cellResult: 'نتيجة الخلية', surpriseReveal: 'كشف المفاجأة', selectSteal: 'السطو', roundEnd: 'نهاية الجولة', matchEnd: 'نهاية المباراة'
    };

    setText('phaseText', 'الحالة: ' + (map[phase] || phase));
    setText('roundText', 'الجولة ' + Number((game.settings && game.settings.currentRound) || 1));
    setText('turnText', 'الدور: ' + (game.currentTurn.activeTeam ? getTeamName(game.settings, game.currentTurn.activeTeam) : '—'));

    if (game.wheelSpin && game.wheelSpin.selectedPlayerName) setText('wheelInfo', '🎲 ' + game.wheelSpin.selectedPlayerName + ' من ' + game.wheelSpin.teamName);
    else if (game.wheelSpin && game.wheelSpin.spinning) setText('wheelInfo', '🎲 تدوير...');
    else setText('wheelInfo', 'لم تبدأ العجلة بعد');

    setText('categoryInfo', game.currentTurn.selectedCategory ? ('التصنيف المختار: ' + game.currentTurn.selectedCategory) : 'بانتظار اختيار تصنيف');

    var reveal = game.currentTurn.revealedSurprise;
    setText('surpriseInfo', reveal ? ('آخر مفاجأة: ' + reveal.type + ' - ' + reveal.message) : 'لم تُكشف مفاجأة بعد');

    setText('stealStatus', phase === PHASES.SELECT_STEAL ? ('🏴‍☠️ ' + (game.currentTurn.stealingPlayerName || 'اللاعب') + ' يختار خلية') : 'لا يوجد سطو نشط');
    setText('blitzInfo', (game.currentTurn.nextQuestionBlitz || game.currentTurn.blitzActive) ? '⚡ وضع السرعة مفعل' : '⚡ لا يوجد وضع سرعة');
    setText('freezeInfo', (game.currentTurn.freezePending || game.currentTurn.freezeActive) ? ('🧊 تجميد: ' + getTeamName(game.settings, game.currentTurn.frozenTeam || 'team1')) : '🧊 لا يوجد تجميد');

    if (game.currentTurn.message) setText('refereeStatus', game.currentTurn.message);
  }

  /**
   * Consumes per-question effect flags.
   * @param {Object} game Game state.
   */
  function consumeQuestionEffects(game) {
    game.currentTurn.buzzerOpen = false;
    game.currentTurn.blitzActive = false;
    game.currentTurn.blitzDeadline = null;
    if (game.currentTurn.freezeActive) {
      game.currentTurn.freezeActive = false;
      game.currentTurn.frozenTeam = null;
      game.currentTurn.freezeUntil = null;
      game.currentTurn.freezePending = false;
    }
  }

  /**
   * Detects winner on board.
   * @param {Object} game Game state.
   * @param {string} preferredTeam Preferred team to evaluate first.
   * @returns {{won:boolean,team:string,path:Array<number>}} Winner result.
   */
  function detectRoundWinner(game, preferredTeam) {
    var safePreferred = normalizeTeamId(preferredTeam);
    var teams = safePreferred
      ? [safePreferred, safePreferred === 'team1' ? 'team2' : 'team1']
      : ['team1', 'team2'];

    clearWinningPathFlags(game.board.cells || []);

    for (var i = 0; i < teams.length; i += 1) {
      var check = checkTeamWin(game, teams[i]);
      if (check.won) {
        applyWinningPath(game.board.cells, check.path);
        return { won: true, team: teams[i], path: check.path };
      }
    }

    return { won: false, team: null, path: [] };
  }

  /**
   * Runs path check for one team.
   * @param {Object} game Game state.
   * @param {string} teamId Team id.
   * @returns {{won:boolean,path:Array<number>}} Result.
   */
  function checkTeamWin(game, teamId) {
    var safeTeam = normalizeTeamId(teamId);
    if (!safeTeam) {
      return { won: false, path: [] };
    }

    var queens = (game.board.cells || []).filter(function (c) { return !!c.isQueen; }).map(function (c) { return c.index; });
    var fixedDirection = safeTeam === 'team1' ? 'horizontal' : 'vertical';
    return PATH_CHECKER.checkWin(game.board.cells || [], safeTeam, fixedDirection, queens);
  }

  /**
   * Clears winningPath flag from all cells.
   * @param {Array<Object>} cells Board cells.
   */
  function clearWinningPathFlags(cells) {
    (cells || []).forEach(function (cell) { cell.winningPath = false; });
  }

  /**
   * Applies winningPath flag to path cells.
   * @param {Array<Object>} cells Board cells.
   * @param {Array<number>} path Winning path.
   */
  function applyWinningPath(cells, path) {
    (path || []).forEach(function (index) {
      if (cells[index]) cells[index].winningPath = true;
    });
  }

  /**
   * Picks random index of opponent-owned cell.
   * @param {Array<Object>} cells Board cells.
   * @param {string} teamId Team id.
   * @returns {number|null} Random index.
   */
  function pickRandomOpponentCell(cells, teamId) {
    var safeTeam = normalizeTeamId(teamId);
    if (!safeTeam) return null;

    var choices = (cells || []).filter(function (cell) {
      return normalizeTeamId(cell.owner) === safeTeam;
    }).map(function (cell) {
      return cell.index;
    });
    if (!choices.length) return null;
    return choices[Math.floor(Math.random() * choices.length)];
  }

  /**
   * Finds next opposite-team responder.
   * @param {Array<Object>} order Ordered buzzer list.
   * @param {number} currentIndex Current index.
   * @param {string} currentTeam Current team id.
   * @returns {number} Next index or -1.
   */
  function findNextOppositeTeam(order, currentIndex, currentTeam) {
    for (var i = currentIndex + 1; i < order.length; i += 1) {
      if (order[i].team !== currentTeam) return i;
    }
    return -1;
  }

  /**
   * Returns true when round is finale tie-break.
   * @param {Object} game Game state.
   * @returns {boolean} Finale status.
   */
  function isFinaleRound(game) {
    var needed = Math.floor(Number(game.settings.bestOf || 3) / 2) + 1;
    return Number(game.scores.team1Stars || 0) === needed - 1 && Number(game.scores.team2Stars || 0) === needed - 1;
  }

  /**
   * Returns team direction.
   * @param {Object} settings Settings object.
   * @param {string} teamId Team id.
   * @returns {'horizontal'|'vertical'} Direction.
   */
  function getTeamDirection(settings, teamId) {
    var safeTeam = normalizeTeamId(teamId) || 'team1';
    return safeTeam === 'team1' ? 'horizontal' : 'vertical';
  }

  /**
   * Returns safe normalized team id.
   * @param {*} teamId Raw team id.
   * @returns {'team1'|'team2'|null} Safe team id.
   */
  function normalizeTeamId(teamId) {
    var safe = String(teamId || '').toLowerCase().trim();
    if (safe === 'team1' || safe === '1' || safe === 'red' || safe === 'الفريق الأول') return 'team1';
    if (safe === 'team2' || safe === '2' || safe === 'green' || safe === 'الفريق الثاني') return 'team2';
    return null;
  }

  /**
   * Returns team name.
   * @param {Object} settings Settings object.
   * @param {string} teamId Team id.
   * @returns {string} Team name.
   */
  function getTeamName(settings, teamId) {
    return teamId === 'team1' ? settings.team1.name : settings.team2.name;
  }

  /**
   * Returns team color.
   * @param {Object} settings Settings object.
   * @param {string} teamId Team id.
   * @returns {string} Team color.
   */
  function getTeamColor(settings, teamId) {
    return teamId === 'team1' ? settings.team1.color : settings.team2.color;
  }

  /**
   * Returns players of one team.
   * @param {Object} players Players map.
   * @param {string} teamId Team id.
   * @returns {Array<Object>} Team players.
   */
  function getTeamPlayers(players, teamId) {
    return Object.values(players || {}).filter(function (p) {
      return normalizeTeamId(p.teamId || p.team) === teamId;
    });
  }

  /**
   * Returns true when player heartbeat is fresh.
   * @param {Object} player Player object.
   * @returns {boolean} Online state.
   */
  function isPlayerOnline(player) {
    if (!player) return false;
    var explicitOffline = player.online === false || player.connected === false;
    if (explicitOffline) return false;
    var lastSeen = Number(player.lastSeen || 0);
    if (!lastSeen) {
      // Legacy player rows may not include heartbeat fields; treat as online unless explicitly offline.
      return true;
    }
    return Date.now() - lastSeen < 15000;
  }

  /**
   * Returns online players list.
   * @param {Object} playersMap Players map.
   * @returns {Array<Object>} Online players.
   */
  function getOnlinePlayers(playersMap) {
    return Object.values(playersMap || {}).filter(function (player) {
      return isPlayerOnline(player);
    });
  }

  /**
   * Builds online/offline summary grouped by teams.
   * @param {Object} playersMap Players map.
   * @returns {{players:Array<Object>,onlineTotal:number,team1Online:number,team2Online:number,isOnline:Function}} Summary object.
   */
  function buildPlayersSummary(playersMap) {
    var players = Object.values(playersMap || {});
    var onlineTotal = 0;
    var team1Online = 0;
    var team2Online = 0;

    function isOnline(player) {
      return isPlayerOnline(player);
    }

    for (var i = 0; i < players.length; i += 1) {
      var player = players[i];
      var teamId = normalizeTeamId(player && (player.teamId || player.team)) || 'team1';
      if (!isOnline(player)) continue;
      onlineTotal += 1;
      if (teamId === 'team2') {
        team2Online += 1;
      } else {
        team1Online += 1;
      }
    }

    return {
      players: players,
      onlineTotal: onlineTotal,
      team1Online: team1Online,
      team2Online: team2Online,
      isOnline: isOnline
    };
  }

  /**
   * Creates base currentTurn object.
   * @param {string} phase Phase id.
   * @returns {Object} Turn state.
   */
  function createFreshTurn(phase) {
    return {
      phase: phase,
      activeTeam: null,
      selectedPlayer: null,
      selectedCell: null,
      selectedLetter: null,
      selectedCategory: null,
      currentQuestion: null,
      categoryDeadline: null,
      currentResponderIndex: 0,
      originalActiveTeam: null,
      nextQuestionBlitz: false,
      blitzActive: false,
      blitzDeadline: null,
      buzzerDeadline: null,
      frozenTeam: null,
      freezeUntil: null,
      freezePending: false,
      freezeActive: false,
      autoShieldPending: false,
      autoShieldTeam: null,
      autoShieldFlashId: null,
      autoShieldActivatedAt: null,
      stealingPlayer: null,
      stealingPlayerName: null,
      stealFromTeam: null,
      stealDeadline: null,
      stolenCell: null,
      revealedSurprise: null,
      lastCorrectResponder: null,
      winningPath: [],
      roundWinner: null,
      matchWinner: null,
      roundWinAt: null,
      matchWinAt: null,
      message: ''
    };
  }

  /**
   * Writes lightweight feed event for display commentator/sounds.
   * @param {Object} game Game state.
   * @param {'correct'|'wrong'|'roundWin'|'matchWin'|null} sound Sound key.
   * @param {string|null} eventType Comment event type.
   * @param {Object} data Template data.
   */
  function setFeed(game, sound, eventType, data) {
    game.feed = {
      id: 'feed_' + DATA_LAYER.getTimestamp() + '_' + Math.floor(Math.random() * 100000),
      at: DATA_LAYER.getTimestamp(),
      sound: sound || null,
      comment: eventType ? { eventType: eventType, data: data || {} } : null
    };
  }

  /**
   * Reads game object.
   * @returns {Promise<Object>} Game object.
   */
  async function readGame() {
    try {
      return await DATA_LAYER.readData('game');
    } catch (error) {
      console.error('⚠️ readGame failed:', error);
      return null;
    }
  }

  /**
   * Writes game object.
   * @param {Object} game Game object.
   */
  async function writeGame(game) {
    try {
      await DATA_LAYER.writeData('game', game);
    } catch (error) {
      console.error('❌ writeGame failed:', error);
      setText('refereeStatus', 'فشل حفظ البيانات في Firebase');
      throw error;
    }
  }

  /**
   * Shows one root screen.
   * @param {'login'|'setup'|'waiting'|'game'} key Screen key.
   */
  function showScreen(key) {
    var map = {
      login: 'loginScreen',
      lobby: 'lobbyScreen',
      setup: 'setupScreen',
      waiting: 'waitingScreen',
      game: 'gameScreen'
    };
    Object.keys(map).forEach(function (k) {
      var element = document.getElementById(map[k]);
      if (element) element.classList.toggle('hidden', k !== key);
    });
  }

  /**
   * Writes text by element id.
   * @param {string} id Element id.
   * @param {string} text Text value.
   */
  function setText(id, text) {
    var element = document.getElementById(id);
    if (element) element.textContent = text;
  }

  /**
   * Renders current game code in referee panels.
   * @param {Object|null} settings Game settings.
   */
  function renderGameCode(settings) {
    var roomPin = DATA_LAYER.getRoomPin();
    var code = settings && settings.gameCode ? String(settings.gameCode) : (roomPin || '----');
    renderRoomPin(code);
  }

  /**
   * Renders active room pin labels in all referee sections.
   * @param {string|null} pin Room pin.
   */
  function renderRoomPin(pin) {
    var code = pin ? String(pin) : '----';
    setText('gameCodeText', '🎮 رقم اللعبة: ' + code);
    setText('gameCodeTextWaiting', '🎮 رقم اللعبة: ' + code);
    setText('gameCodeInline', '#' + code);
  }

  /**
   * Sanitizes room pin value.
   * @param {string} value Raw room pin.
   * @returns {string} Four-digit pin.
   */
  function sanitizeRoomPin(value) {
    return String(value || '').replace(/\D/g, '').slice(0, 4);
  }

  /**
   * Syncs current room metadata for lobby listing.
   * @param {string} roomPin Room pin.
   * @param {Object|null} game Game state.
   * @returns {Promise<void>} Completion promise.
   */
  async function updateRoomIndexFromGame(roomPin, game) {
    var pin = sanitizeRoomPin(roomPin || DATA_LAYER.getRoomPin() || appState.activeRoomPin || '');
    if (!pin) return;

    var patch = {
      pin: pin,
      status: 'setup',
      phase: 'setup',
      hasGame: false,
      team1Name: 'الفريق الأول',
      team2Name: 'الفريق الثاني',
      scoreText: '0 - 0',
      playersOnline: 0,
      playersTotal: 0
    };

    if (game && typeof game === 'object') {
      var phase = String((game.currentTurn && game.currentTurn.phase) || game.phase || 'setup');
      var settings = game.settings || {};
      var scores = game.scores || {};
      var playersSummary = buildPlayersSummary(game.players || {});

      patch.phase = phase;
      patch.hasGame = true;
      patch.team1Name = settings.team1 && settings.team1.name ? settings.team1.name : 'الفريق الأول';
      patch.team2Name = settings.team2 && settings.team2.name ? settings.team2.name : 'الفريق الثاني';
      patch.scoreText = String(Number(scores.team1Stars || 0)) + ' - ' + String(Number(scores.team2Stars || 0));
      patch.playersOnline = Number(playersSummary.onlineTotal || 0);
      patch.playersTotal = Number(playersSummary.players ? playersSummary.players.length : 0);
      patch.currentRound = Number(settings.currentRound || 1);
      patch.bestOf = Number(settings.bestOf || 3);
      if (phase === PHASES.MATCH_END) patch.status = 'finished';
      else if (phase === PHASES.SETUP || phase === PHASES.WAITING_PLAYERS) patch.status = 'setup';
      else patch.status = 'playing';
    }

    if (typeof DATA_LAYER.updateRoomIndex === 'function') {
      await DATA_LAYER.updateRoomIndex(pin, patch);
    } else {
      await DATA_LAYER.updateData('rooms_index.' + pin, Object.assign({}, patch, {
        updatedAt: DATA_LAYER.getServerTimestamp()
      }));
    }
  }

  /**
   * Generates a numeric game code.
   * @returns {string} Four-digit game code.
   */
  function generateNumericGameCode() {
    return String(Math.floor(1000 + Math.random() * 9000));
  }

  /**
   * Flashes warning state.
   */
  function flashStateWarning() {
    var panel = document.getElementById('gameScreen');
    panel.classList.remove('state-warning');
    void panel.offsetWidth;
    panel.classList.add('state-warning');
  }

  /**
   * Toggles debug panel visibility.
   */
  function toggleDebugPanel() {
    appState.debugOpen = !appState.debugOpen;
    var panel = document.getElementById('debugPanel');
    if (!panel) return;
    panel.classList.toggle('hidden', !appState.debugOpen);
  }

  /**
   * Renders debug summary information.
   * @param {Object} game Game object.
   * @param {string} phase Current phase.
   */
  function renderDebugPanel(game, phase) {
    var panel = document.getElementById('debugPanel');
    if (!panel) return;
    panel.classList.toggle('hidden', !appState.debugOpen);

    var cells = (game.board && Array.isArray(game.board.cells)) ? game.board.cells : [];
    var team1Cells = cells.filter(function (cell) { return normalizeTeamId(cell.owner) === 'team1'; }).length;
    var team2Cells = cells.filter(function (cell) { return normalizeTeamId(cell.owner) === 'team2'; }).length;
    var emptyCells = cells.length - team1Cells - team2Cells;

    setText('debugPhase', 'الحالة الحالية: ' + phase);
    setText('debugBoard', 'الخلايا: فارغة ' + emptyCells + ' | فريق1 ' + team1Cells + ' | فريق2 ' + team2Cells);
    setText('debugSurprises', 'المفاجآت: ' + Number(game.board && game.board.revealedCount || 0) + '/' + Number(game.board && game.board.totalSurprises || 0));
  }


  /**
   * Periodically refreshes presence badges based on lastSeen timeout.
   */
  function startPresenceMonitor() {
    if (appState.presenceTimer) return;
    appState.presenceTimer = setInterval(async function () {
      if (!appState.isAuthenticated || !appState.roomSelected) return;
      var game = await readGame();
      if (game && typeof game === 'object') {
        renderPlayers(game.players || {});
        updateRoomIndexFromGame(appState.activeRoomPin, game).catch(function () {});
      }
    }, 5000);
  }

  /**
   * Saves rolling snapshot every 30 seconds.
   */
  function startSnapshotAutoSave() {
    if (appState.snapshotTimer || !window.SNAPSHOT || !SNAPSHOT.saveSnapshot) return;
    appState.snapshotTimer = setInterval(async function () {
      if (!appState.isAuthenticated || !appState.roomSelected) return;
      var game = await readGame();
      if (game && typeof game === 'object') {
        SNAPSHOT.saveSnapshot(game);
      }
    }, 30000);
  }

  /**
   * Shows snapshot restore banner when fresh snapshot exists.
   */
  function maybeShowSnapshotBanner() {
    if (appState.restoreBannerShown || !window.SNAPSHOT || !SNAPSHOT.restoreSnapshot) return;
    var snap = SNAPSHOT.restoreSnapshot();
    if (!snap || !snap.data) return;
    appState.restoreBannerShown = true;

    var bar = document.createElement('div');
    bar.id = 'snapshotBanner';
    bar.style.position = 'fixed';
    bar.style.top = '10px';
    bar.style.right = '10px';
    bar.style.zIndex = '9999';
    bar.style.background = 'rgba(18, 33, 62, 0.95)';
    bar.style.border = '1px solid rgba(244, 196, 48, 0.45)';
    bar.style.borderRadius = '12px';
    bar.style.padding = '10px 12px';
    bar.style.display = 'flex';
    bar.style.alignItems = 'center';
    bar.style.gap = '8px';
    bar.style.color = '#fff';
    bar.innerHTML = '<span>يوجد جلسة سابقة — هل تريد استعادتها؟</span>';

    var restoreBtn = document.createElement('button');
    restoreBtn.className = 'btn btn-small';
    restoreBtn.textContent = 'استعادة';
    restoreBtn.addEventListener('click', async function () {
      await DATA_LAYER.writeData('gameState', snap.data);
      await DATA_LAYER.writeData('game', snap.data);
      SNAPSHOT.clearSnapshot();
      bar.remove();
    });

    var ignoreBtn = document.createElement('button');
    ignoreBtn.className = 'btn btn-small';
    ignoreBtn.textContent = 'تجاهل';
    ignoreBtn.addEventListener('click', function () {
      SNAPSHOT.clearSnapshot();
      bar.remove();
    });

    bar.appendChild(restoreBtn);
    bar.appendChild(ignoreBtn);
    document.body.appendChild(bar);
  }

  /**
   * Writes event log safely without blocking gameplay.
   * @param {string} type Event type.
   * @param {Object} payload Event payload.
   */
  function safeLog(type, payload) {
    if (!window.EVENT_LOG || !EVENT_LOG.logEvent || !type) return;
    EVENT_LOG.logEvent({ type: type, payload: payload || {} }).catch(function () {});
  }

  /**
   * Enables comeback shield for trailing team when gap is large.
   * @param {Object} game Game state.
   */
  function applyComebackShield(game) {
    var cells = game && game.board && Array.isArray(game.board.cells) ? game.board.cells : [];
    if (!cells.length) return;

    var team1Count = cells.filter(function (cell) { return normalizeTeamId(cell.owner) === 'team1'; }).length;
    var team2Count = cells.filter(function (cell) { return normalizeTeamId(cell.owner) === 'team2'; }).length;
    var gap = Math.abs(team1Count - team2Count);
    if (gap < 5) return;

    var trailing = team1Count > team2Count ? 'team2' : 'team1';
    if (game.currentTurn.autoShieldPending && game.currentTurn.autoShieldTeam === trailing) return;

    game.currentTurn.autoShieldPending = true;
    game.currentTurn.autoShieldTeam = trailing;
    game.currentTurn.autoShieldFlashId = 'auto_shield_' + DATA_LAYER.getTimestamp();
    game.currentTurn.autoShieldActivatedAt = DATA_LAYER.getTimestamp();
    game.currentTurn.autoShieldMessage = 'درع الملاحق مفعّل!';
    safeLog('SURPRISE_TRIGGERED', {
      surprise: 'AUTO_SHIELD',
      team: trailing
    });
  }

  /**
   * Waits for a short delay.
   * @param {number} ms Delay ms.
   * @returns {Promise<void>} Delay promise.
   */
  function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  initRefereeApp();
})();

