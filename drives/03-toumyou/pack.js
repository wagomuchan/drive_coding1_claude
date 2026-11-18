// 豆苗パックの絵 なぞった線の当たり判定 収穫の演出

const NS = 'http://www.w3.org/2000/svg';
export const CELL_COUNT = 30;
export const STEPS = 10;

const W = 360;
const H = 470;
const RIM_Y = 352;      //パックのふち ここより上で切れる
const STUMP_H = 44;     //ふちから少し出る
const HIT_READY = 9;
const HIT_GROWING = 8;

const LEAF_L = 'M0 0 C-4 -7 -13 -11 -20 -9 C-16 -2 -8 1 0 0 Z';
const LEAF_R = 'M0 -1 C5 -9 14 -13 21 -10 C16 -2 7 1 0 -1 Z';
const TENDRIL = 'M0 -1 C1 -8 -3 -12 0 -17 C2 -20 5 -18 4 -15';
const STAR = 'M0 -7 L1.4 -1.4 L7 0 L1.4 1.4 L0 7 L-1.4 1.4 L-7 0 L-1.4 -1.4 Z';

const PACK_SVG = `
<defs>
  <linearGradient id="tray-g" x1="0" x2="1">
    <stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/>
    <stop offset="0.12" stop-color="#ffffff" stop-opacity="0.12"/>
    <stop offset="0.7" stop-color="#ffffff" stop-opacity="0.06"/>
    <stop offset="1" stop-color="#ffffff" stop-opacity="0.4"/>
  </linearGradient>
  <pattern id="sponge-p" width="9" height="7" patternUnits="userSpaceOnUse">
    <rect width="9" height="7" fill="#f4ecd3"/>
    <circle cx="2" cy="2" r="1.1" fill="#e3d6ae"/>
    <circle cx="6.5" cy="5" r="0.9" fill="#e6dab5"/>
  </pattern>
</defs>
<ellipse cx="180" cy="463" rx="150" ry="6" fill="rgba(40,60,30,0.14)"/>
<g id="pack-body">
  <path d="M40 352 L320 352 L308 455 Q307 460 301 460 L59 460 Q53 460 52 455 Z" fill="rgba(205,226,232,0.5)"/>
  <rect x="56" y="394" width="248" height="60" rx="4" fill="url(#sponge-p)"/>
  <rect x="56" y="440" width="248" height="14" rx="3" fill="rgba(150,195,220,0.35)"/>
  <g id="roots"></g>
  <g id="stems"></g>
  <g id="beans"></g>
  <path d="M40 352 L320 352 L308 455 Q307 460 301 460 L59 460 Q53 460 52 455 Z" fill="url(#tray-g)" stroke="rgba(110,145,155,0.55)" stroke-width="1.5"/>
  <path d="M60 362 L67 448" stroke="rgba(255,255,255,0.85)" stroke-width="3" stroke-linecap="round"/>
  <path d="M296 364 L291 410" stroke="rgba(255,255,255,0.6)" stroke-width="2" stroke-linecap="round"/>
  <path d="M36 352 L324 352" stroke="rgba(120,155,165,0.75)" stroke-width="4" stroke-linecap="round"/>
  <g class="label">
    <rect x="132" y="402" width="96" height="38" rx="9" fill="#2f7d32"/>
    <rect x="136" y="406" width="88" height="30" rx="6" fill="none" stroke="#f3f7d9" stroke-width="1.2"/>
    <text x="180" y="429" text-anchor="middle">豆苗</text>
  </g>
</g>
<g id="fx"></g>
`;

let svg = null;
let wrap = null;
let body = null;
let fx = null;
let sprouts = [];
let tweening = false;
let shakeAnim = null;

function is_reduced_motion()
{
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// 生える位置 毎回同じ 種固定
function make_rand(seed)
{
    let a = seed;
    return function () {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function make_sprouts()
{
    const rand = make_rand(20261118);
    const rows = [
        { y: 384, off: 0, h: 300 },
        { y: 389, off: 0.5, h: 290 },
        { y: 394, off: 0.25, h: 278 },
    ];
    let list = [];
    for(let r=0;r<rows.length;r++){
        for(let k=0;k<10;k++){
            list.push({
                x: Math.round((72 + (k + rows[r].off) * 23 + (rand() - 0.5) * 8) * 10) / 10,
                y: rows[r].y + Math.round((rand() - 0.5) * 3),
                maxH: rows[r].h + Math.round(rand() * 22),
                lean: (rand() - 0.5) * 0.2,
                root: (rand() - 0.5) * 8,
                g: 0,
                ok: false,
                curH: 0,
                goalH: 0,
                curLeaf: 0,
                goalLeaf: 0,
            });
        }
    }
    return list;
}

function el(tag, attrs)
{
    const e = document.createElementNS(NS, tag);
    for(const k in attrs){
        e.setAttribute(k, attrs[k]);
    }
    return e;
}

export function initPack(svgEl, wrapEl)
{
    svg = svgEl;
    wrap = wrapEl;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.innerHTML = PACK_SVG;
    body = svg.querySelector('#pack-body');
    fx = svg.querySelector('#fx');
    const roots = svg.querySelector('#roots');
    const stems = svg.querySelector('#stems');
    const beans = svg.querySelector('#beans');

    sprouts = make_sprouts();
    for(const s of sprouts){
        const g = el('g', { class: 'sprout is-stump' });
        const stem = el('path', { class: 'stem' });
        const top = el('g', { class: 'top' });
        top.append(el('path', { class: 'leaf', d: LEAF_L }), el('path', { class: 'leaf', d: LEAF_R }), el('path', { class: 'tendril', d: TENDRIL }));
        const tip = el('ellipse', { class: 'tip', rx: 1.9, ry: 1.2 });
        g.append(stem, top, tip);
        stems.append(g);
        s.dom = { g: g, stem: stem, top: top, tip: tip };

        roots.append(el('path', { class: 'root', d: 'M' + s.x + ' ' + (s.y + 5) + ' q' + (s.root / 2) + ' 8 ' + s.root + ' ' + (440 - s.y) }));
        beans.append(el('ellipse', { class: 'bean', cx: s.x, cy: s.y + 2, rx: 6.5, ry: 5 }));
        set_look(s);
        draw_sprout(s);
    }
}//finished

// ---------------------------------------------------------------
// 1本ずつの見た目
// ---------------------------------------------------------------

function mix(c1, c2, t)
{
    const a = parseInt(c1.slice(1), 16);
    const b = parseInt(c2.slice(1), 16);
    let out = '#';
    for(let sh=16;sh>=0;sh=sh-8){
        const x = (a >> sh) & 255;
        const y = (b >> sh) & 255;
        out += Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
    }
    return out;
}

function height_of(s)
{
    if(s.ok){
        return s.maxH;
    }
    if(s.g <= 0){
        return STUMP_H;
    }
    return STUMP_H + (s.maxH * 0.78 - STUMP_H) * s.g / (STEPS - 1);
}

function leaf_of(s)
{
    if(s.ok){
        return 1.25;
    }
    if(s.g <= 0){
        return 0;
    }
    return 0.35 + 0.55 * s.g / (STEPS - 1);
}

function set_look(s)
{
    const g = s.dom.g;
    g.classList.toggle('is-ready', s.ok);
    g.classList.toggle('is-stump', !s.ok && s.g <= 0);
    if(s.ok){
        g.style.setProperty('--stem', '#5aa83f');
        g.style.setProperty('--leaf', '#2e7d32');
    }else{
        const t = s.g / (STEPS - 1);
        g.style.setProperty('--stem', mix('#ecebb0', '#acd25a', t));
        g.style.setProperty('--leaf', mix('#e4e98f', '#98c84c', t));
    }
}

function top_of(s, h)
{
    return { x: s.x + s.lean * h, y: s.y - h };
}

function draw_sprout(s)
{
    const t = top_of(s, s.curH);
    s.dom.stem.setAttribute('d', 'M' + s.x + ' ' + s.y + ' L' + t.x.toFixed(1) + ' ' + t.y.toFixed(1));
    s.dom.top.setAttribute('transform', 'translate(' + t.x.toFixed(1) + ' ' + t.y.toFixed(1) + ') rotate(' + (s.lean * 70).toFixed(1) + ') scale(' + s.curLeaf.toFixed(2) + ')');
    s.dom.tip.setAttribute('cx', t.x.toFixed(1));
    s.dom.tip.setAttribute('cy', t.y.toFixed(1));
}

// g:0〜9 育ち途中 / ok:育ちきり
export function setSprout(i, g, ok, animate)
{
    const s = sprouts[i];
    if(!s){
        return;
    }
    s.g = g;
    s.ok = ok;
    s.goalH = height_of(s);
    s.goalLeaf = leaf_of(s);
    set_look(s);
    if(!animate || is_reduced_motion()){
        s.curH = s.goalH;
        s.curLeaf = s.goalLeaf;
        draw_sprout(s);
        return;
    }
    if(!tweening){
        tweening = true;
        requestAnimationFrame(tween);
    }
}

function tween()
{
    let moving = false;
    for(const s of sprouts){
        if(s.curH == s.goalH && s.curLeaf == s.goalLeaf){
            continue;
        }
        s.curH += (s.goalH - s.curH) * 0.12;
        s.curLeaf += (s.goalLeaf - s.curLeaf) * 0.12;
        if(Math.abs(s.goalH - s.curH) < 0.4 && Math.abs(s.goalLeaf - s.curLeaf) < 0.01){
            s.curH = s.goalH;
            s.curLeaf = s.goalLeaf;
        }else{
            moving = true;
        }
        draw_sprout(s);
    }
    if(moving){
        requestAnimationFrame(tween);
    }else{
        tweening = false;
    }
}

// ---------------------------------------------------------------
// 当たり判定
// ---------------------------------------------------------------

export function toSvgPoint(clientX, clientY)
{
    const m = svg.getScreenCTM();
    if(!m){
        return { x: -999, y: -999 };
    }
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
}

// svg の座標 → wrap の中の px
export function toWrapPoint(x, y)
{
    const m = svg.getScreenCTM();
    const r = wrap.getBoundingClientRect();
    if(!m){
        return { x: 0, y: 0 };
    }
    const p = new DOMPoint(x, y).matrixTransform(m);
    return { x: p.x - r.left, y: p.y - r.top };
}

// 点pと線分ab
function point_seg(p, a, b)
{
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = 0;
    if(len2 > 0){
        t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
    }
    const x = a.x + dx * t;
    const y = a.y + dy * t;
    return { d: Math.hypot(p.x - x, p.y - y), x: x, y: y };
}

function cross(o, a, b)
{
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

// 指の線分abと茎cd いちばん近いところ（茎の上の点）
function seg_seg(a, b, c, d)
{
    const d1 = cross(c, d, a);
    const d2 = cross(c, d, b);
    const d3 = cross(a, b, c);
    const d4 = cross(a, b, d);
    if(((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))){
        const t = d1 / (d1 - d2);
        return { d: 0, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    let best = point_seg(a, c, d);
    const p2 = point_seg(b, c, d);
    if(p2.d < best.d){
        best = p2;
    }
    const p3 = point_seg(c, a, b);
    if(p3.d < best.d){
        best = { d: p3.d, x: c.x, y: c.y };
    }
    const p4 = point_seg(d, a, b);
    if(p4.d < best.d){
        best = { d: p4.d, x: d.x, y: d.y };
    }
    return best;
}

// なぞった線に当たった豆苗 ふちより上だけ
export function findHits(a, b)
{
    let hits = [];
    for(let i=0;i<sprouts.length;i++){
        const s = sprouts[i];
        const t = top_of(s, s.curH);
        if(t.y >= RIM_Y){
            continue;//パックの中
        }
        const k = s.y - RIM_Y;
        const c = { x: s.x + s.lean * k, y: RIM_Y };
        const hit = seg_seg(a, b, c, t);
        if(hit.d <= (s.ok ? HIT_READY : HIT_GROWING)){
            hits.push({ i: i, x: hit.x, y: hit.y, from: Math.hypot(hit.x - a.x, hit.y - a.y) });
        }
    }
    hits.sort((p, q) => p.from - q.from);//なぞった順
    return hits;
}

// タップしたところにいちばん近い豆苗
export function findNear(p)
{
    let best = -1;
    let bestD = 18;
    for(let i=0;i<sprouts.length;i++){
        const s = sprouts[i];
        const t = top_of(s, Math.max(s.curH, STUMP_H + 6));
        const d = point_seg(p, { x: s.x, y: s.y + 4 }, t).d;
        if(d < bestD){
            bestD = d;
            best = i;
        }
    }
    return best;
}

// ---------------------------------------------------------------
// 演出
// ---------------------------------------------------------------

function fade_out(node, ms)
{
    if(!node.animate){
        node.remove();
        return;
    }
    node.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms }).onfinish = () => node.remove();
}

// 切れた上の部分が飛ぶ 葉っぱちょっと散る パックちょっと揺れる
export function playCut(i, x, y, dir)
{
    const s = sprouts[i];
    if(!s){
        return;
    }
    const t = top_of(s, s.curH);
    const piece = el('g', { class: 'sprout is-ready piece' });
    piece.setAttribute('style', s.dom.g.getAttribute('style') || '');
    piece.append(el('path', { class: 'stem', d: 'M' + x.toFixed(1) + ' ' + y.toFixed(1) + ' L' + t.x.toFixed(1) + ' ' + t.y.toFixed(1) }));
    piece.append(s.dom.top.cloneNode(true));
    fx.append(piece);

    if(is_reduced_motion() || !piece.animate){
        fade_out(piece, 250);
        return;
    }

    const r = dir * (18 + Math.random() * 30);
    const dx = dir * (12 + Math.random() * 22);
    piece.style.transformOrigin = x.toFixed(1) + 'px ' + y.toFixed(1) + 'px';
    piece.animate([
        { transform: 'translate(0px, 0px) rotate(0deg)', opacity: 1 },
        { transform: 'translate(' + (dx * 0.4) + 'px, -14px) rotate(' + (r * 0.4) + 'deg)', opacity: 1, offset: 0.3 },
        { transform: 'translate(' + dx + 'px, 70px) rotate(' + r + 'deg)', opacity: 0 },
    ], { duration: 650, easing: 'cubic-bezier(.3,.6,.6,1)' }).onfinish = () => piece.remove();

    // 葉っぱ3枚
    for(let k=0;k<3;k++){
        const leaf = el('ellipse', { class: 'bit', cx: x.toFixed(1), cy: y.toFixed(1), rx: 3.2, ry: 1.6 });
        fx.append(leaf);
        const ang = Math.random() * Math.PI * 2;
        const dist = 12 + Math.random() * 16;
        leaf.style.transformOrigin = x.toFixed(1) + 'px ' + y.toFixed(1) + 'px';
        leaf.animate([
            { transform: 'translate(0px, 0px) rotate(0deg)', opacity: 0.9 },
            { transform: 'translate(' + (Math.cos(ang) * dist).toFixed(1) + 'px, ' + (Math.sin(ang) * dist + 10).toFixed(1) + 'px) rotate(' + Math.round(Math.random() * 360) + 'deg)', opacity: 0 },
        ], { duration: 420 + Math.random() * 120, easing: 'ease-out' }).onfinish = () => leaf.remove();
    }

    if(!shakeAnim || shakeAnim.playState == 'finished'){
        body.style.transformOrigin = '180px 460px';
        shakeAnim = body.animate([
            { transform: 'rotate(0deg)' },
            { transform: 'rotate(0.5deg)' },
            { transform: 'rotate(-0.35deg)' },
            { transform: 'rotate(0deg)' },
        ], { duration: 170, easing: 'ease-out' });
    }
}

// キラッ
export function sparkleAt(i)
{
    const s = sprouts[i];
    if(!s || !s.ok || is_reduced_motion()){
        return;
    }
    const t = top_of(s, s.curH);
    const g = el('g', { transform: 'translate(' + (t.x + (Math.random() - 0.5) * 16).toFixed(1) + ' ' + (t.y - 4 - Math.random() * 8).toFixed(1) + ')' });
    const star = el('path', { class: 'sparkle', d: STAR });
    g.append(star);
    fx.append(g);
    if(!star.animate){
        g.remove();
        return;
    }
    star.animate([
        { transform: 'scale(0) rotate(0deg)', opacity: 0 },
        { transform: 'scale(1) rotate(30deg)', opacity: 1, offset: 0.4 },
        { transform: 'scale(0) rotate(60deg)', opacity: 0 },
    ], { duration: 700, easing: 'ease-in-out' }).onfinish = () => g.remove();
}

export function startSparkle()
{
    setInterval(() => {
        if(document.hidden){
            return;
        }
        let ready = [];
        for(let i=0;i<sprouts.length;i++){
            if(sprouts[i].ok && sprouts[i].curH == sprouts[i].goalH){
                ready.push(i);
            }
        }
        if(ready.length > 0){
            sparkleAt(ready[Math.floor(Math.random() * ready.length)]);
        }
    }, 1300);
}
