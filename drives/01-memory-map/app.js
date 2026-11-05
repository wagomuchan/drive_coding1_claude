// ============================================================
// app.js ― 画面の動き（地図・投稿フォーム）
// データの保存・読み込みは storage.js にお願いする。
// ============================================================

import { fetchRecentPosts, submitPost, isDemoMode } from './storage.js';
import { getGpsPosition, getIpPosition } from './location.js';

const NICKNAME_MAX = 20;
const MEMO_MAX = 100;
const COOLDOWN_MS = 60 * 1000;
const LAST_POST_KEY = 'memoryMap.lastPostAt';
const NICKNAME_KEY = 'memoryMap.nickname';
const JAPAN_CENTER = [36.5, 137.5];

const $ = (id) => document.getElementById(id);
const els = {
  mapStatus: $('map-status'),
  openForm: $('open-form'),
  form: $('post-form'),
  locationNote: $('location-note'),
  locationHelp: $('location-help'),
  confirmLocation: $('confirm-location'),
  retryGps: $('retry-gps'),
  nickname: $('nickname'),
  nicknameCount: $('nickname-count'),
  date: $('date'),
  memo: $('memo'),
  memoCount: $('memo-count'),
  formError: $('form-error'),
  cancel: $('cancel'),
  submit: $('submit'),
  toast: $('toast'),
};

// ---------------------------------------------------------------
// 地図
// ---------------------------------------------------------------

const map = L.map('map', { zoomControl: true }).setView(JAPAN_CENTER, 5);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

const postsLayer = L.layerGroup().addTo(map);

function addPostMarker(post) {
  const marker = L.marker([post.lat, post.lng]).bindPopup(() => popupContent(post));
  postsLayer.addLayer(marker);
  return marker;
}

// 投稿の中身は必ず textContent で入れる（HTMLとして解釈させない）
function popupContent(post) {
  const box = document.createElement('div');
  box.className = 'post-popup';
  const name = document.createElement('strong');
  name.className = 'post-popup-name';
  name.textContent = post.nickname;
  const date = document.createElement('div');
  date.className = 'post-popup-date';
  date.textContent = formatDate(post.date);
  box.append(name, date);
  if (post.memo) {
    const memo = document.createElement('p');
    memo.className = 'post-popup-memo';
    memo.textContent = post.memo;
    box.append(memo);
  }
  return box;
}

async function loadPosts({ fit = false } = {}) {
  els.mapStatus.textContent = '読み込み中…';
  els.mapStatus.classList.remove('is-error');
  try {
    const posts = await fetchRecentPosts();
    postsLayer.clearLayers();
    posts.forEach(addPostMarker);
    els.mapStatus.textContent = posts.length ? `みんなの思い出 ${posts.length}件` : 'まだ投稿がありません。最初の1件をどうぞ！';
    if (fit && posts.length) {
      map.fitBounds(L.latLngBounds(posts.map((p) => [p.lat, p.lng])), { padding: [40, 40], maxZoom: 12 });
    }
  } catch (err) {
    els.mapStatus.textContent = '投稿を読み込めませんでした（タップで再読み込み）';
    els.mapStatus.classList.add('is-error');
  }
}

els.mapStatus.addEventListener('click', () => {
  if (els.mapStatus.classList.contains('is-error')) loadPosts({ fit: true });
});

// ---------------------------------------------------------------
// 投稿する場所（下書きのピン）
// ---------------------------------------------------------------

// source: 'gps' | 'ip' | 'tap'。IP由来の位置は本人が確認するまで投稿できない
let draft = null; // { lat, lng, source, confirmed }
let draftMarker = null;
let locateRequest = 0;
let gpsFailReason = null; // 'denied' | 'timeout' | 'unavailable' | 'unsupported'

const GPS_FAIL_TEXTS = {
  denied: '位置情報の利用が許可されていないため、現在地を取得できませんでした。',
  timeout: '現在地の取得に時間がかかりすぎたため、あきらめました。',
  unavailable: '現在地を取得できませんでした。',
  unsupported: 'このブラウザでは現在地を取得できません。',
};

const draftIcon = L.divIcon({
  className: 'draft-icon',
  html: '<div class="draft-pin"></div>',
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  tooltipAnchor: [0, -28],
});

function setDraft(lat, lng, source) {
  draft = { lat, lng, source, confirmed: source !== 'ip' };
  if (!draftMarker) {
    draftMarker = L.marker([lat, lng], { icon: draftIcon, draggable: true, zIndexOffset: 1000, keyboard: false });
    draftMarker.on('dragend', () => {
      const p = draftMarker.getLatLng();
      setDraft(p.lat, p.lng, 'tap');
    });
    draftMarker.addTo(map);
  } else {
    draftMarker.setLatLng([lat, lng]);
  }
  draftMarker.unbindTooltip();
  if (source === 'ip') {
    draftMarker.bindTooltip('だいたいこの辺？', { permanent: true, direction: 'top', className: 'draft-tooltip' }).openTooltip();
  }
  renderLocationNote();
}

function clearDraft() {
  draft = null;
  if (draftMarker) {
    draftMarker.remove();
    draftMarker = null;
  }
}

function renderLocationNote(message) {
  els.confirmLocation.hidden = !(draft && draft.source === 'ip' && !draft.confirmed);
  if (message) {
    els.locationNote.textContent = message;
    return;
  }
  if (!draft) return;
  const coords = `（${round3(draft.lat).toFixed(3)}, ${round3(draft.lng).toFixed(3)}）`;
  const texts = {
    gps: '現在地を取得しました。違う場所なら、地図をタップするかピンを動かして直せます。',
    ip: draft.confirmed
      ? '場所を確認しました。違う場合は地図をタップして直せます。'
      : `${GPS_FAIL_TEXTS[gpsFailReason] || GPS_FAIL_TEXTS.unavailable}代わりに、通信回線から大まかな場所を推測しました。地図の「だいたいこの辺？」が合っていれば「この場所でOK」を、違えば地図をタップして正しい場所を選んでください。（この位置はまだ保存されていません）`,
    tap: '地図で選んだ場所にピンを立てました。もう一度タップすると選び直せます。',
  };
  els.locationNote.textContent = texts[draft.source] + coords;
}

async function locate() {
  const request = ++locateRequest;
  clearDraft();
  gpsFailReason = null;
  els.locationHelp.hidden = true;
  renderLocationNote('現在地を取得しています…');
  els.retryGps.disabled = true;
  try {
    const pos = await getGpsPosition();
    if (request !== locateRequest || draft) return; // 待っている間に地図をタップした
    setDraft(pos.lat, pos.lng, 'gps');
    map.setView([pos.lat, pos.lng], 15);
  } catch (err) {
    if (request !== locateRequest || draft) return;
    gpsFailReason = err.code;
    els.locationHelp.hidden = gpsFailReason !== 'denied';
    renderLocationNote(`${GPS_FAIL_TEXTS[gpsFailReason] || GPS_FAIL_TEXTS.unavailable}通信回線から大まかな場所を調べています…`);
    const pos = await getIpPosition();
    if (request !== locateRequest || draft) return;
    if (pos) {
      setDraft(pos.lat, pos.lng, 'ip');
      map.setView([pos.lat, pos.lng], 11);
    } else {
      renderLocationNote('場所を自動で取得できませんでした。地図をタップして、行った場所を選んでください。');
    }
  } finally {
    if (request === locateRequest) els.retryGps.disabled = false;
  }
}

map.on('click', (e) => {
  if (els.form.hidden) return;
  setDraft(e.latlng.lat, e.latlng.lng, 'tap');
});

els.confirmLocation.addEventListener('click', () => {
  if (!draft) return;
  draft.confirmed = true;
  if (draftMarker) draftMarker.unbindTooltip();
  renderLocationNote();
});

els.retryGps.addEventListener('click', locate);

// ---------------------------------------------------------------
// 投稿フォーム
// ---------------------------------------------------------------

function openForm() {
  els.openForm.hidden = true;
  els.form.hidden = false;
  hideError();
  const today = todayString();
  els.date.max = today;
  if (!els.date.value || els.date.value > today) els.date.value = today;
  if (!els.nickname.value) els.nickname.value = storageGet(NICKNAME_KEY) || '';
  updateCounters();
  locate();
}

function closeForm() {
  locateRequest++;
  els.retryGps.disabled = false;
  clearDraft();
  els.form.hidden = true;
  els.openForm.hidden = false;
}

function updateCounters() {
  updateCounter(els.nickname, els.nicknameCount, NICKNAME_MAX);
  updateCounter(els.memo, els.memoCount, MEMO_MAX);
}

function updateCounter(input, counter, max) {
  const n = charCount(input.value.trim());
  counter.textContent = `${n} / ${max}`;
  counter.classList.toggle('is-over', n > max);
}

function validate() {
  const nickname = els.nickname.value.trim();
  const memo = els.memo.value.trim();
  const date = els.date.value;
  if (!draft) return '場所を選んでください。地図をタップすると選べます。';
  if (!draft.confirmed) return '地図の「だいたいこの辺？」の場所を確認してください。合っていれば「この場所でOK」を押してください。';
  if (!nickname) return 'ニックネームを入力してください。';
  if (charCount(nickname) > NICKNAME_MAX) return `ニックネームは${NICKNAME_MAX}文字までです。`;
  if (!date) return '行った日を選んでください。';
  if (date > todayString()) return '未来の日付は選べません。';
  if (charCount(memo) > MEMO_MAX) return `一言メモは${MEMO_MAX}文字までです。`;
  const wait = cooldownSecondsLeft();
  if (wait > 0) return `連投は1分あけてください。あと${wait}秒お待ちください。`;
  return null;
}

async function onSubmit(e) {
  e.preventDefault();
  hideError();
  const error = validate();
  if (error) {
    showError(error);
    return;
  }

  els.submit.disabled = true;
  els.submit.textContent = '送信中…';
  try {
    const nickname = els.nickname.value.trim();
    const post = await submitPost({
      nickname,
      lat: round3(draft.lat),
      lng: round3(draft.lng),
      date: els.date.value,
      memo: els.memo.value.trim(),
    });
    storageSet(LAST_POST_KEY, String(Date.now()));
    storageSet(NICKNAME_KEY, nickname);
    els.memo.value = '';
    closeForm();
    showToast('投稿しました！');
    await loadPosts();
    map.setView([post.lat, post.lng], Math.max(map.getZoom(), 13));
    findMarker(post)?.openPopup();
  } catch (err) {
    if (err.code === 'cooldown') storageSet(LAST_POST_KEY, String(Date.now()));
    showError(err.message || '投稿できませんでした。もう一度試してください。');
  } finally {
    els.submit.disabled = false;
    els.submit.textContent = '投稿する';
  }
}

function findMarker(post) {
  let found = null;
  postsLayer.eachLayer((m) => {
    const p = m.getLatLng();
    if (!found && p.lat === post.lat && p.lng === post.lng) found = m;
  });
  return found;
}

function cooldownSecondsLeft() {
  const last = Number(storageGet(LAST_POST_KEY));
  if (!last) return 0;
  return Math.max(0, Math.ceil((last + COOLDOWN_MS - Date.now()) / 1000));
}

function showError(message) {
  els.formError.textContent = message;
  els.formError.hidden = false;
}

function hideError() {
  els.formError.hidden = true;
  els.formError.textContent = '';
}

let toastTimer = null;
function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('is-visible'), 3000);
}

els.openForm.addEventListener('click', openForm);
els.cancel.addEventListener('click', closeForm);
els.form.addEventListener('submit', onSubmit);
els.nickname.addEventListener('input', updateCounters);
els.memo.addEventListener('input', updateCounters);

// ---------------------------------------------------------------
// 小さな道具
// ---------------------------------------------------------------

// 絵文字なども1文字として数える（サーバー側と同じ数え方）
function charCount(s) {
  return Array.from(s).length;
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? `${m[1]}年${Number(m[2])}月${Number(m[3])}日` : s;
}

function storageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 保存できないブラウザでも動くようにする
  }
}

// ---------------------------------------------------------------

if (isDemoMode()) $('demo-banner').hidden = false;
loadPosts({ fit: true });
