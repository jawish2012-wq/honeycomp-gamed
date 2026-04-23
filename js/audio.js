(function () {
  console.log('✅ audio.js loaded');

  var audioContext = null;
  var unlocked = false;

  /**
   * Returns a shared AudioContext instance.
   * @returns {AudioContext|null} Context instance.
   */
  function getContext() {
    if (audioContext) return audioContext;
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioContext = new Ctx();
    return audioContext;
  }

  /**
   * Unlocks audio for mobile autoplay restrictions.
   * @returns {Promise<void>} Completion promise.
   */
  async function unlockAudio() {
    if (unlocked) return;
    var ctx = getContext();
    if (!ctx) return;

    try {
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      gain.gain.value = 0.00001;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.01);
      await ctx.suspend();
      await ctx.resume();
      unlocked = true;
    } catch (_error) {
      // Ignore unlock failures silently; interaction can retry.
    }
  }

  /**
   * Handles first user interaction unlock.
   */
  function onFirstInteraction() {
    unlockAudio();
    var ctx = getContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume();
    }
  }

  document.addEventListener('touchstart', onFirstInteraction, { passive: true, once: true });
  document.addEventListener('click', onFirstInteraction, { once: true });

  window.HQ_AUDIO = {
    unlockAudio: unlockAudio
  };
  window.unlockAudio = unlockAudio;
})();
