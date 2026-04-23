(function () {
  console.log('✅ surprise-engine.js loaded');

  var SURPRISE_ENGINE = (function () {
    var BASE_HEAT = [
      [3, 5, 6, 5, 3],
      [5, 8, 9, 8, 5],
      [6, 9, 10, 9, 6],
      [5, 8, 9, 8, 5],
      [3, 5, 6, 5, 3]
    ];

    var PAIRS = [
      { id: 'pair1', types: ['raid', 'shield'], minBestOf: 3 },
      { id: 'pair2', types: ['freeze', 'double'], minBestOf: 3 },
      { id: 'pair3', types: ['raid', 'freeze'], minBestOf: 3 },
      { id: 'pair4', types: ['shield', 'double'], minBestOf: 5 },
      { id: 'pair5', types: ['mirror', 'raid'], minBestOf: 5 },
      { id: 'pair6', types: ['mirror', 'freeze'], minBestOf: 5 }
    ];

    var HEAT_RANGES = {
      freeze: [8, 10],
      queen: [7, 9],
      hot: [7, 9],
      shield: [6, 8],
      raid: [5, 7],
      double: [4, 7],
      mirror: [3, 6]
    };

    var PICKINESS_ORDER = ['freeze', 'queen', 'hot', 'shield', 'raid', 'double', 'mirror'];

    /**
     * Deep-clones plain JSON values.
     * @param {*} value Value to clone.
     * @returns {*} Cloned value.
     */
    function clone(value) {
      return JSON.parse(JSON.stringify(value));
    }

    /**
     * Shuffles list using Fisher-Yates.
     * @param {Array} list Source list.
     * @returns {Array} Shuffled copy.
     */
    function fisherYates(list) {
      var arr = Array.isArray(list) ? list.slice() : [];
      for (var i = arr.length - 1; i > 0; i -= 1) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
      }
      return arr;
    }

    /**
     * Converts index to row/col.
     * @param {number} index Cell index.
     * @returns {{row:number,col:number}} Coordinate.
     */
    function toCoord(index) {
      return {
        row: Math.floor(index / 5),
        col: index % 5
      };
    }

    /**
     * Converts row/col to index.
     * @param {number} row Row.
     * @param {number} col Column.
     * @returns {number} Cell index.
     */
    function toIndex(row, col) {
      return row * 5 + col;
    }

    /**
     * Returns rotated heat map for a round number.
     * @param {number} roundNumber Current round number.
     * @returns {Array<Array<number>>} Rotated heat map.
     */
    function getRotatedHeatMap(roundNumber) {
      var map = clone(BASE_HEAT);
      var cycle = ((Number(roundNumber || 1) - 1) % 6) + 1;

      for (var r = 0; r < 5; r += 1) {
        for (var c = 0; c < 5; c += 1) {
          if (cycle === 1 && r <= 1 && c <= 2) map[r][c] += 2;
          if (cycle === 2 && r >= 3 && c >= 2) map[r][c] += 2;
          if (cycle === 3 && r <= 1 && c >= 2) map[r][c] += 2;
          if (cycle === 4 && r >= 3 && c <= 2) map[r][c] += 2;
          if (cycle === 5 && (r === 0 || r === 4 || c === 0 || c === 4)) map[r][c] += 2;
          if (cycle === 6 && r >= 1 && r <= 3 && c >= 1 && c <= 3) map[r][c] += 1;
        }
      }

      return map;
    }

    /**
     * Returns heat value for a cell index.
     * @param {number} index Cell index.
     * @param {Array<Array<number>>} heatMap Heat map.
     * @returns {number} Heat value.
     */
    function getCellHeat(index, heatMap) {
      var coord = toCoord(index);
      return Number(heatMap[coord.row][coord.col] || 0);
    }

    /**
     * Returns available surprise pairs.
     * @param {Array<string>} usedPairs Used pair ids.
     * @param {number} bestOf Best-of count.
     * @returns {Array<Object>} Available pairs.
     */
    function getAvailablePairs(usedPairs, bestOf) {
      var used = Array.isArray(usedPairs) ? usedPairs : [];
      var safeBest = Number(bestOf || 3);
      return PAIRS.filter(function (pair) {
        if (pair.minBestOf > safeBest) return false;
        return used.indexOf(pair.id) === -1;
      });
    }

    /**
     * Builds surprise list per round type.
     * @param {'normal'|'finale'} roundType Round type.
     * @param {Object|null} selectedPair Selected pair.
     * @returns {Array<string>} Surprise sequence.
     */
    function buildSurpriseList(roundType, selectedPair) {
      if (roundType === 'finale') {
        return [
          'queen', 'queen',
          'hot', 'hot', 'hot',
          'raid', 'raid',
          'shield', 'shield',
          'freeze', 'freeze',
          'double', 'double',
          'mirror', 'mirror'
        ];
      }

      var list = ['queen', 'hot', 'hot'];
      if (selectedPair && Array.isArray(selectedPair.types) && selectedPair.types.length === 2) {
        list.push(selectedPair.types[0], selectedPair.types[0], selectedPair.types[1], selectedPair.types[1]);
      }
      return list;
    }

    /**
     * Returns pickiness rank.
     * @param {string} type Surprise type.
     * @returns {number} Rank score.
     */
    function getPickinessRank(type) {
      var idx = PICKINESS_ORDER.indexOf(type);
      return idx === -1 ? 999 : idx;
    }

    /**
     * Checks whether placement violates anti-clustering for normal round.
     * @param {number} index Candidate index.
     * @param {Array<string|null>} map Current map.
     * @returns {boolean} True when allowed.
     */
    function canPlaceNormal(index, map) {
      var neighbors = HEX_GRID.getNeighbors(index);
      for (var i = 0; i < neighbors.length; i += 1) {
        if (map[neighbors[i]]) return false;
      }
      return true;
    }

    /**
     * Checks whether placement violates anti-clustering for finale round.
     * @param {number} index Candidate index.
     * @param {Array<string|null>} map Current map.
     * @returns {boolean} True when allowed.
     */
    function canPlaceFinale(index, map) {
      var neighbors = HEX_GRID.getNeighbors(index).filter(function (n) { return !!map[n]; });
      if (neighbors.length < 2) return true;

      for (var i = 0; i < neighbors.length; i += 1) {
        for (var j = i + 1; j < neighbors.length; j += 1) {
          var a = neighbors[i];
          var b = neighbors[j];
          if (HEX_GRID.getNeighbors(a).indexOf(b) !== -1) {
            return false;
          }
        }
      }
      return true;
    }

    /**
     * Returns whether a candidate can be placed.
     * @param {number} index Candidate index.
     * @param {Array<string|null>} map Current map.
     * @param {'normal'|'finale'} roundType Round type.
     * @returns {boolean} True when allowed.
     */
    function canPlace(index, map, roundType) {
      if (map[index]) return false;
      return roundType === 'finale' ? canPlaceFinale(index, map) : canPlaceNormal(index, map);
    }

    /**
     * Selects one best candidate index for a surprise type.
     * @param {string} type Surprise type.
     * @param {Array<string|null>} map Current placement map.
     * @param {Array<Array<number>>} heatMap Heat map.
     * @param {'normal'|'finale'} roundType Round type.
     * @returns {number} Chosen index or -1.
     */
    function pickCellForType(type, map, heatMap, roundType) {
      var range = HEAT_RANGES[type] || [3, 10];
      var expansions = [0, 1, 2, 4];

      for (var e = 0; e < expansions.length; e += 1) {
        var expand = expansions[e];
        var min = range[0] - expand;
        var max = range[1] + expand;

        var candidates = [];
        for (var i = 0; i < 25; i += 1) {
          if (!canPlace(i, map, roundType)) continue;
          var heat = getCellHeat(i, heatMap);
          if (heat < min || heat > max) continue;
          candidates.push(i);
        }

        if (candidates.length) {
          var weighted = candidates.slice().sort(function (a, b) {
            return getCellHeat(b, heatMap) - getCellHeat(a, heatMap);
          });
          var top = weighted.slice(0, Math.max(1, Math.ceil(weighted.length / 2)));
          return top[Math.floor(Math.random() * top.length)];
        }
      }

      var fallback = [];
      for (var idx = 0; idx < 25; idx += 1) {
        if (canPlace(idx, map, roundType)) fallback.push(idx);
      }
      if (fallback.length) return fallback[Math.floor(Math.random() * fallback.length)];

      // Last resort: any unassigned cell
      var anyUnassigned = [];
      for (var k = 0; k < 25; k += 1) {
        if (!map[k]) anyUnassigned.push(k);
      }
      if (!anyUnassigned.length) return -1;
      return anyUnassigned[Math.floor(Math.random() * anyUnassigned.length)];
    }

    /**
     * Applies anti-clustering cleanup pass.
     * @param {Array<string|null>} map Surprise map.
     * @param {'normal'|'finale'} roundType Round type.
     */
    function cleanupClustering(map, roundType) {
      for (var i = 0; i < 25; i += 1) {
        if (!map[i]) continue;
        if (canPlace(i, map, roundType)) continue;

        var type = map[i];
        map[i] = null;
        var replacement = pickCellForType(type, map, getRotatedHeatMap(1), roundType);
        if (replacement !== -1) {
          map[replacement] = type;
        } else {
          map[i] = type;
        }
      }
    }

    /**
     * Generates smart surprise map with heat map and anti-clustering.
     * @param {number} roundNumber Round number.
     * @param {'normal'|'finale'} roundType Round type.
     * @param {Array<string>} usedPairs Used pair ids.
     * @param {number} bestOf Best-of rounds.
     * @returns {{surprises:Array<string|null>,selectedPair:string|null,totalSurprises:number,revealedCount:number,roundType:string,usedPairsNext:Array<string>,heatMap:Array<Array<number>>}}
     */
    function generateSmartSurprises(roundNumber, roundType, usedPairs, bestOf) {
      var safeRoundType = roundType === 'finale' ? 'finale' : 'normal';
      var safeBest = Number(bestOf || 3);
      var used = Array.isArray(usedPairs) ? usedPairs.slice() : [];
      var heatMap = getRotatedHeatMap(roundNumber || 1);

      var selectedPair = null;
      if (safeRoundType === 'normal') {
        var available = getAvailablePairs(used, safeBest);
        if (!available.length) {
          used = [];
          available = getAvailablePairs([], safeBest);
        }
        selectedPair = available[Math.floor(Math.random() * available.length)] || null;
      }

      var list = buildSurpriseList(safeRoundType, selectedPair);
      list.sort(function (a, b) {
        return getPickinessRank(a) - getPickinessRank(b);
      });

      var map = Array.from({ length: 25 }, function () { return null; });

      for (var i = 0; i < list.length; i += 1) {
        var type = list[i];
        var picked = pickCellForType(type, map, heatMap, safeRoundType);
        if (picked !== -1) map[picked] = type;
      }

      cleanupClustering(map, safeRoundType);

      var nextUsed = used.slice();
      if (safeRoundType === 'normal' && selectedPair && nextUsed.indexOf(selectedPair.id) === -1) {
        nextUsed.push(selectedPair.id);
      }

      return {
        surprises: map,
        selectedPair: selectedPair ? selectedPair.id : null,
        totalSurprises: list.length,
        revealedCount: 0,
        roundType: safeRoundType,
        usedPairsNext: nextUsed,
        heatMap: heatMap
      };
    }

    /**
     * Compatibility wrapper used by existing callers.
     * @param {'normal'|'finale'} roundType Round type.
     * @param {Array<string>} usedPairs Used pair ids.
     * @param {number} bestOf Best-of rounds.
     * @param {number} roundNumber Round number.
     * @returns {Object} Surprise generation result.
     */
    function generateSurprises(roundType, usedPairs, bestOf, roundNumber) {
      return generateSmartSurprises(roundNumber || 1, roundType, usedPairs, bestOf);
    }

    /**
     * Reveals surprise at cell index if still hidden.
     * @param {number} cellIndex Cell index.
     * @param {Array<string|null>} surpriseMap Surprise map.
     * @param {Object<string,boolean>} revealedMap Revealed map.
     * @returns {string|null} Surprise type.
     */
    function revealSurprise(cellIndex, surpriseMap, revealedMap) {
      if (!Array.isArray(surpriseMap)) return null;
      if (revealedMap && revealedMap[cellIndex]) return null;
      return surpriseMap[cellIndex] || null;
    }

    /**
     * Returns normalized team id.
     * @param {*} team Raw team value.
     * @returns {'team1'|'team2'|null} Team id.
     */
    function normalizeTeam(team) {
      if (team === 'team1' || team === 'team2') return team;
      return null;
    }

    /**
     * Returns opposite team id.
     * @param {'team1'|'team2'} team Team id.
     * @returns {'team1'|'team2'} Opposite team.
     */
    function oppositeTeam(team) {
      return team === 'team1' ? 'team2' : 'team1';
    }

    /**
     * Returns manual target mode for a surprise type.
     * @param {string} type Surprise type.
     * @returns {string|null} Target mode.
     */
    function getTargetMode(type) {
      if (type === 'raid') return 'raid';
      if (type === 'freeze') return 'freezeEmpty';
      if (type === 'double') return 'double';
      if (type === 'shield') return 'shieldOwn';
      if (type === 'queen') return 'queenReward';
      return null;
    }

    /**
     * Executes surprise effect and returns behavior instructions.
     * @param {string} type Surprise type.
     * @param {Object} context Execution context.
     * @returns {Object} Execution payload.
     */
    function executeSurprise(type, context) {
      var game = context && context.game ? context.game : {};
      var cells = game.board && Array.isArray(game.board.cells) ? game.board.cells : [];
      var cellIndex = Number(context && context.cellIndex);
      var team = normalizeTeam(context && context.team) || 'team1';

      var result = {
        type: type,
        message: 'مفاجأة!',
        requiresTarget: false,
        targetMode: getTargetMode(type),
        requiresChoice: false,
        affectedCells: [cellIndex],
        grantVoucherTo: null,
        mirrorToggledTo: null
      };

      if (type === 'queen') {
        if (cells[cellIndex]) cells[cellIndex].isQueen = true;
        result.requiresChoice = true;
        result.message = '👑 ملكة النحل! اختر مكافأتك';
        return result;
      }

      if (type === 'shield') {
        if (cells[cellIndex]) cells[cellIndex].shielded = true;
        result.message = '🛡️ درع! الخلية محمية طوال الجولة';
        return result;
      }

      if (type === 'freeze') {
        result.requiresTarget = true;
        result.message = '❄️ اختر خلية فارغة لتجميدها لدورتين';
        return result;
      }

      if (type === 'double') {
        result.requiresTarget = true;
        result.message = '💥 اختر خلية إضافية للكسب';
        return result;
      }

      if (type === 'raid') {
        var opponent = oppositeTeam(team);
        var opponentCells = cells.filter(function (cell) {
          return cell && normalizeTeam(cell.owner) === opponent;
        });

        if (!opponentCells.length) {
          result.grantVoucherTo = team;
          result.message = '🎟️ لا يوجد خلايا للخصم - تم منح قسيمة سطو';
          return result;
        }

        result.requiresTarget = true;
        result.message = '🏴‍☠️ اختر خلية للسطو';
        return result;
      }

      if (type === 'hot') {
        if (cells[cellIndex]) {
          cells[cellIndex].isHot = true;
          cells[cellIndex].hotTurnsLeft = 2;
          cells[cellIndex].hotOwner = team;
          cells[cellIndex].hotCreatedAtTurn = Number(game.currentTurn && game.currentTurn.turnCounter || 0);
        }
        result.message = '🔥 خلية مشتعلة! يجب الدفاع عنها خلال دورتين';
        return result;
      }

      if (type === 'mirror') {
        var active = !!(game.currentTurn && game.currentTurn.mirrorActive);
        if (game.currentTurn) {
          game.currentTurn.mirrorActive = !active;
        }
        result.mirrorToggledTo = !active;
        result.message = !active ? '🪞 انعكاس! الأدوار معكوسة في الدور القادم' : '🪞🪞 انعكاس مزدوج! عادت الأدوار طبيعية';
        return result;
      }

      return result;
    }

    /**
     * Decrements frozen/hot counters after each resolved question.
     * @param {Object} game Game state.
     * @param {Array<number>} newlyCapturedCells Cells captured in resolved question.
     * @returns {{thawed:Array<number>,defended:Array<number>,burned:Array<number>}} Result payload.
     */
    function advanceCellEffects(game, newlyCapturedCells) {
      var cells = game.board && Array.isArray(game.board.cells) ? game.board.cells : [];
      var captured = Array.isArray(newlyCapturedCells) ? newlyCapturedCells : [];
      var defended = [];
      var burned = [];
      var thawed = [];

      for (var i = 0; i < cells.length; i += 1) {
        var cell = cells[i];
        if (!cell) continue;

        if (cell.frozen) {
          cell.frozenTurnsLeft = Math.max(0, Number(cell.frozenTurnsLeft || 0) - 1);
          if (cell.frozenTurnsLeft <= 0) {
            cell.frozen = false;
            cell.frozenTurnsLeft = 0;
            thawed.push(i);
          }
        }
      }

      for (var j = 0; j < cells.length; j += 1) {
        var hotCell = cells[j];
        if (!hotCell || !hotCell.isHot) continue;

        var owner = normalizeTeam(hotCell.hotOwner || hotCell.owner);
        if (!owner) {
          hotCell.isHot = false;
          hotCell.hotTurnsLeft = 0;
          continue;
        }

        var defendedThisTurn = captured.some(function (idx) {
          if (idx === j) return false;
          if (HEX_GRID.getNeighbors(j).indexOf(idx) === -1) return false;
          var capturedCell = cells[idx];
          if (!capturedCell) return false;
          return normalizeTeam(capturedCell.owner) === owner;
        });

        if (defendedThisTurn) {
          hotCell.isHot = false;
          hotCell.hotTurnsLeft = 0;
          hotCell.hotOwner = null;
          defended.push(j);
          continue;
        }

        hotCell.hotTurnsLeft = Math.max(0, Number(hotCell.hotTurnsLeft || 0) - 1);
        if (hotCell.hotTurnsLeft <= 0) {
          hotCell.isHot = false;
          hotCell.hotTurnsLeft = 0;
          hotCell.hotOwner = null;
          hotCell.owner = null;
          hotCell.shielded = false;
          hotCell.isQueen = false;
          burned.push(j);
        }
      }

      return {
        thawed: thawed,
        defended: defended,
        burned: burned
      };
    }

    return {
      fisherYates: fisherYates,
      getRotatedHeatMap: getRotatedHeatMap,
      getAvailablePairs: getAvailablePairs,
      generateSmartSurprises: generateSmartSurprises,
      generateSurprises: generateSurprises,
      revealSurprise: revealSurprise,
      executeSurprise: executeSurprise,
      advanceCellEffects: advanceCellEffects,
      normalizeTeam: normalizeTeam,
      oppositeTeam: oppositeTeam
    };
  })();

  window.SURPRISE_ENGINE = SURPRISE_ENGINE;
})();
