// ============================================================
// storage.js  保存・読み込みは全部ここ
//
// 【畑とランキング】スプレッドシート＋Apps Script
//   fetchField()        view（下）
//   harvest(cells)      { got:[番号], taken:[{ i, by }], view }
//   renameMe(name)      view
//   isDemoMode()        API_URL が空なら true
//
// 【このブラウザ】localStorage
//   getMyName() / saveMyName(name)
//   loadMuted() / saveMuted(muted)
//
// view = {
//   field:    [{ g: 0〜10, ok: 収穫できる?, by: 最後に収穫した人, n: 収穫された回数 }] ×30
//   ranking:  [{ rank, name, month, me }]  今月のトップ10
//   me:       { name, total, month, rank }  まだいなければ null
//   champion: { month, name, count }  先月の1位 なければ null
//   vault:    true なら自分が先月のチャンピオン（宝物庫）
//   monthKey: サーバーの今月 '2026-11'
// }
// ============================================================

// ▼ Apps Script のウェブアプリURL（最後が /exec）
//   空だとデモモード（このブラウザの中だけで育つ）
const API_URL = 'https://script.google.com/macros/s/AKfycbzvdE8gsp7FEGgM4uFi0tcLtpq-MGsbMwGpil66NyWitEd2Utl1SCnimuw1Q1upLNBgcg/exec';

// デモの育つ時間 本番のは gas/Code.gs の先頭
const DEMO_GROW_MIN_MS = 1 * 60 * 1000;
const DEMO_GROW_MAX_MS = 3 * 60 * 1000;

const REQUEST_TIMEOUT_MS = 10000;
const CELL_COUNT = 30;
const STEPS = 10;
export const NAME_MAX = 12;

const CLIENT_ID_KEY = 'toumyou.clientId';
const NAME_KEY = 'toumyou.name';
const MUTED_KEY = 'toumyou.muted';
const DEMO_FIELD_KEY = 'toumyou.demoField';
const DEMO_ME_KEY = 'toumyou.demoMe';

export class StorageError extends Error {
    constructor(message, code = 'error') {
        super(message);
        this.name = 'StorageError';
        this.code = code;
    }
}

// localStorage 使えなくても止まらないように
function read_local(key)
{
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function write_local(key, value)
{
    try {
        localStorage.setItem(key, value);
        return true;
    } catch {
        return false;
    }
}

// ============================================================
// このブラウザ
// ============================================================

export function countChars(s)
{
    if(typeof Intl !== 'undefined' && Intl.Segmenter){
        let n = 0;
        for(const seg of new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(s)){
            n++;
        }
        return n;
    }
    return Array.from(s).length;//だいたい
}

export function cleanName(s)
{
    return String(s || '').replace(/[\u0000-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim();
}

let memoryName = null;
export function getMyName()
{
    let name = cleanName(read_local(NAME_KEY));
    if(name && countChars(name) <= NAME_MAX){
        return name;
    }
    name = memoryName || '豆苗ハンター' + (1 + Math.floor(Math.random() * 999));
    memoryName = name;
    write_local(NAME_KEY, name);
    return name;
}

export function saveMyName(name)
{
    memoryName = name;
    write_local(NAME_KEY, name);
}

export function loadMuted()
{
    return read_local(MUTED_KEY) === '1';
}

export function saveMuted(muted)
{
    write_local(MUTED_KEY, muted ? '1' : '0');
}

// ============================================================
// 畑
// ============================================================

export function isDemoMode()
{
    return !API_URL;
}

export async function fetchField()
{
    if(isDemoMode()){
        return demo_view();
    }
    const data = await request(API_URL + '?id=' + encodeURIComponent(get_client_id()), { method: 'GET' });
    return clean_view(data);
}

export async function harvest(cells)
{
    const list = clean_cells(cells);
    if(list.length == 0){
        throw new StorageError('収穫する豆苗がありません。', 'invalid');
    }
    if(isDemoMode()){
        return demo_harvest(list);
    }
    // text/plain だとプリフライトなしで送れる
    const data = await request(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'harvest', clientId: get_client_id(), name: getMyName(), cells: list }),
    });
    return {
        got: Array.isArray(data.got) ? data.got.filter((i) => Number.isInteger(i)) : [],
        taken: clean_taken(data.taken),
        view: clean_view(data),
    };
}

export async function renameMe(name)
{
    const n = cleanName(name);
    if(n == '' || countChars(n) > NAME_MAX){
        throw new StorageError('ニックネームは1〜' + NAME_MAX + '文字です。', 'invalid');
    }
    if(isDemoMode()){
        saveMyName(n);
        return demo_view();
    }
    const data = await request(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'rename', clientId: get_client_id(), name: n }),
    });
    return clean_view(data);
}

// 30本まで 重なりなし
function clean_cells(cells)
{
    let list = [];
    if(!Array.isArray(cells)){
        return list;
    }
    for(const i of cells){
        if(Number.isInteger(i) && i >= 0 && i < CELL_COUNT && !list.includes(i)){
            list.push(i);
        }
    }
    return list.slice(0, CELL_COUNT);
}

function clean_taken(raw)
{
    if(!Array.isArray(raw)){
        return [];
    }
    return raw
        .filter((t) => t && Number.isInteger(t.i))
        .map((t) => ({ i: t.i, by: typeof t.by === 'string' ? t.by : '' }));
}

function to_int(v)
{
    return Number.isInteger(v) && v >= 0 ? v : 0;
}

function clean_view(data)
{
    if(!Array.isArray(data.field) || data.field.length < CELL_COUNT){
        throw new StorageError('畑から正しい返事がありませんでした。', 'bad-response');
    }
    let field = [];
    for(let i=0;i<CELL_COUNT;i++){
        const c = data.field[i] || {};
        const ok = c.ok === true;
        field.push({
            g: ok ? STEPS : Math.min(to_int(c.g), STEPS - 1),
            ok: ok,
            by: typeof c.by === 'string' ? c.by : '',
            n: to_int(c.n),
        });
    }

    let ranking = [];
    if(Array.isArray(data.ranking)){
        for(const r of data.ranking){
            if(r && typeof r.name === 'string'){
                ranking.push({ rank: to_int(r.rank), name: r.name, month: to_int(r.month), me: r.me === true });
            }
        }
    }

    let me = null;
    if(data.me && typeof data.me === 'object'){
        me = {
            name: typeof data.me.name === 'string' ? data.me.name : '',
            total: to_int(data.me.total),
            month: to_int(data.me.month),
            rank: to_int(data.me.rank),
        };
    }

    let champion = null;
    const c = data.champion;
    if(c && typeof c.name === 'string' && c.name !== ''){
        champion = { month: String(c.month || ''), name: c.name, count: to_int(c.count) };
    }
    return {
        field: field,
        ranking: ranking,
        me: me,
        champion: champion,
        vault: data.vault === true,
        monthKey: typeof data.monthKey === 'string' ? data.monthKey : '',
    };
}

async function request(url, options)
{
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res;
    try {
        res = await fetch(url, { ...options, redirect: 'follow', signal: controller.signal });
    } catch (err) {
        throw new StorageError('畑につながりませんでした。', 'network');
    } finally {
        clearTimeout(timer);
    }

    let data;
    try {
        data = await res.json();
    } catch {
        throw new StorageError('畑から正しい返事がありませんでした。', 'bad-response');
    }
    if(!data || data.ok !== true){
        throw new StorageError((data && data.error) || '畑でエラーが起きました。', (data && data.code) || 'error');
    }
    return data;
}

// ブラウザごとのランダムID ランキングの区別用
let memoryClientId = null;
function get_client_id()
{
    let id = read_local(CLIENT_ID_KEY);
    if(id && /^[A-Za-z0-9_-]{8,64}$/.test(id)){
        return id;
    }
    id = memoryClientId || random_id();
    memoryClientId = id;
    write_local(CLIENT_ID_KEY, id);
    return id;
}

function random_id()
{
    if(crypto.randomUUID){
        return crypto.randomUUID();
    }
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================
// デモモード（サーバーのまね このブラウザだけ）
// ============================================================

function month_key()
{
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit',
    }).format(new Date()).slice(0, 7);
}

function demo_read_field()
{
    let cells = null;
    try {
        cells = JSON.parse(read_local(DEMO_FIELD_KEY) || 'null');
    } catch {
        cells = null;
    }
    if(!Array.isArray(cells) || cells.length != CELL_COUNT){
        cells = [];
        for(let i=0;i<CELL_COUNT;i++){
            cells.push({ h: 0, r: 0, by: '', n: 0 });//最初は全部育ちきり
        }
    }
    return cells;
}

function demo_read_me()
{
    let me = null;
    try {
        me = JSON.parse(read_local(DEMO_ME_KEY) || 'null');
    } catch {
        me = null;
    }
    if(!me || typeof me !== 'object'){
        me = { total: 0, month: 0, monthKey: '' };
    }
    if(me.monthKey != month_key()){
        me.month = 0;
        me.monthKey = month_key();
    }
    return me;
}

function demo_view()
{
    const now = Date.now();
    const field = demo_read_field().map((c) => {
        if(!c.r || c.r <= now){
            return { g: STEPS, ok: true, by: c.by || '', n: c.n || 0 };
        }
        const g = Math.floor((now - c.h) / (c.r - c.h) * STEPS);
        return { g: Math.min(Math.max(g, 0), STEPS - 1), ok: false, by: c.by || '', n: c.n || 0 };
    });
    const me = demo_read_me();
    const name = getMyName();
    return {
        field: field,
        ranking: me.month > 0 ? [{ rank: 1, name: name, month: me.month, me: true }] : [],
        me: { name: name, total: me.total || 0, month: me.month, rank: me.month > 0 ? 1 : 0 },
        champion: null,
        vault: false,
        monthKey: month_key(),//デモはスマホの時計で
    };
}

function demo_harvest(list)
{
    const now = Date.now();
    let cells = demo_read_field();
    let got = [];
    let taken = [];
    for(const i of list){
        const c = cells[i];
        if(c.r && c.r > now){
            taken.push({ i: i, by: c.by });
            continue;
        }
        cells[i] = {
            h: now,
            r: now + DEMO_GROW_MIN_MS + Math.random() * (DEMO_GROW_MAX_MS - DEMO_GROW_MIN_MS),
            by: getMyName(),
            n: (c.n || 0) + 1,
        };
        got.push(i);
    }
    write_local(DEMO_FIELD_KEY, JSON.stringify(cells));
    let me = demo_read_me();
    me.total = (me.total || 0) + got.length;
    me.month += got.length;
    write_local(DEMO_ME_KEY, JSON.stringify(me));
    return { got: got, taken: taken, view: demo_view() };
}
