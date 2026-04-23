(function () {
  console.log('✅ question-manager.js loaded');

  var QUESTION_MANAGER = (function () {
    var LETTERS = ['أ', 'ب', 'ت', 'ث', 'ج', 'ح', 'خ', 'د', 'ذ', 'ر', 'ز', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ك', 'ل', 'م', 'ن', 'هـ', 'و', 'ي'];
    var config = null;
    var categoriesById = {};
    var pools = {};
    var openingPool = [];
    var loadState = { loading: false, loaded: false, error: null };

    var recentQuestionKeys = [];
    var recentTopicKeys = [];
    var MAX_RECENT_QUESTIONS = 45;
    var MAX_RECENT_TOPICS = 22;

    /**
     * Deep clone helper.
     * @param {*} value Any serializable value.
     * @returns {*} Clone.
     */
    function clone(value) {
      return JSON.parse(JSON.stringify(value));
    }

    /**
     * Normalizes text to help with topic matching.
     * @param {string} text Raw text.
     * @returns {string} Normalized text.
     */
    function normalizeText(text) {
      return String(text || '')
        .replace(/[«»"']/g, '')
        .replace(/[.,!?،؛:]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    }

    /**
     * Extracts a coarse topic token from question text.
     * @param {string} questionText Question text.
     * @returns {string} Topic token.
     */
    function extractTopic(questionText) {
      var normalized = normalizeText(questionText);
      if (!normalized) return 'general';

      var match = normalized.match(/^في\s+([^،]+)\s/);
      if (match && match[1]) {
        return match[1].trim();
      }

      var words = normalized.split(' ').filter(Boolean).slice(0, 4);
      return words.join(' ');
    }

    /**
     * Builds a stable key for a question row.
     * @param {Object} row Question row.
     * @returns {string} Key.
     */
    function buildQuestionKey(row) {
      return normalizeText(row.q || '') + '||' + normalizeText(row.a || '');
    }

    /**
     * Removes and returns best random item from array using anti-cluster scoring.
     * @param {Array<Object>} array Question bucket.
     * @returns {Object|null} Selected item.
     */
    function popSmart(array) {
      if (!Array.isArray(array) || !array.length) return null;

      var bestIndex = -1;
      var bestScore = -Infinity;

      for (var i = 0; i < array.length; i += 1) {
        var item = array[i];
        var qKey = item.__key || buildQuestionKey(item);
        var tKey = item.__topic || 'general';

        var score = Math.random() * 1.5;
        if (recentQuestionKeys.indexOf(qKey) !== -1) score -= 2.2;
        if (recentTopicKeys.indexOf(tKey) !== -1) score -= 1.1;
        if (i < 3) score -= 0.08;

        if (score > bestScore) {
          bestScore = score;
          bestIndex = i;
        }
      }

      if (bestIndex < 0) bestIndex = Math.floor(Math.random() * array.length);
      var itemOut = array[bestIndex];
      array.splice(bestIndex, 1);
      return itemOut;
    }

    /**
     * Pushes value to recent buffer with max length.
     * @param {Array<string>} bucket Recent bucket.
     * @param {string} value Value to add.
     * @param {number} maxSize Max size.
     */
    function remember(bucket, value, maxSize) {
      if (!value) return;
      bucket.push(value);
      if (bucket.length > maxSize) {
        bucket.splice(0, bucket.length - maxSize);
      }
    }

    /**
     * Fetches JSON with fetch + XHR fallback.
     * @param {string} path Relative path.
     * @returns {Promise<Object|null>} JSON object or null.
     */
    async function safeFetch(path) {
      try {
        var response = await fetch(path);
        if (response.ok) {
          return await response.json();
        }
      } catch (_error) {}

      return new Promise(function (resolve) {
        try {
          var xhr = new XMLHttpRequest();
          xhr.open('GET', path, true);
          xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4) return;
            if ((xhr.status >= 200 && xhr.status < 300) || xhr.status === 0) {
              try {
                resolve(JSON.parse(xhr.responseText));
              } catch (_parseError) {
                resolve(null);
              }
            } else {
              resolve(null);
            }
          };
          xhr.onerror = function () { resolve(null); };
          xhr.send();
        } catch (_xhrError) {
          resolve(null);
        }
      });
    }

    /**
     * Transforms raw row to normalized internal row.
     * @param {Object} row Raw row.
     * @returns {Object} Normalized row.
     */
    function normalizeRow(row) {
      var normalized = {
        q: String(row.q || '').trim(),
        a: String(row.a || '').trim()
      };
      normalized.__topic = extractTopic(normalized.q);
      normalized.__key = buildQuestionKey(normalized);
      return normalized;
    }

    /**
     * Loads all categories and question pools.
     * @returns {Promise<void>} Completion promise.
     */
    async function loadAllQuestions() {
      loadState.loading = true;
      loadState.loaded = false;
      loadState.error = null;

      var loadedConfig = await safeFetch('questions/config.json');
      if (!loadedConfig || !Array.isArray(loadedConfig.categories)) {
        loadState.loading = false;
        loadState.error = 'تعذّر تحميل ملف التصنيفات';
        throw new Error(loadState.error);
      }

      config = loadedConfig;
      categoriesById = {};
      pools = {};
      openingPool = [];
      recentQuestionKeys = [];
      recentTopicKeys = [];

      for (var i = 0; i < config.categories.length; i += 1) {
        var category = config.categories[i];
        categoriesById[category.id] = category;
        var data = await safeFetch('questions/' + category.file);
        if (!data) continue;

        if (category.id === 'opening') {
          var rawOpening = Array.isArray(data.questions) ? data.questions : [];
          openingPool = rawOpening.map(normalizeRow);
        } else {
          var rawPools = clone(data.questions || {});
          var normalizedPools = {};
          Object.keys(rawPools).forEach(function (letter) {
            if (!Array.isArray(rawPools[letter])) return;
            normalizedPools[letter] = rawPools[letter]
              .filter(function (row) { return row && row.q && row.a; })
              .map(normalizeRow);
          });
          pools[category.id] = normalizedPools;
        }
      }

      loadState.loading = false;
      loadState.loaded = true;
      loadState.error = null;
    }

    /**
     * Returns loading state.
     * @returns {{loading:boolean,loaded:boolean,error:string|null}} State.
     */
    function getLoadState() {
      return Object.assign({}, loadState);
    }

    /**
     * Returns category object by id.
     * @param {string} id Category id.
     * @returns {Object|null} Category object.
     */
    function getCategoryById(id) {
      return categoriesById[id] || null;
    }

    /**
     * Returns selectable categories.
     * @returns {Array<Object>} Selectable categories.
     */
    function getSelectableCategories() {
      if (!config || !Array.isArray(config.categories)) return [];
      return config.categories.filter(function (category) {
        return !!category.selectable;
      });
    }

    /**
     * Returns random category id optionally excluding one.
     * @param {string|null} excludeId Excluded id.
     * @returns {string|null} Category id or null.
     */
    function getRandomCategory(excludeId) {
      var options = getSelectableCategories().filter(function (category) {
        return category.id !== excludeId;
      });
      if (!options.length) return null;
      return options[Math.floor(Math.random() * options.length)].id;
    }

    /**
     * Remembers a selected question/topic for anti-cluster behavior.
     * @param {Object} row Selected row.
     */
    function rememberPickedRow(row) {
      if (!row) return;
      remember(recentQuestionKeys, row.__key || buildQuestionKey(row), MAX_RECENT_QUESTIONS);
      remember(recentTopicKeys, row.__topic || extractTopic(row.q || ''), MAX_RECENT_TOPICS);
    }

    /**
     * Returns random opening question.
     * @returns {Object|null} Opening question object.
     */
    function getOpeningQuestion() {
      var item = popSmart(openingPool);
      if (!item) return null;

      rememberPickedRow(item);
      return {
        question: item.q,
        answer: item.a,
        category: 'سؤال افتتاحي',
        categoryId: 'opening',
        letter: ''
      };
    }

    /**
     * Pulls one question from category+letter pool using smart random strategy.
     * @param {string} categoryId Category id.
     * @param {string} letter Letter.
     * @returns {Object|null} Question object.
     */
    function takeFrom(categoryId, letter) {
      if (!categoryId || !pools[categoryId]) return null;
      var bucket = pools[categoryId][letter];
      var item = popSmart(bucket);
      if (!item) return null;

      rememberPickedRow(item);
      var category = getCategoryById(categoryId) || { name: categoryId };
      return {
        question: item.q,
        answer: item.a,
        category: category.name,
        categoryId: categoryId,
        letter: letter
      };
    }

    /**
     * Returns question with fallback strategy and no repeats.
     * @param {string} letter Requested letter.
     * @param {string} categoryId Requested category.
     * @returns {Object|null} Question object.
     */
    function getQuestion(letter, categoryId) {
      var safeLetter = String(letter || '').trim();
      var categoryOrder = [];

      if (categoryId) categoryOrder.push(categoryId);
      getSelectableCategories().forEach(function (category) {
        if (categoryOrder.indexOf(category.id) === -1) categoryOrder.push(category.id);
      });

      var question;

      for (var i = 0; i < categoryOrder.length; i += 1) {
        question = takeFrom(categoryOrder[i], safeLetter);
        if (question) return question;
      }

      for (var j = 0; j < LETTERS.length; j += 1) {
        if (LETTERS[j] === safeLetter) continue;
        question = takeFrom(categoryId, LETTERS[j]);
        if (question) return question;
      }

      for (var c = 0; c < categoryOrder.length; c += 1) {
        for (var l = 0; l < LETTERS.length; l += 1) {
          question = takeFrom(categoryOrder[c], LETTERS[l]);
          if (question) return question;
        }
      }

      return null;
    }

    return {
      loadAllQuestions: loadAllQuestions,
      getLoadState: getLoadState,
      getQuestion: getQuestion,
      getOpeningQuestion: getOpeningQuestion,
      getSelectableCategories: getSelectableCategories,
      getCategoryById: getCategoryById,
      getRandomCategory: getRandomCategory
    };
  })();

  window.QUESTION_MANAGER = QUESTION_MANAGER;
})();
