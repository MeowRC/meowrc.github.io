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

class ComplexMath {
    static toComplex(v) {
        if (v && typeof v === 'object' && 're' in v && 'im' in v) {
            // 归一化 -0 → 0，避免 atan2(-0, neg) = -π 污染辐角分支
            return { re: Object.is(v.re, -0) ? 0 : v.re, im: Object.is(v.im, -0) ? 0 : v.im };
        }
        const n = Number(v);
        return { re: Object.is(n, -0) ? 0 : n, im: 0 };
    }

    static cAdd(a, b) { a = this.toComplex(a); b = this.toComplex(b); return { re: a.re + b.re, im: a.im + b.im }; }

    static cSub(a, b) { a = this.toComplex(a); b = this.toComplex(b); return { re: a.re - b.re, im: a.im - b.im }; }

    static cMul(a, b) { a = this.toComplex(a); b = this.toComplex(b); return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }; }

    static cDiv(a, b) {
        a = this.toComplex(a); b = this.toComplex(b);
        const d = b.re * b.re + b.im * b.im;
        if (d === 0) return { re: NaN, im: NaN };
        return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
    }

    static cNeg(a) { a = this.toComplex(a); return { re: -a.re, im: -a.im }; }

    static cPow(a, b) {
        a = this.toComplex(a); b = this.toComplex(b);
        const r = Math.hypot(a.re, a.im);
        const theta = Math.atan2(a.im, a.re);
        const lnR = Math.log(r);
        const x = Math.exp(lnR * b.re - b.im * theta);
        const y = lnR * b.im + b.re * theta;
        return { re: x * Math.cos(y), im: x * Math.sin(y) };
    }

    static cAbs(a) { a = this.toComplex(a); return { re: Math.hypot(a.re, a.im), im: 0 }; }

    static cLn(a) { a = this.toComplex(a); return { re: Math.log(Math.hypot(a.re, a.im)), im: Math.atan2(a.im, a.re) }; }

    static cSin(a) { a = this.toComplex(a); return { re: Math.sin(a.re) * Math.cosh(a.im), im: Math.cos(a.re) * Math.sinh(a.im) }; }

    static cCos(a) { a = this.toComplex(a); return { re: Math.cos(a.re) * Math.cosh(a.im), im: -Math.sin(a.re) * Math.sinh(a.im) }; }

    static cTan(a) { const s = this.cSin(a), c = this.cCos(a); return this.cDiv(s, c); }

    static cSqrt(a) { return this.cPow(a, { re: 0.5, im: 0 }); }

    static cFactorial(a) {
        a = this.toComplex(a);
        if (a.im !== 0) return { re: NaN, im: NaN };
        const n = a.re + 1; // gamma 参数 = x + 1
        // 负整数处的 gamma 是极点 → 返回 NaN
        if (n <= 0 && Math.abs(n - Math.round(n)) < 1e-10) return { re: NaN, im: NaN };
        // 距离负整数非常近（<0.005）→ 也是极点，值极大且视觉无用
        if (n <= 0 && Math.abs(n - Math.round(n)) < 0.005) return { re: NaN, im: NaN };
        return this.toComplex(this.gamma(n));
    }

    static gamma(z) {
        if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * this.gamma(1 - z));
        const p = [
            676.5203681218851, -1259.1392167224028, 771.32342877765313,
            -176.61502916214059, 12.507343278686905, -0.13857109526572012,
            9.9843695780195716e-6, 1.5056327351493117e-7
        ];
        z -= 1;
        let x = 0.99999999999980993;
        for (let i = 0; i < p.length; i++) x += p[i] / (z + i + 1);
        const t = z + p.length - 0.5;
        return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
    }

    static complexToNumber(v) {
        const c = this.toComplex(v);
        if (!Number.isFinite(c.re) || !Number.isFinite(c.im)) return null;
        // 虚部足够小 → 视为实数（处理 (-x)^n 整数幂的浮点精度问题）
        const imTolerance = Math.max(1e-10, Math.abs(c.re) * 1e-10);
        if (Math.abs(c.im) < imTolerance) return c.re;
        return null; // 有显著虚部 → 实数范围内无定义，返回 null
    }

}

if(typeof module!=='undefined'&&module.exports)module.exports=ComplexMath;