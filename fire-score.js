(() => {
    if (customElements.get('fire-score')) {
        return;
    }

    const NS = 'http://www.w3.org/2000/svg';
    const MAX_SCORE = 52;
    let fireScoreUid = 0;

    const STAGES = [
        { score: 0, dominant: '#ffd974', accent: '#fff2b8', deep: '#ffb648', spark: '#fff8dc' },
        { score: 3, dominant: '#ffb22b', accent: '#ffe07b', deep: '#ff7b15', spark: '#fff2b8' },
        { score: 8, dominant: '#ff8617', accent: '#ffc042', deep: '#ff5600', spark: '#ffe2a2' },
        { score: 16, dominant: '#ff3a1f', accent: '#ff9a2d', deep: '#b71212', spark: '#ffc07e' },
        { score: 24, dominant: '#7b43ff', accent: '#ff8721', deep: '#4c239d', spark: '#ffb46a' },
        { score: 36, dominant: '#ff2fa8', accent: '#ff7a1f', deep: '#a81d73', spark: '#ff9ad6' },
        { score: 52, dominant: '#9d57ff', accent: '#ff7b2b', deep: '#5f2cab', spark: '#efb8ff' }
    ];

    function svgEl(tag, attrs = {}) {
        const node = document.createElementNS(NS, tag);
        Object.entries(attrs).forEach(([key, value]) => {
            node.setAttribute(key, String(value));
        });
        return node;
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function hexToRgb(hex) {
        const normalized = String(hex).trim().replace('#', '');
        const full = normalized.length === 3
            ? normalized.split('').map((part) => part + part).join('')
            : normalized.padEnd(6, '0').slice(0, 6);

        return {
            r: Number.parseInt(full.slice(0, 2), 16),
            g: Number.parseInt(full.slice(2, 4), 16),
            b: Number.parseInt(full.slice(4, 6), 16)
        };
    }

    function mixColor(a, b, amount) {
        const t = clamp(amount, 0, 1);
        return {
            r: Math.round(a.r + (b.r - a.r) * t),
            g: Math.round(a.g + (b.g - a.g) * t),
            b: Math.round(a.b + (b.b - a.b) * t)
        };
    }

    function lighten(color, amount) {
        return mixColor(color, { r: 255, g: 255, b: 255 }, amount);
    }

    function darken(color, amount) {
        return mixColor(color, { r: 0, g: 0, b: 0 }, amount);
    }

    function rgbString(color, alpha = 1) {
        const opacity = clamp(alpha, 0, 1);
        return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${opacity.toFixed(3)})`;
    }

    function interpolateStage(score) {
        const clampedScore = clamp(score, 0, MAX_SCORE);

        for (let index = 0; index < STAGES.length - 1; index += 1) {
            const start = STAGES[index];
            const end = STAGES[index + 1];

            if (clampedScore <= end.score) {
                const span = Math.max(1, end.score - start.score);
                const t = clamp((clampedScore - start.score) / span, 0, 1);

                return {
                    progress: clampedScore / MAX_SCORE,
                    dominant: mixColor(hexToRgb(start.dominant), hexToRgb(end.dominant), t),
                    accent: mixColor(hexToRgb(start.accent), hexToRgb(end.accent), t),
                    deep: mixColor(hexToRgb(start.deep), hexToRgb(end.deep), t),
                    spark: mixColor(hexToRgb(start.spark), hexToRgb(end.spark), t)
                };
            }
        }

        const last = STAGES[STAGES.length - 1];
        return {
            progress: 1,
            dominant: hexToRgb(last.dominant),
            accent: hexToRgb(last.accent),
            deep: hexToRgb(last.deep),
            spark: hexToRgb(last.spark)
        };
    }

    function buildFirePalette(score, intensity) {
        const stage = interpolateStage(score);
        const warmYellow = hexToRgb('#ffd84f');
        const warmOrange = hexToRgb('#ff9a21');
        const hotOrange = hexToRgb('#ff6500');
        const hotRed = hexToRgb('#ff2d20');
        const emberBrown = hexToRgb('#6a1408');
        const energy = clamp(stage.progress * 0.76 + ((intensity - 0.4) / 1.8) * 0.24, 0, 1);

        return {
            energy,
            dominant: stage.dominant,
            accent: stage.accent,
            deep: stage.deep,
            spark: stage.spark,
            top: lighten(mixColor(stage.accent, stage.spark, 0.65), 0.18),
            yellow: mixColor(warmYellow, stage.dominant, 0.12 + energy * 0.16),
            orange: mixColor(warmOrange, stage.dominant, 0.26 + energy * 0.28),
            orangeHot: mixColor(hotOrange, stage.dominant, 0.42 + energy * 0.26),
            redHot: mixColor(hotRed, stage.deep, 0.56 + energy * 0.18),
            tail: mixColor(emberBrown, stage.deep, 0.72),
            glow: mixColor(hotOrange, stage.dominant, 0.48 + energy * 0.22),
            shadow: mixColor(emberBrown, darken(stage.deep, 0.18), 0.78),
            flowWarm: mixColor(warmYellow, stage.accent, 0.4 + energy * 0.16),
            flowHot: mixColor(warmOrange, stage.dominant, 0.52 + energy * 0.18),
            flowDeep: mixColor(hotRed, stage.deep, 0.68)
        };
    }

    function createStyle() {
        return `
            :host {
                display: inline-block;
                width: var(--fire-score-width, 220px);
                aspect-ratio: var(--fire-score-ratio, 2.2 / 1.25);
                contain: layout paint style;
                vertical-align: middle;
            }

            .wrap {
                width: 100%;
                height: 100%;
                position: relative;
            }

            svg {
                width: 100%;
                height: 100%;
                display: block;
                overflow: visible;
            }

            .sr-only {
                position: absolute;
                width: 1px;
                height: 1px;
                padding: 0;
                margin: -1px;
                overflow: hidden;
                clip: rect(0, 0, 0, 0);
                border: 0;
            }
        `;
    }

    class FireScore extends HTMLElement {
        static get observedAttributes() {
            return ['value', 'intensity', 'paused', 'label'];
        }

        constructor() {
            super();
            this.attachShadow({ mode: 'open' });

            this.uid = `fire-score-${++fireScoreUid}`;
            this.rafId = 0;
            this.running = false;
            this.visible = true;
            this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            this.sparkData = [];
            this.jetData = [];
            this.blobData = [];
            this.lastNow = 0;
            this.palette = buildFirePalette(0, 0.6);

            this.wrap = document.createElement('div');
            this.wrap.className = 'wrap';

            const style = document.createElement('style');
            style.textContent = createStyle();

            this.srLabel = document.createElement('span');
            this.srLabel.className = 'sr-only';

            this.svg = svgEl('svg', {
                viewBox: '0 0 320 180',
                role: 'img',
                'aria-hidden': 'true',
                preserveAspectRatio: 'xMidYMid meet'
            });

            this._buildSvg();

            this.wrap.appendChild(this.svg);
            this.wrap.appendChild(this.srLabel);
            this.shadowRoot.append(style, this.wrap);

            this.intersectionObserver = new IntersectionObserver(
                (entries) => {
                    this.visible = Boolean(entries[0]?.isIntersecting);
                    this._syncAnimationState();
                },
                { threshold: 0.01 }
            );

            this.resizeObserver = new ResizeObserver(() => {
                this._refreshTextAndParticles(true);
            });

            this.visibilityHandler = () => this._syncAnimationState();
            this.motionHandler = (event) => {
                this.reducedMotion = event.matches;
                this._syncAnimationState();
            };

            this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
            this.motionQuery.addEventListener?.('change', this.motionHandler);
        }

        connectedCallback() {
            this._applyAccessibilityLabel();
            this._setValueText(this.value);
            this._refreshTextAndParticles(true);
            this.intersectionObserver.observe(this);
            this.resizeObserver.observe(this);
            document.addEventListener('visibilitychange', this.visibilityHandler);
            this._syncAnimationState();
        }

        disconnectedCallback() {
            this._stop();
            this.intersectionObserver.disconnect();
            this.resizeObserver.disconnect();
            document.removeEventListener('visibilitychange', this.visibilityHandler);
            this.motionQuery.removeEventListener?.('change', this.motionHandler);
        }

        attributeChangedCallback(name, oldValue, newValue) {
            if (oldValue === newValue) {
                return;
            }

            if (name === 'value') {
                this._setValueText(this.value);
                this._refreshTextAndParticles(true);
                this._applyAccessibilityLabel();
                return;
            }

            if (name === 'label') {
                this._applyAccessibilityLabel();
                return;
            }

            if (name === 'intensity') {
                this._refreshTextAndParticles(true);
                return;
            }

            if (name === 'paused') {
                this._syncAnimationState();
            }
        }

        get value() {
            return this.getAttribute('value') ?? '0';
        }

        get numericValue() {
            return Math.max(0, Number(this.value) || 0);
        }

        set value(nextValue) {
            this.setAttribute('value', String(nextValue));
        }

        get intensity() {
            return clamp(Number(this.getAttribute('intensity') ?? '1'), 0.4, 2.2);
        }

        set intensity(nextValue) {
            this.setAttribute('intensity', String(nextValue));
        }

        pause() {
            this.setAttribute('paused', '');
        }

        play() {
            this.removeAttribute('paused');
        }

        _paintRef(id) {
            const base = (this.ownerDocument?.baseURI || window.location.href).split('#')[0];
            return `url(${base}#${id})`;
        }

        _buildSvg() {
            this.svg.innerHTML = '';

            const defs = svgEl('defs');
            const makeId = (suffix) => `${this.uid}-${suffix}`;

            this.ids = {
                fireGrad: makeId('fire-grad'),
                flowA: makeId('flow-a'),
                flowB: makeId('flow-b'),
                innerHot: makeId('inner-hot'),
                blur5: makeId('blur-5'),
                blur10: makeId('blur-10'),
                blur16: makeId('blur-16'),
                numGlow: makeId('num-glow'),
                outerHalo: makeId('outer-halo'),
                sparkHalo: makeId('spark-halo'),
                sparkCore: makeId('spark-core'),
                textClip: makeId('text-clip'),
                clipText: makeId('clip-text')
            };

            const fireGrad = svgEl('linearGradient', {
                id: this.ids.fireGrad,
                gradientUnits: 'userSpaceOnUse',
                x1: 160,
                y1: 12,
                x2: 160,
                y2: 168
            });
            this.fgStops = new Array(6).fill(null).map((_, index) => {
                const stop = svgEl('stop', { id: `${this.uid}-fg-${index}`, offset: '0%' });
                fireGrad.appendChild(stop);
                return stop;
            });

            const flowA = svgEl('linearGradient', {
                id: this.ids.flowA,
                gradientUnits: 'userSpaceOnUse',
                x1: 160,
                y1: 0,
                x2: 160,
                y2: 180
            });
            this.faStops = new Array(5).fill(null).map((_, index) => {
                const stop = svgEl('stop', { id: `${this.uid}-fa-${index}`, offset: '0%' });
                flowA.appendChild(stop);
                return stop;
            });

            const flowB = svgEl('linearGradient', {
                id: this.ids.flowB,
                gradientUnits: 'userSpaceOnUse',
                x1: 160,
                y1: 0,
                x2: 160,
                y2: 180
            });
            this.fbStops = new Array(5).fill(null).map((_, index) => {
                const stop = svgEl('stop', { id: `${this.uid}-fb-${index}`, offset: '0%' });
                flowB.appendChild(stop);
                return stop;
            });

            const innerHot = svgEl('radialGradient', { id: this.ids.innerHot, cx: '50%', cy: '30%', r: '70%' });
            this.innerHotStops = new Array(4).fill(null).map((_, index) => {
                const stop = svgEl('stop', { id: `${this.uid}-ih-${index}`, offset: '0%' });
                innerHot.appendChild(stop);
                return stop;
            });

            defs.append(fireGrad, flowA, flowB, innerHot);

            const filterBlur5 = svgEl('filter', { id: this.ids.blur5, x: '-100%', y: '-100%', width: '300%', height: '300%' });
            filterBlur5.appendChild(svgEl('feGaussianBlur', { stdDeviation: '1.9' }));
            defs.appendChild(filterBlur5);

            const filterBlur10 = svgEl('filter', { id: this.ids.blur10, x: '-100%', y: '-100%', width: '300%', height: '300%' });
            filterBlur10.appendChild(svgEl('feGaussianBlur', { stdDeviation: '4' }));
            defs.appendChild(filterBlur10);

            const filterBlur16 = svgEl('filter', { id: this.ids.blur16, x: '-100%', y: '-100%', width: '300%', height: '300%' });
            filterBlur16.appendChild(svgEl('feGaussianBlur', { stdDeviation: '6' }));
            defs.appendChild(filterBlur16);

            const numGlow = svgEl('filter', { id: this.ids.numGlow, x: '-100%', y: '-100%', width: '300%', height: '300%' });
            numGlow.appendChild(svgEl('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: '2.8', result: 'tight' }));
            numGlow.appendChild(svgEl('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: '9', result: 'wide' }));
            numGlow.appendChild(svgEl('feColorMatrix', {
                in: 'tight',
                type: 'matrix',
                values: '1.08 0.10 0 0 0.03  0 0.65 0 0 0  0 0 0.06 0 0  0 0 0 1 0',
                result: 'tightWarm'
            }));
            numGlow.appendChild(svgEl('feColorMatrix', {
                in: 'wide',
                type: 'matrix',
                values: '1.20 0.05 0 0 0.04  0 0.35 0 0 0  0 0 0.03 0 0  0 0 0 0.68 0',
                result: 'wideWarm'
            }));
            const numGlowMerge = svgEl('feMerge');
            numGlowMerge.append(
                svgEl('feMergeNode', { in: 'wideWarm' }),
                svgEl('feMergeNode', { in: 'tightWarm' }),
                svgEl('feMergeNode', { in: 'SourceGraphic' })
            );
            numGlow.appendChild(numGlowMerge);
            defs.appendChild(numGlow);

            const outerHalo = svgEl('filter', { id: this.ids.outerHalo, x: '-140%', y: '-140%', width: '380%', height: '380%' });
            outerHalo.appendChild(svgEl('feGaussianBlur', { stdDeviation: '13', result: 'b' }));
            outerHalo.appendChild(svgEl('feColorMatrix', {
                in: 'b',
                type: 'matrix',
                values: '1.55 0 0 0 0  0 0.34 0 0 0  0 0 0.04 0 0  0 0 0 0.58 0'
            }));
            defs.appendChild(outerHalo);

            const sparkHalo = svgEl('filter', { id: this.ids.sparkHalo, x: '-500%', y: '-500%', width: '1100%', height: '1100%' });
            sparkHalo.appendChild(svgEl('feGaussianBlur', { stdDeviation: '2.8', result: 'b' }));
            sparkHalo.appendChild(svgEl('feColorMatrix', {
                in: 'b',
                type: 'matrix',
                values: '2 0 0 0 0.04  0 0.85 0 0 0.02  0 0 0.06 0 0  0 0 0 0.90 0'
            }));
            defs.appendChild(sparkHalo);

            const sparkCore = svgEl('filter', { id: this.ids.sparkCore, x: '-350%', y: '-350%', width: '800%', height: '800%' });
            sparkCore.appendChild(svgEl('feGaussianBlur', { stdDeviation: '0.8', result: 'b' }));
            sparkCore.appendChild(svgEl('feColorMatrix', {
                in: 'b',
                type: 'matrix',
                values: '1.7 0 0 0 0.08  0 1.25 0 0 0.04  0 0 0.25 0 0  0 0 0 1 0'
            }));
            defs.appendChild(sparkCore);

            this.clipPath = svgEl('clipPath', { id: this.ids.textClip });
            this.clipText = svgEl('text', {
                id: this.ids.clipText,
                x: '160',
                y: '98',
                'text-anchor': 'middle',
                'dominant-baseline': 'middle',
                style: "font: 900 118px/1 'Arial Black', Impact, Arial, sans-serif; letter-spacing: -8px;"
            });
            this.clipText.textContent = this.value;
            this.clipPath.appendChild(this.clipText);
            defs.appendChild(this.clipPath);

            this.svg.appendChild(defs);

            this.scene = svgEl('g');
            this.backgroundHalo = svgEl('ellipse', { cx: '160', cy: '124', rx: '82', ry: '22', filter: this._paintRef(this.ids.outerHalo) });
            this.backgroundHalo2 = svgEl('ellipse', { cx: '160', cy: '96', rx: '90', ry: '34', filter: this._paintRef(this.ids.outerHalo) });
            this.sparksBehind = svgEl('g');

            this.haloFar = svgEl('text', {
                x: '160',
                y: '98',
                'text-anchor': 'middle',
                'dominant-baseline': 'middle',
                filter: this._paintRef(this.ids.outerHalo),
                style: "font: 900 118px/1 'Arial Black', Impact, Arial, sans-serif; letter-spacing: -8px;"
            });

            this.baseNumber = svgEl('text', {
                x: '160',
                y: '98',
                'text-anchor': 'middle',
                'dominant-baseline': 'middle',
                fill: this._paintRef(this.ids.fireGrad),
                filter: this._paintRef(this.ids.numGlow),
                stroke: 'rgba(110,0,0,0.12)',
                'stroke-width': '0.8',
                'paint-order': 'stroke fill',
                style: "font: 900 118px/1 'Arial Black', Impact, Arial, sans-serif; letter-spacing: -8px;"
            });

            this.haloNear = svgEl('text', {
                x: '160',
                y: '98',
                'text-anchor': 'middle',
                'dominant-baseline': 'middle',
                filter: this._paintRef(this.ids.outerHalo),
                style: "font: 900 118px/1 'Arial Black', Impact, Arial, sans-serif; letter-spacing: -8px;"
            });

            this.clipGroup = svgEl('g', { 'clip-path': this._paintRef(this.ids.textClip) });
            this.innerHotRect = svgEl('rect', { x: '0', y: '0', width: '320', height: '180', fill: this._paintRef(this.ids.innerHot), opacity: '0.66' });
            this.flowARect = svgEl('rect', { x: '0', y: '0', width: '320', height: '180', fill: this._paintRef(this.ids.flowA), opacity: '0.54' });
            this.flowBRect = svgEl('rect', { x: '0', y: '0', width: '320', height: '180', fill: this._paintRef(this.ids.flowB), opacity: '0.38' });
            this.insideJets = svgEl('g', { filter: this._paintRef(this.ids.blur16) });
            this.insideBlobs = svgEl('g', { filter: this._paintRef(this.ids.blur10) });
            this.insideFlares = svgEl('g', { filter: this._paintRef(this.ids.blur5) });
            this.clipGroup.append(this.innerHotRect, this.flowARect, this.flowBRect, this.insideJets, this.insideBlobs, this.insideFlares);

            this.sparksFront = svgEl('g');

            this.scene.append(
                this.backgroundHalo,
                this.backgroundHalo2,
                this.sparksBehind,
                this.haloFar,
                this.haloNear,
                this.baseNumber,
                this.clipGroup,
                this.sparksFront
            );

            this.svg.appendChild(this.scene);
        }

        _setValueText(value) {
            const text = String(value);
            this.baseNumber.textContent = text;
            this.haloFar.textContent = text;
            this.haloNear.textContent = text;
            this.clipText.textContent = text;
        }

        _applyAccessibilityLabel() {
            const label = this.getAttribute('label') || `Streak ${this.value}`;
            this.srLabel.textContent = label;
        }

        _refreshTextAndParticles() {
            if (!this.isConnected) {
                return;
            }

            this.palette = buildFirePalette(this.numericValue, this.intensity);

            const raw = this.value;
            const len = String(raw).length;
            const fontSize = clamp(126 - Math.max(0, len - 2) * 16, 62, 126);
            const letterSpacing = clamp(-8 + Math.max(0, len - 2) * -2, -16, -4);
            const textStyle = `font: 900 ${fontSize}px/1 'Arial Black', Impact, Arial, sans-serif; letter-spacing: ${letterSpacing}px;`;

            [this.baseNumber, this.haloFar, this.haloNear, this.clipText].forEach((node) => {
                node.setAttribute('style', textStyle);
            });

            let bb;
            try {
                bb = this.baseNumber.getBBox();
            } catch {
                bb = { x: 64, y: 34, width: 192, height: 108 };
            }

            this.bounds = bb;

            const width = bb.width || 192;
            const topY = bb.y;
            const bottomY = bb.y + bb.height;
            const centerX = bb.x + bb.width / 2;
            const centerY = bb.y + bb.height / 2;

            this.backgroundHalo.setAttribute('cx', centerX.toFixed(1));
            this.backgroundHalo.setAttribute('cy', (bottomY + 10).toFixed(1));
            this.backgroundHalo.setAttribute('rx', (width * 0.56).toFixed(1));
            this.backgroundHalo.setAttribute('ry', '18');

            this.backgroundHalo2.setAttribute('cx', centerX.toFixed(1));
            this.backgroundHalo2.setAttribute('cy', (centerY + 18).toFixed(1));
            this.backgroundHalo2.setAttribute('rx', (width * 0.62).toFixed(1));
            this.backgroundHalo2.setAttribute('ry', (bb.height * 0.34).toFixed(1));

            this._rebuildInnerFlames(topY);
            this._rebuildSparks();
        }

        _rebuildInnerFlames() {
            this.insideJets.innerHTML = '';
            this.insideBlobs.innerHTML = '';
            this.insideFlares.innerHTML = '';
            this.jetData = [];
            this.blobData = [];

            const bb = this.bounds || { x: 64, y: 34, width: 192, height: 108 };
            const intensity = this.intensity;
            const energy = this.palette.energy;

            const jetCount = clamp(Math.round(4 + bb.width / 56 * (0.8 + intensity * 0.5 + energy * 0.8)), 4, 12);
            for (let index = 0; index < jetCount; index += 1) {
                const node = svgEl('ellipse');
                this.insideJets.appendChild(node);
                this.jetData.push({
                    node,
                    cx: bb.x + bb.width * (0.08 + Math.random() * 0.84),
                    cy: bb.y + bb.height * (0.18 + Math.random() * 0.42),
                    rx: 5 + Math.random() * 8,
                    ry: 14 + Math.random() * 20,
                    dx: 2 + Math.random() * 5,
                    dy: 5 + Math.random() * 7,
                    phase: Math.random() * Math.PI * 2,
                    speed: 0.7 + Math.random() * 1.0,
                    hot: Math.random() > 0.35,
                    opacity: 0.18 + Math.random() * 0.18
                });
            }

            const blobCount = clamp(Math.round(4 + bb.width / 64 * (0.8 + intensity * 0.4 + energy * 0.6)), 4, 10);
            for (let index = 0; index < blobCount; index += 1) {
                const node = svgEl('ellipse');
                this.insideBlobs.appendChild(node);
                this.blobData.push({
                    node,
                    cx: bb.x + bb.width * (0.1 + Math.random() * 0.8),
                    cy: bb.y + bb.height * (0.12 + Math.random() * 0.48),
                    rx: 8 + Math.random() * 14,
                    ry: 12 + Math.random() * 20,
                    dx: 2 + Math.random() * 5,
                    dy: 2 + Math.random() * 5,
                    phase: Math.random() * Math.PI * 2,
                    speed: 0.45 + Math.random() * 0.7,
                    bright: Math.random() > 0.4,
                    opacity: 0.18 + Math.random() * 0.14
                });
            }

            const flareCount = clamp(Math.round(2 + bb.width / 92 * (0.7 + energy * 0.9)), 2, 6);
            for (let index = 0; index < flareCount; index += 1) {
                const node = svgEl('circle');
                node.dataset.cx = (bb.x + bb.width * (0.16 + Math.random() * 0.68)).toFixed(2);
                node.dataset.cy = (bb.y + bb.height * (0.1 + Math.random() * 0.28)).toFixed(2);
                node.dataset.r = (4 + Math.random() * 9).toFixed(2);
                node.dataset.phase = (Math.random() * Math.PI * 2).toFixed(4);
                node.dataset.speed = (0.9 + Math.random() * 1.3).toFixed(4);
                this.insideFlares.appendChild(node);
            }
        }

        _rebuildSparks() {
            this.sparksBehind.innerHTML = '';
            this.sparksFront.innerHTML = '';
            this.sparkData = [];

            const bb = this.bounds || { x: 64, y: 34, width: 192, height: 108 };
            const count = clamp(Math.round(10 + bb.width / 24 * (0.65 + this.intensity * 0.36 + this.palette.energy * 0.82)), 10, 28);

            for (let index = 0; index < count; index += 1) {
                const front = Math.random() > 0.42;
                this.sparkData.push(this._makeSpark(front ? this.sparksFront : this.sparksBehind, bb, front));
            }
        }

        _makeSpark(layer, bb, front) {
            const group = svgEl('g');
            const halo = svgEl('circle', { filter: this._paintRef(this.ids.sparkHalo) });
            const core = svgEl('circle', { filter: this._paintRef(this.ids.sparkCore) });
            group.append(halo, core);
            layer.appendChild(group);

            const angle = (-Math.PI / 2) + (Math.random() - 0.5) * 0.42;
            const speed = (0.18 + Math.random() * 0.42) * (0.88 + this.intensity * 0.34 + this.palette.energy * 0.2);

            return {
                group,
                halo,
                core,
                bb,
                front,
                x: bb.x + bb.width * (0.08 + Math.random() * 0.84),
                y: bb.y + bb.height * (0.1 + Math.random() * 0.08),
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                drift: (Math.random() - 0.5) * 0.007,
                life: Math.random() * 14,
                ttl: 16 + Math.random() * 20,
                r: 0.6 + Math.random() * 1.3,
                hot: Math.random() > 0.22,
                depth: front ? 1 + Math.random() * 0.18 : 0.74 + Math.random() * 0.16
            };
        }

        _syncAnimationState() {
            const shouldRun = !this.hasAttribute('paused') && this.visible && !document.hidden && !this.reducedMotion;
            if (shouldRun) {
                this._start();
            } else {
                this._stop();
                this._renderStaticFrame();
            }
        }

        _start() {
            if (this.running) {
                return;
            }
            this.running = true;
            this.lastNow = performance.now();
            this.rafId = requestAnimationFrame((now) => this._tick(now));
        }

        _stop() {
            this.running = false;
            if (this.rafId) {
                cancelAnimationFrame(this.rafId);
            }
            this.rafId = 0;
        }

        _tick(now) {
            if (!this.running) {
                return;
            }
            this._renderFrame(now * 0.001);
            this.rafId = requestAnimationFrame((time) => this._tick(time));
        }

        _renderStaticFrame() {
            this._renderFrame(0.75);
        }

        _renderFrame(time) {
            const pulseA = (Math.sin(time * 0.8) + 1) * 0.5;
            const pulseB = (Math.sin(time * 1.55 + 0.9) + 1) * 0.5;
            const pulseC = (Math.sin(time * 2.35 + 1.8) + 1) * 0.5;
            const flicker = (Math.sin(time * 7.4) * 0.2 + Math.sin(time * 11.2 + 0.6) * 0.15 + 1) * 0.5;
            const { palette } = this;

            const top = lighten(palette.top, 0.05 + pulseA * 0.08);
            const yellow = lighten(palette.yellow, 0.02 + pulseB * 0.08);
            const orange = mixColor(palette.orange, palette.dominant, 0.18 + pulseA * 0.14);
            const orangeHot = mixColor(palette.orangeHot, palette.dominant, 0.26 + pulseC * 0.12);
            const redHot = mixColor(palette.redHot, palette.deep, 0.24 + pulseB * 0.18);
            const tail = darken(mixColor(palette.tail, palette.deep, 0.5), 0.08 + pulseA * 0.06);
            const glow = mixColor(palette.glow, palette.spark, 0.1 + pulseA * 0.08);

            this.svg.querySelector(`#${this.ids.fireGrad}`)?.setAttribute(
                'gradientTransform',
                `translate(${Math.sin(time * 1.1) * 4.5}, ${-8 + Math.sin(time * 1.9) * 8}) scale(1 ${1.05 + pulseB * 0.1}) skewX(${Math.sin(time * 0.9) * 1.6})`
            );
            this.svg.querySelector(`#${this.ids.flowA}`)?.setAttribute(
                'gradientTransform',
                `translate(${Math.sin(time * 1.9 + 0.4) * 8}, ${-24 + Math.sin(time * 2.6) * 10}) scale(1 ${1.18 + pulseA * 0.16})`
            );
            this.svg.querySelector(`#${this.ids.flowB}`)?.setAttribute(
                'gradientTransform',
                `translate(${Math.sin(time * 2.2 + 1.2) * 7}, ${-30 + Math.sin(time * 3 + 0.6) * 11}) scale(1 ${1.15 + pulseC * 0.14})`
            );

            this.fgStops[0].setAttribute('offset', `${Math.max(0, 1 + pulseA * 2.5)}%`);
            this.fgStops[1].setAttribute('offset', `${9 + pulseB * 5}%`);
            this.fgStops[2].setAttribute('offset', `${22 + pulseA * 8}%`);
            this.fgStops[3].setAttribute('offset', `${43 + pulseC * 8}%`);
            this.fgStops[4].setAttribute('offset', `${66 + pulseB * 8}%`);
            this.fgStops[5].setAttribute('offset', '100%');
            this.fgStops[0].setAttribute('stop-color', rgbString(top));
            this.fgStops[1].setAttribute('stop-color', rgbString(yellow));
            this.fgStops[2].setAttribute('stop-color', rgbString(orange));
            this.fgStops[3].setAttribute('stop-color', rgbString(orangeHot));
            this.fgStops[4].setAttribute('stop-color', rgbString(redHot));
            this.fgStops[5].setAttribute('stop-color', rgbString(tail));
            this.fgStops.forEach((stop) => stop.setAttribute('stop-opacity', '1'));

            this.faStops[0].setAttribute('offset', '0%');
            this.faStops[1].setAttribute('offset', `${8 + pulseA * 6}%`);
            this.faStops[2].setAttribute('offset', `${22 + pulseB * 8}%`);
            this.faStops[3].setAttribute('offset', `${39 + pulseC * 8}%`);
            this.faStops[4].setAttribute('offset', '100%');
            this.faStops[0].setAttribute('stop-color', rgbString(palette.spark, 0));
            this.faStops[1].setAttribute('stop-color', rgbString(lighten(palette.flowWarm, 0.24), 0.32 + pulseA * 0.24));
            this.faStops[2].setAttribute('stop-color', rgbString(palette.flowHot, 0.14 + pulseA * 0.18));
            this.faStops[3].setAttribute('stop-color', rgbString(palette.flowDeep, 0.08 + pulseB * 0.08));
            this.faStops[4].setAttribute('stop-color', rgbString(palette.flowDeep, 0));

            this.fbStops[0].setAttribute('offset', '0%');
            this.fbStops[1].setAttribute('offset', `${10 + pulseC * 6}%`);
            this.fbStops[2].setAttribute('offset', `${27 + pulseA * 8}%`);
            this.fbStops[3].setAttribute('offset', `${44 + pulseB * 8}%`);
            this.fbStops[4].setAttribute('offset', '100%');
            this.fbStops[0].setAttribute('stop-color', rgbString(palette.spark, 0));
            this.fbStops[1].setAttribute('stop-color', rgbString(lighten(palette.flowWarm, 0.18), 0.24 + pulseC * 0.18));
            this.fbStops[2].setAttribute('stop-color', rgbString(mixColor(palette.flowHot, palette.dominant, 0.24), 0.12 + pulseB * 0.11));
            this.fbStops[3].setAttribute('stop-color', rgbString(mixColor(palette.flowDeep, palette.deep, 0.22), 0.07 + pulseA * 0.08));
            this.fbStops[4].setAttribute('stop-color', rgbString(palette.flowDeep, 0));

            this.innerHotStops[0].setAttribute('offset', '0%');
            this.innerHotStops[1].setAttribute('offset', '20%');
            this.innerHotStops[2].setAttribute('offset', '56%');
            this.innerHotStops[3].setAttribute('offset', '100%');
            this.innerHotStops[0].setAttribute('stop-color', rgbString(lighten(palette.spark, 0.12), 0.95));
            this.innerHotStops[1].setAttribute('stop-color', rgbString(lighten(palette.yellow, 0.12), 0.75));
            this.innerHotStops[2].setAttribute('stop-color', rgbString(glow, 0.26));
            this.innerHotStops[3].setAttribute('stop-color', rgbString(redHot, 0));

            this.backgroundHalo.setAttribute('fill', rgbString(mixColor(palette.orangeHot, palette.dominant, 0.18), 0.12 + palette.energy * 0.08));
            this.backgroundHalo2.setAttribute('fill', rgbString(mixColor(glow, palette.dominant, 0.34), 0.08 + palette.energy * 0.05));
            this.haloFar.setAttribute('fill', rgbString(mixColor(palette.deep, glow, 0.22), 0.26 + palette.energy * 0.12));
            this.haloNear.setAttribute('fill', rgbString(lighten(glow, 0.08), 0.36 + palette.energy * 0.12));

            this.jetData.forEach((jet, index) => {
                const cx = jet.cx + Math.sin(time * jet.speed + jet.phase) * jet.dx;
                const cy = jet.cy + Math.cos(time * jet.speed * 0.9 + jet.phase) * jet.dy - pulseB * 2;
                const rx = jet.rx * (0.82 + Math.sin(time * 1.6 + jet.phase) * 0.12);
                const ry = jet.ry * (0.86 + Math.cos(time * 1.35 + jet.phase) * 0.16);
                const opacity = clamp(jet.opacity + Math.sin(time * 1.9 + index) * 0.05 + flicker * 0.08, 0.05, 0.6);
                const fill = jet.hot
                    ? mixColor(glow, palette.dominant, 0.24 + pulseA * 0.12)
                    : mixColor(palette.orange, palette.yellow, 0.42 + pulseC * 0.12);

                jet.node.setAttribute('cx', cx.toFixed(2));
                jet.node.setAttribute('cy', cy.toFixed(2));
                jet.node.setAttribute('rx', Math.max(2.6, rx).toFixed(2));
                jet.node.setAttribute('ry', Math.max(8, ry).toFixed(2));
                jet.node.setAttribute('fill', rgbString(fill, 0.95));
                jet.node.setAttribute('opacity', opacity.toFixed(3));
            });

            this.blobData.forEach((blob, index) => {
                const cx = blob.cx + Math.sin(time * blob.speed + blob.phase) * blob.dx;
                const cy = blob.cy + Math.cos(time * blob.speed * 0.85 + blob.phase) * blob.dy;
                const rx = blob.rx * (0.86 + Math.sin(time * 1.3 + blob.phase) * 0.1);
                const ry = blob.ry * (0.84 + Math.cos(time * 1.1 + blob.phase) * 0.1);
                const opacity = clamp(blob.opacity + Math.sin(time * 1.5 + index) * 0.04, 0.04, 0.45);
                const fill = blob.bright
                    ? mixColor(palette.orange, palette.spark, 0.24 + pulseB * 0.12)
                    : mixColor(palette.orangeHot, palette.dominant, 0.28 + pulseA * 0.1);

                blob.node.setAttribute('cx', cx.toFixed(2));
                blob.node.setAttribute('cy', cy.toFixed(2));
                blob.node.setAttribute('rx', Math.max(3, rx).toFixed(2));
                blob.node.setAttribute('ry', Math.max(4, ry).toFixed(2));
                blob.node.setAttribute('fill', rgbString(fill, 0.86));
                blob.node.setAttribute('opacity', opacity.toFixed(3));
            });

            [...this.insideFlares.children].forEach((flare, index) => {
                const cx = Number(flare.dataset.cx);
                const cy = Number(flare.dataset.cy);
                const radius = Number(flare.dataset.r);
                const phase = Number(flare.dataset.phase);
                const speed = Number(flare.dataset.speed);
                flare.setAttribute('cx', (cx + Math.sin(time * speed + phase) * 1.8).toFixed(2));
                flare.setAttribute('cy', (cy + Math.cos(time * speed * 0.9 + phase) * 1.4 - pulseA * 1.3).toFixed(2));
                flare.setAttribute('r', Math.max(1.2, radius * (0.82 + pulseB * 0.18)).toFixed(2));
                flare.setAttribute('fill', this._paintRef(this.ids.innerHot));
                flare.setAttribute('opacity', (0.28 + Math.sin(time * 2.4 + index) * 0.08 + flicker * 0.1).toFixed(3));
            });

            this.sparkData.forEach((spark, index) => {
                spark.life += 1;
                spark.vx += spark.drift;
                spark.vy -= 0.004;
                spark.vx *= 0.994;
                spark.vy *= 0.997;
                spark.x += spark.vx;
                spark.y += spark.vy;

                const ratio = spark.life / spark.ttl;
                const alpha = Math.max(0, 1 - ratio * ratio);
                const twinkle = 0.82 + Math.sin(spark.life * 0.55 + index * 0.8) * 0.18;
                const heat = 1 - ratio;

                const haloRadius = spark.r * (1.8 + heat * 0.5) * spark.depth;
                const coreRadius = spark.r * (0.72 + heat * 0.16) * spark.depth;
                const haloOpacity = Math.max(0, alpha * 0.22 * twinkle * (spark.front ? 1 : 0.85));
                const coreOpacity = Math.max(0, alpha * 0.92 * twinkle * (spark.front ? 1 : 0.86));
                const haloFill = mixColor(glow, palette.spark, 0.22 + heat * 0.18);
                const coreFill = spark.hot
                    ? mixColor(palette.spark, palette.dominant, 0.28 + heat * 0.26)
                    : mixColor(palette.orangeHot, palette.yellow, 0.38 + heat * 0.18);

                spark.halo.setAttribute('cx', spark.x.toFixed(2));
                spark.halo.setAttribute('cy', spark.y.toFixed(2));
                spark.halo.setAttribute('r', haloRadius.toFixed(2));
                spark.halo.setAttribute('fill', rgbString(haloFill, haloOpacity));

                spark.core.setAttribute('cx', spark.x.toFixed(2));
                spark.core.setAttribute('cy', spark.y.toFixed(2));
                spark.core.setAttribute('r', Math.max(0.25, coreRadius).toFixed(2));
                spark.core.setAttribute('fill', rgbString(coreFill, coreOpacity));

                if (
                    spark.life > spark.ttl ||
                    spark.y < spark.bb.y + spark.bb.height * 0.02 ||
                    spark.x < spark.bb.x - 8 ||
                    spark.x > spark.bb.x + spark.bb.width + 8
                ) {
                    spark.group.remove();
                    this.sparkData[index] = this._makeSpark(spark.front ? this.sparksFront : this.sparksBehind, spark.bb, spark.front);
                }
            });
        }
    }

    customElements.define('fire-score', FireScore);
})();
