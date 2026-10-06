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

class AITargetSelector {
    constructor(ai) { this.ai = ai; }

    async selectTargets() {
        this.ai.pendingRevengePuzzle = null;

        const state = this.ai.gameController.getGameState();
        const count = state.targetCount;
        const gridSize = this.ai.gridSystem.gridSize;
        const half = gridSize / 2;
        const strategy = this.ai.strategies[this.ai.gameController.difficulty] || this.ai.strategies.normal;

        console.log(`[AI] selectTargets 开始: 需要 ${count} 个目标格, 当前阶段: ${state.currentPhase}`);

        // 检查当前阶段是否正确
        if (state.currentPhase !== 'select_target') {
            console.error(`[AI] ❌ 当前阶段不是 select_target，而是 ${state.currentPhase}，无法选择目标格`);
            return;
        }

        // ── 挑衅反转模式：先训练再出题 ────────────────────────────────────────
        if (this.ai.revengeMode && this.ai.failedPuzzle) {
            console.log('[AI] 进入复仇模式，先进行100000局现场训练...');
            // 对失败局面及其变体进行100000局训练
            await this.ai.trainOnFailedPuzzle(this.ai.failedPuzzle);

            console.log('[AI] 复仇训练完成，开始选择目标格');
            const revengeSuccess = this.ai._tryRevengeTargetSelection(half, count);
            this.ai.revengeMode = false;
            if (!revengeSuccess) {
                // 找不到可平移位置，放弃复仇，继续普通选题
                this.ai.failedPuzzle = null;
                console.log('[AI] 挑衅反转：棋盘无空位，放弃');
            } else {
                // 复仇成功，清空 failedPuzzle 避免下次重复触发
                this.ai.failedPuzzle = null;
                const placedCount = this.ai.gameController.roundState.targetCells.length;
                console.log(`[AI] 复仇模式完成，已放置 ${placedCount}/${count} 个目标格`);
                // 如果复仇模式已经放置了足够的目标格，直接返回
                if (placedCount >= count) {
                    console.log(`[AI] 复仇模式已放置足够目标格，跳过普通选题`);
                    return;
                }
            }
            // 复仇目标格不足时，继续向下执行普通选题循环补齐
        }

        // ── 普通选题：while 循环确保准确计数，避免 for 循环 bestCell=null 时少选 ──────
        let placed = this.ai.gameController.roundState.targetCells.length; // 直接读 live 数组长度
        let safetyLimit = count * 3 + 10; // 防无限循环

        console.log(`[AI] 普通选题开始: 已有 ${placed}/${count} 个目标格`);

        while (placed < count && safetyLimit-- > 0) {
            let bestScore = -Infinity;
            let bestCell = null;

            // 采样 40 个候选，降低全部被占用的概率
            for (let c = 0; c < 40; c++) {
                let cx = Math.floor(Math.random() * gridSize) - half;
                let cy = Math.floor(Math.random() * gridSize) - half;

                if (this.ai.isOccupied(cx, cy)) continue;

                let score = Math.abs(cx) + Math.abs(cy);
                for (const t of this.ai.gameController.roundState.targetCells) {
                    const dx = Math.abs(cx - t.x), dy = Math.abs(cy - t.y);
                    if (dx === 0 || dy === 0 || dx === dy) score -= 5;
                    else score += dx + dy;
                }
                if (Math.random() > strategy.targetAccuracy) score = Math.random() * 10;

                if (score > bestScore) { bestScore = score; bestCell = { x: cx, y: cy }; }
            }

            // 底安：随机采样全部失败时穷举找最佳空位
            if (!bestCell) {
                bestCell = this.ai._findFallbackCell(half, this.ai.gameController.roundState.targetCells);
            }

            if (bestCell) {
                const ok = this.ai.gameController.selectTargetCell(bestCell);
                if (ok !== false) {
                    placed++; // 放置成功才计数
                    console.log(`[AI] 普通选题放置成功: ${placed}/${count}`);
                } else {
                    console.warn('[AI] selectTargetCell 返回 false，阶段可能已变更，中止选题');
                    break;
                }
            } else {
                console.warn('[AI] 无法找到候选格子，棋盘可能已满');
                break;
            }
        }

        console.log(`[AI] 普通选题结束: 最终 ${placed}/${count} 个目标格`);
    }

    _tryRevengeTargetSelection(half, targetCount) {
        // 构建螺旋平移列表（从 0 向外逻层扩展）
        const offsets = [{ dx: 0, dy: 0 }];
        for (let r = 1; r <= 4; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dy = -r; dy <= r; dy++) {
                    if (Math.abs(dx) === r || Math.abs(dy) === r) {
                        offsets.push({ dx, dy });
                    }
                }
            }
        }

        for (const { dx, dy } of offsets) {
            const transTargets = this.ai.failedPuzzle.targetCells.map(c => ({ x: c.x + dx, y: c.y + dy }));
            const transForbidden = this.ai.failedPuzzle.forbiddenCells.map(c => ({ x: c.x + dx, y: c.y + dy }));

            // 所有目标格必须在棋盘内且未被占用
            const allValid = transTargets.every(c =>
                c.x >= -half && c.x < half &&
                c.y >= -half && c.y < half &&
                !this.ai.isOccupied(c.x, c.y)
            );
            if (!allValid) continue;

            // 找到合法平移！
            // 根据当前 targetCount 截取或补齐目标格数量
            let finalTargets = transTargets.slice(0, targetCount);
            // 如果复仇局面目标格少于当前需要，后面会由普通选题补齐
            this.ai.pendingRevengePuzzle = { targetCells: finalTargets, forbiddenCells: transForbidden };

            console.log(`[AI] 复仇模式: 准备放置 ${finalTargets.length} 个目标格`);
            let placedCount = 0;
            for (const cell of finalTargets) {
                const ok = this.ai.gameController.selectTargetCell({ ...cell });
                if (ok) {
                    placedCount++;
                } else {
                    console.warn(`[AI] 复仇模式: 放置目标格 (${cell.x}, ${cell.y}) 失败`);
                }
            }
            console.log(`[AI] 复仇模式: 成功放置 ${placedCount}/${finalTargets.length} 个目标格`);

            if (window.summaCharacter) {
                const msg = (dx === 0 && dy === 0)
                    ? '这个局面让我很困惑……你来帮帮我吧？'
                    : '换个方向，同样的难题……你能找到解法吗？';
                window.characterModule.say(msg, 'neutral');
            }
            console.log(`[AI] 挑衅反转成功，平移 (${dx}, ${dy})，放置 ${finalTargets.length}/${targetCount} 个目标格`);
            return true;
        }
        return false;
    }

    _findFallbackCell(half, alreadyChosen) {
        const candidates = [];
        for (let gx = -half; gx < half; gx++) {
            for (let gy = -half; gy < half; gy++) {
                if (this.ai.isOccupied(gx, gy)) continue;
                let score = Math.abs(gx) + Math.abs(gy);
                for (const t of alreadyChosen) {
                    const ddx = Math.abs(gx - t.x), ddy = Math.abs(gy - t.y);
                    if (ddx === 0 || ddy === 0 || ddx === ddy) score -= 5;
                    else score += ddx + ddy;
                }
                candidates.push({ x: gx, y: gy, score });
            }
        }
        if (candidates.length === 0) return null;
        candidates.sort((a, b) => b.score - a.score);
        // 从最优的前 5 个中随机选一个，增加变化性
        return candidates[Math.floor(Math.random() * Math.min(5, candidates.length))];
    }

    isTooCloseToExisting(x, y) {
        const state = this.ai.gameController.getGameState();
        const minDistance = 3; // 最小距离

        for (const cell of state.roundState.targetCells) {
            const distance = Math.abs(cell.x - x) + Math.abs(cell.y - y);
            if (distance < minDistance) {
                return true;
            }
        }
        return false;
    }

    selectRandomTargets(targetCells, count) {
        const shuffled = [...targetCells].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, count);
    }

}

if(typeof module!=='undefined'&&module.exports)module.exports=AITargetSelector;