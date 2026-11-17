// 画面の動き 保存・通信は storage.js / weather.js

import {
    FORTUNES,
    PART_KINDS,
    PART_MAX,
    calcProbs,
    sumByGroup,
    pickFortuneIdx,
    mergeParts,
    pickAdvice,
    buildSentence,
    normalizeKey,
    countChars,
    cleanPart,
} from './omikuji.js';
import { fetchTokyoWeather, weatherMessage } from './weather.js';
import { loadToday, saveToday, fetchParts, addPart, isDemoMode } from './storage.js';

const SHAKE_MS = 1800;
const SHAKE_MS_SMALL = 900;
const SITE_URL = 'https://wagomuchan.github.io/drive_coding1_claude/drives/02-omikuji/';

const $ = (id) => document.getElementById(id);
const els = {
    weatherText: $('weather-text'),
    weatherBias: $('weather-bias'),
    stage: $('stage'),
    box: $('box'),
    stageText: $('stage-text'),
    draw: $('draw'),
    result: $('result'),
    slip: document.querySelector('.slip'),
    fortune: $('fortune'),
    advice: $('advice'),
    resultWeather: $('result-weather'),
    share: $('share'),
    shareLinks: $('share-links'),
    shareX: $('share-x'),
    shareLine: $('share-line'),
    redraw: $('redraw'),
    doneNote: $('done-note'),
    partsOpen: $('parts-open'),
    partsForm: $('parts-form'),
    kindList: $('kind-list'),
    partText: $('part-text'),
    partAfter: $('part-after'),
    partCount: $('part-count'),
    partHint: $('part-hint'),
    previewText: $('preview-text'),
    previewReroll: $('preview-reroll'),
    partError: $('part-error'),
    demoNote: $('demo-note'),
    partsClose: $('parts-close'),
    partSubmit: $('part-submit'),
    toast: $('toast'),
};

// 日本時間の今日 2026-11-18 の形
function get_today()
{
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
}

function is_reduced_motion()
{
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function sleep(ms)
{
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function percent(x)
{
    return Math.round(x * 100) + '%';
}

// ---------------------------------------------------------------
// 最初に読み込むもの
// ---------------------------------------------------------------

const weatherPromise = fetchTokyoWeather();
let allParts = mergeParts(null);
const partsPromise = fetchParts()
    .then((extra) => {
        allParts = mergeParts(extra);
        return allParts;
    })
    .catch((err) => {
        //console.log('パーツだめ', err);
        return allParts;//最初のパーツだけで引く
    });

weatherPromise.then((weather) => {
    show_weather(weather);
});

function show_weather(weather)
{
    els.weatherText.textContent = weatherMessage(weather);
    const sum = sumByGroup(calcProbs(weather ? weather.group : null));
    els.weatherBias.replaceChildren();
    const rows = [['kichi', '吉寄り'], ['naka', '中'], ['kyou', '凶寄り']];
    for(const row of rows){
        const span = document.createElement('span');
        span.className = 'bias-' + row[0];
        span.style.width = (sum[row[0]] * 100) + '%';
        span.textContent = row[0] == 'naka' ? '' : row[1] + ' ' + percent(sum[row[0]]);
        span.title = row[1] + ' ' + percent(sum[row[0]]);
        els.weatherBias.append(span);
    }
    els.weatherBias.setAttribute('aria-label', '出やすさ：吉寄り' + percent(sum.kichi) + '、吉でも凶でもない' + percent(sum.naka) + '、凶寄り' + percent(sum.kyou));
    els.weatherBias.hidden = false;
}

// ---------------------------------------------------------------
// おみくじを引く
// ---------------------------------------------------------------

let today = loadToday(get_today());
let isDrawing = false;

function show_result(state, withEffect)
{
    const r = state.result;
    const fortune = FORTUNES[r.fortuneIdx] || FORTUNES[FORTUNES.length - 1];
    els.fortune.textContent = fortune.name;
    els.fortune.classList.toggle('is-kyou', fortune.group == 'kyou');
    els.fortune.classList.toggle('is-naka', fortune.group == 'naka');
    els.advice.textContent = buildSentence(r.advice);
    els.resultWeather.textContent = weatherMessage(r.weather || null);

    els.stage.hidden = true;
    els.result.hidden = false;
    els.slip.classList.remove('is-deeen');
    if(withEffect){
        void els.slip.offsetWidth;//アニメもう一回
        els.slip.classList.add('is-deeen');
        els.result.scrollIntoView({ behavior: is_reduced_motion() ? 'auto' : 'smooth', block: 'start' });
    }

    els.redraw.hidden = state.draws >= 2;
    els.doneNote.hidden = state.draws < 2;
    setup_share(fortune.name, buildSentence(r.advice));
}

function show_stage()
{
    els.result.hidden = true;
    els.stage.hidden = false;
    els.box.classList.remove('is-shaking', 'is-out');
    els.stageText.textContent = '心を落ち着けて、箱をふってください。';
    els.draw.disabled = false;
}

async function draw_omikuji()
{
    if(isDrawing){
        return;
    }
    const date = get_today();
    const before = loadToday(date) || (today && today.date == date ? today : null);//localStorage だめでもメモリの方
    if(before && before.draws >= 2){
        today = before;
        show_result(today, false);
        return;
    }

    isDrawing = true;
    show_stage();
    els.draw.disabled = true;
    els.redraw.disabled = true;
    els.stageText.textContent = 'ふりふり…';
    els.box.classList.add('is-shaking');

    // 天気とパーツを待ちながらふる
    const shakeMs = is_reduced_motion() ? SHAKE_MS_SMALL : SHAKE_MS;
    const got = await Promise.all([weatherPromise, partsPromise, sleep(shakeMs)]);
    const weather = got[0];
    const parts = got[1];

    els.box.classList.remove('is-shaking');
    els.box.classList.add('is-out');
    els.stageText.textContent = '出ました！';
    await sleep(is_reduced_motion() ? 200 : 650);

    const probs = calcProbs(weather ? weather.group : null);
    today = {
        date: date,
        draws: before ? 2 : 1,
        result: {
            fortuneIdx: pickFortuneIdx(probs),
            advice: pickAdvice(parts),
            weather: weather,
            drawnAt: new Date().toISOString(),
        },
    };
    saveToday(today);
    show_result(today, true);
    isDrawing = false;
    els.redraw.disabled = false;
}

els.draw.addEventListener('click', draw_omikuji);
els.redraw.addEventListener('click', draw_omikuji);

// ---------------------------------------------------------------
// シェア
// ---------------------------------------------------------------

let shareText = '';

function setup_share(fortuneName, sentence)
{
    shareText = '今日の運勢は「' + fortuneName + '」\n一言：' + sentence + '\n#支離滅裂おみくじ';
    const full = shareText + '\n' + SITE_URL;
    els.shareX.href = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(shareText) + '&url=' + encodeURIComponent(SITE_URL);
    els.shareLine.href = 'https://line.me/R/share?text=' + encodeURIComponent(full);

    if(navigator.share){
        els.share.hidden = false;
        els.shareLinks.hidden = true;
    }else{
        els.share.hidden = true;
        els.shareLinks.hidden = false;
    }
}

els.share.addEventListener('click', async () => {
    try {
        await navigator.share({ title: '支離滅裂おみくじ', text: shareText, url: SITE_URL });
    } catch (err) {
        if(err && err.name == 'AbortError'){
            return;//やめただけ
        }
        els.shareLinks.hidden = false;//だめならリンク
    }
});

// ---------------------------------------------------------------
// パーツ募集
// ---------------------------------------------------------------

let kindIdx = 0;
let previewSeed = null;

function make_kind_list()
{
    for(let i=0;i<PART_KINDS.length;i++){
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'kind';
        input.value = PART_KINDS[i].key;
        input.checked = i == kindIdx;
        input.addEventListener('change', () => {
            kindIdx = i;
            update_form();
            els.partText.focus();
        });
        const span = document.createElement('span');
        span.textContent = '〈' + PART_KINDS[i].label + '〉' + PART_KINDS[i].after.replace('、', '');
        label.append(input, span);
        els.kindList.append(label);
    }
}

function reroll_preview()
{
    previewSeed = pickAdvice(allParts);
    update_form();
}

function update_form()
{
    const kind = PART_KINDS[kindIdx];
    els.partAfter.textContent = kind.after;
    els.partText.placeholder = '例：' + kind.placeholder;
    els.partText.setAttribute('aria-describedby', 'part-after');

    const text = cleanPart(els.partText.value);
    const n = countChars(text);
    els.partCount.textContent = n;
    els.partCount.parentElement.classList.toggle('is-over', n > PART_MAX);

    // つなぎの言葉を自分で書いちゃったとき
    const tail = kind.after.replace(/[、。]/g, '');
    if(tail && text.length > 1 && text.endsWith(tail)){
        els.partHint.textContent = '最後の「' + tail + '」はなくても大丈夫です（あとに「' + kind.after + '」が自動でつきます）。';
        els.partHint.hidden = false;
    }else{
        els.partHint.hidden = true;
    }

    // プレビュー
    if(!previewSeed){
        previewSeed = pickAdvice(allParts);
    }
    els.previewText.replaceChildren();
    for(let i=0;i<PART_KINDS.length;i++){
        if(i == kindIdx){
            const mark = document.createElement('mark');
            mark.textContent = text || '〈' + kind.label + '〉';
            els.previewText.append(mark);
        }else{
            els.previewText.append(previewSeed[i]);
        }
        els.previewText.append(PART_KINDS[i].after);
    }
}

function show_part_error(msg)
{
    els.partError.textContent = msg;
    els.partError.hidden = !msg;
}

// 送る前のチェック サーバーでも同じことをする
function check_part(text)
{
    if(text == ''){
        return '言葉を入れてください。';
    }
    if(countChars(text) > PART_MAX){
        return PART_MAX + '文字までです。';
    }
    const key = normalizeKey(text);
    const list = allParts[PART_KINDS[kindIdx].key];
    for(const w of list){
        if(normalizeKey(w) == key){
            return 'その言葉はもう奉納されています。ほかの言葉でどうぞ。';
        }
    }
    return '';
}

els.partsOpen.addEventListener('click', () => {
    const open = els.partsForm.hidden;
    els.partsForm.hidden = !open;
    els.partsOpen.setAttribute('aria-expanded', String(open));
    if(open){
        els.demoNote.hidden = !isDemoMode();
        update_form();
        els.partsForm.scrollIntoView({ behavior: is_reduced_motion() ? 'auto' : 'smooth', block: 'start' });
    }
});

els.partsClose.addEventListener('click', () => {
    els.partsForm.hidden = true;
    els.partsOpen.setAttribute('aria-expanded', 'false');
    els.partsOpen.focus();
});

els.partText.addEventListener('input', () => {
    show_part_error('');
    update_form();
});
els.previewReroll.addEventListener('click', reroll_preview);

let isSending = false;
els.partsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if(isSending){
        return;
    }
    await partsPromise;//みんなのパーツ読み込み待ち 重複チェックのため
    const kind = PART_KINDS[kindIdx];
    const text = cleanPart(els.partText.value);
    const msg = check_part(text);
    if(msg){
        show_part_error(msg);
        return;
    }

    isSending = true;
    els.partSubmit.disabled = true;
    els.partSubmit.textContent = '奉納中…';
    try {
        const added = await addPart(kind.key, text);
        const word = added && typeof added.text === 'string' ? added.text : text;
        allParts[kind.key].push(word);
        els.partText.value = '';
        show_part_error('');
        update_form();
        show_toast('奉納しました。みんなのおみくじに混ざりました！');
    } catch (err) {
        show_part_error(err && err.message ? err.message : '奉納できませんでした。');
    } finally {
        isSending = false;
        els.partSubmit.disabled = false;
        els.partSubmit.textContent = '奉納する';
    }
});

let toastTimer = null;
function show_toast(msg)
{
    els.toast.textContent = msg;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        els.toast.hidden = true;
    }, 3000);
}

// ---------------------------------------------------------------

make_kind_list();
partsPromise.then(() => {
    if(!els.partsForm.hidden){
        reroll_preview();
    }
});

if(today){
    show_result(today, false);//今日もう引いた
}
