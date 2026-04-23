(function () {
  console.log('✅ qr-generator.js loaded');

  var QR_GENERATOR = (function () {
    /**
     * Sanitizes room pin text to 4 digits.
     * @param {string} value Raw input.
     * @returns {string} 4-digit pin or empty string.
     */
    function sanitizePin(value) {
      return String(value || '').replace(/\D/g, '').slice(0, 4);
    }

    /**
     * Returns absolute buzzer URL with optional room pin query.
     * @param {string=} roomPin Optional room pin.
     * @returns {string} URL.
     */
    function getBuzzerUrl(roomPin) {
      var base = window.location.origin + window.location.pathname.replace(/display\.html$/i, 'buzzer.html');
      var pin = sanitizePin(roomPin);
      if (!pin) return base;
      return base + '?pin=' + encodeURIComponent(pin);
    }

    /**
     * Renders QR image and URL text.
     * @param {HTMLImageElement} imageElement Image element.
     * @param {HTMLElement} textElement Text element.
     * @param {string=} roomPin Optional room pin.
     * @returns {string} URL.
     */
    function render(imageElement, textElement, roomPin) {
      var url = getBuzzerUrl(roomPin);
      var source = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent(url);

      if (imageElement) {
        imageElement.src = source;
        imageElement.alt = 'رمز QR للانضمام';
      }
      if (textElement) {
        textElement.textContent = url;
      }

      return url;
    }

    return { render: render, getBuzzerUrl: getBuzzerUrl };
  })();

  window.QR_GENERATOR = QR_GENERATOR;
})();
