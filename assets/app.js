/* Agenda de Salas – SIAL Paris 2026
   Site estático: os dados ficam salvos no navegador deste aparelho (localStorage).
   Use "Backup" / "Restaurar" para levar a agenda a outro aparelho. */
(() => {
  'use strict';

  // ---------- Configuração ----------
  const EVENT_DAYS = ['2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21'];
  const DAY_START = 8 * 60;   // 08:00 em minutos
  const DAY_END = 20 * 60;    // 20:00
  const SLOT = 30;            // grade visual (min)
  const SNAP = 15;            // passo de arraste e seleção (min)
  const DEFAULT_DURATION = 60;
  const LONG_PRESS_MS = 350;
  const STORAGE_KEY = 'sial2026-meetings-v1';
  const ROOMS = { 1: 'JBS 1', 2: 'JBS 2' };
  const DEFAULT_BUS = ['Friboi', 'Seara', 'Swift', 'JBS Leather', 'JBS New Business', 'Pilgrim\'s', 'JBS USA', 'JBS Australia', 'Prepared Foods', 'Friboi International'];
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // ---------- Estado ----------
  let meetings, selectedDay, roomFilter = 'all', listMode = false;

  // ---------- Utilitários ----------
  const $ = (sel) => document.querySelector(sel);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const pad = (n) => String(n).padStart(2, '0');
  const fmtTime = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const fmtDate = (iso) => { const d = new Date(iso + 'T12:00:00'); return `${DOW[d.getDay()]}, Oct ${d.getDate()}`; };
  const fmtDateLong = (iso) => { const d = new Date(iso + 'T12:00:00'); return `${DOW_LONG[d.getDay()]}, October ${d.getDate()}`; };
  const hourPx = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hour'));
  const minToPx = (m) => (m - DAY_START) / 60 * hourPx();
  const pxToMin = (px) => DAY_START + px / hourPx() * 60;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function pickInitialDay() {
    const t = todayIso();
    return EVENT_DAYS.includes(t) ? t : EVENT_DAYS[0];
  }
  // ---------- Camada de dados ----------
  // Supabase quando configurado em assets/config.js; senão, localStorage deste aparelho.
  const cfg = window.SIAL_CONFIG || {};
  const sb = (cfg.supabaseUrl && cfg.supabaseKey && window.supabase)
    ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey) : null;
  const toRow = (m) => ({ id: m.id, room: m.room, date: m.date, start_min: m.start, end_min: m.end, name: m.name, people: m.people, bu: m.bu, company: m.company, updated_at: new Date().toISOString() });
  const fromRow = (r) => ({ id: r.id, room: Number(r.room), date: r.date, start: Number(r.start_min), end: Number(r.end_min), name: r.name, people: Number(r.people), bu: r.bu || '', company: r.company || '' });
  function setSync(state, text) { const el = $('#syncStatus'); if (!el) return; el.className = 'sync ' + state; el.textContent = '● ' + text; }

  const localStore = {
    async load() { try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : []; } catch { return []; } },
    async upsert(m) { localStorage.setItem(STORAGE_KEY, JSON.stringify(meetings)); return m; },
    async remove() { localStorage.setItem(STORAGE_KEY, JSON.stringify(meetings)); },
    async replaceAll(list) { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); },
    subscribe() {},
  };
  const remoteStore = {
    async load() {
      const { data, error } = await sb.from('meetings').select('*');
      if (error) throw error;
      setSync('ok', 'synced'); return data.map(fromRow);
    },
    async upsert(m) {
      const { error } = await sb.from('meetings').upsert(toRow(m));
      if (error) throw error; return m;
    },
    async remove(id) {
      const { error } = await sb.from('meetings').delete().eq('id', id);
      if (error) throw error;
    },
    async replaceAll(list) {
      const { error: e1 } = await sb.from('meetings').delete().neq('id', '');
      if (e1) throw e1;
      if (list.length) { const { error: e2 } = await sb.from('meetings').insert(list.map(toRow)); if (e2) throw e2; }
    },
    subscribe(onChange) {
      sb.channel('meetings-live').on('postgres_changes', { event: '*', schema: 'public', table: 'meetings' }, onChange)
        .subscribe((status) => { if (status === 'SUBSCRIBED') setSync('ok', 'synced · live'); });
      setInterval(onChange, 30 * 1000); // rede de segurança caso o tempo real caia
    },
  };
  const store = sb ? remoteStore : localStore;

  async function refresh() {
    try { meetings = await store.load(); render(); }
    catch (e) { console.error(e); setSync('err', 'offline'); toast('Could not load the schedule. Check your connection.'); }
  }
  function friendlyError(e) {
    const msg = String(e && (e.message || e)) || '';
    if (/meetings_no_overlap|exclusion/i.test(msg)) return 'That slot was just booked from another device.';
    return 'Could not save. Check your connection and try again.';
  }
  function conflict(m) {
    return meetings.find((o) => o.id !== m.id && o.room === m.room && o.date === m.date && o.start < m.end && m.start < o.end);
  }
  function isPast(m) {
    const t = todayIso();
    return m.date < t || (m.date === t && m.end <= nowMin());
  }
  let toastTimer;
  function toast(msg) {
    const el = $('#toast'); el.textContent = msg; el.classList.remove('hidden');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.add('hidden'), 2400);
  }

  meetings = [];
  selectedDay = pickInitialDay();

  // ---------- Render ----------
  function renderDayTabs() {
    const t = todayIso();
    $('#dayTabs').innerHTML = EVENT_DAYS.map((d) => {
      const dt = new Date(d + 'T12:00:00');
      const n = meetings.filter((m) => m.date === d).length;
      return `<button class="day-tab ${d === selectedDay ? 'is-active' : ''} ${d === t ? 'is-today' : ''}" data-day="${d}">
        <span class="dow">${DOW[dt.getDay()]}</span><span class="dom">${dt.getDate()}</span>
        ${n ? `<span class="dow">${n} mtg${n > 1 ? 's' : ''}</span>` : ''}</button>`;
    }).join('');
  }

  function visibleRooms() { return roomFilter === 'all' ? [1, 2] : [Number(roomFilter)]; }

  function renderCalendar() {
    const rooms = visibleRooms();
    const one = rooms.length === 1;
    const header = $('#calHeader'); const grid = $('#calGrid');
    header.classList.toggle('one-room', one); grid.classList.toggle('one-room', one);

    header.innerHTML = '<div></div>' + rooms.map((r) => {
      const n = meetings.filter((m) => m.date === selectedDay && m.room === r).length;
      return `<div class="room-head r${r}">${ROOMS[r]}<small>${n ? `${n} meeting${n > 1 ? 's' : ''}` : 'free all day'}</small></div>`;
    }).join('');

    let timeCol = '<div class="time-col">';
    for (let m = DAY_START; m <= DAY_END; m += 60) timeCol += `<div class="time-label" style="top:${minToPx(m)}px">${fmtTime(m)}</div>`;
    timeCol += '</div>';

    const cols = rooms.map((r) => {
      let html = `<div class="room-col r${r}" data-room="${r}">`;
      for (let m = DAY_START; m < DAY_END; m += SLOT) {
        html += `<div class="slot ${m % 60 ? 'half' : ''}" data-min="${m}" style="top:${minToPx(m)}px;height:${minToPx(m + SLOT) - minToPx(m)}px"></div>`;
      }
      html += `<div class="slot" style="top:${minToPx(DAY_END)}px;height:0"></div>`;
      meetings.filter((mt) => mt.date === selectedDay && mt.room === r).sort((a, b) => a.start - b.start).forEach((mt) => {
        const h = minToPx(mt.end) - minToPx(mt.start);
        html += `<div class="event r${r} ${h < 46 ? 'short' : ''} ${isPast(mt) ? 'past' : ''}" data-id="${mt.id}" style="top:${minToPx(mt.start)}px;height:${h - 3}px">
          <span class="ev-time">${fmtTime(mt.start)} – ${fmtTime(mt.end)}</span>
          <span class="ev-name">${esc(mt.name)}</span>
          <span class="ev-meta">${esc(mt.bu)} · ${mt.people} ${mt.people > 1 ? 'people' : 'person'}${mt.company ? ' · ' + esc(mt.company) : ''}</span>
        </div>`;
      });
      return html + '</div>';
    }).join('');

    let nowLine = '';
    if (selectedDay === todayIso()) {
      const n = nowMin();
      if (n >= DAY_START && n <= DAY_END) nowLine = `<div class="now-line" style="top:${minToPx(n)}px"></div>`;
    }
    grid.innerHTML = timeCol + cols + nowLine;
  }

  function renderList() {
    const rooms = visibleRooms();
    const items = meetings.filter((m) => m.date === selectedDay && rooms.includes(m.room)).sort((a, b) => a.start - b.start || a.room - b.room);
    $('#listView').innerHTML = `<div class="list-day-title">${fmtDateLong(selectedDay)}</div>` +
      (items.length ? items.map((m) => `
        <div class="list-item r${m.room} ${isPast(m) ? 'past' : ''}" data-id="${m.id}">
          <div class="li-time">${fmtTime(m.start)}<small>to ${fmtTime(m.end)}</small></div>
          <div><div class="li-name">${esc(m.name)}</div>
            <div class="li-meta">${esc(m.bu)} · ${m.people} ${m.people > 1 ? 'people' : 'person'}${m.company ? ' · with ' + esc(m.company) : ''}</div></div>
          <span class="li-room">${ROOMS[m.room]}</span>
        </div>`).join('') : '<div class="list-empty">No meetings on this day.</div>');
  }

  function render() {
    renderDayTabs();
    $('#calendar').classList.toggle('hidden', listMode);
    $('#listView').classList.toggle('hidden', !listMode);
    $('#btnList').querySelector('.ico').textContent = listMode ? '▦' : '☰';
    $('#btnList').querySelector('.long').textContent = listMode ? ' Grid' : ' List';
    if (listMode) renderList(); else renderCalendar();
  }

  // ---------- Formulário ----------
  const form = $('#form');
  function fillTimeSelects() {
    let opts = '';
    for (let m = DAY_START; m <= DAY_END; m += SNAP) opts += `<option value="${m}">${fmtTime(m)}</option>`;
    $('#fStart').innerHTML = opts; $('#fEnd').innerHTML = opts;
    $('#fDate').innerHTML = EVENT_DAYS.map((d) => `<option value="${d}">${fmtDate(d)}</option>`).join('');
  }
  function fillBuList() {
    const set = new Set([...meetings.map((m) => m.bu).filter(Boolean), ...DEFAULT_BUS]);
    $('#buList').innerHTML = [...set].sort().map((b) => `<option value="${esc(b)}">`).join('');
  }
  function setRoom(r) {
    $('#fRoom').value = r;
    $('#fRoomSeg').querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', b.dataset.room == r));
  }
  function openForm(data) {
    fillBuList();
    const editing = !!data.id;
    $('#modalTitle').textContent = editing ? 'Edit meeting' : 'Add meeting';
    $('#btnDelete').classList.toggle('hidden', !editing);
    $('#fId').value = data.id || '';
    setRoom(data.room || 1);
    $('#fName').value = data.name || '';
    $('#fPeople').value = data.people || 2;
    $('#fBu').value = data.bu || '';
    $('#fCompany').value = data.company || '';
    $('#fDate').value = data.date || selectedDay;
    const start = clamp(data.start ?? DAY_START + 60, DAY_START, DAY_END - SNAP);
    $('#fStart').value = start;
    $('#fEnd').value = clamp(data.end ?? start + DEFAULT_DURATION, start + SNAP, DAY_END);
    $('#formError').classList.add('hidden');
    $('#modal').classList.remove('hidden');
    if (!editing) setTimeout(() => $('#fName').focus(), 50);
  }
  function closeForm() { $('#modal').classList.add('hidden'); }
  function showError(msg) { const e = $('#formError'); e.textContent = msg; e.classList.remove('hidden'); }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const m = {
      id: $('#fId').value || uid(),
      room: Number($('#fRoom').value),
      name: $('#fName').value.trim(),
      people: clamp(parseInt($('#fPeople').value, 10) || 1, 1, 99),
      bu: $('#fBu').value.trim(),
      company: $('#fCompany').value.trim(),
      date: $('#fDate').value,
      start: Number($('#fStart').value),
      end: Number($('#fEnd').value),
    };
    if (!m.name) return showError('Please enter the person\'s name.');
    if (!m.bu) return showError('Please enter the Business Unit.');
    if (m.end <= m.start) return showError('End time must be after start time.');
    const c = conflict(m);
    if (c) return showError(`Conflict: ${ROOMS[m.room]} already has "${c.name}" from ${fmtTime(c.start)} to ${fmtTime(c.end)}.`);
    const idx = meetings.findIndex((o) => o.id === m.id);
    const prev = meetings.slice();
    if (idx >= 0) meetings[idx] = m; else meetings.push(m);
    $('#btnSave').disabled = true;
    try {
      await store.upsert(m);
      selectedDay = m.date; closeForm(); render();
      toast(idx >= 0 ? 'Meeting updated' : 'Meeting added');
      if (sb) refresh();
    } catch (e) { console.error(e); meetings = prev; showError(friendlyError(e)); }
    finally { $('#btnSave').disabled = false; }
  });

  $('#btnDelete').addEventListener('click', async () => {
    const id = $('#fId').value; const m = meetings.find((o) => o.id === id);
    if (!m) return;
    if (!confirm(`Delete ${m.name}'s meeting (${fmtTime(m.start)}–${fmtTime(m.end)})?`)) return;
    const prev = meetings.slice();
    meetings = meetings.filter((o) => o.id !== id);
    try { await store.remove(id); closeForm(); render(); toast('Meeting deleted'); }
    catch (e) { console.error(e); meetings = prev; showError(friendlyError(e)); }
  });
  $('#btnClose').addEventListener('click', closeForm);
  $('#btnCancel').addEventListener('click', closeForm);
  $('#modal').addEventListener('click', (e) => { if (e.target === $('#modal')) closeForm(); });
  $('#fRoomSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setRoom(b.dataset.room); });
  $('#fPeopleMinus').addEventListener('click', () => { const i = $('#fPeople'); i.value = Math.max(1, (parseInt(i.value, 10) || 1) - 1); });
  $('#fPeoplePlus').addEventListener('click', () => { const i = $('#fPeople'); i.value = Math.min(99, (parseInt(i.value, 10) || 0) + 1); });
  $('#fStart').addEventListener('change', () => {
    const s = Number($('#fStart').value), e = Number($('#fEnd').value);
    if (e <= s) $('#fEnd').value = Math.min(DAY_END, s + DEFAULT_DURATION);
  });

  // ---------- Navegação ----------
  $('#dayTabs').addEventListener('click', (e) => { const b = e.target.closest('.day-tab'); if (b) { selectedDay = b.dataset.day; render(); } });
  $('#roomFilter').addEventListener('click', (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    roomFilter = b.dataset.room;
    $('#roomFilter').querySelectorAll('.chip').forEach((c) => c.classList.toggle('is-active', c === b));
    render();
  });
  $('#btnList').addEventListener('click', () => { listMode = !listMode; render(); });
  $('#btnAdd').addEventListener('click', () => openForm({ room: roomFilter === 'all' ? 1 : Number(roomFilter), date: selectedDay }));
  $('#listView').addEventListener('click', (e) => {
    const it = e.target.closest('.list-item'); if (!it) return;
    const m = meetings.find((o) => o.id === it.dataset.id); if (m) openForm({ ...m });
  });

  // ---------- Toque na grade / arrastar ----------
  const grid = $('#calGrid');
  let drag = null; // { el, m, timer, startX, startY, lifted, offsetY, moved }

  grid.addEventListener('click', (e) => {
    if (drag && drag.moved) return;
    const slot = e.target.closest('.slot');
    if (slot && !e.target.closest('.event')) {
      const room = Number(slot.closest('.room-col').dataset.room);
      const start = Number(slot.dataset.min);
      if (start >= DAY_END) return;
      openForm({ room, date: selectedDay, start, end: Math.min(DAY_END, start + DEFAULT_DURATION) });
      return;
    }
    const ev = e.target.closest('.event');
    if (ev) { const m = meetings.find((o) => o.id === ev.dataset.id); if (m) openForm({ ...m }); }
  });

  grid.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.event'); if (!el) return;
    const m = meetings.find((o) => o.id === el.dataset.id); if (!m) return;
    drag = { el, m, startX: e.clientX, startY: e.clientY, lifted: false, moved: false, pointerId: e.pointerId };
    drag.offsetY = e.clientY - el.getBoundingClientRect().top;
    drag.timer = setTimeout(() => {
      if (!drag) return;
      drag.lifted = true; el.classList.add('is-lifted');
      try { el.setPointerCapture(e.pointerId); } catch {}
      if (navigator.vibrate) navigator.vibrate(15);
      el.style.touchAction = 'none';
    }, LONG_PRESS_MS);
  });

  grid.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.startX, dy = e.clientY - drag.startY;
    if (!drag.lifted) {
      if (Math.hypot(dx, dy) > 8) { clearTimeout(drag.timer); drag = null; } // virou rolagem/tap longo cancelado
      return;
    }
    e.preventDefault();
    drag.moved = true;
    drag.el.classList.add('is-dragging');
    const target = computeDrop(e.clientX, e.clientY);
    if (!target) return;
    drag.target = target;
    const col = grid.querySelector(`.room-col[data-room="${target.room}"]`);
    if (drag.el.parentElement !== col) col.appendChild(drag.el);
    drag.el.className = drag.el.className.replace(/\br[12]\b/, `r${target.room}`);
    drag.el.style.top = `${minToPx(target.start)}px`;
    drag.el.querySelector('.ev-time').textContent = `${fmtTime(target.start)} – ${fmtTime(target.start + (drag.m.end - drag.m.start))}`;
  });

  function computeDrop(clientX, clientY) {
    const cols = [...grid.querySelectorAll('.room-col')];
    let col = cols.find((c) => { const r = c.getBoundingClientRect(); return clientX >= r.left && clientX <= r.right; });
    if (!col) col = drag.el.closest('.room-col') || cols[0];
    const rect = col.getBoundingClientRect();
    const dur = drag.m.end - drag.m.start;
    let start = pxToMin(clientY - drag.offsetY - rect.top);
    start = Math.round(start / SNAP) * SNAP;
    start = clamp(start, DAY_START, DAY_END - dur);
    return { room: Number(col.dataset.room), start };
  }

  function endDrag(e) {
    if (!drag) return;
    clearTimeout(drag.timer);
    const d = drag; drag = null;
    d.el.classList.remove('is-lifted', 'is-dragging'); d.el.style.touchAction = '';
    if (!d.lifted) return;
    // depois de um toque longo, o clique residual não deve abrir o formulário
    drag = { moved: true }; setTimeout(() => { if (drag && !drag.el) drag = null; }, 0);
    if (!d.moved || !d.target || (d.target.room === d.m.room && d.target.start === d.m.start)) { render(); return; }
    const moved = { ...d.m, room: d.target.room, start: d.target.start, end: d.target.start + (d.m.end - d.m.start) };
    const c = conflict(moved);
    if (c) { render(); toast(`Slot in ${ROOMS[moved.room]} is taken by ${c.name}`); return; }
    $('#confirmText').innerHTML = `<b style="color:inherit">${esc(d.m.name)}</b> will move to <strong>${ROOMS[moved.room]}</strong>, ${fmtTime(moved.start)} – ${fmtTime(moved.end)}.`;
    $('#confirmModal').classList.remove('hidden');
    $('#confirmYes').onclick = async () => {
      const idx = meetings.findIndex((o) => o.id === moved.id); const prev = meetings[idx];
      meetings[idx] = moved;
      $('#confirmModal').classList.add('hidden');
      try { await store.upsert(moved); render(); toast('Meeting moved'); if (sb) refresh(); }
      catch (e) { console.error(e); meetings[idx] = prev; render(); toast(friendlyError(e)); }
    };
    $('#confirmNo').onclick = () => { $('#confirmModal').classList.add('hidden'); render(); };
  }
  grid.addEventListener('pointerup', endDrag);
  grid.addEventListener('pointercancel', endDrag);
  grid.addEventListener('contextmenu', (e) => { if (e.target.closest('.event')) e.preventDefault(); });

  // ---------- Backup / restauração ----------
  $('#btnExport').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(meetings, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `sial-schedule-${todayIso()}.json`; a.click(); URL.revokeObjectURL(a.href);
  });
  $('#fileImport').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!Array.isArray(data)) throw new Error();
      if (!confirm(`Replace the current schedule with ${data.length} meeting(s) from this file?`)) return;
      const list = data.filter((m) => m && m.id && ROOMS[m.room] && EVENT_DAYS.includes(m.date));
      await store.replaceAll(list); meetings = list; render(); toast('Schedule restored');
      if (sb) refresh();
    } catch (err) { console.error(err); toast('Invalid file or upload failed'); }
    e.target.value = '';
  });

  // ---------- Início ----------
  if (window.innerWidth < 600) {
    roomFilter = '1';
    $('#roomFilter').querySelectorAll('.chip').forEach((c) => c.classList.toggle('is-active', c.dataset.room === '1'));
  }
  fillTimeSelects();
  render();
  // rola para o horário atual (ou 8h) e atualiza a linha "agora"
  const scrollTo = selectedDay === todayIso() ? clamp(nowMin() - 60, DAY_START, DAY_END) : DAY_START;
  $('#calScroll').scrollTop = minToPx(scrollTo);
  setInterval(() => { if (!listMode && !drag) renderCalendar(); }, 60 * 1000);

  if (sb) setSync('', 'connecting…'); else setSync('', 'this device only');
  refresh().then(() => store.subscribe(() => { if (!drag && $('#modal').classList.contains('hidden')) refresh(); }));
  window.addEventListener('focus', () => { if (sb) refresh(); });
})();
