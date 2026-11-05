// ============================================================
// storage.js ― データの保存・読み込みは、すべてこのファイルで行う
//
// 他のファイルから localStorage の記録・スプレッドシート・Apps Script を
// 直接さわらないこと。保存先を変えるときは、このファイルだけを書き換える。
//
// 【自分の記録】このブラウザの中（localStorage）にだけ保存する
//   listMyRecords()          … 行った日が新しい順で返す
//   saveMyRecord(record)     … 新規作成、または id が同じ記録を上書きする
//   deleteMyRecord(id)       … 1件削除する
//   exportMyRecords()        … バックアップ用の JSON 文字列を返す
//   importMyRecords(text)    … バックアップを読み込んで、今の記録に足す
//
//   記録の形：{ id, placeName, lat, lng, date, memo, createdAt, updatedAt, sharedAt }
//   （lat/lng は丸めない正確な位置。sharedAt はみんなのマップに共有した日時、未共有なら null）
//
// 【みんなのマップ】Googleスプレッドシート ＋ Apps Script に保存する
//   fetchRecentPosts()       … 直近100件を、投稿日時が新しい順で返す
//   submitPost(post)         … 投稿を1件保存して、保存された投稿を返す
//   isDemoMode()             … まだ Apps Script のURLが設定されていなければ true
//
//   投稿の形：{ postedAt, nickname, lat, lng, date, memo }
// ============================================================

// ▼ ここに Apps Script のウェブアプリURL（最後が /exec のもの）を貼り付ける
//   空のままだと「デモモード」になり、投稿はこのブラウザの中にだけ保存される
const API_URL = 'https://script.google.com/macros/s/AKfycbxJF2hoHk5anCyNLr-WgAE_NUhp8EF3fWWUZbKE-RAbwGfGCd67_pIcis8oA9lO61lJrQ/exec';

const REQUEST_TIMEOUT_MS = 20000;
const CLIENT_ID_KEY = 'memoryMap.clientId';
const DEMO_POSTS_KEY = 'memoryMap.demoPosts';
const RECORDS_KEY = 'memoryMap.records';
const BACKUP_APP = 'drive-memory-map';
const BACKUP_VERSION = 1;
const MAX_POSTS = 100;

export const LIMITS = {
  placeName: 30,
  memo: 100,
  nickname: 20,
};

export class StorageError extends Error {
  constructor(message, code = 'error') {
    super(message);
    this.name = 'StorageError';
    this.code = code;
  }
}

// ============================================================
// 自分の記録
// ============================================================

export function listMyRecords() {
  return sortRecords(readRecords());
}

export function saveMyRecord(input) {
  const records = readRecords();
  const now = new Date().toISOString();
  const index = input.id ? records.findIndex((r) => r.id === input.id) : -1;
  const base = index >= 0 ? records[index] : { id: randomId(), createdAt: now, sharedAt: null };
  const record = normalizeRecord({ ...base, ...input, id: base.id, createdAt: base.createdAt, updatedAt: now });
  if (!record) {
    throw new StorageError('記録の内容が正しくありません。', 'invalid');
  }
  if (index >= 0) {
    records[index] = record;
  } else {
    records.push(record);
  }
  writeRecords(records);
  return record;
}

export function deleteMyRecord(id) {
  writeRecords(readRecords().filter((r) => r.id !== id));
}

export function exportMyRecords() {
  return JSON.stringify(
    {
      app: BACKUP_APP,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      records: sortRecords(readRecords()),
    },
    null,
    2,
  );
}

// 同じ記録（id が同じ）がすでにあれば、更新日時が新しいほうを残す
export function importMyRecords(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new StorageError('バックアップのファイルを読めませんでした。', 'invalid');
  }
  const incoming = data && data.app === BACKUP_APP && Array.isArray(data.records) ? data.records : null;
  if (!incoming) {
    throw new StorageError('このサイトのバックアップのファイルではないようです。', 'invalid');
  }

  const records = readRecords();
  const byId = new Map(records.map((r, i) => [r.id, i]));
  const result = { added: 0, updated: 0, skipped: 0 };
  for (const raw of incoming) {
    const record = normalizeRecord(raw);
    if (!record) {
      result.skipped++;
      continue;
    }
    if (byId.has(record.id)) {
      const i = byId.get(record.id);
      if (record.updatedAt > records[i].updatedAt) {
        records[i] = record;
        result.updated++;
      } else {
        result.skipped++;
      }
    } else {
      byId.set(record.id, records.length);
      records.push(record);
      result.added++;
    }
  }
  writeRecords(records);
  return result;
}

function readRecords() {
  let raw;
  try {
    raw = localStorage.getItem(RECORDS_KEY);
  } catch {
    throw new StorageError('このブラウザでは記録を読み込めません。', 'unavailable');
  }
  try {
    const list = JSON.parse(raw || '[]');
    return Array.isArray(list) ? list.map(normalizeRecord).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function writeRecords(records) {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch {
    throw new StorageError('このブラウザでは記録を保存できませんでした。プライベートブラウズを使っている場合は、通常の画面で開いてください。', 'unavailable');
  }
}

function sortRecords(records) {
  return [...records].sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1));
}

// 形のおかしい記録は null にする（バックアップの読み込みでも使う）
function normalizeRecord(r) {
  if (!r || typeof r !== 'object') return null;
  const id = typeof r.id === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(r.id) ? r.id : null;
  const lat = Number(r.lat);
  const lng = Number(r.lng);
  const date = typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : null;
  if (!id || !date || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return null;
  }
  const createdAt = isoOr(r.createdAt, new Date(0).toISOString());
  return {
    id,
    placeName: clip(r.placeName, LIMITS.placeName),
    lat,
    lng,
    date,
    memo: clip(r.memo, LIMITS.memo),
    createdAt,
    updatedAt: isoOr(r.updatedAt, createdAt),
    sharedAt: r.sharedAt ? isoOr(r.sharedAt, null) : null,
  };
}

function clip(value, max) {
  return typeof value === 'string' ? Array.from(value.trim()).slice(0, max).join('') : '';
}

function isoOr(value, fallback) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : fallback;
}

// ============================================================
// みんなのマップ
// ============================================================

export function isDemoMode() {
  return !API_URL;
}

export async function fetchRecentPosts() {
  if (isDemoMode()) {
    return readDemoPosts().slice(0, MAX_POSTS);
  }
  const data = await request(API_URL, { method: 'GET' });
  return Array.isArray(data.posts) ? data.posts : [];
}

// 位置は約100m単位（小数点以下3桁）に丸めて送る
export async function submitPost({ nickname, lat, lng, date, memo }) {
  const body = { clientId: getClientId(), nickname, lat: round3(lat), lng: round3(lng), date, memo };

  if (isDemoMode()) {
    const post = { postedAt: new Date().toISOString(), nickname, lat: body.lat, lng: body.lng, date, memo };
    const posts = [post, ...readDemoPosts()].slice(0, MAX_POSTS);
    try {
      localStorage.setItem(DEMO_POSTS_KEY, JSON.stringify(posts));
    } catch {
      // 保存できないブラウザでも、画面には表示される
    }
    return post;
  }

  // Content-Type を text/plain のままにすると、Apps Script に
  // 余計な事前確認（CORS のプリフライト）なしで送れる
  const data = await request(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
  });
  return data.post;
}

async function request(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, { ...options, redirect: 'follow', signal: controller.signal });
  } catch (err) {
    throw new StorageError(
      err.name === 'AbortError'
        ? 'サーバーの応答がありませんでした。電波の良いところでもう一度試してください。'
        : 'サーバーにつながりませんでした。電波の良いところでもう一度試してください。',
      'network',
    );
  } finally {
    clearTimeout(timer);
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw new StorageError('サーバーから正しい返事がありませんでした。', 'bad-response');
  }
  if (!data || data.ok !== true) {
    throw new StorageError((data && data.error) || 'サーバーでエラーが起きました。', (data && data.code) || 'error');
  }
  return data;
}

// ブラウザごとのランダムなID（みんなのマップの連投チェックに使う）
let memoryClientId = null;
function getClientId() {
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY);
    if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
      id = randomId();
      localStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
  } catch {
    memoryClientId = memoryClientId || randomId();
    return memoryClientId;
  }
}

function readDemoPosts() {
  try {
    const posts = JSON.parse(localStorage.getItem(DEMO_POSTS_KEY) || '[]');
    return Array.isArray(posts) ? posts : [];
  } catch {
    return [];
  }
}

// ============================================================

function randomId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}
