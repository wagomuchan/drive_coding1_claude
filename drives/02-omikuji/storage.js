// ============================================================
// storage.js  保存・読み込みは全部ここ
//
// 【今日のおみくじ】このブラウザ（localStorage）
//   loadToday(date)      その日の結果 なければ null
//   saveToday(state)
//
// 【みんなのパーツ】スプレッドシート＋Apps Script
//   fetchParts()         { itsu:[], doko:[], nani:[], dounaru:[] }
//   addPart(kind, text)
//   isDemoMode()         API_URL が空なら true
// ============================================================

// ▼ Apps Script のウェブアプリURL（最後が /exec）
//   空だとデモモード（追加したパーツはこのブラウザの中だけ）
const API_URL = 'https://script.google.com/macros/s/AKfycbzTpnsew8UPCp5THtCxWVMq9DXE1L5nr8mPcRSwUPS_Kyq_DlGIv7YTXjHVbZRLvYtJaw/exec';

const REQUEST_TIMEOUT_MS = 8000;
const COOLDOWN_MS = 60 * 1000;
const TODAY_KEY = 'omikuji.today';
const CLIENT_ID_KEY = 'omikuji.clientId';
const LAST_ADD_KEY = 'omikuji.lastAddAt';
const DEMO_PARTS_KEY = 'omikuji.demoParts';
const KINDS = ['itsu', 'doko', 'nani', 'dounaru'];

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
// 今日のおみくじ
// ============================================================

export function loadToday(date)
{
    const raw = read_local(TODAY_KEY);
    if(!raw){
        return null;
    }
    let state;
    try {
        state = JSON.parse(raw);
    } catch {
        return null;
    }
    if(!state || state.date !== date || !state.result){
        return null;//日付ちがう→また引ける
    }
    const r = state.result;
    if(!Number.isInteger(r.fortuneIdx) || !Array.isArray(r.advice) || r.advice.length !== 4){
        return null;//こわれてる
    }
    return {
        date: state.date,
        draws: state.draws >= 2 ? 2 : 1,
        result: r,
    };
}

export function saveToday(state)
{
    write_local(TODAY_KEY, JSON.stringify(state));//だめでも気にしない
}

// ============================================================
// みんなのパーツ
// ============================================================

export function isDemoMode()
{
    return !API_URL;
}

function empty_parts()
{
    return { itsu: [], doko: [], nani: [], dounaru: [] };
}

function clean_parts(raw)
{
    let parts = empty_parts();
    if(!raw || typeof raw !== 'object'){
        return parts;
    }
    for(const k of KINDS){
        if(Array.isArray(raw[k])){
            parts[k] = raw[k].filter((w) => typeof w === 'string' && w !== '');
        }
    }
    return parts;
}

export async function fetchParts()
{
    if(isDemoMode()){
        return read_demo_parts();
    }
    const data = await request(API_URL, { method: 'GET' });
    return clean_parts(data.parts);
}

export async function addPart(kind, text)
{
    if(!KINDS.includes(kind)){
        throw new StorageError('どこに入れるかを選んでください。', 'invalid');
    }

    // 連続は1分あける（サーバーでもチェック）
    const last = Number(read_local(LAST_ADD_KEY));
    const wait = COOLDOWN_MS - (Date.now() - last);
    if(last > 0 && wait > 0){
        throw new StorageError('続けて奉納するときは1分あけてください。あと' + Math.ceil(wait / 1000) + '秒です。', 'cooldown');
    }

    if(isDemoMode()){
        let parts = read_demo_parts();
        parts[kind].unshift(text);
        write_local(DEMO_PARTS_KEY, JSON.stringify(parts));
        write_local(LAST_ADD_KEY, String(Date.now()));
        return { kind: kind, text: text };
    }

    // text/plain だとプリフライトなしで送れる
    const data = await request(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ clientId: get_client_id(), kind: kind, text: text }),
    });
    write_local(LAST_ADD_KEY, String(Date.now()));
    return data.part;
}

async function request(url, options)
{
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res;
    try {
        res = await fetch(url, { ...options, redirect: 'follow', signal: controller.signal });
    } catch (err) {
        throw new StorageError(
            err.name === 'AbortError'
                ? '社務所から返事がありませんでした。電波の良いところでもう一度どうぞ。'
                : '社務所につながりませんでした。電波の良いところでもう一度どうぞ。',
            'network',
        );
    } finally {
        clearTimeout(timer);
    }

    let data;
    try {
        data = await res.json();
    } catch {
        throw new StorageError('社務所から正しい返事がありませんでした。', 'bad-response');
    }
    if(!data || data.ok !== true){
        throw new StorageError((data && data.error) || '社務所でエラーが起きました。', (data && data.code) || 'error');
    }
    return data;
}

// ブラウザごとのランダムID 連続追加チェック用
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

function read_demo_parts()
{
    try {
        return clean_parts(JSON.parse(read_local(DEMO_PARTS_KEY) || '{}'));
    } catch {
        return empty_parts();
    }
}

function random_id()
{
    if(crypto.randomUUID){
        return crypto.randomUUID();
    }
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
