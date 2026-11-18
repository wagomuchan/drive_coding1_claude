/**
 * 豆苗  Google Apps Script（サーバー側）
 *
 * スプレッドシートの「拡張機能 → Apps Script」に全部貼り付ける
 * 手順は drives/03-toumyou/SETUP.md
 *
 *   GET  ?id=…            畑・ランキング・自分の数
 *   POST action=harvest   まとめて収穫（1本ずつ早い者勝ち）
 *   POST action=rename    ニックネームを変える
 *
 * 先月のチャンピオンのIDは「歴代チャンピオン」シートのD列にだけ置く
 * 画面に返すのは「あなたは先月のチャンピオンか」（vault）だけ
 * 育ちきる時刻は画面に送らない。送るのは育ち具合（0〜10）と収穫できるかだけ
 */

// ▼ 育ちきるまでの時間 1本ごとにこの間でランダム
//   テストのとき：1 * 60 * 1000 と 3 * 60 * 1000（1〜3分）
const GROW_MIN_MS = 1 * 60 * 60 * 1000;
const GROW_MAX_MS = 3 * 60 * 60 * 1000;

const CELL_COUNT = 30;
const STEPS = 10;        // 育ち具合の段階
const NAME_MAX = 12;
const TOP_N = 10;
const CACHE_SEC = 5;     // 10秒ごとに読まれるので少しだけ覚えておく
const TZ = 'Asia/Tokyo';

const FIELD_SHEET = '畑';
const FIELD_HEADERS = ['マス', '収穫した時刻', '育ちきる時刻', '収穫した人', '収穫した人のID', '収穫された回数'];
const USER_SHEET = 'ユーザー';
const USER_HEADERS = ['ID', 'ニックネーム', '累計', '今月の数', 'どの月の数か', '最後に収穫した時刻'];
const CHAMP_SHEET = '歴代チャンピオン';
const CHAMP_HEADERS = ['月', 'ニックネーム', '本数', 'ID'];   // ID は同点なら , でつなぐ


function doGet(e)
{
    try {
        const id = e && e.parameter && isId_(e.parameter.id) ? e.parameter.id : '';
        checkMonth_(false);
        const state = getState_();
        return json_(Object.assign({ ok: true }, buildView_(state, id, Date.now())));
    } catch (err) {
        console.error(err);
        return json_({ ok: false, error: '畑でエラーが起きました。' });
    }
}

function doPost(e)
{
    const lock = LockService.getScriptLock();
    try {
        lock.waitLock(10000);
    } catch (err) {
        return json_({ ok: false, code: 'busy', error: '畑が混み合っています。少し待ってからもう一度どうぞ。' });
    }

    try {
        let body;
        try {
            body = JSON.parse(e.postData.contents);
        } catch (err) {
            return json_({ ok: false, code: 'invalid', error: 'データの形式が正しくありません。' });
        }
        if (!body || typeof body !== 'object' || !isId_(body.clientId)) {
            return json_({ ok: false, code: 'invalid', error: 'ブラウザの識別情報が正しくありません。ページを読み込み直してください。' });
        }

        checkMonth_(true);
        if (body.action === 'harvest') {
            return json_(harvest_(body));
        }
        if (body.action === 'rename') {
            return json_(rename_(body));
        }
        return json_({ ok: false, code: 'invalid', error: 'データの形式が正しくありません。' });
    } catch (err) {
        console.error(err);
        return json_({ ok: false, error: '畑でエラーが起きました。' });
    } finally {
        lock.releaseLock();
    }
}//finished


// ------------------------------------------------------------
// 収穫
// ------------------------------------------------------------

function harvest_(body)
{
    // 番号 0〜29 重なりなし 30本まで
    if (!Array.isArray(body.cells) || body.cells.length === 0 || body.cells.length > CELL_COUNT) {
        return { ok: false, code: 'invalid', error: '収穫する豆苗が正しくありません。' };
    }
    let wanted = [];
    for (let i = 0; i < body.cells.length; i++) {
        const k = body.cells[i];
        if (typeof k !== 'number' || k % 1 !== 0 || k < 0 || k >= CELL_COUNT) {
            return { ok: false, code: 'invalid', error: '収穫する豆苗が正しくありません。' };
        }
        if (wanted.indexOf(k) < 0) wanted.push(k);
    }

    const id = body.clientId;
    const now = Date.now();
    const cm = monthKey_(new Date(now));
    const fieldSheet = getFieldSheet_();
    const cells = readCells_(fieldSheet);
    const userSheet = getSheet_(USER_SHEET, USER_HEADERS);
    const users = readUsers_(userSheet);
    const names = nameMap_(users);

    let user = null;
    for (let i = 0; i < users.length; i++) {
        if (users[i].id === id) user = users[i];
    }
    let name = user ? user.name : cleanName_(body.name);
    if (name === '' || countChars_(name) > NAME_MAX) {
        name = '豆苗ハンター' + (1 + Math.floor(Math.random() * 999));
    }

    let got = [];
    let taken = [];
    for (let i = 0; i < wanted.length; i++) {
        const k = wanted[i];
        const c = cells[k];
        if (c.r > now) {
            // 先を越された or まだ育ってない
            taken.push({ i: k, by: names[c.byId] || c.byName || '' });
            continue;
        }
        c.h = now;
        c.r = now + GROW_MIN_MS + Math.floor(Math.random() * (GROW_MAX_MS - GROW_MIN_MS));
        c.byId = id;
        c.byName = name;
        c.n++;
        got.push(k);
    }

    if (got.length > 0) {
        writeCells_(fieldSheet, cells);
        if (!user) {
            user = { row: 0, id: id, name: name, total: 0, month: 0, monthKey: cm, lastAt: 0 };
            users.push(user);
        }
        if (user.monthKey !== cm) {
            user.month = 0;//月が変わった
            user.monthKey = cm;
        }
        user.total += got.length;
        user.month += got.length;
        user.lastAt = now;
        writeUser_(userSheet, user);
    }
    CacheService.getScriptCache().remove('state');

    const state = makeState_(cm, cells, users, readChampion_(cm));
    return Object.assign({ ok: true, got: got, taken: taken }, buildView_(state, id, now));
}

function rename_(body)
{
    const name = cleanName_(body.name);
    if (name === '' || countChars_(name) > NAME_MAX) {
        return { ok: false, code: 'invalid', error: 'ニックネームは1〜' + NAME_MAX + '文字です。' };
    }
    const id = body.clientId;
    const cm = monthKey_(new Date());
    const userSheet = getSheet_(USER_SHEET, USER_HEADERS);
    const users = readUsers_(userSheet);
    let user = null;
    for (let i = 0; i < users.length; i++) {
        if (users[i].id === id) user = users[i];
    }
    if (!user) {
        user = { row: 0, id: id, name: name, total: 0, month: 0, monthKey: cm, lastAt: 0 };
        users.push(user);
    }
    user.name = name;
    writeUser_(userSheet, user);
    CacheService.getScriptCache().remove('state');

    const state = makeState_(cm, readCells_(getFieldSheet_()), users, readChampion_(cm));
    return Object.assign({ ok: true }, buildView_(state, id, Date.now()));
}

// ------------------------------------------------------------
// 画面に返すもの
// ------------------------------------------------------------

// state はキャッシュに入れる形（時刻はミリ秒）
function getState_()
{
    const cache = CacheService.getScriptCache();
    const hit = cache.get('state');
    if (hit) {
        try {
            return JSON.parse(hit);
        } catch (err) {
            // こわれてたら読み直す
        }
    }
    const cm = monthKey_(new Date());
    const state = makeState_(cm, readCells_(getFieldSheet_()), readUsers_(getSheet_(USER_SHEET, USER_HEADERS)), readChampion_(cm));
    try {
        cache.put('state', JSON.stringify(state), CACHE_SEC);
    } catch (err) {
        // 大きすぎ→キャッシュなしでいい
    }
    return state;
}

function makeState_(cm, cells, users, champion)
{
    let list = [];
    for (let i = 0; i < users.length; i++) {
        const u = users[i];
        list.push({ id: u.id, name: u.name, total: u.total, month: u.monthKey === cm ? u.month : 0, lastAt: u.lastAt });
    }
    // 今月の数が多い順 同じなら先に取った人
    list.sort(function (a, b) {
        if (b.month !== a.month) return b.month - a.month;
        return a.lastAt - b.lastAt;
    });
    return { monthKey: cm, cells: cells, users: list, champion: champion };
}

function buildView_(state, id, now)
{
    let names = {};
    for (let i = 0; i < state.users.length; i++) {
        names[state.users[i].id] = state.users[i].name;
    }

    let field = [];
    for (let i = 0; i < state.cells.length; i++) {
        const c = state.cells[i];
        const by = names[c.byId] || c.byName || '';
        if (c.r <= now) {
            field.push({ g: STEPS, ok: true, by: by, n: c.n });
            continue;
        }
        let g = Math.floor((now - c.h) / (c.r - c.h) * STEPS);
        if (!(g >= 0)) g = 0;//NaNも
        if (g > STEPS - 1) g = STEPS - 1;
        field.push({ g: g, ok: false, by: by, n: c.n });
    }

    let ranking = [];
    let me = null;
    let rank = 0;
    let prev = -1;
    for (let i = 0; i < state.users.length; i++) {
        const u = state.users[i];
        if (u.month > 0 && u.month !== prev) {
            rank = i + 1;
            prev = u.month;
        }
        if (u.month > 0 && ranking.length < TOP_N) {
            ranking.push({ rank: rank, name: u.name, month: u.month, me: u.id === id });
        }
        if (id && u.id === id) {
            me = { name: u.name, total: u.total, month: u.month, rank: u.month > 0 ? rank : 0 };
        }
    }

    // ほかの人のIDは送らない
    const champ = state.champion;
    let champion = null;
    let vault = false;
    if (champ) {
        champion = { month: champ.month, name: champ.name, count: champ.count };
        vault = id !== '' && (champ.ids || []).indexOf(id) >= 0;
    }

    return { field: field, ranking: ranking, me: me, champion: champion, vault: vault, monthKey: state.monthKey };
}

// ------------------------------------------------------------
// 月の切り替え 先月の1位を歴代チャンピオンに
// ------------------------------------------------------------

function checkMonth_(locked)
{
    const props = PropertiesService.getScriptProperties();
    const cm = monthKey_(new Date());
    const last = props.getProperty('lastMonth');
    if (last === cm) return;
    if (!last) {
        props.setProperty('lastMonth', cm);//公開した月
        return;
    }

    let lock = null;
    if (!locked) {
        lock = LockService.getScriptLock();
        if (!lock.tryLock(5000)) return;//次の人がやる
    }
    try {
        if (props.getProperty('lastMonth') === cm) return;
        const users = readUsers_(getSheet_(USER_SHEET, USER_HEADERS));
        let best = 0;
        for (let i = 0; i < users.length; i++) {
            if (users[i].monthKey === last && users[i].month > best) best = users[i].month;
        }
        if (best > 0) {
            let names = [];
            let ids = [];
            for (let i = 0; i < users.length; i++) {
                if (users[i].monthKey === last && users[i].month === best) {
                    names.push(users[i].name);
                    ids.push(users[i].id);
                }
            }
            getChampSheet_().appendRow([asText_(last), asText_(names.join('・')), best, asText_(ids.join(','))]);
        }
        props.setProperty('lastMonth', cm);
        CacheService.getScriptCache().remove('state');
    } finally {
        if (lock) lock.releaseLock();
    }
}

function readChampion_(cm)
{
    const prev = prevMonth_(cm);
    const sheet = getChampSheet_();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return null;
    const rows = sheet.getRange(2, 1, lastRow - 1, CHAMP_HEADERS.length).getValues();
    for (let i = rows.length - 1; i >= 0; i--) {
        if (toMonth_(rows[i][0]) === prev) {
            const ids = String(rows[i][3]).split(',').map(function (x) { return x.trim(); }).filter(isId_);
            return { month: prev, name: String(rows[i][1]), count: Number(rows[i][2]) || 0, ids: ids };
        }
    }
    return null;
}

// 前の版で作ったシートは ID の見出しがない→足す
function getChampSheet_()
{
    const sheet = getSheet_(CHAMP_SHEET, CHAMP_HEADERS);
    const head = sheet.getRange(1, 1, 1, CHAMP_HEADERS.length).getValues()[0];
    if (String(head[3]) === '') {
        sheet.getRange(1, 4).setValue(CHAMP_HEADERS[3]);
    }
    return sheet;
}

// ------------------------------------------------------------
// シート
// ------------------------------------------------------------

function getSheet_(name, headers)
{
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
        sheet = ss.insertSheet(name);
    }
    if (sheet.getLastRow() === 0) {
        sheet.appendRow(headers);
        sheet.setFrozenRows(1);
    }
    return sheet;
}

// 30マスなかったら足す 最初は全部育ちきり
function getFieldSheet_()
{
    const sheet = getSheet_(FIELD_SHEET, FIELD_HEADERS);
    const n = sheet.getLastRow() - 1;
    if (n < CELL_COUNT) {
        let rows = [];
        for (let i = n; i < CELL_COUNT; i++) {
            rows.push([i + 1, '', '', '', '', 0]);
        }
        sheet.getRange(n + 2, 1, rows.length, FIELD_HEADERS.length).setValues(rows);
    }
    return sheet;
}

function readCells_(sheet)
{
    const rows = sheet.getRange(2, 1, CELL_COUNT, FIELD_HEADERS.length).getValues();
    let cells = [];
    for (let i = 0; i < CELL_COUNT; i++) {
        const r = rows[i];
        cells.push({
            h: toMs_(r[1]),
            r: toMs_(r[2]),   // 0 = 育ちきり
            byName: String(r[3]),
            byId: String(r[4]),
            n: Number(r[5]) || 0,
        });
    }
    return cells;
}

function writeCells_(sheet, cells)
{
    let rows = [];
    for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        rows.push([i + 1, c.h ? new Date(c.h) : '', c.r ? new Date(c.r) : '', asText_(c.byName), asText_(c.byId), c.n]);
    }
    sheet.getRange(2, 1, rows.length, FIELD_HEADERS.length).setValues(rows);
}

function readUsers_(sheet)
{
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
    const rows = sheet.getRange(2, 1, lastRow - 1, USER_HEADERS.length).getValues();
    let users = [];
    for (let i = 0; i < rows.length; i++) {
        const id = String(rows[i][0]);
        if (!isId_(id)) continue;//空行とか
        users.push({
            row: i + 2,
            id: id,
            name: String(rows[i][1]).trim() || '豆苗ハンター',
            total: Number(rows[i][2]) || 0,
            month: Number(rows[i][3]) || 0,
            monthKey: toMonth_(rows[i][4]),
            lastAt: toMs_(rows[i][5]),
        });
    }
    return users;
}

function writeUser_(sheet, u)
{
    const row = [asText_(u.id), asText_(u.name), u.total, u.month, asText_(u.monthKey), u.lastAt ? new Date(u.lastAt) : ''];
    if (u.row > 0) {
        sheet.getRange(u.row, 1, 1, USER_HEADERS.length).setValues([row]);
    } else {
        sheet.appendRow(row);
        u.row = sheet.getLastRow();
    }
}

function nameMap_(users)
{
    let names = {};
    for (let i = 0; i < users.length; i++) {
        names[users[i].id] = users[i].name;
    }
    return names;
}

// ------------------------------------------------------------
// こまかいの
// ------------------------------------------------------------

function isId_(id)
{
    return typeof id === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(id);
}

function cleanName_(s)
{
    return typeof s === 'string' ? s.replace(/[\u0000-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim() : '';
}

// 見た目の文字数 だいたい
function countChars_(s)
{
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
        let count = 0;
        const it = new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(s);
        for (const seg of it) {
            count++;
        }
        return count;
    }
    return Array.from(s).length;
}

function monthKey_(d)
{
    return Utilities.formatDate(d, TZ, 'yyyy-MM');
}

function prevMonth_(cm)
{
    let y = Number(cm.slice(0, 4));
    let m = Number(cm.slice(5, 7)) - 1;
    if (m === 0) {
        m = 12;
        y = y - 1;
    }
    return y + '-' + (m < 10 ? '0' + m : String(m));
}

// 作者が手で書き換えて日付になっちゃっても読めるように
function toMonth_(v)
{
    if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM');
    return String(v).trim();
}

function toMs_(v)
{
    if (v instanceof Date) return v.getTime();
    if (typeof v === 'number') return v;
    if (v === '' || v === null) return 0;
    const t = new Date(String(v)).getTime();
    return isFinite(t) ? t : 0;
}

// 先頭に ' →数式や日付に勝手に変わらない
function asText_(v)
{
    return v === '' ? '' : "'" + v;
}

function json_(obj)
{
    return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
