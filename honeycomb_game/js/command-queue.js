(function () {
  console.log('✅ command-queue.js loaded');

  /**
   * Serial command queue for async operations.
   */
  function CommandQueue() {
    this._tail = Promise.resolve();
  }

  /**
   * Enqueues an async command and runs it when previous command completes.
   * @param {Function} asyncFn Async function returning a promise.
   * @returns {Promise<*>} Command result.
   */
  CommandQueue.prototype.enqueue = function (asyncFn) {
    var run = this._tail.then(function () {
      return Promise.resolve().then(asyncFn);
    });
    this._tail = run.catch(function () {});
    return run;
  };

  window.CommandQueue = CommandQueue;
})();
