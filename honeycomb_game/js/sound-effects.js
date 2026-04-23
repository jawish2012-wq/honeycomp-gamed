(function () {
  console.log('✅ sound-effects.js loaded');

  var SOUND_EFFECTS = (function () {
    var audioCtx = null;
    var enabled = localStorage.getItem('hcg_soundMuted') !== '1';

    function init() {
      unlock();
      document.addEventListener('click', unlock, { once: true });
      document.addEventListener('touchstart', unlock, { once: true });
      document.addEventListener('keydown', unlock, { once: true });
    }

    function unlock() {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtx) {
        audioCtx = new Ctx();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(function () {});
      }
    }

    function setEnabled(value) {
      enabled = !!value;
      localStorage.setItem('hcg_soundMuted', enabled ? '0' : '1');
    }

    function isEnabled() {
      return enabled;
    }

    function tone(freq, duration, time, type, gain) {
      if (!enabled) return;
      unlock();
      if (!audioCtx) return;
      var osc = audioCtx.createOscillator();
      var envelope = audioCtx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, time);
      envelope.gain.setValueAtTime(0.0001, time);
      envelope.gain.linearRampToValueAtTime(gain || 0.12, time + 0.01);
      envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
      osc.connect(envelope).connect(audioCtx.destination);
      osc.start(time);
      osc.stop(time + duration);
    }

    function now() {
      return audioCtx ? audioCtx.currentTime : 0;
    }

    function noise(duration) {
      if (!enabled) return;
      unlock();
      if (!audioCtx) return;
      var frameCount = Math.floor(audioCtx.sampleRate * duration);
      var buffer = audioCtx.createBuffer(1, frameCount, audioCtx.sampleRate);
      var data = buffer.getChannelData(0);
      for (var i = 0; i < frameCount; i += 1) data[i] = Math.random() * 2 - 1;

      var source = audioCtx.createBufferSource();
      var filter = audioCtx.createBiquadFilter();
      var envelope = audioCtx.createGain();
      filter.type = 'bandpass';
      filter.frequency.value = 3000;
      envelope.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      envelope.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + 0.02);
      envelope.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
      source.buffer = buffer;
      source.connect(filter).connect(envelope).connect(audioCtx.destination);
      source.start();
      source.stop(audioCtx.currentTime + duration);
    }

    function playBuzzerPress() { tone(800, 0.15, now(), 'sine', 0.14); }
    function playCorrectAnswer() { var t = now(); tone(400, 0.1, t, 'sine', 0.14); tone(600, 0.1, t + 0.15, 'sine', 0.14); tone(800, 0.1, t + 0.30, 'sine', 0.14); }
    function playWrongAnswer() { var t = now(); tone(400, 0.14, t, 'sawtooth', 0.14); tone(200, 0.18, t + 0.12, 'sawtooth', 0.14); }
    function playQueenReveal() { var t = now(); [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.2, t + i * 0.2, 'sine', 0.13); }); }
    function playRaidReveal() { var t = now(); tone(200, 0.1, t, 'square', 0.14); tone(150, 0.1, t + 0.12, 'square', 0.14); }
    function playShieldReveal() { var t = now(); tone(1200, 0.2, t, 'sine', 0.12); tone(2400, 0.2, t, 'sine', 0.08); }
    function playFreezeReveal() { tone(80, 0.5, now(), 'sine', 0.16); }
    function playDoubleStrikeReveal() { var t = now(); tone(300, 0.1, t, 'square', 0.12); tone(250, 0.1, t + 0.15, 'square', 0.12); }
    function playBlitzReveal() { noise(0.2); }
    function playWinRound() { var t = now(); [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.3, t + i * 0.3, 'sine', 0.14); }); tone(1047, 0.5, t + 1.2, 'sine', 0.14); }
    function playWinMatch() { var t = now(); [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.5, t + i * 0.3, 'sine', 0.12); }); tone(523, 1.0, t + 1.2, 'sine', 0.10); tone(659, 1.0, t + 1.2, 'sine', 0.10); tone(784, 1.0, t + 1.2, 'sine', 0.10); }
    function playTickSound() { tone(1000, 0.03, now(), 'sine', 0.10); }
    function playWheelSpin(step) { var f = step > 10 ? 600 : (step > 4 ? 400 : 300); tone(f, 0.02, now(), 'square', 0.08); }
    function playTimerWarning() { tone(900, 0.1, now(), 'sine', 0.15); }
    function playHotCellReveal() { var t = now(); tone(180, 0.12, t, 'sawtooth', 0.12); tone(220, 0.12, t + 0.1, 'triangle', 0.08); }
    function playHotCellBurned() { noise(0.15); var t = now(); tone(380, 0.08, t, 'sine', 0.09); tone(180, 0.12, t + 0.08, 'sine', 0.09); }
    function playHotCellDefended() { var t = now(); tone(650, 0.05, t, 'triangle', 0.1); tone(760, 0.06, t + 0.06, 'triangle', 0.09); }
    function playMirrorReveal() { var t = now(); tone(1400, 0.09, t, 'sine', 0.08); tone(1750, 0.11, t + 0.09, 'sine', 0.08); }
    function playVoucherIssued() { var t = now(); tone(240, 0.05, t, 'square', 0.1); tone(140, 0.07, t + 0.05, 'square', 0.1); }
    function playVoucherTriggered() { var t = now(); playRaidReveal(); tone(420, 0.09, t + 0.12, 'sawtooth', 0.1); }

    return {
      init: init,
      setEnabled: setEnabled,
      isEnabled: isEnabled,
      playBuzzerPress: playBuzzerPress,
      playCorrectAnswer: playCorrectAnswer,
      playWrongAnswer: playWrongAnswer,
      playQueenReveal: playQueenReveal,
      playRaidReveal: playRaidReveal,
      playShieldReveal: playShieldReveal,
      playFreezeReveal: playFreezeReveal,
      playDoubleStrikeReveal: playDoubleStrikeReveal,
      playBlitzReveal: playBlitzReveal,
      playWinRound: playWinRound,
      playWinMatch: playWinMatch,
      playTickSound: playTickSound,
      playWheelSpin: playWheelSpin,
      playTimerWarning: playTimerWarning,
      playHotCellReveal: playHotCellReveal,
      playHotCellBurned: playHotCellBurned,
      playHotCellDefended: playHotCellDefended,
      playMirrorReveal: playMirrorReveal,
      playVoucherIssued: playVoucherIssued,
      playVoucherTriggered: playVoucherTriggered
    };
  })();

  window.SOUND_EFFECTS = SOUND_EFFECTS;
})();
