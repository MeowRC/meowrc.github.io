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

class AILearningSystem {
    constructor(ai) { this.ai = ai; }

    learnFromPlayer(expression) {
        if (!this.ai.pendingRevengePuzzle) return;

        // 存入精确解法
        this.ai.learnedSolutions.push({
            targetCells: this.ai.pendingRevengePuzzle.targetCells.map(c => ({ ...c })),
            forbiddenCells: this.ai.pendingRevengePuzzle.forbiddenCells.map(c => ({ ...c })),
            expression,
            archiveId: this.ai.activeArchiveId || null
        });

        // 提取结构模板并计入算法
        const template = this.ai._extractTemplate(expression);
        if (template) {
            const alreadyHave = this.ai.learnedTemplates.some(t => t.core === template.core);
            if (!alreadyHave) {
                this.ai.learnedTemplates.push(template);
                console.log('[AI] 学习到新算法模板:', template.core);
            }
        }

        this.ai.failedPuzzle = null;
        this.ai.pendingRevengePuzzle = null;
        this.ai._saveLearnedData();
        this.ai._saveArchiveRevengeTraining();

        if (window.summaCharacter) {
            window.characterModule.say(`"${expression}"……这个解法我记下了，下次就不会再被难倒了！`, 'determined');
        }
    }

    async trainOnPlayerExpression(expression, currentTargets, currentForbidden) {
        if (!expression || !expression.includes('x') || currentTargets.length === 0) return;

        const TOTAL_SIMS = 10000;
        const SLICE_MS = 8;
        let sliceStart = performance.now();

        // 提取玩家表达式的核心模板
        const playerTemplate = this.ai._extractTemplate(expression);
        if (!playerTemplate) return;

        // 将玩家模板加入库（去重）
        if (!this.ai.learnedTemplates.some(t => t.core === playerTemplate.core)) {
            this.ai.learnedTemplates.push(playerTemplate);
        }

        // 生成变形模板集：基于玩家表达式进行缩放、翻转、变形
        const variants = this.ai._generateTemplateVariants(playerTemplate.core);

        const gridSize = this.ai.gridSystem.gridSize;
        const half = gridSize / 2;
        let newSolutions = 0;
        let newTemplates = 0;

        console.log(`[AI-Train] 开始训练: 基于 "${expression}" 生成 ${TOTAL_SIMS} 局模拟`);

        for (let sim = 0; sim < TOTAL_SIMS; sim++) {
            // 时间切片：每 8ms 让出主线程
            if (performance.now() - sliceStart >= SLICE_MS) {
                await new Promise(resolve => requestAnimationFrame(resolve));
                sliceStart = performance.now();
            }

            // 生成随机偏移的类似局面
            const simTargets = currentTargets.map(t => ({
                x: t.x + Math.floor(Math.random() * 7) - 3,  // 偏移 -3 ~ +3
                y: t.y + Math.floor(Math.random() * 7) - 3
            })).filter(t =>
                t.x >= -half && t.x < half && t.y >= -half && t.y < half
            );
            if (simTargets.length !== currentTargets.length) continue;

            // 随机生成 0~2 个禁止区
            const simForbidden = [];
            const forbiddenCount = Math.floor(Math.random() * 3);
            for (let f = 0; f < forbiddenCount; f++) {
                const fx = Math.floor(Math.random() * gridSize) - half;
                const fy = Math.floor(Math.random() * gridSize) - half;
                const isTarget = simTargets.some(t => t.x === fx && t.y === fy);
                if (!isTarget) simForbidden.push({ x: fx, y: fy });
            }

            // 尝试用所有变形模板求解
            for (const tmplCore of variants) {
                const adapted = this.ai._adaptCoreToTargets(tmplCore, simTargets);
                if (!adapted) continue;

                // 纯数学验证：检查是否穿过所有目标格且避开禁止区
                if (this.ai._verifyExpressionPure(adapted, simTargets, simForbidden)) {
                    // 存入精确解法库（去重）
                    const exists = this.ai.learnedSolutions.some(s =>
                        this.ai.solutionMatchesPuzzle(s, simTargets) && s.expression === adapted
                    );
                    if (!exists) {
                        this.ai.learnedSolutions.push({
                            targetCells: simTargets.map(c => ({ ...c })),
                            forbiddenCells: simForbidden.map(c => ({ ...c })),
                            expression: adapted,
                            archiveId: this.ai.activeArchiveId || null
                        });
                        newSolutions++;
                    }

                    // 提取新模板
                    const tmpl = this.ai._extractTemplate(adapted);
                    if (tmpl && !this.ai.learnedTemplates.some(t => t.core === tmpl.core)) {
                        this.ai.learnedTemplates.push(tmpl);
                        newTemplates++;
                    }
                    break; // 这个局面已解决，进入下一局
                }
            }
        }

        // 限制解法库大小，避免内存膨胀
        if (this.ai.learnedSolutions.length > 500) {
            this.ai.learnedSolutions = this.ai.learnedSolutions.slice(-500);
        }
        if (this.ai.learnedTemplates.length > 100) {
            this.ai.learnedTemplates = this.ai.learnedTemplates.slice(-100);
        }

        console.log(`[AI-Train] 训练完成: 新增 ${newSolutions} 个解法，${newTemplates} 个模板。解法库总计: ${this.ai.learnedSolutions.length}，模板库总计: ${this.ai.learnedTemplates.length}`);
    }

    async trainOnFailedPuzzle(puzzle) {
        if (!puzzle || !puzzle.targetCells || puzzle.targetCells.length === 0) return;
        const archiveId = this.ai.activeArchiveId || null;

        const TOTAL_SIMS = 100000;
        const TIME_BUDGET_MS = 100;
        const startTime = performance.now();

        const gridSize = this.ai.gridSystem.gridSize;
        const half = gridSize / 2;
        let newSolutions = 0;
        let newTemplates = 0;
        let validVariants = 0;

        console.log(`[AI-RevengeTrain] 开始复仇训练: 失败局面及平移变体 ${TOTAL_SIMS} 轮（预算 ${TIME_BUDGET_MS}ms）`);

        // 轻量核心模板池：优先已学模板，限制池大小确保 10000 轮可在短时完成
        const learnedCores = this.ai.learnedTemplates.length > 0
            ? this.ai.learnedTemplates.map(t => t.core).slice(-24)
            : [];
        const baseTemplates = [...new Set([
            ...learnedCores,
            'x', 'x^2', 'x^3', 'sin(x)', 'cos(x)', 'abs(x)', 'x/2', '2*x'
        ])];

        // 平移偏移池（优先小位移，确保更可能落在棋盘范围内）
        const offsets = [];
        for (let r = 0; r <= 4; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dy = -r; dy <= r; dy++) {
                    if (Math.max(Math.abs(dx), Math.abs(dy)) === r) {
                        offsets.push({ dx, dy });
                    }
                }
            }
        }

        const isInsideBoard = (c) => c.x >= -half && c.x < half && c.y >= -half && c.y < half;
        const sameCell = (a, b) => a.x === b.x && a.y === b.y;
        const addSolutionIfNew = (targets, forbidden, expr) => {
            const exists = this.ai.learnedSolutions.some(s =>
                this.ai.solutionMatchesPuzzle(s, targets) && s.expression === expr && s.archiveId === archiveId
            );
            if (!exists) {
                this.ai.learnedSolutions.push({
                    targetCells: targets.map(c => ({ ...c })),
                    forbiddenCells: forbidden.map(c => ({ ...c })),
                    expression: expr,
                    archiveId
                });
                newSolutions++;
            }
            const tmpl = this.ai._extractTemplate(expr);
            if (tmpl && !this.ai.learnedTemplates.some(t => t.core === tmpl.core)) {
                this.ai.learnedTemplates.push(tmpl);
                newTemplates++;
            }
        };

        for (let sim = 0; sim < TOTAL_SIMS; sim++) {
            const offset = offsets[sim % offsets.length];
            const simTargets = puzzle.targetCells.map(t => ({ x: t.x + offset.dx, y: t.y + offset.dy }));
            const simForbiddenRaw = (puzzle.forbiddenCells || []).map(f => ({ x: f.x + offset.dx, y: f.y + offset.dy }));

            if (!simTargets.every(isInsideBoard)) continue;
            const simForbidden = simForbiddenRaw.filter(c =>
                isInsideBoard(c) && !simTargets.some(t => sameCell(t, c))
            );
            validVariants++;

            // 每轮仅测 1 个核心模板，避免 O(10000 * 模板数) 的爆炸耗时
            const core = baseTemplates[sim % baseTemplates.length];
            const adapted = this.ai._adaptCoreToTargets(core, simTargets);
            if (!adapted) continue;
            if (!this.ai._verifyExpressionPure(adapted, simTargets, simForbidden)) continue;
            addSolutionIfNew(simTargets, simForbidden, adapted);
        }

        // 限制库大小
        if (this.ai.learnedSolutions.length > 500) {
            this.ai.learnedSolutions = this.ai.learnedSolutions.slice(-500);
        }
        if (this.ai.learnedTemplates.length > 100) {
            this.ai.learnedTemplates = this.ai.learnedTemplates.slice(-100);
        }

        // 保存到 localStorage
        this.ai._saveLearnedData();
        this.ai._saveArchiveRevengeTraining(archiveId, { newSolutions, newTemplates, elapsed: performance.now() - startTime });

        const elapsed = performance.now() - startTime;
        const budgetState = elapsed <= TIME_BUDGET_MS ? '达标' : '超预算';
        console.log(`[AI-RevengeTrain] 完成 ${TOTAL_SIMS} 轮，合法变体 ${validVariants}，新增 ${newSolutions} 解法/${newTemplates} 模板，耗时 ${elapsed.toFixed(1)}ms（${budgetState}）`);
    }

    _extractTemplate(expression) {
        // 匹配末尾 +/- 整数或小数
        const match = expression.match(/^(.+?)([+-]\d+\.?\d*)$/);
        if (match && match[1] && match[1].includes('x')) {
            return { core: match[1], original: expression };
        }
        // 表达式本身就是核心
        if (expression.includes('x')) {
            return { core: expression, original: expression };
        }
        return null;
    }

    _generateTemplateVariants(core) {
        const variants = [core];
        // 缩放变形
        for (const a of [0.5, 2, -1, -0.5, 3, 0.25]) {
            if (core === 'x') {
                variants.push(`${a}*x`);
            } else {
                variants.push(`${a}*(${core})`);
            }
        }
        // 翻转变形
        if (core === 'x') {
            variants.push('-x');
        } else {
            variants.push(`-(${core})`);
        }
        // 平移变形 (x → x±1, x±2)
        for (const shift of [1, -1, 2, -2]) {
            const shiftStr = shift > 0 ? `x-${shift}` : `x+${-shift}`;
            if (core === 'x') {
                variants.push(`(${shiftStr})`);
            } else {
                variants.push(core.replace(/x/g, `(${shiftStr})`));
            }
        }
        return variants;
    }

    _adaptCoreToTargets(core, targets) {
        if (!targets || targets.length === 0) return null;
        try {
            const t = targets[0];
            const tx = t.x + 0.5, ty = t.y + 0.5;
            const coreVal = this.ai.evaluateFunction(core, tx);
            if (!isFinite(coreVal) || isNaN(coreVal)) return null;
            const c = ty - coreVal;
            if (Math.abs(c) > 50) return null;
            const cR = Math.round(c * 2) / 2; // 精确到 0.5
            if (cR === 0) return core;
            const sign = cR > 0 ? '+' : '';
            return `${core}${sign}${cR}`;
        } catch (e) {
            return null;
        }
    }

    _verifyExpressionPure(expr, targets, forbidden) {
        // 检查是否穿过所有目标格
        for (const t of targets) {
            const tx = t.x + 0.5, ty = t.y + 0.5;
            const y = this.ai.evaluateFunction(expr, tx);
            if (!isFinite(y) || Math.abs(y - ty) >= 0.5) return false;
        }
        // 检查是否碰禁止区
        for (const f of forbidden) {
            const fx = f.x + 0.5, fy = f.y + 0.5;
            const y = this.ai.evaluateFunction(expr, fx);
            if (isFinite(y) && Math.abs(y - fy) < 0.5) return false;
        }
        return true;
    }

    adaptTemplateToTargets(template, targetCells, lockedElements = []) {
        if (!targetCells || targetCells.length === 0) return null;
        try {
            const target = targetCells[0];
            const tx = target.x + 0.5, ty = target.y + 0.5;
            const coreVal = this.ai.evaluateFunction(template.core, tx);
            if (!isFinite(coreVal) || isNaN(coreVal)) return null;
            const c = ty - coreVal;
            if (Math.abs(c) > 50) return null;

            // 如果小数点被锁定，常数取整；否则精确到0.5
            const canFloat = !lockedElements.includes('.');
            const cRounded = canFloat ? Math.round(c * 2) / 2 : Math.round(c);
            const sign = cRounded >= 0 ? '+' : '';
            const cStr = cRounded === 0 ? '' : `${sign}${cRounded}`;
            return `${template.core}${cStr}`;
        } catch (e) {
            return null;
        }
    }

    notifyPlayerFailedRevenge() {
        this.ai.pendingRevengePuzzle = null;
        if (window.summaCharacter) {
            window.characterModule.say('看来这个局面确实有难度……我们一起加油吧！', 'neutral');
        }
    }

    solutionMatchesPuzzle(solution, targetCells) {
        if (solution.targetCells.length !== targetCells.length) return false;
        return solution.targetCells.every(sc =>
            targetCells.some(tc => tc.x === sc.x && tc.y === sc.y)
        );
    }

}

if(typeof module!=='undefined'&&module.exports)module.exports=AILearningSystem;