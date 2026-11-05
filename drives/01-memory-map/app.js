// ============================================================
// app.js ― 画面の動き（タブ・地図・記録フォーム・一覧・バックアップ）
// データの保存・読み込みは storage.js にお願いする。
// ============================================================

import {
  LIMITS,
  listMyRecords,
  saveMyRecord,
  deleteMyRecord,
  exportMyRecords,
  importMyRecords,
  fetchRecentPosts,
  submitPost,
  isDemoMode,
} from './storage.js';
import { getGpsPosition, getIpPosition } from './location.js';

const COOLDOWN_MS = 60 * 1000;
const LAST_POST_KEY = 'memoryMap.lastPostAt';
const NICKNAME_KEY = 'memoryMap.nickname';
const JAPAN_CENTER = [36.5, 137.5];

const $ = (id) => document.getElementById(id);
const els = {
  tabMine: $('tab-mine'),
  tabEveryone: $('tab-everyone'),
  panelMine: $('panel-mine'),
  panelEveryone: $('panel-everyone'),
  mapWrap: document.querySelector('.map-wrap'),
  mapStatus: $('map-status'),
  openForm: $('open-form'),
  form: $('record-form'),
  formTitle: $('form-title'),
  locationNote: $('location-note'),
  locationHelp: $('location-help'),
  confirmLocation: $('confirm-location'),
  retryGps: $('retry-gps'),
  placeName: $('place-name'),
  placeNameCount: $('place-name-count'),
  date: $('date'),
  memo: $('memo'),
  memoCount: $('memo-count'),
  shareBox: $('share-box'),
  share: $('share'),
  shareFields: $('share-fields'),
  nickname: $('nickname'),
  nicknameCount: $('nickname-count'),
  sharedNote: $('shared-note'),
  formError: $('form-error'),
  cancel: $('cancel'),
  submit: $('submit'),
  recordsCount: $('records-count'),
  recordsEmpty: $('records-empty'),
  recordsList: $('records-list'),
  exportBtn: $('export'),
  importBtn: $('import'),
  importFile: $('import-file'),
  homeTip: $('home-tip'),
  demoBanner: $('demo-banner'),
  reloadPosts: $('reload-posts'),
  feedCount: $('feed-count'),
  feedEmpty: $('feed-empty'),
  feedList: $('feed-list'),
  toast: $('toast'),
};

// ---------------------------------------------------------------
// 地図
// ---------------------------------------------------------------

const map = L.map('map').setView(JAPAN_CENTER, 5);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

const mineLayer = L.layerGroup().addTo(map);
const postsLayer = L.layerGroup();
const statusText = { mine: '', everyone: '' };

function setStatus(tab, text, isError = false) {
  statusText[tab] = { text, isError };
  if (tab === currentTab) renderStatus();
}

function renderStatus() {
  const s = statusText[currentTab] || { text: '', isError: false };
  els.mapStatus.textContent = s.text;
  els.mapStatus.hidden = !s.text;
  els.mapStatus.classList.toggle('is-error', s.isError);
}

function fitTo(points) {
  if (!points.length) return;
  if (points.length === 1) {
    map.setView(points[0], 13);
  } else {
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 13 });
  }
}

// 中身は必ず textContent で入れる（HTMLとして解釈させない）
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// ---------------------------------------------------------------
// タブ
// ---------------------------------------------------------------

let currentTab = 'mine';
let postsLoaded = false;

function switchTab(tab) {
  if (tab === currentTab) return;
  currentTab = tab;
  const mine = tab === 'mine';
  els.tabMine.setAttribute('aria-selected', String(mine));
  els.tabEveryone.setAttribute('aria-selected', String(!mine));
  els.panelMine.hidden = !mine;
  els.panelEveryone.hidden = mine;
  if (mine) {
    map.removeLayer(postsLayer);
    mineLayer.addTo(map);
    fitTo(records.map((r) => [r.lat, r.lng]));
  } else {
    closeForm();
    map.removeLayer(mineLayer);
    postsLayer.addTo(map);
    if (!postsLoaded) {
      loadPosts();
    } else {
      fitTo(posts.map((p) => [p.lat, p.lng]));
    }
  }
  renderStatus();
}

els.tabMine.addEventListener('click', () => switchTab('mine'));
els.tabEveryone.addEventListener('click', () => switchTab('everyone'));

// ---------------------------------------------------------------
// 自分の記録：一覧と地図のピン
// ---------------------------------------------------------------

let records = [];
const markerById = new Map();

function refreshRecords({ fit = false } = {}) {
  try {
    records = listMyRecords();
  } catch (err) {
    records = [];
    els.recordsEmpty.textContent = err.message;
    els.recordsEmpty.hidden = false;
    setStatus('mine', err.message, true);
    return;
  }

  // 消した記録の吹き出しが残らないように閉じてから作り直す
  mineLayer.eachLayer((m) => m.closePopup());
  mineLayer.clearLayers();
  markerById.clear();
  els.recordsList.replaceChildren();

  for (const record of records) {
    const marker = L.marker([record.lat, record.lng]).bindPopup(() => recordPopup(record));
    mineLayer.addLayer(marker);
    markerById.set(record.id, marker);
    els.recordsList.append(recordItem(record));
  }

  els.recordsCount.textContent = records.length ? `${records.length}件` : '';
  els.recordsEmpty.textContent = 'まだ記録がありません。「行った場所を記録する」から、最初の1件をどうぞ。';
  els.recordsEmpty.hidden = records.length > 0;
  setStatus('mine', records.length ? `自分の記録 ${records.length}件` : '');
  if (fit) fitTo(records.map((r) => [r.lat, r.lng]));
}

function recordTitle(record) {
  return record.placeName || '（場所の名前なし）';
}

function recordPopup(record) {
  const box = el('div', 'post-popup');
  box.append(el('strong', 'post-popup-name', recordTitle(record)), el('div', 'post-popup-date', formatDate(record.date)));
  if (record.memo) box.append(el('p', 'post-popup-memo', record.memo));
  if (record.sharedAt) box.append(el('span', 'badge', 'みんなのマップに共有済み'));
  return box;
}

function recordItem(record) {
  const li = el('li', 'record-item');

  const main = el('button', 'record-main');
  main.type = 'button';
  main.append(el('span', 'record-date', formatDate(record.date)), el('span', 'record-name', recordTitle(record)));
  if (record.memo) main.append(el('span', 'record-memo', record.memo));
  if (record.sharedAt) main.append(el('span', 'badge', '共有済み'));
  main.addEventListener('click', () => focusRecord(record.id));

  const actions = el('div', 'record-actions');
  const edit = el('button', 'btn btn-small', '編集');
  edit.type = 'button';
  edit.addEventListener('click', () => openForm({ record }));
  actions.append(edit);
  if (!record.sharedAt) {
    const share = el('button', 'btn btn-small', 'みんなに共有');
    share.type = 'button';
    share.addEventListener('click', () => openForm({ record, share: true }));
    actions.append(share);
  }
  const del = el('button', 'btn btn-small btn-danger', '削除');
  del.type = 'button';
  del.addEventListener('click', () => removeRecord(record));
  actions.append(del);

  li.append(main, actions);
  return li;
}

function focusRecord(id) {
  const marker = markerById.get(id);
  if (!marker) return;
  els.mapWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
  map.setView(marker.getLatLng(), Math.max(map.getZoom(), 14));
  marker.openPopup();
}

function removeRecord(record) {
  const note = record.sharedAt ? '\n（みんなのマップに共有した投稿は消えません）' : '';
  if (!confirm(`「${recordTitle(record)}」（${formatDate(record.date)}）の記録を削除しますか？${note}`)) return;
  try {
    deleteMyRecord(record.id);
  } catch (err) {
    showToast(err.message);
    return;
  }
  if (editingId === record.id) closeForm();
  refreshRecords();
  showToast('削除しました');
}

// ---------------------------------------------------------------
// 記録する場所（下書きのピン）
// ---------------------------------------------------------------

// source: 'gps' | 'ip' | 'tap' | 'saved'。IP由来の位置は本人が確認するまで記録できない
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
  const failText = GPS_FAIL_TEXTS[gpsFailReason] || GPS_FAIL_TEXTS.unavailable;
  const texts = {
    gps: '現在地を取得しました。違う場所なら、地図をタップするかピンを動かして直せます。',
    ip: draft.confirmed
      ? '場所を確認しました。違う場合は地図をタップして直せます。'
      : `${failText}代わりに、通信回線から大まかな場所を推測しました。地図の「だいたいこの辺？」が合っていれば「この場所でOK」を、違えば地図をタップして正しい場所を選んでください。（この位置はまだ保存されていません）`,
    tap: '地図で選んだ場所にピンを立てました。もう一度タップすると選び直せます。',
    saved: '記録してある場所です。直したいときは、地図をタップするかピンを動かしてください。',
  };
  els.locationNote.textContent = texts[draft.source];
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
  if (els.form.hidden || currentTab !== 'mine') return;
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
// 記録フォーム（新しく記録する／直す）
// ---------------------------------------------------------------

let editingId = null; // 直している記録の id。新しく記録するときは null
let editingShared = false;

function openForm({ record = null, share = false } = {}) {
  hideError();
  editingId = record ? record.id : null;
  editingShared = Boolean(record && record.sharedAt);

  const today = todayString();
  els.date.max = today;
  els.placeName.value = record ? record.placeName : '';
  els.date.value = record ? record.date : today;
  els.memo.value = record ? record.memo : '';
  els.share.checked = share && !editingShared;
  if (!els.nickname.value) els.nickname.value = storageGet(NICKNAME_KEY) || '';
  els.shareBox.hidden = editingShared;
  els.sharedNote.hidden = !editingShared;
  els.formTitle.textContent = record ? '記録を直す' : '行った場所を記録';
  els.submit.textContent = record ? '保存する' : '記録する';
  renderShareFields();
  updateCounters();

  els.openForm.hidden = true;
  els.form.hidden = false;

  if (record) {
    locateRequest++;
    els.retryGps.disabled = false;
    els.locationHelp.hidden = true;
    setDraft(record.lat, record.lng, 'saved');
    map.closePopup();
    map.setView([record.lat, record.lng], Math.max(map.getZoom(), 14));
    els.mapWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    locate();
  }
  if (share && !editingShared) els.nickname.focus({ preventScroll: true });
}

function closeForm() {
  locateRequest++;
  els.retryGps.disabled = false;
  clearDraft();
  editingId = null;
  els.form.hidden = true;
  els.openForm.hidden = false;
}

function renderShareFields() {
  els.shareFields.hidden = !els.share.checked;
}

function updateCounters() {
  updateCounter(els.placeName, els.placeNameCount, LIMITS.placeName);
  updateCounter(els.memo, els.memoCount, LIMITS.memo);
  updateCounter(els.nickname, els.nicknameCount, LIMITS.nickname);
}

function updateCounter(input, counter, max) {
  const n = charCount(input.value.trim());
  counter.textContent = `${n} / ${max}`;
  counter.classList.toggle('is-over', n > max);
}

function wantsShare() {
  return !editingShared && els.share.checked;
}

function validate() {
  const placeName = els.placeName.value.trim();
  const memo = els.memo.value.trim();
  const date = els.date.value;
  if (!draft) return '場所を選んでください。地図をタップすると選べます。';
  if (!draft.confirmed) return '地図の「だいたいこの辺？」の場所を確認してください。合っていれば「この場所でOK」を押してください。';
  if (charCount(placeName) > LIMITS.placeName) return `場所の名前は${LIMITS.placeName}文字までです。`;
  if (!date) return '行った日を選んでください。';
  if (date > todayString()) return '未来の日付は選べません。';
  if (charCount(memo) > LIMITS.memo) return `メモは${LIMITS.memo}文字までです。`;
  if (wantsShare()) {
    const nickname = els.nickname.value.trim();
    if (!nickname) return 'みんなのマップに載せるときは、ニックネームを入力してください。';
    if (charCount(nickname) > LIMITS.nickname) return `ニックネームは${LIMITS.nickname}文字までです。`;
    const wait = cooldownSecondsLeft();
    if (wait > 0) return `みんなのマップへの投稿は1分あけてください。あと${wait}秒お待ちください。`;
  }
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

  const isNew = !editingId;
  const share = wantsShare();
  let record;
  try {
    record = saveMyRecord({
      id: editingId || undefined,
      placeName: els.placeName.value.trim(),
      lat: draft.lat,
      lng: draft.lng,
      date: els.date.value,
      memo: els.memo.value.trim(),
    });
  } catch (err) {
    showError(err.message);
    return;
  }
  // ここから先で共有に失敗してもやり直せるように、今の記録を「直している記録」にしておく
  editingId = record.id;

  if (share) {
    els.submit.disabled = true;
    els.submit.textContent = '送信中…';
    try {
      const nickname = els.nickname.value.trim();
      await submitPost({ nickname, lat: record.lat, lng: record.lng, date: record.date, memo: record.memo });
      storageSet(LAST_POST_KEY, String(Date.now()));
      storageSet(NICKNAME_KEY, nickname);
      record = saveMyRecord({ id: record.id, sharedAt: new Date().toISOString() });
      postsLoaded = false;
    } catch (err) {
      if (err.code === 'cooldown') storageSet(LAST_POST_KEY, String(Date.now()));
      els.formTitle.textContent = '記録を直す';
      refreshRecords();
      showError(`記録は保存しました。ただ、みんなのマップには載せられませんでした：${err.message}`);
      return;
    } finally {
      els.submit.disabled = false;
      els.submit.textContent = '保存する';
    }
  }

  closeForm();
  refreshRecords();
  focusRecord(record.id);
  showToast(share ? '記録して、みんなのマップにも載せました！' : isNew ? '記録しました！' : '保存しました');
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

els.openForm.addEventListener('click', () => openForm());
els.cancel.addEventListener('click', closeForm);
els.form.addEventListener('submit', onSubmit);
els.share.addEventListener('change', renderShareFields);
for (const input of [els.placeName, els.memo, els.nickname]) {
  input.addEventListener('input', updateCounters);
}

// ---------------------------------------------------------------
// バックアップ
// ---------------------------------------------------------------

els.exportBtn.addEventListener('click', async () => {
  let text;
  try {
    text = exportMyRecords();
  } catch (err) {
    showToast(err.message);
    return;
  }
  const d = new Date();
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const filename = `drive-memory-map-backup-${stamp}.json`;
  const file = new File([text], filename, { type: 'application/json' });

  // スマホでは共有メニューから「ファイルに保存」などを選べるようにする
  const isTouch = matchMedia('(pointer: coarse)').matches;
  if (isTouch && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = el('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
});

els.importBtn.addEventListener('click', () => els.importFile.click());

els.importFile.addEventListener('change', async () => {
  const file = els.importFile.files[0];
  els.importFile.value = '';
  if (!file) return;
  try {
    const result = importMyRecords(await file.text());
    refreshRecords({ fit: true });
    const skipped = result.skipped ? `、そのまま${result.skipped}件` : '';
    showToast(`読み込みました（新しく${result.added}件、更新${result.updated}件${skipped}）`);
  } catch (err) {
    showToast(err.message);
  }
});

const isStandalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
els.homeTip.hidden = isStandalone;

// ---------------------------------------------------------------
// みんなのマップ
// ---------------------------------------------------------------

let posts = [];

function postPopup(post) {
  const box = el('div', 'post-popup');
  box.append(el('strong', 'post-popup-name', post.nickname), el('div', 'post-popup-date', formatDate(post.date)));
  if (post.memo) box.append(el('p', 'post-popup-memo', post.memo));
  return box;
}

// タイムラインの1件（Twitter のような並び）
const AVATAR_COLORS = ['#d2562b', '#2f7d6d', '#3b6fb6', '#8a5cb8', '#c2861a', '#b8466e'];

function feedItem(post, marker) {
  const li = el('li', 'feed-item');
  const button = el('button', 'feed-main');
  button.type = 'button';

  const nickname = post.nickname || '名無し';
  const avatar = el('span', 'feed-avatar', Array.from(nickname)[0]);
  avatar.style.background = AVATAR_COLORS[hashString(nickname) % AVATAR_COLORS.length];
  avatar.setAttribute('aria-hidden', 'true');

  const body = el('span', 'feed-body');
  const head = el('span', 'feed-head');
  const time = el('time', 'feed-time', relativeTime(post.postedAt));
  time.dateTime = post.postedAt;
  time.title = formatDateTime(post.postedAt);
  head.append(el('span', 'feed-name', nickname), time);
  body.append(head);
  if (post.memo) body.append(el('span', 'feed-memo', post.memo));
  body.append(el('span', 'feed-meta', `📍 ${formatDate(post.date)}に行った ・ 地図で見る`));

  button.append(avatar, body);
  button.addEventListener('click', () => {
    els.mapWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    map.setView(marker.getLatLng(), Math.max(map.getZoom(), 13));
    marker.openPopup();
  });
  li.append(button);
  return li;
}

async function loadPosts() {
  setStatus('everyone', '読み込み中…');
  els.reloadPosts.disabled = true;
  els.feedEmpty.textContent = '読み込み中…';
  els.feedEmpty.hidden = !!posts.length;
  try {
    posts = await fetchRecentPosts();
    postsLayer.eachLayer((m) => m.closePopup());
    postsLayer.clearLayers();
    els.feedList.replaceChildren();
    for (const post of posts) {
      const marker = L.marker([post.lat, post.lng]).bindPopup(() => postPopup(post));
      postsLayer.addLayer(marker);
      els.feedList.append(feedItem(post, marker));
    }
    postsLoaded = true;
    setStatus('everyone', posts.length ? `みんなの思い出 ${posts.length}件` : 'まだ誰も共有していません');
    els.feedCount.textContent = posts.length ? `${posts.length}件` : '';
    els.feedEmpty.textContent = 'まだ誰も共有していません。';
    els.feedEmpty.hidden = posts.length > 0;
    if (currentTab === 'everyone') fitTo(posts.map((p) => [p.lat, p.lng]));
  } catch {
    setStatus('everyone', '読み込めませんでした（「読み込み直す」を押してください）', true);
    els.feedEmpty.textContent = '投稿を読み込めませんでした。上の「読み込み直す」を押してください。';
    els.feedEmpty.hidden = false;
  } finally {
    els.reloadPosts.disabled = false;
  }
}

els.reloadPosts.addEventListener('click', loadPosts);
els.demoBanner.hidden = !isDemoMode();

// ---------------------------------------------------------------
// 小さな道具
// ---------------------------------------------------------------

// 絵文字なども1文字として数える（サーバー側と同じ数え方）
function charCount(s) {
  return Array.from(s).length;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 「3分前」「5時間前」「2日前」。1週間より前は日付で出す
function relativeTime(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const diff = Math.max(0, Date.now() - t) / 1000;
  if (diff < 60) return 'たった今';
  if (diff < 3600) return `${Math.floor(diff / 60)}分前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}時間前`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}日前`;
  const d = new Date(t);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function formatDateTime(iso) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours()}:${pad(d.getMinutes())}`;
}

function hashString(s) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h;
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

let toastTimer = null;
function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('is-visible'), 3500);
}

// ---------------------------------------------------------------

refreshRecords({ fit: true });
