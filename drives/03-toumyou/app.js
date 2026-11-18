// 画面の動き 通信・保存は storage.js、絵は pack.js、音は sound.js

import {
    fetchField,
    harvest,
    renameMe,
    isDemoMode,
    getMyName,
    saveMyName,
    loadMuted,
    saveMuted,
    cleanName,
    countChars,
    NAME_MAX,
} from './storage.js';
import { CELL_COUNT, initPack, setSprout, toSvgPoint, toWrapPoint, findHits, findNear, playCut, sparkleAt, startSparkle } from './pack.js';
import { unlockAudio, playBuchi, setMuted } from './sound.js';

// なぞり終わり 最後になぞってからこれだけ待って送る
const STROKE_END_MS = 1000;
const POLL_MS = 10 * 1000;
const MADA_GAP_MS = 1500;   //まだだよ 間引き
const SITE_URL = 'https://wagomuchan.github.io/drive_coding1_claude/drives/03-toumyou/';

const $ = (id) => document.getElementById(id);
const els = {
    wrap: $('pack-wrap'),
    pack: $('pack'),
    ticker: $('ticker'),
    status: $('pack-status'),
    statusText: $('pack-status-text'),
    retry: $('retry'),
    myMonth: $('my-month'),
    myTotal: $('my-total'),
    mute: $('mute'),
    demoNote: $('demo-note'),
    champion: $('champion'),
    rankList: $('rank-list'),
    rankEmpty: $('rank-empty'),
    meName: $('me-name'),
    meRank: $('me-rank'),
    meMonth: $('me-month'),
    meTotal: $('me-total'),
    share: $('share'),
    shareLinks: $('share-links'),
    shareX: $('share-x'),
    shareLine: $('share-line'),
    nameOpen: $('name-open'),
    nameForm: $('name-form'),
    nameInput: $('name-input'),
    nameCount: $('name-count'),
    nameError: $('name-error'),
    nameClose: $('name-close'),
    nameSubmit: $('name-submit'),
    toast: $('toast'),
};

function is_reduced_motion()
{
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ---------------------------------------------------------------
// 畑の状態
// ---------------------------------------------------------------

let cells = [];             // サーバーから来たまま
let loaded = false;
let serverMe = null;
let localCut = new Map();   // i → 'pending' | 'sending'  画面ではもう収穫済み
let batch = [];
let combo = 0;
let strokeTimer = null;
let mutation = 0;           // 収穫・名前変更の返事が来たら+1 古い読み直しを無視する用

// mine: 自分が送った番号 ティッカーに出さない
function apply_view(view, mine, fresh)
{
    let others = {};
    for(let i=0;i<CELL_COUNT;i++){
        if(localCut.has(i)){
            continue;//送る前 or 送ってる途中
        }
        const c = view.field[i];
        const old = cells[i];
        if(old && c.n < old.n){
            continue;//古い返事
        }
        if(loaded && old && c.n > old.n && !(mine && mine.includes(i))){
            const who = c.by || 'だれか';
            others[who] = (others[who] || 0) + (c.n - old.n);
        }
        const changed = !old || old.g != c.g || old.ok != c.ok;
        const becameReady = old && !old.ok && c.ok;
        cells[i] = c;
        if(changed){
            setSprout(i, c.g, c.ok, true);
            if(becameReady){
                setTimeout(() => sparkleAt(i), 900);
            }
        }
    }

    if(fresh){
        if(view.me && (!serverMe || view.me.total >= serverMe.total)){
            serverMe = view.me;
            if(serverMe.name){
                saveMyName(serverMe.name);//作者が直したときも
            }
        }
        render_ranking(view.ranking, view.champion);
    }
    render_me();
    show_ticker(others);

    if(!loaded){
        loaded = true;
        els.status.hidden = true;
    }
}

// ---------------------------------------------------------------
// 読み直し 10秒ごと 見てないときは止める
// ---------------------------------------------------------------

let pollTimer = null;
let polling = false;

async function poll()
{
    if(polling){
        return;
    }
    polling = true;
    const mark = mutation;
    try {
        const view = await fetchField();
        apply_view(view, null, mark == mutation);
    } catch (err) {
        //console.log('読み直しだめ', err);
        if(!loaded){
            els.statusText.textContent = (err && err.message ? err.message : '畑につながりませんでした。') + '電波の良いところで、もう一度どうぞ。';
            els.retry.hidden = false;
        }
    } finally {
        polling = false;
    }
}

function start_poll()
{
    stop_poll();
    poll();
    pollTimer = setInterval(poll, POLL_MS);
}

function stop_poll()
{
    if(pollTimer){
        clearInterval(pollTimer);
        pollTimer = null;
    }
}

document.addEventListener('visibilitychange', () => {
    if(document.visibilityState == 'visible'){
        start_poll();
    }else{
        stop_poll();
        if(batch.length > 0){
            flush();//途中のは送っちゃう
        }
    }
});

els.retry.addEventListener('click', () => {
    els.retry.hidden = true;
    els.statusText.textContent = '畑を見に行っています…';
    poll();
});

// ---------------------------------------------------------------
// なぞる
// ---------------------------------------------------------------

let stroke = null;
let lastMada = 0;

function restart_stroke_timer()
{
    clearTimeout(strokeTimer);
    strokeTimer = setTimeout(flush, STROKE_END_MS);
}

function trace(a, b)
{
    const hits = findHits(a, b);
    const dir = b.x >= a.x ? 1 : -1;
    const moving = a.x != b.x || a.y != b.y;
    let k = 0;
    for(const h of hits){
        if(localCut.has(h.i) || !cells[h.i]){
            continue;
        }
        if(cells[h.i].ok){
            cut_one(h, dir, k);
            k++;
            stroke.cut = true;
        }else if(moving){
            mada(h);
        }
    }
    if(batch.length > 0){
        restart_stroke_timer();
    }
}

function cut_one(h, dir, k)
{
    localCut.set(h.i, 'pending');
    batch.push(h.i);
    playBuchi(combo, k * 0.028);
    combo++;
    render_me();
    // 1回で何本も当たったら少しずつずらす ブチブチブチ
    const show = () => {
        playCut(h.i, h.x, h.y, dir);
        setSprout(h.i, 0, false, false);
        if(navigator.vibrate){
            try {
                navigator.vibrate(12);
            } catch {
                //だめでもいい
            }
        }
        show_plus(h.x, h.y);
        bump(els.myMonth);
    };
    if(k == 0){
        show();
    }else{
        setTimeout(show, k * 28);
    }
}

function mada(h)
{
    const now = Date.now();
    if(now - lastMada < MADA_GAP_MS){
        return;
    }
    lastMada = now;
    show_bubble('まだだよ', h.x, h.y);
}

function tap(p)
{
    const i = findNear(p);
    if(i < 0 || !cells[i]){
        return;
    }
    if(localCut.has(i)){
        show_bubble(my_name() + 'が収穫', p.x, p.y);
    }else if(!cells[i].ok){
        show_bubble(cells[i].by ? cells[i].by + 'が収穫' : 'まだだよ', p.x, p.y);
    }
}

els.wrap.addEventListener('pointerdown', (e) => {
    unlockAudio();
    if(!loaded || stroke){
        return;
    }
    if(e.pointerType == 'mouse' && e.button != 0){
        return;
    }
    e.preventDefault();
    try {
        els.wrap.setPointerCapture(e.pointerId);
    } catch {
        //なくても動く
    }
    const p = toSvgPoint(e.clientX, e.clientY);
    stroke = { id: e.pointerId, last: p, moved: 0, cut: false };
    trace(p, p);
});

els.wrap.addEventListener('pointermove', (e) => {
    if(!stroke || e.pointerId != stroke.id){
        return;
    }
    const p = toSvgPoint(e.clientX, e.clientY);
    const d = Math.hypot(p.x - stroke.last.x, p.y - stroke.last.y);
    if(d < 1){
        return;
    }
    stroke.moved += d;
    trace(stroke.last, p);
    stroke.last = p;
});

function end_stroke(e)
{
    if(!stroke || e.pointerId != stroke.id){
        return;
    }
    if(e.type == 'pointerup' && stroke.moved < 8 && !stroke.cut){
        tap(stroke.last);
    }
    stroke = null;
    // 指を離しても確定しない タイマーまかせ
}
els.wrap.addEventListener('pointerup', end_stroke);
els.wrap.addEventListener('pointercancel', end_stroke);
// iPhone の長押しメニューとか出ないように
els.wrap.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('touchend', unlockAudio, { passive: true });
document.addEventListener('click', unlockAudio);

// ---------------------------------------------------------------
// まとめて送る
// ---------------------------------------------------------------

async function flush()
{
    clearTimeout(strokeTimer);
    strokeTimer = null;
    combo = 0;
    if(batch.length == 0){
        return;
    }
    const sending = batch;
    batch = [];
    for(const i of sending){
        localCut.set(i, 'sending');
    }
    try {
        const res = await harvest(sending);
        for(const i of sending){
            localCut.delete(i);
        }
        mutation++;
        apply_view(res.view, sending, true);
        if(res.taken.length > 0){
            show_taken(res.taken);
        }
    } catch (err) {
        // 元に戻す
        for(const i of sending){
            localCut.delete(i);
            if(cells[i]){
                setSprout(i, cells[i].g, cells[i].ok, true);
            }
        }
        render_me();
        show_toast(err && err.code != 'network' && err.message ? err.message : '畑につながりませんでした');
    }
}//finished

function show_taken(taken)
{
    let names = [];
    for(const t of taken){
        const who = t.by || 'ほかの人';
        if(!names.includes(who)){
            names.push(who);
        }
    }
    show_toast(names.join('と') + 'に' + (taken.length > 1 ? taken.length + '本' : '') + '取られた！');
}

// ---------------------------------------------------------------
// 演出（HTMLの方）
// ---------------------------------------------------------------

function show_plus(x, y)
{
    const p = toWrapPoint(x, y);
    const div = document.createElement('div');
    div.className = 'plus';
    div.textContent = '+1';
    div.style.left = p.x + 'px';
    div.style.top = p.y + 'px';
    els.wrap.append(div);
    if(!div.animate){
        setTimeout(() => div.remove(), 600);
        return;
    }
    const rise = is_reduced_motion() ? 0 : 34;
    div.animate([
        { transform: 'translate(-50%, -50%) scale(0.7)', opacity: 0 },
        { transform: 'translate(-50%, -80%) scale(1.05)', opacity: 1, offset: 0.25 },
        { transform: 'translate(-50%, calc(-50% - ' + rise + 'px)) scale(1)', opacity: 0 },
    ], { duration: 750, easing: 'ease-out' }).onfinish = () => div.remove();
}

let bubbleEl = null;
let bubbleTimer = null;
function show_bubble(text, x, y)
{
    if(!bubbleEl){
        bubbleEl = document.createElement('div');
        bubbleEl.className = 'bubble';
        els.wrap.append(bubbleEl);
    }
    const p = toWrapPoint(x, y);
    const w = els.wrap.clientWidth;
    bubbleEl.textContent = text;
    bubbleEl.style.left = Math.min(Math.max(p.x, 70), w - 70) + 'px';
    bubbleEl.style.top = Math.max(p.y - 34, 10) + 'px';
    bubbleEl.classList.remove('is-show');
    void bubbleEl.offsetWidth;
    bubbleEl.classList.add('is-show');
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => bubbleEl.classList.remove('is-show'), 1300);
}

function bump(node)
{
    if(node.animate && !is_reduced_motion()){
        node.animate([{ transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 220, easing: 'ease-out' });
    }
}

// 豆苗ハンター45が3本収穫
function show_ticker(others)
{
    for(const who in others){
        const div = document.createElement('div');
        div.className = 'ticker-item';
        div.textContent = who + 'が' + others[who] + '本収穫';
        els.ticker.append(div);
        while(els.ticker.children.length > 3){
            els.ticker.firstElementChild.remove();
        }
        setTimeout(() => {
            div.classList.add('is-out');
            setTimeout(() => div.remove(), 500);
        }, 4500);
    }
}

let toastTimer = null;
function show_toast(msg)
{
    els.toast.textContent = msg;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        els.toast.hidden = true;
    }, 3200);
}

// ---------------------------------------------------------------
// 自分の数・ランキング
// ---------------------------------------------------------------

function my_name()
{
    return serverMe && serverMe.name ? serverMe.name : getMyName();
}

function render_me()
{
    const pending = localCut.size;//まだ返事が来てない分も足す
    const month = (serverMe ? serverMe.month : 0) + pending;
    const total = (serverMe ? serverMe.total : 0) + pending;
    els.myMonth.textContent = month;
    els.myTotal.textContent = total;
    els.meMonth.textContent = month;
    els.meTotal.textContent = total;
    els.meName.textContent = my_name();
    const rank = serverMe ? serverMe.rank : 0;
    els.meRank.textContent = rank > 0 ? rank + '位' : '—';
    setup_share(serverMe ? serverMe.month : 0, rank);
}

function render_ranking(ranking, champion)
{
    els.rankList.replaceChildren();
    for(const r of ranking){
        const li = document.createElement('li');
        li.className = 'rank-item' + (r.me ? ' is-me' : '') + (r.rank <= 3 ? ' is-top' + r.rank : '');
        const no = document.createElement('span');
        no.className = 'rank-no';
        no.textContent = r.rank;
        const name = document.createElement('span');
        name.className = 'rank-name';
        name.textContent = r.name + (r.me ? '（あなた）' : '');
        const count = document.createElement('span');
        count.className = 'rank-count';
        count.textContent = r.month + '本';
        li.append(no, name, count);
        els.rankList.append(li);
    }
    els.rankEmpty.hidden = ranking.length > 0;

    if(champion){
        els.champion.textContent = '👑 先月のチャンピオン：' + champion.name + '（' + champion.count + '本）';
        els.champion.hidden = false;
    }else{
        els.champion.hidden = true;
    }
}

// ---------------------------------------------------------------
// シェア 02と同じ形
// ---------------------------------------------------------------

let shareText = '';

function setup_share(month, rank)
{
    if(month <= 0){
        els.share.hidden = true;
        els.shareLinks.hidden = true;
        return;
    }
    shareText = '今月' + month + '本収穫' + (rank > 0 ? '・' + rank + '位' : '') + '\n#豆苗';
    const full = shareText + '\n' + SITE_URL;
    els.shareX.href = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(shareText) + '&url=' + encodeURIComponent(SITE_URL);
    els.shareLine.href = 'https://line.me/R/share?text=' + encodeURIComponent(full);

    if(navigator.share){
        els.share.hidden = false;
        if(!shareFailed){
            els.shareLinks.hidden = true;
        }
    }else{
        els.share.hidden = true;
        els.shareLinks.hidden = false;
    }
}

let shareFailed = false;
els.share.addEventListener('click', async () => {
    try {
        await navigator.share({ title: '豆苗', text: shareText, url: SITE_URL });
    } catch (err) {
        if(err && err.name == 'AbortError'){
            return;//やめただけ
        }
        shareFailed = true;
        els.shareLinks.hidden = false;//だめならリンク
    }
});

// ---------------------------------------------------------------
// ニックネーム
// ---------------------------------------------------------------

function show_name_error(msg)
{
    els.nameError.textContent = msg;
    els.nameError.hidden = !msg;
}

function update_name_count()
{
    const n = countChars(cleanName(els.nameInput.value));
    els.nameCount.textContent = n;
    els.nameCount.parentElement.classList.toggle('is-over', n > NAME_MAX);
}

function close_name_form()
{
    els.nameForm.hidden = true;
    els.nameOpen.hidden = false;
    els.nameOpen.setAttribute('aria-expanded', 'false');
}

els.nameOpen.addEventListener('click', () => {
    els.nameForm.hidden = false;
    els.nameOpen.hidden = true;
    els.nameOpen.setAttribute('aria-expanded', 'true');
    els.nameInput.value = my_name();
    show_name_error('');
    update_name_count();
    els.nameInput.focus();
});

els.nameClose.addEventListener('click', () => {
    close_name_form();
    els.nameOpen.focus();
});

els.nameInput.addEventListener('input', () => {
    show_name_error('');
    update_name_count();
});

let isRenaming = false;
els.nameForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if(isRenaming){
        return;
    }
    const name = cleanName(els.nameInput.value);
    if(name == ''){
        show_name_error('ニックネームを入れてください。');
        return;
    }
    if(countChars(name) > NAME_MAX){
        show_name_error(NAME_MAX + '文字までです。');
        return;
    }
    isRenaming = true;
    els.nameSubmit.disabled = true;
    els.nameSubmit.textContent = '変えています…';
    try {
        const view = await renameMe(name);
        saveMyName(name);
        mutation++;
        if(serverMe){
            serverMe.name = name;
        }
        apply_view(view, null, true);
        close_name_form();
        show_toast('ニックネームを「' + my_name() + '」にしました');
    } catch (err) {
        show_name_error(err && err.message ? err.message : '変えられませんでした。');
    } finally {
        isRenaming = false;
        els.nameSubmit.disabled = false;
        els.nameSubmit.textContent = '変える';
    }
});

// ---------------------------------------------------------------
// 音
// ---------------------------------------------------------------

let muted = loadMuted();

function render_mute()
{
    setMuted(muted);
    els.mute.textContent = muted ? '🔇' : '🔊';
    els.mute.setAttribute('aria-pressed', String(muted));
    els.mute.setAttribute('aria-label', muted ? '音を出す' : '音を消す');
}

els.mute.addEventListener('click', () => {
    muted = !muted;
    saveMuted(muted);
    render_mute();
});

// ---------------------------------------------------------------

initPack(els.pack, els.wrap);
startSparkle();
render_mute();
render_me();
els.demoNote.hidden = !isDemoMode();
if(document.visibilityState == 'visible'){
    start_poll();
}
