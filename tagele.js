// ==UserScript==
// @name         KDESK - Тег для списка чатов
// @namespace    fsafaf
// @version      2026.1
// @description  Показывает текст из поля "Идентификатор" рядом с именем чата в списке.
// @match        https://chat.telegram-agents.work/*
// @match        https://chat.telegram-agents.ru/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @connect      script.google.com
// @connect      script.googleusercontent.com
// ==/UserScript==

(function () {
  'use strict';

  // ===== НАСТРОЙКИ =====
  const SYNC_URL = 'https://script.google.com/macros/s/AKfycby9rxi0t8GPipAoHYiLWreNiMgCZiwwtBDmdIG-ceQxwfnHr91UC80jy1icBXA2bkrV/exec';        // URL веб-приложения Apps Script (оканчивается на /exec)
  const TOKEN = 'f7LiWgDIIHg9-1k6HtZnNIOR';         // тот же токен, что в Code.gs
  const USER = 'Илья';                                  // твоё имя (у сменщика другое), видно в подсказке плашки
  const PULL_MS = 120000;                            // как часто тянуть изменения из таблицы (мс)
  // ======================

  const LS_KEY = 'tp_notes_v2';
  const CHIP_ATTR = 'data-tp-note';
  const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  const SYNC_ON = !/PASTE_/.test(SYNC_URL);
  const info = (...a) => console.log('[TP-notes]', ...a);
  const warn = (...a) => console.warn('[TP-notes]', ...a);

  info('v2.1.0 запущен, синхронизация:', SYNC_ON ? 'включена' : 'ВЫКЛЮЧЕНА (не указан SYNC_URL)');

  // ---------- storage ----------
  // notes[uuid] = {t, name, ts, by}; names[name] = uuid; dirty[uuid] = 1 (ещё не отправлено)
  let db = { notes: {}, names: {}, dirty: {} };
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) || localStorage.getItem('tp_notes_v1') || 'null');
    if (raw && raw.notes && raw.names) db = Object.assign(db, raw);
  } catch (e) {}
  for (const id in db.notes) {
    const n = db.notes[id];
    if (!n.ts) { n.ts = Date.now(); n.by = n.by || USER; db.dirty[id] = 1; }
  }
  let saveTimer = 0;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(LS_KEY, JSON.stringify(db)); } catch (e) {}
    }, 300);
  }

  function setNote(uuid, name, text) {
    text = (text || '').trim();
    const prev = db.notes[uuid];
    if (prev && prev.t === text) return false;
    if (!prev && !text) return false;
    db.notes[uuid] = { t: text, name: name || (prev && prev.name) || '', ts: Date.now(), by: USER };
    if (name) db.names[name] = uuid;
    db.dirty[uuid] = 1;
    persist();
    schedulePush(1500);
    return true;
  }

  // ---------- сеть (GM_xmlhttpRequest обходит ограничения CRM, fetch как запасной вариант) ----------
  function http(method, url, body) {
    return new Promise((resolve, reject) => {
      const parse = (txt) => { try { resolve(JSON.parse(txt)); } catch (e) { reject(new Error('не JSON: ' + String(txt).slice(0, 120))); } };
      if (typeof GM_xmlhttpRequest === 'function') {
        GM_xmlhttpRequest({
          method, url, data: body, timeout: 25000,
          headers: body ? { 'Content-Type': 'text/plain;charset=utf-8' } : {},
          onload: (r) => parse(r.responseText),
          onerror: () => reject(new Error('сетевая ошибка (проверь @connect / разрешение Tampermonkey)')),
          ontimeout: () => reject(new Error('таймаут'))
        });
      } else {
        fetch(url, { method, body, headers: body ? { 'Content-Type': 'text/plain;charset=utf-8' } : {} })
          .then(r => r.text()).then(parse).catch(reject);
      }
    });
  }

  // ---------- синхронизация с Google Таблицей ----------
  let pushing = false, pushTimer = 0, lastPull = 0;
  function schedulePush(delay) {
    if (!SYNC_ON) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, delay);
  }
  async function push() {
    const ids = Object.keys(db.dirty);
    if (!SYNC_ON || !ids.length || pushing) return;
    pushing = true;
    const items = ids.filter(id => db.notes[id]).map(id => {
      const n = db.notes[id];
      return { id, name: n.name, note: n.t, by: n.by, ts: n.ts };
    });
    try {
      const j = await http('POST', SYNC_URL, JSON.stringify({ token: TOKEN, items }));
      if (j.ok) {
        for (const it of items) if (db.notes[it.id] && db.notes[it.id].ts === it.ts) delete db.dirty[it.id];
        persist();
        info('отправлено заметок:', items.length);
      } else { warn('сервер отклонил запись:', j.error); schedulePush(30000); }
    } catch (e) { warn('ошибка отправки:', e.message); schedulePush(30000); }
    pushing = false;
  }
  async function pull() {
    if (!SYNC_ON) return;
    lastPull = Date.now();
    try {
      const j = await http('GET', SYNC_URL + '?token=' + encodeURIComponent(TOKEN));
      if (!j.ok) { warn('сервер отклонил чтение:', j.error); return; }
      let changed = false;
      for (const row of j.rows) {
        const id = String(row.id).toLowerCase();
        if (!UUID_RE.test(id)) continue;
        if (row.name && db.names[row.name] !== id) { db.names[row.name] = id; changed = true; }
        const loc = db.notes[id];
        if (loc && (loc.ts >= row.ts || db.dirty[id])) continue; // локальная версия новее
        if (!loc && !row.note) continue;
        db.notes[id] = { t: row.note || '', name: row.name, ts: row.ts, by: row.by };
        changed = true;
      }
      if (changed) { persist(); scheduleRender(); }
    } catch (e) { warn('ошибка чтения:', e.message); }
  }
  async function syncAll() { await push(); await pull(); }

  // ---------- читаем правую панель (открытый чат) ----------
  function readPanel() {
    const input = document.querySelector('input[placeholder="ID"]');
    if (!input) return null;
    let el = input.parentElement, h6 = null;
    for (let i = 0; i < 12 && el; i++, el = el.parentElement) {
      h6 = el.querySelector('h6');
      if (h6) break;
    }
    if (!el || !h6) return null;
    let uuid = null;
    for (const s of el.querySelectorAll('span')) {
      const m = /^ID:\s*([0-9a-f-]{36})/i.exec(s.textContent.trim());
      if (m) { uuid = m[1].toLowerCase(); break; }
    }
    if (!uuid) return null;
    return { input, uuid, name: h6.textContent.trim() };
  }

  // пока пользователь печатает: сохраняем сразу
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || t.placeholder !== 'ID') return;
    const p = readPanel();
    if (p && p.input === t && setNote(p.uuid, p.name, t.value)) scheduleRender();
  }, true);

  // при открытии чата значение может подгрузиться не сразу: сохраняем, когда оно устоялось
  let lastSeen = { uuid: null, val: null, n: 0 };
  function syncPanel() {
    const p = readPanel();
    if (!p) { lastSeen.uuid = null; return; }
    const v = p.input.value;
    if (lastSeen.uuid === p.uuid && lastSeen.val === v) lastSeen.n++;
    else lastSeen = { uuid: p.uuid, val: v, n: 1 };
    // по таймеру пишем только непустое значение; очистка поля обрабатывается событием input
    if (v && lastSeen.n === 2 && setNote(p.uuid, p.name, v)) scheduleRender();
  }

  // ---------- список чатов ----------
  const style = document.createElement('style');
  style.textContent = `
    [${CHIP_ATTR}] {
      flex: 0 5 auto; min-width: 0; max-width: 55%;
      font-size: 0.72rem; line-height: 1.5; font-weight: 600;
      padding: 0 7px; border-radius: 10px;
      background: rgba(255,214,102,0.16); color: #ffd666;
      border: 1px solid rgba(255,214,102,0.35);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }`;
  document.documentElement.appendChild(style);

  const findItems = () => document.querySelectorAll('div[data-index][style*="position"]');

  function noteFor(name) {
    const u = db.names[name];
    return u && db.notes[u] && db.notes[u].t ? db.notes[u] : null;
  }

  function render() {
    for (const item of findItems()) {
      const nameP = item.querySelector('p');
      if (!nameP) continue;
      const row = nameP.parentElement; // flex-контейнер с именем и точкой статуса
      const name = (nameP.firstChild ? nameP.firstChild.textContent : nameP.textContent).trim();
      const note = noteFor(name);
      let chip = row.querySelector(':scope > [' + CHIP_ATTR + ']');
      if (!note) { if (chip) chip.remove(); continue; }
      if (!chip) {
        chip = document.createElement('span');
        chip.setAttribute(CHIP_ATTR, '');
        row.appendChild(chip);
      }
      if (chip.textContent !== note.t) chip.textContent = note.t;
      const title = note.t + (note.by ? '\n— ' + note.by : '');
      if (chip.title !== title) chip.title = title;
    }
  }

  // перерисовка не чаще, чем раз в 400 мс
  let renderTimer = 0;
  function scheduleRender() {
    if (renderTimer) return;
    renderTimer = setTimeout(() => { renderTimer = 0; render(); }, 400);
  }

  // следим только за контейнером списка чатов, а не за всей страницей
  let observed = null;
  const observer = new MutationObserver((muts) => {
    for (const m of muts) {
      const nodes = [...m.addedNodes, ...m.removedNodes];
      if (nodes.length && nodes.every(n => n.nodeType === 1 && n.hasAttribute(CHIP_ATTR))) continue; // наши же плашки
      scheduleRender();
      return;
    }
  });
  function attachObserver() {
    const first = findItems()[0];
    const root = first && first.parentElement;
    if (root && root !== observed) {
      observer.disconnect();
      observer.observe(root, { childList: true, subtree: true, characterData: true });
      observed = root;
      scheduleRender();
    }
  }

  // ---------- запуск ----------
  setInterval(syncPanel, 800);
  setInterval(attachObserver, 3000);
  setInterval(() => { if (!document.hidden) syncAll(); }, PULL_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Date.now() - lastPull > 30000) syncAll();
  });
  attachObserver();
  syncAll();
  render();
})();
