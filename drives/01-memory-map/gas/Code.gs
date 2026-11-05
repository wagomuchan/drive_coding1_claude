/**
 * ドライブの思い出マップ ― Google Apps Script（サーバー側）
 *
 * このファイルの中身をまるごと、スプレッドシートの
 * 「拡張機能 → Apps Script」のエディタに貼り付けて使います。
 * 手順は drives/01-memory-map/SETUP.md を見てください。
 *
 *   GET  … 投稿日時が新しい順に最大100件を返す
 *   POST … 投稿を1件追加する（入力チェック・連投チェックつき）
 */

const SHEET_NAME = 'posts';
const HEADERS = ['postedAt', 'clientId', 'nickname', 'lat', 'lng', 'date', 'memo'];
const MAX_POSTS = 100;          // 返す件数
const NICKNAME_MAX = 20;        // ニックネームの最大文字数
const MEMO_MAX = 100;           // 一言メモの最大文字数
const COOLDOWN_MS = 60 * 1000;  // 同じ人の連投は1分あける
const TIME_ZONE = 'Asia/Tokyo';

// ---------------------------------------------------------------
// 窓口
// ---------------------------------------------------------------

function doGet() {
  try {
    return json_({ ok: true, posts: readRecentPosts_() });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'サーバーでエラーが起きました。' });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    return json_({ ok: false, error: '混み合っています。少し待ってからもう一度試してください。' });
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
    const post = result.post;
    const sheet = getSheet_();
    const now = new Date();

    if (postedRecently_(sheet, post.clientId, now)) {
      return json_({ ok: false, code: 'cooldown', error: '連投は1分あけてください。' });
    }

    const postedAt = now.toISOString();
    // 文字列の先頭に ' を付けると、スプレッドシートが日付や数式に
    // 勝手に変換せず、そのままの文字として保存される
    sheet.appendRow([
      asText_(postedAt),
      asText_(post.clientId),
      asText_(post.nickname),
      post.lat,
      post.lng,
      asText_(post.date),
      asText_(post.memo),
    ]);

    return json_({
      ok: true,
      post: {
        postedAt: postedAt,
        nickname: post.nickname,
        lat: post.lat,
        lng: post.lng,
        date: post.date,
        memo: post.memo,
      },
    });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'サーバーでエラーが起きました。' });
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------
// 入力チェック（フロント側と同じルールをサーバーでも確認する）
// ---------------------------------------------------------------

function validate_(body) {
  if (!body || typeof body !== 'object') {
    return { error: 'データの形式が正しくありません。' };
  }

  const clientId = typeof body.clientId === 'string' ? body.clientId : '';
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(clientId)) {
    return { error: 'ブラウザの識別情報が正しくありません。ページを読み込み直してください。' };
  }

  const nickname = cleanText_(body.nickname, false);
  if (charCount_(nickname) === 0) {
    return { error: 'ニックネームを入力してください。' };
  }
  if (charCount_(nickname) > NICKNAME_MAX) {
    return { error: 'ニックネームは' + NICKNAME_MAX + '文字までです。' };
  }

  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return { error: '場所が正しくありません。' };
  }

  const date = typeof body.date === 'string' ? body.date : '';
  if (!isValidDate_(date)) {
    return { error: '日付が正しくありません。' };
  }
  // 時差を考えて、日本時間の「明日」までは許す
  const tomorrow = Utilities.formatDate(new Date(Date.now() + 24 * 60 * 60 * 1000), TIME_ZONE, 'yyyy-MM-dd');
  if (date > tomorrow) {
    return { error: '未来の日付は選べません。' };
  }

  const memo = cleanText_(body.memo, true);
  if (charCount_(memo) > MEMO_MAX) {
    return { error: '一言メモは' + MEMO_MAX + '文字までです。' };
  }

  return {
    post: {
      clientId: clientId,
      nickname: nickname,
      lat: round3_(lat),
      lng: round3_(lng),
      date: date,
      memo: memo,
    },
  };
}

function cleanText_(value, allowNewline) {
  if (typeof value !== 'string') return '';
  let s = value.replace(/\r\n?/g, '\n');
  s = allowNewline
    ? s.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '')
    : s.replace(/[\u0000-\u001F\u007F]/g, '');
  return s.trim();
}

// 絵文字なども1文字として数える
function charCount_(s) {
  return Array.from(s).length;
}

function isValidDate_(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  if (y < 1900) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// 小数点以下3桁（約100m単位）に丸める
function round3_(n) {
  return Math.round(n * 1000) / 1000;
}

// ---------------------------------------------------------------
// スプレッドシートの読み書き
// ---------------------------------------------------------------

function getSheet_() {
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

function readRows_(sheet, fromRow) {
  const lastRow = sheet.getLastRow();
  const start = Math.max(2, fromRow);
  if (lastRow < start) return [];
  return sheet.getRange(start, 1, lastRow - start + 1, HEADERS.length).getValues();
}

function readRecentPosts_() {
  const sheet = getSheet_();
  const posts = [];
  readRows_(sheet, 2).forEach(function (row) {
    const post = rowToPost_(row);
    if (post) posts.push(post);
  });
  // 作者が手で並べ替えても大丈夫なように、ここで新しい順に並べる
  posts.sort(function (a, b) {
    return a.postedAt < b.postedAt ? 1 : a.postedAt > b.postedAt ? -1 : 0;
  });
  return posts.slice(0, MAX_POSTS);
}

// 行のデータを、画面に返す形に直す（clientId は返さない）
function rowToPost_(row) {
  const lat = Number(row[3]);
  const lng = Number(row[4]);
  if (row[3] === '' || row[4] === '' || !isFinite(lat) || !isFinite(lng)) return null;
  return {
    postedAt: toIso_(row[0]),
    nickname: String(row[2]),
    lat: lat,
    lng: lng,
    date: toDateString_(row[5]),
    memo: String(row[6]),
  };
}

function postedRecently_(sheet, clientId, now) {
  // 最近の50行だけ見れば十分
  const rows = readRows_(sheet, sheet.getLastRow() - 49);
  return rows.some(function (row) {
    if (String(row[1]) !== clientId) return false;
    const t = new Date(toIso_(row[0])).getTime();
    return isFinite(t) && now.getTime() - t < COOLDOWN_MS;
  });
}

function toIso_(v) {
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function toDateString_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TIME_ZONE, 'yyyy-MM-dd');
  return String(v);
}

function asText_(v) {
  return v === '' ? '' : "'" + v;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
