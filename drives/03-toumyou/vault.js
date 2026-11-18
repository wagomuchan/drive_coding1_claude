// 先月のチャンピオンの宝物庫 パックのまわりの飾りだけ
// パックと豆苗は pack.js のまま 飾りは後ろと前に重ねる
// 飾りは pointer-events: none →なぞるのはじゃましない

const NS = 'http://www.w3.org/2000/svg';
const W = 360;
const H = 470;

let backEl = null;
let frontEl = null;

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

function f(x)
{
    return x.toFixed(1);
}

function coin(x, y, s)
{
    return '<g transform="translate(' + f(x) + ' ' + f(y) + ') scale(' + s.toFixed(2) + ')">'
        + '<ellipse cy="2.4" rx="9" ry="4" fill="#a8680f"/>'
        + '<ellipse rx="9" ry="4" fill="url(#v-coin)" stroke="#d1931c" stroke-width="0.8"/>'
        + '<ellipse rx="5.4" ry="2.2" fill="none" stroke="#fff3b0" stroke-width="0.7" opacity="0.8"/>'
        + '</g>';
}

// 金貨の山 まんなか高い
function pile(rand, cx, baseY, width, height, n)
{
    let list = [];
    for(let i=0;i<n;i++){
        const u = rand() * 2 - 1;
        const top = height * (1 - u * u);
        list.push({ x: cx + u * width / 2, y: baseY - Math.sqrt(rand()) * top, s: 0.85 + rand() * 0.35 });
    }
    list.sort((a, b) => a.y - b.y);//奥から
    let out = '';
    for(const c of list){
        out += coin(c.x, c.y, c.s);
    }
    return out;
}

function gem(x, y, s, color)
{
    return '<g transform="translate(' + f(x) + ' ' + f(y) + ') scale(' + s.toFixed(2) + ')">'
        + '<path d="M-8 -3 L-4 -8 L4 -8 L8 -3 L0 8 Z" fill="' + color + '" stroke="rgba(0,0,0,0.25)" stroke-width="0.6"/>'
        + '<path d="M-8 -3 L8 -3 L0 8 Z" fill="rgba(0,0,0,0.18)"/>'
        + '<path d="M-4 -8 L-1 -3 L-8 -3 Z M4 -8 L1 -3 L8 -3 Z" fill="rgba(255,255,255,0.4)"/>'
        + '<path d="M-2.5 -6 L1.5 -6" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/>'
        + '</g>';
}

function crown(x, y, s)
{
    return '<g transform="translate(' + f(x) + ' ' + f(y) + ') scale(' + s.toFixed(2) + ') rotate(-8)">'
        + '<path d="M-22 8 L-25 -13 L-12 -2 L0 -19 L12 -2 L25 -13 L22 8 Z" fill="url(#v-gold)" stroke="#9a6409" stroke-width="1.2" stroke-linejoin="round"/>'
        + '<rect x="-23" y="5" width="46" height="9" rx="2" fill="#e9b42c" stroke="#9a6409" stroke-width="1"/>'
        + '<circle cx="0" cy="-19" r="2.8" fill="#fff4b0"/><circle cx="-25" cy="-13" r="2.4" fill="#fff4b0"/><circle cx="25" cy="-13" r="2.4" fill="#fff4b0"/>'
        + '<circle cx="0" cy="9.5" r="2.6" fill="#e0245e"/><circle cx="-12" cy="9.5" r="2.1" fill="#2f6fe0"/><circle cx="12" cy="9.5" r="2.1" fill="#1fae6a"/>'
        + '</g>';
}

function bar(x, y)
{
    return '<path d="M' + f(x + 4) + ' ' + f(y) + ' L' + f(x + 26) + ' ' + f(y) + ' L' + f(x + 30) + ' ' + f(y + 7) + ' L' + f(x) + ' ' + f(y + 7) + ' Z" fill="#ffe27a" stroke="#a8680f" stroke-width="0.8"/>'
        + '<path d="M' + f(x) + ' ' + f(y + 7) + ' L' + f(x + 30) + ' ' + f(y + 7) + ' L' + f(x + 30) + ' ' + f(y + 17) + ' L' + f(x) + ' ' + f(y + 17) + ' Z" fill="url(#v-gold)" stroke="#a8680f" stroke-width="0.8"/>'
        + '<path d="M' + f(x + 3) + ' ' + f(y + 10) + ' L' + f(x + 20) + ' ' + f(y + 10) + '" stroke="#fff3b0" stroke-width="1" opacity="0.7"/>';
}

function chest(rand)
{
    let coins = '';
    for(let i=0;i<9;i++){
        coins += coin(14 + rand() * 62, 30 + rand() * 7, 0.8);
    }
    return '<g transform="translate(4 316)">'
        + '<path d="M6 34 L14 0 L78 0 L86 34 Z" fill="#6b3b14" stroke="#3d2008" stroke-width="1.5"/>'
        + '<path d="M22 0 L18 34 M70 0 L74 34" stroke="#e1a92a" stroke-width="5"/>'
        + '<ellipse cx="46" cy="36" rx="40" ry="8" fill="#ffe892"/>'
        + coins
        + '<rect x="0" y="38" width="92" height="46" rx="4" fill="#7a4518" stroke="#3d2008" stroke-width="1.5"/>'
        + '<rect x="0" y="38" width="92" height="6" fill="#e1a92a"/><rect x="0" y="76" width="92" height="6" fill="#e1a92a"/>'
        + '<rect x="12" y="38" width="7" height="46" fill="#e1a92a"/><rect x="73" y="38" width="7" height="46" fill="#e1a92a"/>'
        + '<rect x="39" y="48" width="14" height="16" rx="2" fill="#f3c640" stroke="#9a6409"/>'
        + '<circle cx="46" cy="54" r="2" fill="#3d2008"/><path d="M46 55 L46 60" stroke="#3d2008" stroke-width="1.6"/>'
        + '</g>';
}

const DEFS = '<defs>'
    + '<radialGradient id="v-velvet" cx="50%" cy="42%" r="75%"><stop offset="0" stop-color="#b3182f"/><stop offset="0.6" stop-color="#7d0c20"/><stop offset="1" stop-color="#3e0510"/></radialGradient>'
    + '<pattern id="v-fold" width="22" height="470" patternUnits="userSpaceOnUse"><rect width="22" height="470" fill="rgba(0,0,0,0)"/><rect x="0" width="7" height="470" fill="rgba(0,0,0,0.13)"/><rect x="12" width="3" height="470" fill="rgba(255,255,255,0.05)"/></pattern>'
    + '<radialGradient id="v-glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff2b8" stop-opacity="0.95"/><stop offset="0.45" stop-color="#ffd15c" stop-opacity="0.55"/><stop offset="1" stop-color="#ffb300" stop-opacity="0"/></radialGradient>'
    + '<linearGradient id="v-coin" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#fff0a0"/><stop offset="0.5" stop-color="#ffc928"/><stop offset="1" stop-color="#e09b12"/></linearGradient>'
    + '<linearGradient id="v-gold" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff0a0"/><stop offset="0.45" stop-color="#f5bf2e"/><stop offset="1" stop-color="#b9780f"/></linearGradient>'
    + '<linearGradient id="v-curtain" x1="0" x2="1"><stop offset="0" stop-color="#5e0816"/><stop offset="0.5" stop-color="#9c1428"/><stop offset="1" stop-color="#5e0816"/></linearGradient>'
    + '</defs>';

function curtain(flip)
{
    const g = flip ? '<g transform="translate(360 0) scale(-1 1)">' : '<g>';
    return g
        + '<path d="M0 0 L132 0 Q104 26 74 36 Q38 52 18 104 Q8 132 0 170 Z" fill="url(#v-curtain)"/>'
        + '<path d="M28 0 Q30 50 10 120 M56 0 Q56 30 40 62 M88 0 Q84 20 70 34" fill="none" stroke="rgba(0,0,0,0.22)" stroke-width="3"/>'
        + '<path d="M0 6 Q66 40 130 4" fill="none" stroke="#e1a92a" stroke-width="3.5" stroke-linecap="round"/>'
        + '<path d="M20 104 l-4 22 l8 0 Z" fill="#e1a92a"/><circle cx="20" cy="102" r="4" fill="#f3c640"/>'
        + '</g>';
}

function back_svg()
{
    const rand = make_rand(1122);
    let rays = '';
    for(let i=0;i<7;i++){
        const a = -0.55 + i * 0.18;
        const x1 = 180 + Math.sin(a - 0.04) * 600;
        const x2 = 180 + Math.sin(a + 0.04) * 600;
        rays += '<path d="M180 -30 L' + f(x1) + ' 560 L' + f(x2) + ' 560 Z" fill="rgba(255,226,140,0.10)"/>';
    }
    return DEFS
        + '<rect width="' + W + '" height="' + H + '" fill="url(#v-velvet)"/>'
        + '<rect width="' + W + '" height="' + H + '" fill="url(#v-fold)"/>'
        + rays
        + '<ellipse cx="180" cy="235" rx="175" ry="215" fill="url(#v-glow)"/>'
        + curtain(false) + curtain(true)
        + chest(rand)
        + bar(288, 384) + bar(320, 384) + bar(304, 367) + bar(296, 350)
        + pile(rand, 180, 474, 380, 46, 90);
}

function front_svg()
{
    const rand = make_rand(777);
    let stars = '';
    const pos = [[22, 404], [342, 402], [74, 312], [318, 334], [104, 458], [256, 460], [176, 462]];
    for(let i=0;i<pos.length;i++){
        stars += '<g transform="translate(' + pos[i][0] + ' ' + pos[i][1] + ')"><path class="v-twinkle" style="animation-delay:' + (i * 0.37).toFixed(2) + 's" d="M0 -6 L1.2 -1.2 L6 0 L1.2 1.2 L0 6 L-1.2 1.2 L-6 0 L-1.2 -1.2 Z" fill="#fffbe0"/></g>';
    }
    return pile(rand, 18, 478, 110, 52, 30)
        + pile(rand, 344, 478, 110, 48, 28)
        + gem(26, 440, 1.1, '#e0245e') + gem(56, 458, 0.9, '#2f6fe0') + gem(8, 462, 0.8, '#1fae6a')
        + gem(300, 462, 0.9, '#9b4dde') + gem(354, 452, 0.85, '#e0245e')
        + gem(120, 465, 0.7, '#1fae6a') + gem(232, 466, 0.75, '#2f6fe0')
        + coin(150, 466, 0.9) + coin(206, 467, 0.85)
        + crown(334, 426, 0.9)
        + stars;
}

function make_layer(cls, inner)
{
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('class', 'vault-layer ' + cls);
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = inner;
    return svg;
}

// on:true で宝物庫 2回呼んでも作り直さない
export function showVault(wrap, packSvg, on)
{
    if(on && !backEl){
        backEl = make_layer('vault-back', back_svg());
        frontEl = make_layer('vault-front', front_svg());//色は back の defs を使う
        wrap.insertBefore(backEl, packSvg);
        packSvg.after(frontEl);
    }
    if(backEl){
        backEl.style.display = on ? '' : 'none';
        frontEl.style.display = on ? '' : 'none';
    }
    wrap.classList.toggle('is-vault', on);
}
