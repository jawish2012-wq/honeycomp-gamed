(function () {
  console.log('✅ path-checker.js loaded');

  var PATH_CHECKER = (function () {
    /**
     * Converts linear index to row/col coordinates.
     * @param {number} index Cell index.
     * @returns {{row:number,col:number}} Coordinate object.
     */
    function indexToCoord(index) {
      return {
        row: Math.floor(index / 5),
        col: index % 5
      };
    }

    /**
     * Returns safe normalized owner/team id.
     * @param {*} owner Raw owner value.
     * @returns {'team1'|'team2'|null} Normalized owner.
     */
    function getSafeOwner(owner) {
      if (owner === 'team1' || owner === 'team2') return owner;
      return null;
    }

    /**
     * Returns a safe numeric index for a cell.
     * @param {Object} cell Cell object.
     * @param {number} fallbackIndex Array fallback index.
     * @returns {number} Safe index value.
     */
    function getSafeIndex(cell, fallbackIndex) {
      var idx = Number(cell && cell.index);
      return Number.isNaN(idx) ? Number(fallbackIndex) : idx;
    }

    /**
     * Builds a map of cells indexed by their safe index.
     * @param {Array<Object>} board Board cells.
     * @returns {Object<number,Object>} Cell map by index.
     */
    function buildCellIndexMap(board) {
      var map = {};
      var cells = Array.isArray(board) ? board : [];
      for (var i = 0; i < cells.length; i += 1) {
        if (!cells[i]) continue;
        map[getSafeIndex(cells[i], i)] = cells[i];
      }
      return map;
    }

    /**
     * Rebuilds BFS path from parent links.
     * @param {Object<string,number>} parents Parent map.
     * @param {number} endNode End node.
     * @returns {Array<number>} Rebuilt path.
     */
    function rebuildPath(parents, endNode) {
      var path = [endNode];
      var cursor = endNode;
      while (parents[String(cursor)] !== undefined) {
        cursor = parents[String(cursor)];
        path.push(cursor);
      }
      path.reverse();
      return path;
    }

    /**
     * Returns true if index reached target edge for direction.
     * @param {number} index Cell index.
     * @param {'horizontal'|'vertical'} direction Team direction.
     * @returns {boolean} True when edge reached.
     */
    function reachedTargetEdge(index, direction) {
      var coord = indexToCoord(index);
      if (direction === 'horizontal') return coord.col === 4;
      return coord.row === 4;
    }

    /**
     * Returns true if cell is blocked from BFS traversal.
     * @param {Object} cell Cell object.
     * @returns {boolean} True when frozen wall.
     */
    function isBlocked(cell) {
      return !!(cell && cell.frozen);
    }

    /**
     * Collects BFS starts from correct edge.
     * @param {Array<Object>} board Board cells.
     * @param {string} team Team id.
     * @param {'horizontal'|'vertical'} direction Team direction.
     * @returns {Array<number>} Start indices.
     */
    function collectStarts(board, team, direction) {
      var safeTeam = getSafeOwner(team);
      if (!safeTeam) return [];

      var starts = [];
      var cells = Array.isArray(board) ? board : [];
      for (var i = 0; i < cells.length; i += 1) {
        var cell = cells[i];
        if (!cell || isBlocked(cell)) continue;
        if (getSafeOwner(cell.owner) !== safeTeam) continue;

        var idx = getSafeIndex(cell, i);
        var coord = indexToCoord(idx);

        if (direction === 'horizontal' && coord.col === 0) starts.push(idx);
        if (direction === 'vertical' && coord.row === 0) starts.push(idx);
      }
      return starts;
    }

    /**
     * Runs BFS to detect if a team completed a connecting path.
     * NOTE: queen cells are treated as normal owned cells.
     * @param {Array<Object>} board Board cells.
     * @param {string} team Team id.
     * @param {'horizontal'|'vertical'} direction Team direction.
     * @param {Array<number>} _queenCells Deprecated, ignored.
     * @returns {{won:boolean,path:Array<number>}} Win result object.
     */
    function checkWin(board, team, direction, _queenCells) {
      var safeTeam = getSafeOwner(team);
      if (!safeTeam) {
        return { won: false, path: [] };
      }

      var safeDirection = direction === 'horizontal' ? 'horizontal' : 'vertical';
      var cells = Array.isArray(board) ? board : [];
      var cellMap = buildCellIndexMap(cells);
      var starts = collectStarts(cells, safeTeam, safeDirection);

      if (!starts.length) {
        return { won: false, path: [] };
      }

      var queue = starts.slice();
      var visited = {};
      var parents = {};

      for (var i = 0; i < starts.length; i += 1) {
        visited[String(starts[i])] = true;
      }

      while (queue.length) {
        var current = queue.shift();

        if (reachedTargetEdge(current, safeDirection)) {
          return {
            won: true,
            path: rebuildPath(parents, current)
          };
        }

        var neighbors = HEX_GRID.getNeighbors(current);
        for (var j = 0; j < neighbors.length; j += 1) {
          var next = neighbors[j];
          if (visited[String(next)]) continue;

          var nextCell = cellMap[next];
          if (!nextCell || isBlocked(nextCell)) continue;
          if (getSafeOwner(nextCell.owner) !== safeTeam) continue;

          visited[String(next)] = true;
          parents[String(next)] = current;
          queue.push(next);
        }
      }

      return { won: false, path: [] };
    }

    /**
     * Returns winning path only for convenience callers.
     * @param {Array<Object>} board Board cells.
     * @param {string} team Team id.
     * @param {'horizontal'|'vertical'} direction Team direction.
     * @param {Array<number>} queenCells Deprecated, ignored.
     * @returns {Array<number>} Winning path or empty array.
     */
    function getWinningPath(board, team, direction, queenCells) {
      return checkWin(board, team, direction, queenCells).path;
    }

    return {
      checkWin: checkWin,
      getWinningPath: getWinningPath
    };
  })();

  window.PATH_CHECKER = PATH_CHECKER;
})();
