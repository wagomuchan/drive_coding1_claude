// ============================================================
// storage.js ― データの保存・読み込みは、すべてこのファイルで行う
//
// 他のファイルからスプレッドシートや Apps Script を直接呼ばないこと。
// 将来 Supabase に移すときは、このファイルの中身だけを書き換えれば
// 済むように、外に見せるのは下の3つだけにしている。
//
//   fetchRecentPosts()   … 直近100件を、投稿日時が新しい順で返す
//   submitPost(post)     … 投稿を1件保存して、保存された投稿を返す
//   isDemoMode()         … まだ保存先が設定されていなければ true
//
// 投稿の形： { postedAt, nickname, lat, lng, date, memo }
// ============================================================

// ▼ ここに Apps Script のウェブアプリURL（最後が /exec のもの）を貼り付ける
//   空のままだと「デモモード」になり、投稿はこのブラウザの中にだけ保存される
const API_URL = 'https://script.google.com/macros/s/AKfycbxJF2hoHk5anCyNLr-WgAE_NUhp8EF3fWWUZbKE-RAbwGfGCd67_pIcis8oA9lO61lJrQ/exec';

const REQUEST_TIMEOUT_MS = 20000;
const CLIENT_ID_KEY = 'memoryMap.clientId';
const DEMO_POSTS_KEY = 'memoryMap.demoPosts';
const MAX_POSTS = 100;

export class StorageError extends Error {
  constructor(message, code = 'error') {
    super(message);
    this.name = 'StorageError';
    this.code = code;
  }
}

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

export async function submitPost({ nickname, lat, lng, date, memo }) {
  const body = { clientId: getClientId(), nickname, lat, lng, date, memo };

  if (isDemoMode()) {
    const post = {
      postedAt: new Date().toISOString(),
      nickname,
      lat: round3(lat),
      lng: round3(lng),
      date,
      memo,
    };
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

// ---------------------------------------------------------------

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

// ブラウザごとのランダムなID（連投チェックに使う）
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

function randomId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function readDemoPosts() {
  try {
    const posts = JSON.parse(localStorage.getItem(DEMO_POSTS_KEY) || '[]');
    return Array.isArray(posts) ? posts : [];
  } catch {
    return [];
  }
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}
