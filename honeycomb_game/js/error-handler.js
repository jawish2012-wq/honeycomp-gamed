(function () {
  console.log('✅ error-handler.js loaded');

  var LOG_KEY = 'hq_error_log';
  var MAX_ERRORS = 20;

  /**
   * Reads current error entries.
   * @returns {Array<Object>} Error entries.
   */
  function readLog() {
    try {
      var raw = localStorage.getItem(LOG_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (_error) {
      return [];
    }
  }

  /**
   * Writes bounded error entries.
   * @param {Array<Object>} entries Error entries.
   */
  function writeLog(entries) {
    localStorage.setItem(LOG_KEY, JSON.stringify((entries || []).slice(-MAX_ERRORS)));
  }

  /**
   * Appends error entry to persistent log.
   * @param {Object} entry Error entry.
   */
  function appendLog(entry) {
    var list = readLog();
    list.push(entry);
    writeLog(list);
  }

  /**
   * Creates a non-blocking toast in referee page.
   */
  function showRefereeToast() {
    var source = document.documentElement && document.documentElement.dataset
      ? document.documentElement.dataset.source
      : '';
    if (source !== 'referee') return;

    var existing = document.getElementById('hqErrorToast');
    if (existing) {
      existing.remove();
    }

    var toast = document.createElement('div');
    toast.id = 'hqErrorToast';
    toast.textContent = 'خطأ غير متوقع — تحقق من وحدة التحكم';
    toast.style.position = 'fixed';
    toast.style.bottom = '18px';
    toast.style.left = '18px';
    toast.style.zIndex = '99999';
    toast.style.padding = '10px 14px';
    toast.style.borderRadius = '10px';
    toast.style.background = 'rgba(180, 34, 34, 0.92)';
    toast.style.color = '#fff';
    toast.style.fontSize = '14px';
    toast.style.boxShadow = '0 6px 24px rgba(0,0,0,0.28)';
    toast.style.maxWidth = '360px';
    document.body.appendChild(toast);

    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 5000);
  }

  /**
   * Captures one runtime error.
   * @param {string} message Error message.
   * @param {string} source Source file.
   * @param {number} lineno Line number.
   * @param {number} colno Column number.
   */
  function captureError(message, source, lineno, colno) {
    appendLog({
      ts: Date.now(),
      message: String(message || 'Unknown error'),
      source: source || '',
      lineno: Number(lineno || 0),
      colno: Number(colno || 0)
    });
    showRefereeToast();
  }

  window.onerror = function (message, source, lineno, colno) {
    captureError(message, source, lineno, colno);
    return false;
  };

  window.onunhandledrejection = function (event) {
    var reason = event && event.reason ? event.reason : {};
    var message = reason && reason.message ? reason.message : String(reason || 'Unhandled rejection');
    captureError(message, '', 0, 0);
  };

  /**
   * Clears stored error log.
   */
  function clearErrorLog() {
    localStorage.removeItem(LOG_KEY);
  }

  window.clearErrorLog = clearErrorLog;
})();
