(function () {
  console.log('✅ display-app.js loaded');

  var appState = {
    lastSpinKey: null,
    lastCelebrationKey: null,
    lastSurpriseId: null,
    lastCounterValue: '',
    blitzTicker: null,
    surpriseTimer: null,
    lastFeedId: null,
    lastFastestKey: null,
    lastAutoShieldId: null,
    lastBuzzSoundKey: null,
    connected: false,
    gameUnsub: null
  };

  /**
   * Initializes display app.
   */
  async function initDisplayApp() {
    SOUND_EFFECTS.init();
    bindUi();
    prefillRoomPin();
    try {
      await DATA_LAYER.initDataLayer();
    } catch (error) {
      console.error('❌ Data layer init failed on display:', error);
      var status = document.getElementById('displayRoomStatus');
      if (status) status.textContent = 'فشل الاتصال بقاعدة البيانات';
      return;
    }

    var roomInput = document.getElementById('displayRoomPinInput');
    var initialPin = sanitizePin(roomInput ? roomInput.value : DATA_LAYER.getRoomPin());
    if (initialPin && initialPin.length === 4) {
      connectToRoomFromInput();
    }
  }

  /**
   * Binds UI interactions.
   */
  function bindUi() {
    var muteButton = document.getElementById('muteToggleBtn');
    if (muteButton) {
      muteButton.addEventListener('click', function () {
        SOUND_EFFECTS.setEnabled(!SOUND_EFFECTS.isEnabled());
        renderMuteState();
      });
    }
    var connectBtn = document.getElementById('displayJoinRoomBtn');
    var roomInput = document.getElementById('displayRoomPinInput');
    if (connectBtn) {
      connectBtn.addEventListener('click', connectToRoomFromInput);
    }
    if (roomInput) {
      roomInput.addEventListener('input', function () {
        roomInput.value = sanitizePin(roomInput.value);
      });
      roomInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          connectToRoomFromInput();
        }
      });
    }
    renderMuteState();
  }

  /**
   * Prefills room pin input from local storage/current data layer pin.
   */
  function prefillRoomPin() {
    var roomInput = document.getElementById('displayRoomPinInput');
    if (!roomInput) return;
    var remembered = sanitizePin(DATA_LAYER.getRoomPin() || localStorage.getItem('hcg_roomPin') || '');
    if (remembered) roomInput.value = remembered;
  }

  /**
   * Connects display page to the selected room.
   * @returns {Promise<void>} Completion promise.
   */
  async function connectToRoomFromInput() {
    var roomInput = document.getElementById('displayRoomPinInput');
    var status = document.getElementById('displayRoomStatus');
    var pin = sanitizePin(roomInput ? roomInput.value : '');

    if (!pin || pin.length !== 4) {
      if (status) status.textContent = '❌ أدخل رمز لعبة مكوّن من 4 أرقام';
      return;
    }

    if (status) status.textContent = '⏳ جارٍ الاتصال بالغرفة...';

    try {
      var ok = await DATA_LAYER.joinRoom(pin);
      if (!ok) {
        if (status) status.textContent = '❌ رمز اللعبة غير موجود';
        return;
      }

      appState.connected = true;
      if (!appState.gameUnsub) {
        appState.gameUnsub = DATA_LAYER.onDataChange('game', renderFromState);
      }
      try {
        var game = await DATA_LAYER.readData('game');
        renderFromState(game || {});
        if (status) status.textContent = '✅ متصل بالغرفة #' + pin;
      } catch (readError) {
        console.warn('Display initial room read delayed:', readError);
        if (status) status.textContent = '✅ متصل بالغرفة #' + pin + ' (جاري مزامنة البيانات...)';
      }
    } catch (error) {
      console.error('Display room connect failed:', error);
      if (status) status.textContent = '❌ فشل الاتصال بالغرفة';
    }
  }

  /**
   * Renders mute button icon.
   */
  function renderMuteState() {
    var muteButton = document.getElementById('muteToggleBtn');
    if (!muteButton) return;
    muteButton.textContent = SOUND_EFFECTS.isEnabled() ? '🔊' : '🔇';
    muteButton.setAttribute('aria-label', SOUND_EFFECTS.isEnabled() ? 'كتم الصوت' : 'تشغيل الصوت');
  }

  /**
   * Renders full display state.
   * @param {Object} game Game object.
   */
  function renderFromState(game) {
    if (!appState.connected) return;
    if (!game || typeof game !== 'object') return;

    var settings = game.settings || null;
    var scores = game.scores || { team1Stars: 0, team2Stars: 0 };
    var board = game.board || {};
    var turn = game.currentTurn || {};
    var phase = turn.phase || game.phase || 'setup';
    var players = Object.values(game.players || {});

    renderHeader(settings, scores, players.length);
    renderTurnSelection(turn, settings);
    renderMirrorBanner(turn);
    renderVoucherBadges(turn);
    renderOverrideIndicator(turn);
    renderStatus(settings, phase);
    renderFinaleMode(board);
    renderQrSection(settings, players.length, phase);
    renderLoadingState();
    renderSurpriseCounter(board);
    renderBoard(board.cells || [], turn);
    renderQuestion(turn);
    renderBuzzer(game, settings, turn);
    renderWheel(game.wheelSpin || null);
    renderFreezeOverlay(turn);
    renderBlitzCountdown(turn, phase);
    renderSurpriseOverlay(turn, settings);
    renderAutoShieldOverlay(turn, settings);
    renderStats(game, settings);
    renderFeed(game);
    renderCelebration(game, settings, phase, scores);
    renderAchievements(turn);
  }

  /**
   * Shows brief overlay when comeback shield is auto-enabled.
   * @param {Object} turn Turn state.
   * @param {Object|null} settings Settings object.
   */
  function renderAutoShieldOverlay(turn, settings) {
    if (!turn || !turn.autoShieldFlashId) return;
    if (turn.autoShieldFlashId === appState.lastAutoShieldId) return;
    appState.lastAutoShieldId = turn.autoShieldFlashId;

    var overlay = document.getElementById('surpriseOverlay');
    var title = document.getElementById('surpriseTitle');
    var text = document.getElementById('surpriseText');
    if (!overlay || !title || !text) return;

    var teamName = 'الفريق';
    if (settings && turn.autoShieldTeam === 'team1') teamName = settings.team1.name;
    if (settings && turn.autoShieldTeam === 'team2') teamName = settings.team2.name;

    title.textContent = '🛡️ درع الملاحق مفعّل!';
    text.textContent = teamName + ' حصل على درع إضافي للسؤال القادم';
    overlay.classList.remove('hidden');

    clearTimeout(appState.surpriseTimer);
    appState.surpriseTimer = setTimeout(function () {
      overlay.classList.add('hidden');
    }, 1800);
  }

  /**
   * Renders header content.
   * @param {Object|null} settings Settings object.
   * @param {Object} scores Score object.
   * @param {number} playerCount Connected count.
   */
  function renderHeader(settings, scores, playerCount) {
    var teamOneName = document.getElementById('teamOneName');
    var teamTwoName = document.getElementById('teamTwoName');
    var teamOneStars = document.getElementById('teamOneStars');
    var teamTwoStars = document.getElementById('teamTwoStars');
    var roundInfo = document.getElementById('roundInfo');
    var playersCount = document.getElementById('displayPlayersCount');

    if (playersCount) {
      playersCount.textContent = '👥 ' + playerCount + ' لاعبين متصلين';
    }

    if (!settings) {
      teamOneName.textContent = 'الفريق الأول';
      teamTwoName.textContent = 'الفريق الثاني';
      teamOneStars.textContent = '☆☆';
      teamTwoStars.textContent = '☆☆';
      roundInfo.textContent = 'بانتظار إعداد المباراة';
      return;
    }

    var bestOf = Number(settings.bestOf || 3);
    var needed = Math.floor(bestOf / 2) + 1;

    teamOneName.textContent = settings.team1.name;
    teamTwoName.textContent = settings.team2.name;
    teamOneStars.textContent = buildStars(scores.team1Stars || 0, needed);
    teamTwoStars.textContent = buildStars(scores.team2Stars || 0, needed);
    roundInfo.textContent = 'الجولة ' + Number(settings.currentRound || 1) + ' من ' + bestOf;

    document.getElementById('teamOneHeader').style.borderColor = settings.team1.color;
    document.getElementById('teamTwoHeader').style.borderColor = settings.team2.color;
  }

  /**
   * Builds star indicator text.
   * @param {number} filled Filled stars.
   * @param {number} total Total stars.
   * @returns {string} Stars text.
   */
  function buildStars(filled, total) {
    var count = Math.max(0, Number(filled || 0));
    var max = Math.max(1, Number(total || 1));
    return '⭐'.repeat(Math.min(count, max)) + '☆'.repeat(Math.max(0, max - count));
  }

  /**
   * Renders status text.
   * @param {Object|null} settings Settings.
   * @param {string} phase Current phase.
   */
  function renderStatus(settings, phase) {
    var statusArea = document.getElementById('statusArea');
    if (!settings) {
      statusArea.textContent = 'بانتظار إعداد المباراة من لوحة الحكم...';
      return;
    }

    var map = {
      setup: 'جاري التجهيز...',
      waitingPlayers: 'بانتظار اللاعبين...',
      opening: '🎯 سؤال افتتاحي!',
      wheelLetter: '🎲 يتم اختيار لاعب لاختيار الحرف...',
      wheelCategory: '🎲 يتم اختيار لاعب لاختيار الفئة...',
      selectCell: 'اختر خلية من اللوحة',
      selectCategory: '📱 اللاعب يختار التصنيف من هاتفه',
      queenReward: '👑 اللاعب يختار مكافأة الملكة',
      showQuestion: 'السؤال جاهز',
      buzzerOpen: '🔴 البازر مفتوح الآن!',
      judging: 'الحكم يراجع الإجابة',
      cellResult: 'نتيجة الخلية',
      surpriseReveal: '🎭 مفاجأة!',
      selectSteal: '🏴‍☠️ اختيار خلية للسطو',
      roundEnd: '🏆 نهاية الجولة',
      matchEnd: '🏆🏆🏆 نهاية المباراة'
    };

    statusArea.textContent = map[phase] || 'حالة غير معروفة';
  }

  /**
   * Shows QR block when waiting for players.
   * @param {Object|null} settings Settings.
   * @param {number} playerCount Player count.
   * @param {string} phase Phase id.
   */
  function renderQrSection(settings, playerCount, phase) {
    var section = document.getElementById('qrJoinSection');
    if (!section) return;

    var visible = !settings || phase === 'waitingPlayers' || phase === 'setup';
    section.classList.toggle('hidden', !visible);
    if (!visible) return;

    var roomPin = sanitizePin((settings && settings.gameCode) || DATA_LAYER.getRoomPin() || '');
    QR_GENERATOR.render(document.getElementById('qrImage'), document.getElementById('joinUrlText'), roomPin);
    document.getElementById('qrPlayersText').textContent = '👥 في انتظار اللاعبين • المتصلون الآن: ' + playerCount;
  }

  /**
   * Renders letter/category picker line.
   * @param {Object} turn Turn state.
   * @param {Object|null} settings Settings state.
   */
  function renderTurnSelection(turn, settings) {
    var line = document.getElementById('turnSelectionLine');
    if (!line || !settings || !turn) return;
    var letterTeam = turn.letterTeam || 'team1';
    var categoryTeam = turn.categoryTeam || 'team2';
    var letterName = letterTeam === 'team1' ? settings.team1.name : settings.team2.name;
    var categoryName = categoryTeam === 'team1' ? settings.team1.name : settings.team2.name;
    line.textContent = '🔤 ' + letterName + ' يختار الحرف | 📚 ' + categoryName + ' يختار الفئة';
  }

  /**
   * Renders mirror banner visibility.
   * @param {Object} turn Turn state.
   */
  function renderMirrorBanner(turn) {
    var banner = document.getElementById('mirrorBanner');
    if (!banner) return;
    banner.classList.toggle('hidden', !turn.mirrorActive);
  }

  /**
   * Renders raid voucher badges by team name.
   * @param {Object} turn Turn state.
   */
  function renderVoucherBadges(turn) {
    var team1 = document.getElementById('teamOneVoucher');
    var team2 = document.getElementById('teamTwoVoucher');
    if (!team1 || !team2) return;
    team1.classList.toggle('hidden', turn.raidVoucher !== 'team1');
    team2.classList.toggle('hidden', turn.raidVoucher !== 'team2');
  }

  /**
   * Renders manual override indicator visibility.
   * @param {Object} turn Turn state.
   */
  function renderOverrideIndicator(turn) {
    var icon = document.getElementById('overrideIndicator');
    if (!icon) return;
    icon.classList.toggle('hidden', !turn.overrideMode);
  }

  /**
   * Renders loading indicator.
   */
  function renderLoadingState() {
    var box = document.getElementById('loadingBox');
    if (!box || !QUESTION_MANAGER || !QUESTION_MANAGER.getLoadState) return;
    var state = QUESTION_MANAGER.getLoadState();
    if (state.loading) {
      box.classList.remove('hidden');
      box.textContent = 'جاري تحميل الأسئلة...';
      return;
    }
    if (state.error) {
      box.classList.remove('hidden');
      box.textContent = state.error;
      return;
    }
    box.classList.add('hidden');
  }

  /**
   * Renders board cells.
   * @param {Array<Object>} cells Cells.
   * @param {Object} turn Turn state.
   */
  function renderBoard(cells, turn) {
    if (!Array.isArray(cells) || !cells.length) return;

    HEX_GRID.renderGrid(document.getElementById('displayGrid'), cells, {
      clickable: false,
      miniMode: false,
      showLetters: true
    });

    HEX_GRID.clearHighlights();

    if (typeof turn.selectedCell === 'number') {
      HEX_GRID.highlightCell(turn.selectedCell, '#ffd700');
    }

    if (Array.isArray(turn.winningPath) && turn.winningPath.length) {
      HEX_GRID.highlightWinningPath(turn.winningPath, turn.roundWinner || turn.matchWinner || 'team1');
    }
  }

  /**
   * Renders question block.
   * @param {Object} turn Turn state.
   */
  function renderQuestion(turn) {
    var category = document.getElementById('questionCategory');
    var text = document.getElementById('questionText');
    var question = turn.currentQuestion || null;

    if (!question) {
      category.textContent = 'التصنيف';
      text.textContent = 'استعدوا! الحكم سيقرأ السؤال بصوته خلال ثوانٍ.';
      return;
    }

    category.textContent = turn.phase === 'opening' ? '🎯 سؤال افتتاحي!' : (question.category || 'التصنيف');
    text.textContent = buildDisplayPrompt(turn.phase);
  }

  /**
   * Returns motivational display text per phase (without revealing question content).
   * @param {string} phase Turn phase.
   * @returns {string} Prompt text.
   */
  function buildDisplayPrompt(phase) {
    var prompts = {
      opening: 'ركّزوا جيداً... السؤال الافتتاحي يُقرأ الآن من الحكم.',
      showQuestion: '🎙️ الحكم يطرح السؤال الآن... انتظروا إشارة فتح البازر!',
      buzzerOpen: '🔴 البازر مفتوح! السرعة + الدقة = الفوز.',
      judging: '⏳ جاري تقييم الإجابة... أبقوا جاهزين.',
      cellResult: '✨ نتيجة هذه الخلية ستظهر بعد لحظات.',
      selectCategory: '📱 اللاعب المختار يحدد التصنيف الآن.',
      selectSteal: '🏴‍☠️ قرار السطو قيد التنفيذ...',
      roundEnd: '🏆 نهاية الجولة! حضّروا أنفسكم للجولة التالية.',
      matchEnd: '🎉 مباراة رائعة! استمتعوا بلحظة التتويج.'
    };
    return prompts[phase] || '🔥 الحماس مستمر... تابعوا اللعب السريع!';
  }

  /**
   * Renders buzzer order text.
   * @param {Object} game Full game.
   * @param {Object|null} settings Settings.
   * @param {Object} turn Turn.
   */
  function renderBuzzer(game, settings, turn) {
    var target = document.getElementById('buzzerResult');
    var presses = game.buzzer && Array.isArray(game.buzzer.presses) ? game.buzzer.presses.slice() : [];
    presses.sort(function (a, b) { return Number(a.timestamp || 0) - Number(b.timestamp || 0); });

    if (!presses.length) {
      appState.lastBuzzSoundKey = null;
      target.textContent = turn.phase === 'buzzerOpen' ? 'بانتظار أول ضغطة...' : 'لا يوجد ضغطات بعد';
      return;
    }

    var firstPress = presses[0];
    var buzzKey = String(firstPress.playerId || '') + '_' + String(firstPress.timestamp || '');
    if (buzzKey && buzzKey !== appState.lastBuzzSoundKey) {
      appState.lastBuzzSoundKey = buzzKey;
      SOUND_EFFECTS.playBuzzerPress();
    }

    var lines = presses.map(function (press, index) {
      var teamMeta = resolvePressTeamMeta(press, settings);
      return '<span class="buzz-item">' +
        '<span class="buzz-rank">#' + (index + 1) + '</span>' +
        '<span class="buzz-player-block">' +
          '<span class="buzz-player-dot" style="background:' + teamMeta.color + ';"></span>' +
          '<span class="buzz-player">' + escapeHtml(press.playerName || 'لاعب') + '</span>' +
        '</span>' +
        '<span class="buzz-team-pill">' + escapeHtml(teamMeta.name) + '</span>' +
      '</span>';
    });

    target.innerHTML = '⚡ ' + lines.join(' <span class="buzz-sep">|</span> ');
  }

  /**
   * Resolves a player's team name/color for buzzer rendering.
   * @param {Object} press Single buzz press object.
   * @param {Object|null} settings Settings object.
   * @returns {{id:string,name:string,color:string}} Team display meta.
   */
  function resolvePressTeamMeta(press, settings) {
    var team1Name = (settings && settings.team1 && settings.team1.name) || 'الفريق الأول';
    var team2Name = (settings && settings.team2 && settings.team2.name) || 'الفريق الثاني';
    var team1Color = (settings && settings.team1 && settings.team1.color) || '#e74c3c';
    var team2Color = (settings && settings.team2 && settings.team2.color) || '#27ae60';
    var rawValues = [press && press.teamId, press && press.team, press && press.teamName]
      .filter(function (value) { return value !== undefined && value !== null && value !== ''; })
      .map(function (value) { return String(value).toLowerCase().trim(); });

    var team2Aliases = ['team2', '2', 'green', 'الفريق الثاني', String(team2Name).toLowerCase().trim()];
    var isTeam2 = rawValues.some(function (value) {
      return team2Aliases.indexOf(value) !== -1;
    });

    if (isTeam2) {
      return { id: 'team2', name: team2Name, color: team2Color };
    }

    return { id: 'team1', name: team1Name, color: team1Color };
  }

  /**
   * Escapes text to safe HTML.
   * @param {string} value Raw text.
   * @returns {string} Escaped string.
   */
  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Sanitizes room PIN input to 4 numeric characters.
   * @param {string} value Raw pin input.
   * @returns {string} Sanitized pin.
   */
  function sanitizePin(value) {
    return String(value || '').replace(/\D/g, '').slice(0, 4);
  }

  /**
   * Renders wheel animation.
   * @param {Object|null} wheel Wheel state.
   */
  function renderWheel(wheel) {
    var container = document.getElementById('wheelContainer');
    var message = document.getElementById('wheelMessage');

    if (!wheel) {
      container.innerHTML = '<p class="wheel-placeholder">ستظهر عجلة الأسماء هنا عند بداية الدور</p>';
      message.textContent = '';
      return;
    }

    if (wheel.spinning && !wheel.selectedPlayerName) {
      message.textContent = 'يتم الاختيار...';
      return;
    }

    if (wheel.selectedPlayerName) {
      var key = String(wheel.spinId || '') + '_' + String(wheel.selectedPlayerName || '');
      var modeLabel = wheel.kind === 'category' ? 'اختر الفئة' : 'اختر الحرف';
      if (key !== appState.lastSpinKey) {
        appState.lastSpinKey = key;
        SOUND_EFFECTS.playWheelSpin(12);
        WHEEL_SPINNER.renderWheelAnimation(
          container,
          wheel.candidates || [],
          wheel.selectedPlayerName,
          wheel.teamColor || '#ffd700',
          function () {
            message.textContent = '🎲 ' + wheel.selectedPlayerName + ' من ' + (wheel.teamName || '') + '! ' + modeLabel;
          }
        );
      } else {
        message.textContent = '🎲 ' + wheel.selectedPlayerName + ' من ' + (wheel.teamName || '') + '! ' + modeLabel;
      }
    }
  }

  /**
   * Renders surprise overlay.
   * @param {Object} turn Turn state.
   * @param {Object|null} settings Settings.
   */
  function renderSurpriseOverlay(turn, settings) {
    var reveal = turn.revealedSurprise || null;
    if (!reveal || !reveal.id || reveal.id === appState.lastSurpriseId) return;

    appState.lastSurpriseId = reveal.id;

    var overlay = document.getElementById('surpriseOverlay');
    var title = document.getElementById('surpriseTitle');
    var text = document.getElementById('surpriseText');
    var fx = document.getElementById('screenFx');

    var map = {
      queen: '👑 ملكة النحل!',
      blitz: '⚡ السرعة!',
      raid: '🏴‍☠️ السطو!',
      shield: '🛡️ الدرع!',
      freeze: '🧊 الفخ المتجمد!',
      double: '💥 الضربة المزدوجة!'
    };

    title.textContent = map[reveal.type] || '🎭 مفاجأة!';

    var teamName = reveal.team === 'team1'
      ? (settings ? settings.team1.name : 'الفريق الأول')
      : (settings ? settings.team2.name : 'الفريق الثاني');
    text.textContent = reveal.message || ('تم تفعيل مفاجأة لصالح ' + teamName);

    overlay.classList.remove('hidden');
    overlay.querySelector('.surprise-card').className = 'surprise-card type-' + String(reveal.type || 'default');

    if (typeof reveal.cellIndex === 'number') {
      HEX_GRID.animateSurprise(reveal.cellIndex, reveal.type || 'queen');
    }

    fx.classList.remove('flash-gold', 'shake');
    if (reveal.type === 'queen') {
      fx.classList.add('flash-gold');
      SOUND_EFFECTS.playQueenReveal();
    }
    if (reveal.type === 'raid') {
      fx.classList.add('shake');
      SOUND_EFFECTS.playRaidReveal();
    }
    if (reveal.type === 'shield') SOUND_EFFECTS.playShieldReveal();
    if (reveal.type === 'freeze') SOUND_EFFECTS.playFreezeReveal();
    if (reveal.type === 'double') SOUND_EFFECTS.playDoubleStrikeReveal();
    if (reveal.type === 'blitz') SOUND_EFFECTS.playBlitzReveal();

    clearTimeout(appState.surpriseTimer);
    appState.surpriseTimer = setTimeout(function () {
      overlay.classList.add('hidden');
      fx.classList.remove('flash-gold', 'shake');
    }, 2400);
  }

  /**
   * Renders finale mode visuals.
   * @param {Object} board Board object.
   */
  function renderFinaleMode(board) {
    var layout = document.getElementById('displayLayout');
    var banner = document.getElementById('finaleBanner');
    var grid = document.getElementById('displayGrid');
    var finale = board && board.roundType === 'finale';
    if (layout) {
      layout.classList.toggle('finale-mode', !!finale);
    }
    if (grid) {
      grid.classList.toggle('finale-mode', !!finale);
    }
    if (banner) {
      banner.classList.toggle('hidden', !finale);
    }
  }

  /**
   * Renders surprise counter.
   * @param {Object} board Board object.
   */
  function renderSurpriseCounter(board) {
    var counter = document.getElementById('surpriseCounter');
    var revealed = Number(board && board.revealedCount || 0);
    var total = Number(board && board.totalSurprises || 0);
    var text = '🎭 مفاجآت: ' + revealed + '/' + total;
    counter.textContent = text;

    if (text !== appState.lastCounterValue) {
      appState.lastCounterValue = text;
      counter.classList.remove('bump');
      void counter.offsetWidth;
      counter.classList.add('bump');
    }
  }

  /**
   * Renders freeze overlay.
   * @param {Object} turn Turn state.
   */
  function renderFreezeOverlay(turn) {
    var overlay = document.getElementById('frostOverlay');
    var now = Date.now();

    if (turn.freezeActive && turn.frozenTeam && now < Number(turn.freezeUntil || 0)) {
      overlay.classList.remove('hidden');
      overlay.classList.add('active');
      overlay.style.background = turn.frozenTeam === 'team1'
        ? 'linear-gradient(90deg, rgba(149,209,255,.38), rgba(149,209,255,0) 56%)'
        : 'linear-gradient(270deg, rgba(149,209,255,.38), rgba(149,209,255,0) 56%)';
    } else {
      overlay.classList.add('hidden');
      overlay.classList.remove('active');
    }
  }

  /**
   * Renders blitz countdown.
   * @param {Object} turn Turn state.
   * @param {string} phase Phase id.
   */
  function renderBlitzCountdown(turn, phase) {
    var counter = document.getElementById('blitzCountdown');
    var deadline = Number(turn.blitzDeadline || 0);

    if (!(phase === 'buzzerOpen' && turn.blitzActive && deadline)) {
      counter.classList.add('hidden');
      clearInterval(appState.blitzTicker);
      appState.blitzTicker = null;
      return;
    }

    counter.classList.remove('hidden');
    clearInterval(appState.blitzTicker);
    appState.blitzTicker = setInterval(function () {
      var left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      counter.textContent = '⚡ ' + left;
      if (left <= 3 && left > 0) SOUND_EFFECTS.playTimerWarning();
      if (left <= 0) {
        clearInterval(appState.blitzTicker);
        appState.blitzTicker = null;
      }
    }, 250);
  }

  /**
   * Renders compact stats bar.
   * @param {Object} game Game state.
   * @param {Object|null} settings Settings.
   */
  function renderStats(game, settings) {
    var stats = game.stats || {};
    var cells = game.board && Array.isArray(game.board.cells) ? game.board.cells : [];
    var control = STATS_TRACKER.getControlPercentage(cells);
    var team1Name = settings ? settings.team1.name : 'الفريق الأول';
    var team2Name = settings ? settings.team2.name : 'الفريق الثاني';

    var fill = document.getElementById('controlBarFill');
    var label = document.getElementById('controlLabel');
    var fastest = document.getElementById('fastestBuzzLabel');
    var steal = document.getElementById('stealLabel');
    if (!fill || !label || !fastest || !steal) return;

    fill.style.width = control.team1 + '%';
    label.textContent = team1Name + ' ' + control.team1 + '% — ' + team2Name + ' ' + control.team2 + '%';

    if (stats.fastestBuzzEver && stats.fastestBuzzEver.playerName) {
      var key = stats.fastestBuzzEver.playerName + '_' + stats.fastestBuzzEver.time;
      fastest.textContent = '⚡ أسرع إصبع: ' + stats.fastestBuzzEver.playerName + ' — ' + stats.fastestBuzzEver.time + 'ms';
      if (appState.lastFastestKey && appState.lastFastestKey !== key) {
        fastest.classList.remove('record-flash');
        void fastest.offsetWidth;
        fastest.classList.add('record-flash');
      }
      appState.lastFastestKey = key;
    } else {
      fastest.textContent = '⚡ أسرع إصبع: -';
    }

    var team1Steals = Number(stats.teams && stats.teams.team1 && stats.teams.team1.steals || 0);
    var team2Steals = Number(stats.teams && stats.teams.team2 && stats.teams.team2.steals || 0);
    steal.textContent = '🏴‍☠️ سرقات: ' + team1Name + ' ' + team1Steals + ' | ' + team2Name + ' ' + team2Steals;
  }

  /**
   * Renders commentator feed and sound events.
   * @param {Object} game Game state.
   */
  function renderFeed(game) {
    var feed = game.feed || null;
    if (!feed || !feed.id || feed.id === appState.lastFeedId) return;
    appState.lastFeedId = feed.id;

    if (feed.comment && feed.comment.eventType) {
      var comment = AUTO_COMMENTATOR.generateComment(feed.comment.eventType, feed.comment.data || {});
      AUTO_COMMENTATOR.displayComment(document.getElementById('commentatorText'), comment);
    }

    if (feed.sound === 'correct') SOUND_EFFECTS.playCorrectAnswer();
    if (feed.sound === 'wrong') SOUND_EFFECTS.playWrongAnswer();
    if (feed.sound === 'roundWin') SOUND_EFFECTS.playWinRound();
    if (feed.sound === 'matchWin') SOUND_EFFECTS.playWinMatch();
  }

  /**
   * Renders celebration overlay.
   * @param {Object} game Game state.
   * @param {Object|null} settings Settings.
   * @param {string} phase Phase.
   * @param {Object} scores Scores.
   */
  function renderCelebration(game, settings, phase, scores) {
    var overlay = document.getElementById('celebrationOverlay');
    var title = document.getElementById('celebrationText');
    var subtitle = document.getElementById('celebrationSubText');
    var confetti = document.getElementById('confettiLayer');
    var turn = game.currentTurn || {};

    if (phase !== 'roundEnd' && phase !== 'matchEnd') {
      overlay.classList.add('hidden');
      return;
    }

    var winnerTeam = turn.matchWinner || turn.roundWinner;
    var winnerName = winnerTeam === 'team1'
      ? (settings ? settings.team1.name : 'الفريق الأول')
      : (settings ? settings.team2.name : 'الفريق الثاني');

    if (phase === 'matchEnd') {
      title.textContent = '🏆🏆🏆 ' + winnerName + ' أبطال المباراة! 🏆🏆🏆';
      subtitle.textContent = (scores.team1Stars || 0) + ' - ' + (scores.team2Stars || 0);
    } else {
      title.textContent = '🏆 ' + winnerName + ' يفوز بالجولة!';
      subtitle.textContent = 'النتيجة الحالية: ' + (scores.team1Stars || 0) + ' - ' + (scores.team2Stars || 0);
    }

    var key = phase + '_' + String(turn.matchWinAt || turn.roundWinAt || 0);
    if (key !== appState.lastCelebrationKey) {
      appState.lastCelebrationKey = key;
      spawnConfetti(confetti);
    }

    overlay.classList.remove('hidden');
  }

  /**
   * Renders achievements cards.
   * @param {Object} turn Turn object.
   */
  function renderAchievements(turn) {
    var overlay = document.getElementById('achievementsOverlay');
    var list = document.getElementById('achievementsList');
    if (!overlay || !list) return;

    var items = Array.isArray(turn.achievements) ? turn.achievements : [];
    if (!items.length || turn.phase !== 'matchEnd') {
      overlay.classList.add('hidden');
      list.innerHTML = '';
      return;
    }

    overlay.classList.remove('hidden');
    list.innerHTML = '';

    for (var i = 0; i < items.length; i += 1) {
      var card = document.createElement('article');
      card.className = 'achievement-card';
      card.style.animationDelay = (i * 0.3) + 's';
      card.innerHTML = '<h4>' + items[i].icon + ' ' + items[i].title + '</h4><p>' + items[i].winner + '</p><small>' + items[i].value + '</small>';
      list.appendChild(card);
    }
  }

  /**
   * Spawns confetti elements.
   * @param {HTMLElement} layer Container layer.
   */
  function spawnConfetti(layer) {
    if (!layer) return;
    layer.innerHTML = '';
    var colors = ['#ffd700', '#e74c3c', '#27ae60', '#74b9ff', '#ffeaa7', '#fd79a8'];
    for (var i = 0; i < 38; i += 1) {
      var piece = document.createElement('span');
      piece.className = 'confetti';
      piece.style.left = (Math.random() * 100) + '%';
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.animationDelay = (Math.random() * 0.4) + 's';
      piece.style.animationDuration = (2 + Math.random() * 1.6) + 's';
      layer.appendChild(piece);
    }
  }

  initDisplayApp();
})();
