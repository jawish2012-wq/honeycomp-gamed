(function () {
  console.log('✅ migrations.js loaded');

  var CURRENT_SCHEMA_VERSION = 3;

  /**
   * Deep clones JSON-safe values.
   * @param {*} value Any serializable value.
   * @returns {*} Cloned value.
   */
  function clone(value) {
    return JSON.parse(JSON.stringify(value || {}));
  }

  /**
   * Migrates v1 state to v2 shape.
   * @param {Object} state State object.
   * @returns {Object} Migrated state.
   */
  function migrateV1ToV2(state) {
    if (!Array.isArray(state.surprises)) {
      state.surprises = [];
    }
    state.schemaVersion = 2;
    return state;
  }

  /**
   * Migrates v2 state to v3 shape.
   * @param {Object} state State object.
   * @returns {Object} Migrated state.
   */
  function migrateV2ToV3(state) {
    if (!Array.isArray(state.event_log)) {
      state.event_log = [];
    }
    state.schemaVersion = 3;
    return state;
  }

  /**
   * Migrates an arbitrary state object to current schema version.
   * @param {Object} inputState State object from persistence.
   * @returns {Object} Migrated state object.
   */
  function migrateState(inputState) {
    var state = clone(inputState);
    var version = Number(state.schemaVersion || 1);

    if (version < 2) {
      state = migrateV1ToV2(state);
      version = 2;
    }
    if (version < 3) {
      state = migrateV2ToV3(state);
      version = 3;
    }

    state.schemaVersion = CURRENT_SCHEMA_VERSION;
    return state;
  }

  window.MIGRATIONS = {
    CURRENT_SCHEMA_VERSION: CURRENT_SCHEMA_VERSION,
    migrateState: migrateState
  };
})();
