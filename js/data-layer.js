(function () {
  console.log('✅ data-layer.js loaded');

  var DATA_LAYER = (function () {
    var ROOM_STORAGE_KEY = 'hcg_roomPin';
    var DEFAULT_ROOM_PIN = '0000';
    var DEFAULT_FIREBASE_CONFIG = {
      apiKey: 'AIzaSyD-DcnhfDVMcexS-Fqtd9JGzgh_NI_DPfM',
      authDomain: 'beehive-game-48b4e.firebaseapp.com',
      databaseURL: 'https://beehive-game-48b4e-default-rtdb.firebaseio.com',
      projectId: 'beehive-game-48b4e',
      storageBucket: 'beehive-game-48b4e.firebasestorage.app',
      messagingSenderId: '163704815325',
      appId: '1:163704815325:web:ca58e7018c456567e32534',
      measurementId: 'G-Q474809F3T'
    };
    var listeners = {};
    var roomListeners = [];
    var app = null;
    var db = null;
    var source = 'display';
    var roomPin = null;
    var isReady = false;
    var OP_TIMEOUT_MS = 6000;

    /**
     * Returns current local timestamp in milliseconds.
     * @returns {number} Local Unix timestamp in ms.
     */
    function getTimestamp() {
      return Date.now();
    }

    /**
     * Returns Firebase server timestamp token.
     * @returns {*} Firebase server timestamp placeholder.
     */
    function getServerTimestamp() {
      return firebase.database.ServerValue.TIMESTAMP;
    }

    /**
     * Deep clones serializable values.
     * @param {*} value Any serializable value.
     * @returns {*} Cloned value.
     */
    function clone(value) {
      if (value === undefined) return null;
      return JSON.parse(JSON.stringify(value));
    }

    /**
     * Wraps async operations with timeout to prevent UI freeze.
     * @param {Promise<*>} promise Promise to wrap.
     * @param {number} timeoutMs Timeout in milliseconds.
     * @param {string} label Operation label.
     * @returns {Promise<*>} Wrapped promise.
     */
    function withTimeout(promise, timeoutMs, label) {
      var ms = Number(timeoutMs || OP_TIMEOUT_MS);
      return Promise.race([
        promise,
        new Promise(function (_resolve, reject) {
          setTimeout(function () {
            reject(new Error('Timeout in ' + (label || 'operation') + ' after ' + ms + 'ms'));
          }, ms);
        })
      ]);
    }

    /**
     * Splits a dot path into tokens.
     * @param {string} path Dot path.
     * @returns {Array<string>} Path tokens.
     */
    function splitPath(path) {
      return String(path || '').split('.').filter(Boolean);
    }

    /**
     * Normalizes incoming path aliases.
     * @param {string} path Raw incoming path.
     * @returns {string} Canonical path.
     */
    function normalizePath(path) {
      var safePath = String(path || '').trim();
      if (safePath === 'gameState') return 'game';
      if (safePath.indexOf('gameState.') === 0) {
        return 'game.' + safePath.slice('gameState.'.length);
      }
      return safePath;
    }

    /**
     * Converts a dot path to slash path.
     * @param {string} path Dot path.
     * @returns {string} Slash path.
     */
    function toSlashPath(path) {
      return splitPath(path).join('/');
    }

    /**
     * Returns true when a path is scoped under the active game node.
     * @param {string} path Canonical path.
     * @returns {boolean} True when room scope is required.
     */
    function isGameScopedPath(path) {
      return path === 'game' || path.indexOf('game.') === 0;
    }

    /**
     * Sanitizes and validates a room pin.
     * @param {string} rawPin Raw pin string.
     * @returns {string} Normalized 4 digit pin.
     */
    function sanitizeRoomPin(rawPin) {
      return String(rawPin || '').replace(/\D/g, '').slice(0, 4);
    }

    /**
     * Resolves Firebase config from global window object or default project config.
     * @returns {Object} Firebase config object.
     */
    function resolveFirebaseConfig() {
      var fromWindow = window.HCG_FIREBASE_CONFIG || null;
      var hasValidWindowConfig = fromWindow &&
        fromWindow.apiKey &&
        fromWindow.databaseURL &&
        fromWindow.apiKey !== 'YOUR_API_KEY';

      if (hasValidWindowConfig) {
        return fromWindow;
      }

      window.HCG_FIREBASE_CONFIG = Object.assign({}, DEFAULT_FIREBASE_CONFIG);
      return window.HCG_FIREBASE_CONFIG;
    }

    /**
     * Returns whether current source can access protected surprise paths.
     * @param {string} path Canonical path.
     * @returns {boolean} True when path is protected for buzzer source.
     */
    function isProtectedPath(path) {
      if (!path) return false;
      return path === 'game.board.surpriseMap' ||
        path.indexOf('game.board.surpriseMap.') === 0 ||
        path === 'game.surpriseConfig' ||
        path.indexOf('game.surpriseConfig.') === 0;
    }

    /**
     * Redacts secret surprise fields from game object for buzzer source.
     * @param {*} value Raw game object.
     * @returns {*} Redacted game object.
     */
    function redactGameForBuzzer(value) {
      var game = clone(value);
      if (!game || typeof game !== 'object') return game;

      if (game.board && typeof game.board === 'object') {
        delete game.board.surpriseMap;
      }

      delete game.surpriseConfig;

      if (game.currentTurn && typeof game.currentTurn === 'object') {
        delete game.currentTurn.pendingSurprise;
        delete game.currentTurn.pendingSurpriseType;
      }

      return game;
    }

    /**
     * Applies source-based redaction before returning values.
     * @param {string} path Canonical path.
     * @param {*} value Raw value.
     * @returns {*} Safe value.
     */
    function sanitizeForSource(path, value) {
      if (source !== 'buzzer') return clone(value);

      if (isProtectedPath(path)) {
        return null;
      }

      if (path === 'game') {
        return redactGameForBuzzer(value);
      }

      if (path === 'game.board') {
        var board = clone(value);
        if (board && typeof board === 'object') {
          delete board.surpriseMap;
        }
        return board;
      }

      return clone(value);
    }

    /**
     * Returns whether current source can write to a path.
     * @param {string} path Canonical path.
     * @returns {boolean} True when writing is allowed.
     */
    function canWritePath(path) {
      if (source !== 'buzzer') return true;
      return !isProtectedPath(path) && path !== 'game.surpriseConfig' && path.indexOf('game.surpriseConfig.') !== 0;
    }

    /**
     * Ensures Firebase app and database are initialized.
     */
    function ensureFirebase() {
      if (isReady) return;
      if (!window.firebase || !window.firebase.initializeApp) {
        throw new Error('Firebase SDK not loaded. Add firebase-app-compat and firebase-database-compat scripts.');
      }
      var firebaseConfig = resolveFirebaseConfig();
      if (!firebaseConfig || !firebaseConfig.apiKey || !firebaseConfig.databaseURL) {
        throw new Error('Missing HCG_FIREBASE_CONFIG. Define Firebase config before loading data-layer.js.');
      }

      app = firebase.apps && firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
      db = firebase.database(app);
      isReady = true;
    }

    /**
     * Emits room pin changes to room listeners.
     */
    function fireRoomListeners() {
      for (var i = 0; i < roomListeners.length; i += 1) {
        try {
          roomListeners[i](roomPin);
        } catch (error) {
          console.error('Room listener error:', error);
        }
      }
    }

    /**
     * Saves room pin to storage and rebinds all path listeners.
     * @param {string} pin Room pin.
     */
    function setRoomPinInternal(pin) {
      var normalized = sanitizeRoomPin(pin);
      if (!normalized) return;

      if (roomPin === normalized) return;
      roomPin = normalized;
      localStorage.setItem(ROOM_STORAGE_KEY, roomPin);
      rebindAllListeners();
      fireRoomListeners();
    }

    /**
     * Resolves canonical dot path to database ref path.
     * @param {string} path Canonical path.
     * @returns {string|null} Realtime Database slash path.
     */
    function resolveDbPath(path) {
      var safePath = normalizePath(path);

      if (!safePath) {
        return isReady ? '' : null;
      }

      if (safePath.indexOf('games.') === 0 || safePath === 'games') {
        return toSlashPath(safePath);
      }

      if (safePath.indexOf('referee.') === 0 || safePath === 'referee') {
        return toSlashPath(safePath);
      }

      if (isGameScopedPath(safePath)) {
        if (!roomPin) return null;
        if (safePath === 'game') {
          return 'games/' + roomPin + '/game';
        }
        return 'games/' + roomPin + '/game/' + toSlashPath(safePath.slice('game.'.length));
      }

      return toSlashPath(safePath);
    }

    /**
     * Builds a Firebase database ref from canonical path.
     * @param {string} path Canonical path.
     * @returns {firebase.database.Reference|null} Database reference.
     */
    function getRef(path) {
      ensureFirebase();
      var dbPath = resolveDbPath(path);
      if (dbPath === null) return null;
      return db.ref(dbPath);
    }

    /**
     * Ensures minimal room meta node exists (best effort).
     * @param {string} pin Room pin.
     * @returns {Promise<void>} Completion promise.
     */
    async function ensureRoomMeta(pin) {
      ensureFirebase();
      var normalized = sanitizeRoomPin(pin);
      if (!normalized || normalized.length !== 4) return;
      try {
        await db.ref('games/' + normalized + '/meta').update({
          roomPin: normalized,
          updatedAt: firebase.database.ServerValue.TIMESTAMP
        });
      } catch (error) {
        console.warn('⚠️ ensureRoomMeta skipped for room', normalized, error);
      }
    }

    /**
     * Binds one listener bucket to Firebase onValue stream.
     * @param {string} listenerPath Canonical path.
     */
    function bindListener(listenerPath) {
      var bucket = listeners[listenerPath];
      if (!bucket || bucket.off) return;

      var ref = getRef(listenerPath);
      if (!ref) {
        bucket.callbacks.forEach(function (callback) {
          callback(null, listenerPath);
        });
        return;
      }

      var handler = function (snapshot) {
        var safeValue = sanitizeForSource(listenerPath, snapshot.val());
        for (var i = 0; i < bucket.callbacks.length; i += 1) {
          bucket.callbacks[i](safeValue, listenerPath);
        }
      };

      var errorHandler = function (error) {
        console.error('Firebase listener error for', listenerPath, error);
      };

      ref.on('value', handler, errorHandler);
      bucket.off = function () {
        ref.off('value', handler);
        bucket.off = null;
      };
    }

    /**
     * Rebinds all active listeners (used after room pin changes).
     */
    function rebindAllListeners() {
      var paths = Object.keys(listeners);
      for (var i = 0; i < paths.length; i += 1) {
        var path = paths[i];
        var bucket = listeners[path];
        if (!bucket) continue;
        if (bucket.off) bucket.off();
        bindListener(path);
      }
    }

    /**
     * Normalizes buzzer object structure.
     * @param {Object} buzzer Raw buzzer.
     * @returns {Object} Normalized buzzer.
     */
    function normalizeBuzzer(buzzer) {
      var safe = buzzer && typeof buzzer === 'object' ? clone(buzzer) : {};
      if (!Array.isArray(safe.presses)) safe.presses = [];
      if (!safe.byKey || typeof safe.byKey !== 'object') safe.byKey = {};
      return safe;
    }

    /**
     * Appends a buzzer press using transaction + server timestamp.
     * @param {Object} incomingBuzzer Incoming full buzzer object.
     * @returns {Promise<void>} Completion promise.
     */
    function appendBuzzerPress(incomingBuzzer) {
      var buzzerRef = getRef('game.buzzer');
      if (!buzzerRef) {
        return Promise.reject(new Error('Room PIN is not selected.'));
      }

      var incoming = normalizeBuzzer(incomingBuzzer);
      return withTimeout(buzzerRef.transaction(function (currentRaw) {
        var current = normalizeBuzzer(currentRaw);
        if (!current.open) {
          return current;
        }

        var newPress = null;
        for (var i = 0; i < incoming.presses.length; i += 1) {
          var item = incoming.presses[i];
          var exists = current.presses.some(function (entry) {
            return entry && item && entry.playerId === item.playerId;
          });
          if (!exists) {
            newPress = item;
            break;
          }
        }

        if (!newPress) {
          return current;
        }

        var press = {
          playerId: newPress.playerId || '',
          playerName: newPress.playerName || '',
          team: newPress.team || '',
          timestamp: firebase.database.ServerValue.TIMESTAMP
        };

        current.presses.push(press);

        var candidateKey = null;
        var incomingKeys = Object.keys(incoming.byKey || {});
        for (var k = 0; k < incomingKeys.length; k += 1) {
          var key = incomingKeys[k];
          if (!current.byKey[key]) {
            candidateKey = key;
            break;
          }
        }

        if (!candidateKey) {
          candidateKey = 't_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
        }

        current.byKey[candidateKey] = press;
        return current;
      }, null, false).then(function () {}), OP_TIMEOUT_MS, 'appendBuzzerPress');
    }

    /**
     * Initializes firebase data layer and restores room pin.
     * @param {Object=} options Optional init options.
     * @returns {Promise<void>} Completion promise.
     */
    function initDataLayer(options) {
      ensureFirebase();
      source = (document.documentElement.dataset && document.documentElement.dataset.source) || 'display';

      var opts = options && typeof options === 'object' ? options : {};
      var fromOption = sanitizeRoomPin(opts.roomPin || opts.roomId);
      var fromStorage = sanitizeRoomPin(localStorage.getItem(ROOM_STORAGE_KEY));
      var resolved = fromOption || fromStorage || DEFAULT_ROOM_PIN;

      setRoomPinInternal(resolved);

      return Promise.resolve().then(function () {
        ensureRoomMeta(roomPin);
        rebindAllListeners();
        fireRoomListeners();
      });
    }

    /**
     * Generates and atomically creates a unique 4-digit room pin.
     * @returns {Promise<string>} New room pin.
     */
    async function createRoom() {
      ensureFirebase();
      var candidate = null;

      for (var attempt = 0; attempt < 20; attempt += 1) {
        candidate = String(Math.floor(1000 + Math.random() * 9000));
        var exists = false;
        try {
          var existsSnap = await withTimeout(
            db.ref('games/' + candidate + '/meta/roomPin').once('value'),
            OP_TIMEOUT_MS,
            'createRoom.exists'
          );
          exists = !!(existsSnap && existsSnap.exists && existsSnap.exists());
        } catch (existsError) {
          console.warn('⚠️ createRoom exists check skipped:', existsError);
        }
        if (exists) continue;

        try {
          await withTimeout(
            db.ref('games/' + candidate + '/meta').update({
              roomPin: candidate,
              status: 'setup',
              createdAt: firebase.database.ServerValue.TIMESTAMP,
              updatedAt: firebase.database.ServerValue.TIMESTAMP
            }),
            OP_TIMEOUT_MS,
            'createRoom'
          );
        } catch (error) {
          console.warn('⚠️ createRoom write timed out / failed, proceeding with local PIN:', candidate, error);
        }

        setRoomPinInternal(candidate);
        return candidate;
      }

      throw new Error('تعذر إنشاء رقم لعبة جديد. أعد المحاولة.');
    }

    /**
     * Joins an existing room by pin if it exists.
     * @param {string} pin 4-digit room pin.
     * @returns {Promise<boolean>} True if room exists and was joined.
     */
    async function joinRoom(pin) {
      ensureFirebase();
      var normalized = sanitizeRoomPin(pin);
      if (!normalized || normalized.length !== 4) return false;

      try {
        var roomSnap = await withTimeout(
          db.ref('games/' + normalized + '/meta/roomPin').once('value'),
          OP_TIMEOUT_MS,
          'joinRoom.exists'
        );
        if (!roomSnap || !roomSnap.exists || !roomSnap.exists()) {
          return false;
        }
      } catch (existsError) {
        console.warn('⚠️ joinRoom exists check skipped for room', normalized, existsError);
      }

      setRoomPinInternal(normalized);
      try {
        await withTimeout(ensureRoomMeta(normalized), OP_TIMEOUT_MS, 'joinRoom.ensureRoomMeta');
      } catch (error) {
        console.warn('⚠️ joinRoom meta sync skipped for room', normalized, error);
      }
      try {
        await withTimeout(
          db.ref('games/' + normalized + '/meta/updatedAt').set(firebase.database.ServerValue.TIMESTAMP),
          OP_TIMEOUT_MS,
          'joinRoom.updatedAt'
        );
      } catch (error) {
        console.warn('⚠️ joinRoom updatedAt skipped for room', normalized, error);
      }
      return true;
    }

    /**
     * Manually sets active room pin and rebinds listeners.
     * @param {string} pin 4-digit room pin.
     */
    function setRoomPin(pin) {
      setRoomPinInternal(pin);
    }

    /**
     * Returns current active room pin.
     * @returns {string|null} Active room pin.
     */
    function getRoomPin() {
      return roomPin;
    }

    /**
     * Subscribes to room pin changes.
     * @param {Function} callback Callback receiving room pin.
     * @returns {Function} Unsubscribe function.
     */
    function onRoomChange(callback) {
      if (typeof callback !== 'function') {
        return function () {};
      }
      roomListeners.push(callback);
      callback(roomPin);

      return function () {
        roomListeners = roomListeners.filter(function (fn) {
          return fn !== callback;
        });
      };
    }

    /**
     * Writes data at path.
     * @param {string} path Dot path.
     * @param {*} data Any serializable payload.
     * @returns {Promise<void>} Completion promise.
     */
    async function writeData(path, data) {
      var safePath = normalizePath(path);
      if (!canWritePath(safePath)) return;

      console.log('📦 DATA: writeData called, path:', safePath, 'data:', data);

      if (source === 'buzzer' && safePath === 'game.buzzer') {
        await appendBuzzerPress(data);
        return;
      }

      var ref = getRef(safePath);
      if (!ref) {
        throw new Error('Room PIN is not selected for path: ' + safePath);
      }
      await withTimeout(ref.set(clone(data)), OP_TIMEOUT_MS, 'writeData:' + safePath);
    }

    /**
     * Reads data once from path.
     * @param {string} path Dot path.
     * @returns {Promise<*>} Resolved value.
     */
    async function readData(path) {
      var safePath = normalizePath(path);
      if (source === 'buzzer' && isProtectedPath(safePath)) return null;

      var ref = getRef(safePath);
      if (!ref) return null;
      var snap = await withTimeout(ref.once('value'), OP_TIMEOUT_MS, 'readData:' + safePath);
      var value = snap.val();

      if (value === null && safePath === 'game' && roomPin) {
        try {
          // Legacy fallback: older builds stored game state at games/{pin} root.
          var legacySnap = await withTimeout(
            db.ref('games/' + roomPin).once('value'),
            OP_TIMEOUT_MS,
            'readData:legacyGameRoot'
          );
          var legacyValue = legacySnap.val();
          if (legacyValue && typeof legacyValue === 'object' && (legacyValue.settings || legacyValue.currentTurn || legacyValue.board)) {
            value = legacyValue;
          }
        } catch (legacyError) {
          console.warn('⚠️ legacy game root read skipped:', legacyError);
        }
      }

      return sanitizeForSource(safePath, value);
    }

    /**
     * Subscribes to path changes.
     * @param {string} path Dot path.
     * @param {Function} callback Listener callback.
     * @returns {Function} Unsubscribe function.
     */
    function onDataChange(path, callback) {
      var safePath = normalizePath(path);
      if (!listeners[safePath]) {
        listeners[safePath] = {
          callbacks: [],
          off: null
        };
      }

      listeners[safePath].callbacks.push(callback);
      bindListener(safePath);

      return function () {
        var bucket = listeners[safePath];
        if (!bucket) return;

        bucket.callbacks = bucket.callbacks.filter(function (cb) {
          return cb !== callback;
        });

        if (!bucket.callbacks.length) {
          if (bucket.off) bucket.off();
          delete listeners[safePath];
        }
      };
    }

    /**
     * Pushes a child record with auto-generated key.
     * @param {string} path Parent dot path.
     * @param {*} data Child payload.
     * @returns {Promise<string>} Generated key.
     */
    async function pushData(path, data) {
      var safePath = normalizePath(path);
      if (!canWritePath(safePath)) return '';

      var ref = getRef(safePath);
      if (!ref) {
        throw new Error('Room PIN is not selected for path: ' + safePath);
      }

      var payload = clone(data);
      if (source === 'buzzer' && safePath.indexOf('game.buzzer') === 0 && payload && typeof payload === 'object' && !('timestamp' in payload)) {
        payload.timestamp = firebase.database.ServerValue.TIMESTAMP;
      }

      var childRef = ref.push();
      await withTimeout(childRef.set(payload), OP_TIMEOUT_MS, 'pushData:' + safePath);
      return childRef.key;
    }

    /**
     * Applies partial update under a path.
     * @param {string} path Parent dot path.
     * @param {Object} updates Partial updates.
     * @returns {Promise<void>} Completion promise.
     */
    async function updateData(path, updates) {
      var safePath = normalizePath(path);
      if (!canWritePath(safePath)) return;

      var ref = getRef(safePath);
      if (!ref) {
        throw new Error('Room PIN is not selected for path: ' + safePath);
      }

      var payload = clone(updates) || {};
      await withTimeout(ref.update(payload), OP_TIMEOUT_MS, 'updateData:' + safePath);
    }

    /**
     * Removes data at path.
     * @param {string} path Dot path.
     * @returns {Promise<void>} Completion promise.
     */
    async function removeData(path) {
      var safePath = normalizePath(path);
      if (!canWritePath(safePath)) return;

      var ref = getRef(safePath);
      if (!ref) {
        throw new Error('Room PIN is not selected for path: ' + safePath);
      }

      await withTimeout(ref.remove(), OP_TIMEOUT_MS, 'removeData:' + safePath);
    }

    return {
      initDataLayer: initDataLayer,
      writeData: writeData,
      readData: readData,
      onDataChange: onDataChange,
      pushData: pushData,
      updateData: updateData,
      removeData: removeData,
      getTimestamp: getTimestamp,
      getServerTimestamp: getServerTimestamp,
      createRoom: createRoom,
      joinRoom: joinRoom,
      setRoomPin: setRoomPin,
      getRoomPin: getRoomPin,
      onRoomChange: onRoomChange
    };
  })();

  window.DATA_LAYER = DATA_LAYER;
})();
