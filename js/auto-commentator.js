(function () {
  console.log('✅ auto-commentator.js loaded');

  var AUTO_COMMENTATOR = (function () {
    var templates = {
      correctAnswer: ['إجابة رائعة من {player}! 🎯', '{team} يتقدم بثبات!', 'أحسنت يا {player}! معلومة ممتازة!', '{player} يثبت جدارته!', 'هل يستطيع {opponent} الرد؟'],
      wrongAnswer: ['للأسف! إجابة خاطئة من {player}', 'فرصة ذهبية لـ{opponent}!', 'لا بأس {player}، المحاولة القادمة!', 'أوه! {opponent} ينتظر الفرصة!'],
      bothWrong: ['لا أحد أصاب! سؤال جديد!', 'سؤال صعب! المحاولة مستمرة...', 'هل من مجيب؟ 🤔'],
      raidSteal: ['🏴‍☠️ سرقة جريئة من {player}!', 'لا أحد في مأمن من {team}! 🏴‍☠️', '{player} يقلب الطاولة بسرقة ذكية!', 'يا للجرأة! {team} يسرق أمام الجميع!'],
      raidBlocked: ['🛡️ الدرع يتصدى! محاولة فاشلة!', 'الحماية تنقذ {opponent}! 🛡️'],
      queenBee: ['👑 ملكة النحل! هذا يغير كل شيء!', 'اكتشاف ملكي من {player}! 👑', '👑 خلية ذهبية! {team} في وضع ممتاز!'],
      freezeTrap: ['🧊 فخ ثلجي! {team} لن يستطيع الرد!', 'أوه لا! {player} فتح فخاً مجمداً! 🧊', '10 ثوانٍ من الصمت الإجباري لـ{team}!'],
      doubleStrike: ['💥 ضربة مدمرة! خليتين دفعة واحدة!', 'بوم! 💥 {team} يتوسع بسرعة!', '{player} يضرب ضربة مزدوجة! 💥'],
      blitz: ['⚡ سرعة! 7 ثوانٍ فقط للسؤال القادم!', 'الساعة تدق! ⚡ من سيجيب أولاً؟'],
      shieldGained: ['🛡️ حماية ذكية! هذه الخلية في مأمن!', '{team} يحصّن موقعه! 🛡️'],
      queenReward: ['{player} يختار مكافأته الملكية! 👑', 'ماذا سيختار {player}؟ الكل ينتظر! 👑'],
      hotCellCreated: ['🔥 خلية مشتعلة! {team} لازم يدافع عنها!', 'النار تشتعل! هل ينجح {team} بالإطفاء؟ 🔥'],
      hotCellDefended: ['🔥→✅ دفاع ناجح! {team} أنقذ الخلية!', 'إطفاء في الوقت المناسب! 🧯'],
      hotCellBurned: ['🔥→💨 احترقت! {team} خسر الخلية!', 'النار لا ترحم! 💨'],
      mirrorActivated: ['🪞 انعكاس! الأدوار معكوسة!', 'من يختار الحرف سيختار الفئة والعكس! 🪞'],
      raidVoucherIssued: ['🎟️ قسيمة سطو! ستتفعل عند أول خلية للخصم!', '{team} يحصل على قسيمة سطو مرعبة! 🎟️'],
      raidVoucherTriggered: ['🎟️ القسيمة تتفعل! الخلية مسروقة فوراً!', 'سرقة مؤجلة! {team} ينفذ القسيمة! 🏴‍☠️'],
      freezeCellPlaced: ['❄️ خلية مجمدة لدورتين! لا أحد يقترب!', 'الجليد يغطي خلية {letter}! ❄️'],
      freezeCellThawed: ['❄️→💧 الجليد يذوب! خلية {letter} حرة!'],
      letterSelection: ['{player} من {team} يختار الحرف! 🔤'],
      categorySelection: ['{player} من {team} يختار الفئة! 📚'],
      nearWin: ['⚠️ {team} يحتاج خلية واحدة فقط!', '🚨 هل ينجح {opponent} بالإيقاف؟', '{team} على بعد خطوة من الفوز! 😱'],
      tiedGame: ['المنافسة على أشدها! لا أحد يتراجع!', 'تعادل في السيطرة! من سيكسر الجمود؟'],
      finaleStart: ['🔥 الجولة الفاصلة! كل شيء ممكن!', '🔥 لحظة الحقيقة! من سيكون البطل؟'],
      matchWin: ['🏆 مبروك لـ{team}! أبطال اللعبة!', '🏆🏆🏆 {team} يتوّج بالبطولة!']
    };

    var lastShownAt = 0;

    /**
     * Generates one commentary line.
     * @param {string} eventType Event type.
     * @param {Object} data Template data.
     * @returns {{text:string,emoji:string,type:string}} Comment object.
     */
    function generateComment(eventType, data) {
      var list = templates[eventType] || ['لحظة حماس جديدة!'];
      var template = list[Math.floor(Math.random() * list.length)];
      var safe = data || {};
      var text = template
        .replaceAll('{player}', safe.player || 'لاعب')
        .replaceAll('{team}', safe.team || 'الفريق')
        .replaceAll('{opponent}', safe.opponent || 'الخصم')
        .replaceAll('{letter}', safe.letter || '؟');
      return { text: text, emoji: '', type: eventType };
    }

    /**
     * Displays comment in one container.
     * @param {HTMLElement} container Target container.
     * @param {{text:string}} comment Comment object.
     */
    function displayComment(container, comment) {
      if (!container || !comment || !comment.text) return;
      var now = Date.now();
      if (now - lastShownAt < 3000) return;
      lastShownAt = now;

      container.classList.remove('comment-show');
      void container.offsetWidth;
      container.textContent = comment.text;
      container.classList.add('comment-show');

      setTimeout(function () {
        container.classList.remove('comment-show');
      }, 4200);
    }

    /**
     * Calculates near-win distance using weighted BFS.
     * @param {Array<Object>} cells Board cells.
     * @param {'team1'|'team2'} teamId Team id.
     * @returns {number} Minimum empty cells needed.
     */
    function getDistanceToWin(cells, teamId) {
      var board = Array.isArray(cells) ? cells : [];
      var horizontal = teamId === 'team1';
      var queue = [];
      var costs = {};

      for (var i = 0; i < 25; i += 1) {
        var row = Math.floor(i / 5);
        var col = i % 5;
        var onStart = horizontal ? col === 0 : row === 0;
        if (!onStart) continue;

        var startCost = getCellCost(board[i], teamId);
        costs[String(i)] = startCost;
        queue.push({ index: i, cost: startCost });
      }

      while (queue.length) {
        queue.sort(function (a, b) { return a.cost - b.cost; });
        var node = queue.shift();
        var rowNow = Math.floor(node.index / 5);
        var colNow = node.index % 5;
        var reached = horizontal ? colNow === 4 : rowNow === 4;
        if (reached) return node.cost;

        var neighbors = HEX_GRID.getNeighbors(node.index);
        for (var n = 0; n < neighbors.length; n += 1) {
          var next = neighbors[n];
          var nextCost = node.cost + getCellCost(board[next], teamId);
          if (costs[String(next)] === undefined || nextCost < costs[String(next)]) {
            costs[String(next)] = nextCost;
            queue.push({ index: next, cost: nextCost });
          }
        }
      }

      return 99;
    }

    /**
     * Returns traversal cost for one cell.
     * @param {Object} cell Board cell.
     * @param {'team1'|'team2'} teamId Team id.
     * @returns {number} Cell cost.
     */
    function getCellCost(cell, teamId) {
      if (!cell || !cell.owner) return 1;
      if (cell.owner === teamId) return 0;
      return 99;
    }

    return {
      generateComment: generateComment,
      displayComment: displayComment,
      getDistanceToWin: getDistanceToWin
    };
  })();

  window.AUTO_COMMENTATOR = AUTO_COMMENTATOR;
})();
