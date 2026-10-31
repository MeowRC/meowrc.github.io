/**
 * 函数棋 - Function Chess
 * Copyright (C) 2024 shaihai-studio
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

class AIConstraintManager {
    constructor(ai) { this.ai = ai; }

    setForbiddenZones() {
        const state = this.ai.gameController.getGameState();
        const maxForbidden = state.maxForbidden;
        const gridSize = this.ai.gridSystem.gridSize;

        console.log(`[AI] 设置禁区: maxForbidden=${maxForbidden}`);

        if (maxForbidden === 0) return;

        let placedCount = 0;

        // ── 挑衅反转模式：优先放置平移后的复仇禁区 ────────────────────────
        if (this.ai.pendingRevengePuzzle && this.ai.pendingRevengePuzzle.forbiddenCells.length > 0) {
            for (const cell of this.ai.pendingRevengePuzzle.forbiddenCells) {
                if (placedCount >= maxForbidden) break;
                if (this.ai.isValidForbiddenPosition(cell.x, cell.y)) {
                    this.ai.gameController.addForbiddenCell({ x: cell.x, y: cell.y });
                    placedCount++;
                }
            }
            if (placedCount >= maxForbidden) {
                console.log(`[AI] 复仇禁区放置完毕，共 ${placedCount} 个`);
                return;
            }
            // 复仇禁区部分不可用，用普通逻辑补准
        }

        // ── 普通禁区放置：靠近目标格路径 + 随机底安 ──────────────────────
        while (placedCount < maxForbidden) {
            let bestX = 0, bestY = 0;
            let found = false;

            if (state.roundState.targetCells.length > 0) {
                const target = state.roundState.targetCells[placedCount % state.roundState.targetCells.length];
                for (let i = 0; i < 30; i++) {
                    let tx = Math.floor(target.x * Math.random()) + Math.floor(Math.random() * 3 - 1);
                    let ty = Math.floor(target.y * Math.random()) + Math.floor(Math.random() * 3 - 1);
                    if (tx < -gridSize / 2 || tx >= gridSize / 2) continue;
                    if (ty < -gridSize / 2 || ty >= gridSize / 2) continue;
                    if (this.ai.isValidForbiddenPosition(tx, ty)) {
                        bestX = tx; bestY = ty; found = true; break;
                    }
                }
            }

            if (!found) {
                for (let attempt = 0; attempt < 150; attempt++) {
                    let rx = Math.floor(Math.random() * gridSize) - gridSize / 2;
                    let ry = Math.floor(Math.random() * gridSize) - gridSize / 2;
                    if (this.ai.isValidForbiddenPosition(rx, ry)) {
                        bestX = rx; bestY = ry; found = true; break;
                    }
                }
            }

            if (found) {
                this.ai.gameController.addForbiddenCell({ x: bestX, y: bestY });
                placedCount++;
            } else {
                break; // 棋盘已满，无法继续
            }
        }

        console.log(`[AI] 禁区设置完成，共设置 ${placedCount} 个禁区`);
    }

    isValidForbiddenPosition(x, y) {
        const state = this.ai.gameController.getGameState();

        // 不能是目标格
        if (state.roundState.targetCells.some(c => c.x === x && c.y === y)) return false;
        // 不能是已有禁区
        if (state.roundState.forbiddenCells.some(c => c.x === x && c.y === y)) return false;
        // 不能是历史使用过的格子（规避灰色历史格）
        if (state.usedCells && state.usedCells.some(c => c.x === x && c.y === y)) return false;

        return true;
    }

    setLocks() {
        const state = this.ai.gameController.getGameState();
        const maxLocks = state.maxLocks;
        if (maxLocks === 0) return;

        const count = this.ai.getDifficultyBasedCount(maxLocks);
        const strategy = this.ai.strategies[this.ai.gameController.difficulty] || this.ai.strategies.normal;

        // 根据难度选择策略元素池
        let elements;
        if (strategy.functionComplexity <= 2) {
            elements = ['+', '-', '*', '/', '^', 'sin', 'cos', 'abs'];
        } else {
            elements = ['+', '-', '*', '/', '^', 'sin', 'cos', 'tan', 'abs', 'ln', 'sqrt'];
        }

        // 简单模式不锁定四则运算
        if (state.difficulty === 'easy') {
            elements = elements.filter(e => !['+', '-', '*', '/'].includes(e));
        }

        // ── 关键修复：过滤掉已被锁定2次（达到上限）的元素 ─────────────────
        elements = elements.filter(e => this.ai.gameController.canLockElement(e));
        if (elements.length === 0) return;

        // 洗牌后循环锁定，保证选满 count 个
        const shuffled = [...elements].sort(() => 0.5 - Math.random());
        let locked = 0, idx = 0;
        while (locked < count && shuffled.length > 0) {
            if (idx >= shuffled.length) idx = 0;
            this.ai.gameController.addLockedElement(shuffled[idx]);
            locked++;
            idx++;
        }
    }

    getDifficultyBasedCount(max) {
        const difficulty = this.ai.gameController.difficulty;
        let count;

        if (difficulty === 'easy') {
            count = Math.floor(max * 0.3);
        } else if (difficulty === 'hard') {
            count = Math.ceil(max * 0.8);
        } else if (difficulty === 'expert') {
            count = max;
        } else { // normal
            count = Math.floor(max * 0.6);
        }

        // 如果max>0但至少应该设置1个
        if (max > 0 && count === 0) {
            count = 1;
        }

        return count;
    }

    isOccupied(x, y) {
        const state = this.ai.gameController.getGameState();
        const isTarget = state.roundState.targetCells.some(c => c.x === x && c.y === y);
        const isForbidden = state.roundState.forbiddenCells.some(c => c.x === x && c.y === y);
        // 也检查历史使用过的格子
        const isUsed = state.usedCells && state.usedCells.some(c => c.x === x && c.y === y);
        return isTarget || isForbidden || isUsed;
    }

}

if(typeof module!=='undefined'&&module.exports)module.exports=AIConstraintManager;