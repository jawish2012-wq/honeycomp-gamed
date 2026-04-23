(function () {
  console.log('✅ hex-grid.js loaded');

  var HEX_GRID = (function () {
    var LETTERS = ['أ', 'ب', 'ت', 'ث', 'ج', 'ح', 'خ', 'د', 'ذ', 'ر', 'ز', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ك', 'ل', 'م', 'ن', 'هـ', 'و', 'ي'];
    var cellsCache = [];

    /**
     * Returns a shuffled copy of an array using Fisher-Yates.
     * @param {Array} source Source array.
     * @returns {Array} Shuffled copy.
     */
    function shuffle(source) {
      var list = Array.isArray(source) ? source.slice() : [];
      for (var i = list.length - 1; i > 0; i -= 1) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = list[i];
        list[i] = list[j];
        list[j] = temp;
      }
      return list;
    }

    /**
     * Assigns 25 random Arabic letters from the letters pool.
     * @returns {Array<string>} Assigned letters.
     */
    function assignLetters() {
      return shuffle(LETTERS).slice(0, 25);
    }

    /**
     * Generates a 5x5 board model with default metadata.
     * @returns {Array<Object>} Generated board cells.
     */
    function generateGrid() {
      var letters = assignLetters();
      var cells = [];
      for (var row = 0; row < 5; row += 1) {
        for (var col = 0; col < 5; col += 1) {
          var index = row * 5 + col;
          cells.push({
            index: index,
            row: row,
            col: col,
            letter: letters[index],
            owner: null,
            selected: false,
            winningPath: false,
            isQueen: false,
            shielded: false,
            frozen: false,
            frozenTurnsLeft: 0,
            isHot: false,
            hotTurnsLeft: 0,
            hotOwner: null
          });
        }
      }
      cellsCache = cells.slice();
      return cells;
    }

    /**
     * Converts row/col to linear index.
     * @param {number} row Row index.
     * @param {number} col Column index.
     * @returns {number} Linear index.
     */
    function toIndex(row, col) {
      return row * 5 + col;
    }

    /**
     * Returns neighbor indices for the rendered hex layout.
     * The board is rendered in RTL with odd rows shifted right,
     * so adjacency uses reversed odd-r offsets to match the visual grid.
     * @param {number} cellIndex Cell index.
     * @returns {Array<number>} Neighbor indices.
     */
    function getNeighbors(cellIndex) {
      var row = Math.floor(cellIndex / 5);
      var col = cellIndex % 5;
      var offsets = (row % 2 === 0)
        ? [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0], [1, 1]]
        : [[-1, -1], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 0]];

      var neighbors = [];
      for (var i = 0; i < offsets.length; i += 1) {
        var nr = row + offsets[i][0];
        var nc = col + offsets[i][1];
        if (nr >= 0 && nr < 5 && nc >= 0 && nc < 5) {
          neighbors.push(toIndex(nr, nc));
        }
      }
      return neighbors;
    }

    /**
     * Logs one-time neighbor verification for debugging.
     */
    function logNeighborVerification() {
      console.log('🧪 Neighbor test:');
      console.log('Neighbors of cell 2 (row0,col2):', getNeighbors(2));
      console.log('Neighbors of cell 8 (row1,col3):', getNeighbors(8));
      console.log('Is 2↔8 neighbors?', getNeighbors(2).includes(8));
      console.log('Neighbors of cell 12 (row2,col2):', getNeighbors(12));
      console.log('Is 8↔12 neighbors?', getNeighbors(8).includes(12));
      console.log('Neighbors of cell 18 (row3,col3):', getNeighbors(18));
      console.log('Is 12↔18 neighbors?', getNeighbors(12).includes(18));
    }

    /**
     * Renders board cells into a container.
     * @param {HTMLElement} container Grid container.
     * @param {Array<Object>} cells Board cells.
     * @param {{clickable:boolean,miniMode:boolean,showLetters:boolean,onCellClick:Function}} options Render options.
     */
    function renderGrid(container, cells, options) {
      if (!container) return;

      var opts = Object.assign({
        clickable: false,
        miniMode: false,
        showLetters: true,
        onCellClick: null
      }, options || {});

      var safeCells = Array.isArray(cells) ? cells : [];
      cellsCache = safeCells.slice();

      container.innerHTML = '';
      container.classList.toggle('mini-mode', !!opts.miniMode);
      container.classList.toggle('display-mode', !opts.miniMode);

      for (var row = 0; row < 5; row += 1) {
        var rowEl = document.createElement('div');
        rowEl.className = 'hex-row' + (row % 2 === 1 ? ' offset-row' : '');

        for (var col = 0; col < 5; col += 1) {
          var index = toIndex(row, col);
          var cell = safeCells[index] || {};
          var cellEl = buildCellElement(cell, opts);
          rowEl.appendChild(cellEl);
        }

        container.appendChild(rowEl);
      }

      addEdgeIndicators(container);
    }

    /**
     * Builds one rendered cell element.
     * @param {Object} cell Cell state object.
     * @param {Object} opts Render options.
     * @returns {HTMLElement} Cell element.
     */
    function buildCellElement(cell, opts) {
      var cellEl = document.createElement('div');
      var index = Number(cell.index);
      if (Number.isNaN(index)) index = 0;
      var owner = getSafeOwner(cell.owner);
      cellEl.className = 'hex-cell';
      cellEl.dataset.index = String(index);

      if (opts.clickable) {
        cellEl.classList.add('clickable');
      }
      if (owner === 'team1') {
        cellEl.classList.add('team1');
      }
      if (owner === 'team2') {
        cellEl.classList.add('team2');
      }
      if (cell.selected) {
        cellEl.classList.add('selected');
      }
      if (cell.winningPath) {
        cellEl.classList.add('winning-path');
      }
      if (cell.selectable) {
        cellEl.classList.add('selectable-target');
      }
      if (owner && cell.isQueen) {
        cellEl.classList.add('queen-cell');
      }
      if (owner && cell.shielded) {
        cellEl.classList.add('shielded-cell');
      }
      if (cell.frozen) {
        cellEl.classList.add('frozen-cell');
      }
      if (cell.isHot) {
        cellEl.classList.add('hot-cell');
      }

      var letterEl = document.createElement('span');
      letterEl.className = 'letter';
      letterEl.textContent = opts.showLetters ? (cell.letter || '') : '';
      cellEl.appendChild(letterEl);

      if (owner && cell.isQueen) {
        var queenIcon = document.createElement('span');
        queenIcon.className = 'cell-icon queen-icon';
        queenIcon.textContent = '👑';
        cellEl.appendChild(queenIcon);
      }

      if (owner && cell.shielded) {
        var shieldIcon = document.createElement('span');
        shieldIcon.className = 'cell-icon shield-icon';
        shieldIcon.textContent = '🛡️';
        cellEl.appendChild(shieldIcon);
      }

      if (cell.frozen) {
        var freezeIcon = document.createElement('span');
        freezeIcon.className = 'cell-icon freeze-icon';
        freezeIcon.textContent = '❄️';
        cellEl.appendChild(freezeIcon);

        if (Number(cell.frozenTurnsLeft || 0) > 0) {
          var freezeCount = document.createElement('span');
          freezeCount.className = 'cell-turn-badge freeze-badge';
          freezeCount.textContent = String(Number(cell.frozenTurnsLeft));
          cellEl.appendChild(freezeCount);
        }
      }

      if (cell.isHot) {
        var hotIcon = document.createElement('span');
        hotIcon.className = 'cell-icon hot-icon';
        hotIcon.textContent = '🔥';
        cellEl.appendChild(hotIcon);

        if (Number(cell.hotTurnsLeft || 0) > 0) {
          var hotCount = document.createElement('span');
          hotCount.className = 'cell-turn-badge hot-badge';
          hotCount.textContent = String(Number(cell.hotTurnsLeft));
          cellEl.appendChild(hotCount);
        }
      }

      if (opts.clickable && typeof opts.onCellClick === 'function') {
        cellEl.addEventListener('click', function () {
          opts.onCellClick(index);
        });
      }

      return cellEl;
    }

    /**
     * Adds directional edge indicators around a grid.
     * @param {HTMLElement} container Grid container.
     */
    function addEdgeIndicators(container) {
      var names = ['left', 'right', 'top', 'bottom'];
      for (var i = 0; i < names.length; i += 1) {
        var edge = document.createElement('div');
        edge.className = 'edge-indicator ' + names[i];
        container.appendChild(edge);
      }
    }

    /**
     * Highlights one selected cell visually.
     * @param {number} cellIndex Cell index.
     * @param {string} color Optional glow color.
     */
    function highlightCell(cellIndex, color) {
      var nodes = document.querySelectorAll('.hex-cell[data-index="' + cellIndex + '"]');
      for (var i = 0; i < nodes.length; i += 1) {
        nodes[i].classList.add('selected');
        if (color) {
          nodes[i].style.setProperty('--selected-glow', color);
        }
      }
    }

    /**
     * Runs capture animation class and owner color class for one cell.
     * @param {number} cellIndex Cell index.
     * @param {'team1'|'team2'} teamId Team owner id.
     */
    function animateCellCapture(cellIndex, teamId) {
      var nodes = document.querySelectorAll('.hex-cell[data-index="' + cellIndex + '"]');
      for (var i = 0; i < nodes.length; i += 1) {
        var node = nodes[i];
        node.classList.remove('captured');
        void node.offsetWidth;
        node.classList.add('captured');
        node.classList.remove('team1', 'team2');
        node.classList.add(teamId);
      }
    }

    /**
     * Highlights one cell as a revealed surprise type.
     * @param {number} cellIndex Cell index.
     * @param {string} type Surprise type id.
     */
    function animateSurprise(cellIndex, type) {
      var nodes = document.querySelectorAll('.hex-cell[data-index="' + cellIndex + '"]');
      for (var i = 0; i < nodes.length; i += 1) {
        var node = nodes[i];
        if (!node.classList.contains('team1') && !node.classList.contains('team2')) {
          continue;
        }
        var classes = ['surprise-queen', 'surprise-blitz', 'surprise-raid', 'surprise-shield', 'surprise-freeze', 'surprise-double'];
        node.classList.remove.apply(node.classList, classes);
        node.classList.add('surprise-' + type);
        (function (targetNode, existingClasses) {
          setTimeout(function () {
            for (var c = 0; c < existingClasses.length; c += 1) {
              targetNode.classList.remove(existingClasses[c]);
            }
          }, 2200);
        })(node, classes);
      }
    }

    /**
     * Returns a trusted owner value for rendering.
     * @param {*} owner Raw owner value.
     * @returns {'team1'|'team2'|null} Safe owner value.
     */
    function getSafeOwner(owner) {
      if (owner === 'team1' || owner === 'team2') {
        return owner;
      }
      return null;
    }

    /**
     * Clears selected and winning path highlights.
     */
    function clearHighlights() {
      var nodes = document.querySelectorAll('.hex-cell.selected, .hex-cell.winning-path');
      for (var i = 0; i < nodes.length; i += 1) {
        nodes[i].classList.remove('selected');
        nodes[i].classList.remove('winning-path');
        nodes[i].style.removeProperty('--selected-glow');
        nodes[i].style.boxShadow = '';
      }
    }

    /**
     * Highlights all path cells for a winning chain.
     * @param {Array<number>} indices Winning path indices.
     * @param {'team1'|'team2'} teamId Winner team id.
     */
    function highlightWinningPath(indices, teamId) {
      if (!Array.isArray(indices)) return;
      for (var i = 0; i < indices.length; i += 1) {
        var nodes = document.querySelectorAll('.hex-cell[data-index="' + indices[i] + '"]');
        for (var j = 0; j < nodes.length; j += 1) {
          nodes[j].classList.add('winning-path');
          nodes[j].classList.add(teamId === 'team1' ? 'winning-team1' : 'winning-team2');
        }
      }
    }

    /**
     * Returns all cached cells owned by one team.
     * @param {string} owner Team id.
     * @returns {Array<Object>} Owned cells.
     */
    function getCellsByOwner(owner) {
      return cellsCache.filter(function (cell) {
        return getSafeOwner(cell.owner) === getSafeOwner(owner);
      });
    }

    /**
     * Returns all cached cells that are still unowned.
     * @returns {Array<Object>} Empty cells.
     */
    function getEmptyCells() {
      return cellsCache.filter(function (cell) {
        return getSafeOwner(cell.owner) === null && !cell.frozen;
      });
    }

    logNeighborVerification();

    return {
      generateGrid: generateGrid,
      renderGrid: renderGrid,
      getNeighbors: getNeighbors,
      assignLetters: assignLetters,
      highlightCell: highlightCell,
      animateCellCapture: animateCellCapture,
      animateSurprise: animateSurprise,
      highlightWinningPath: highlightWinningPath,
      clearHighlights: clearHighlights,
      getCellsByOwner: getCellsByOwner,
      getEmptyCells: getEmptyCells
    };
  })();

  window.HEX_GRID = HEX_GRID;
})();
