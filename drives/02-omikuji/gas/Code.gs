/**
 * 支離滅裂おみくじ  Google Apps Script（サーバー側）
 *
 * スプレッドシートの「拡張機能 → Apps Script」に全部貼り付ける
 * 手順は drives/02-omikuji/SETUP.md
 *
 *   GET  … みんなのパーツを種類ごとに返す
 *   POST … パーツを1個追加（チェックつき）
 */

const SHEET_NAME = 'parts';
const HEADERS = ['addedAt', 'kind', 'text', 'clientId'];
const KINDS = ['itsu', 'doko', 'nani', 'dounaru'];
const PART_MAX = 15;            // 1パーツの文字数
const COOLDOWN_MS = 60 * 1000;  // 同じ人は1分あける
const MAX_PER_KIND = 0;         // 重くなったら 500 とかにする 0=全部


function doGet()
{
    try {
        return json_({ ok: true, parts: readParts_() });
    } catch (err) {
        console.error(err);
        return json_({ ok: false, error: '社務所でエラーが起きました。' });
    }
}

function doPost(e)
{
    const lock = LockService.getScriptLock();
    try {
        lock.waitLock(10000);
    } catch (err) {
        return json_({ ok: false, error: '混み合っています。少し待ってからもう一度どうぞ。' });
    }

    try {
        let body;
        try {
            body = JSON.parse(e.postData.contents);
        } catch (err) {
            return json_({ ok: false, error: 'データの形式が正しくありません。' });
        }

        const result = validate_(body);
        if (result.error) {
            return json_({ ok: false, code: 'invalid', error: result.error });
        }
        const part = result.part;
        const sheet = getSheet_();
        const rows = readRows_(sheet);
        const now = new Date();

        //連続チェック
        for (let i = 0; i < rows.length; i++) {
            if (String(rows[i][3]) !== part.clientId) {
                continue;
            }
            const t = new Date(toIso_(rows[i][0])).getTime();
            if (isFinite(t) && now.getTime() - t < COOLDOWN_MS) {
                return json_({ ok: false, code: 'cooldown', error: '続けて奉納するときは1分あけてください。' });
            }
        }

        //同じ言葉
        const key = normalizeKey_(part.text);
        for (let i = 0; i < rows.length; i++) {
            if (String(rows[i][1]) === part.kind && normalizeKey_(String(rows[i][2])) === key) {
                return json_({ ok: false, code: 'duplicate', error: 'その言葉はもう奉納されています。ほかの言葉でどうぞ。' });
            }
        }

        // 先頭に ' →数式や日付に勝手に変わらない
        sheet.appendRow([asText_(now.toISOString()), part.kind, asText_(part.text), asText_(part.clientId)]);

        return json_({ ok: true, part: { kind: part.kind, text: part.text } });
    } catch (err) {
        console.error(err);
        return json_({ ok: false, error: '社務所でエラーが起きました。' });
    } finally {
        lock.releaseLock();
    }
}//finished


function validate_(body)
{
    if (!body || typeof body !== 'object') {
        return { error: 'データの形式が正しくありません。' };
    }
    const clientId = typeof body.clientId === 'string' ? body.clientId : '';
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(clientId)) {
        return { error: 'ブラウザの識別情報が正しくありません。ページを読み込み直してください。' };
    }
    if (KINDS.indexOf(body.kind) < 0) {
        return { error: 'どこに入れるかを選んでください。' };
    }
    const text = typeof body.text === 'string' ? body.text.replace(/[\u0000-\u001F\u007F]/g, '').trim() : '';
    if (text === '') {
        return { error: '言葉を入れてください。' };
    }
    if (countChars_(text) > PART_MAX) {
        return { error: PART_MAX + '文字までです。' };
    }
    return { part: { clientId: clientId, kind: body.kind, text: text } };
}

// 全角半角・空白そろえる（フロントと同じ）
function normalizeKey_(s)
{
    return String(s).normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}

// 見た目の文字数
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
    //Segmenter ない→だいたいで数える
    //return Array.from(s).length;  ←👨‍👩‍👧が5文字になる
    const cps = Array.from(s);
    let count = 0;
    let ri = 0;
    for (let i = 0; i < cps.length; i++) {
        const c = cps[i].codePointAt(0);
        if (c === 0x200D) {
            i++;//ZWJの次もくっつく
            continue;
        }
        if ((c >= 0xFE00 && c <= 0xFE0F) || (c >= 0x1F3FB && c <= 0x1F3FF) || (c >= 0xE0020 && c <= 0xE007F) || /\p{M}/u.test(cps[i])) {
            continue;
        }
        if (c >= 0x1F1E6 && c <= 0x1F1FF) {
            ri++;
            if (ri % 2 === 0) continue;//国旗は2個で1文字
        }
        count++;
    }
    return count;
}


function getSheet_()
{
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
        sheet = ss.insertSheet(SHEET_NAME);
    }
    if (sheet.getLastRow() === 0) {
        sheet.appendRow(HEADERS);
        sheet.setFrozenRows(1);
    }
    return sheet;
}

function readRows_(sheet)
{
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
    return sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
}

function readParts_()
{
    const rows = readRows_(getSheet_());
    // 新しい順（作者が並べ替えても大丈夫なように）
    rows.sort(function (a, b) {
        const ta = toIso_(a[0]);
        const tb = toIso_(b[0]);
        return ta < tb ? 1 : ta > tb ? -1 : 0;
    });
    let parts = { itsu: [], doko: [], nani: [], dounaru: [] };
    for (let i = 0; i < rows.length; i++) {
        const kind = String(rows[i][1]);
        const text = String(rows[i][2]).trim();
        if (KINDS.indexOf(kind) < 0 || text === '') {
            continue;
        }
        if (MAX_PER_KIND > 0 && parts[kind].length >= MAX_PER_KIND) {
            continue;
        }
        parts[kind].push(text);
    }
    return parts;
}

function toIso_(v)
{
    if (v instanceof Date) return v.toISOString();
    return String(v);
}

function asText_(v)
{
    return v === '' ? '' : "'" + v;
}

function json_(obj)
{
    return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
