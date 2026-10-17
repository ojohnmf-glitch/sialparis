/* Room Scheduler – SIAL Paris 2026
   Site estático. Dados no Supabase quando assets/config.js está preenchido
   (compartilhado entre aparelhos, em tempo real); senão, no localStorage deste aparelho. */
(() => {
  'use strict';

  // ---------- Configuração ----------
  const EVENT_DAYS = ['2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21'];
  const DAY_START = 8 * 60;   // 08:00 em minutos
  const DAY_END = 20 * 60;    // 20:00
  const SLOT = 30;            // grade visual (min)
  const SNAP = 15;            // passo de arraste e seleção (min)
  const DEFAULT_DURATION = 30;   // toque curto num horário livre
  const LONG_PRESS_MS = 350;
  const STORAGE_KEY = 'sial2026-meetings-v1';
  const ROOMS = { 1: 'JBS 1', 2: 'JBS 2' };
  const DEFAULT_BUS = ['FRIBOI', 'JBS', 'JBS CANADA', 'JBS GLOBAL UK', 'JBS TOLEDO', 'JBS USA BEEF', 'JBS USA PORK', 'PILGRIM\'S', 'PILGRIM\'S US', 'SEARA'];
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // ---------- Estado ----------
  let meetings, selectedDay, roomFilter = 'all', listMode = false;

  // ---------- Utilitários ----------
  const $ = (sel) => document.querySelector(sel);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const pad = (n) => String(n).padStart(2, '0');
  const fmtTime = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const fmtDate = (iso) => { const d = new Date(iso + 'T12:00:00'); return `${DOW[d.getDay()]}, ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`; };
  const fmtDateLong = (iso) => { const d = new Date(iso + 'T12:00:00'); return `${DOW_LONG[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`; };
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
  let live = false, wasOffline = false;
  function setSync(state, text) { const el = $('#syncStatus'); el.className = 'sync ' + state; el.querySelector('.sync-text').textContent = text; }

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
      setSync('ok', live ? 'synced · live' : 'synced'); return data.map(fromRow);
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
        .subscribe((status) => { live = status === 'SUBSCRIBED'; if (live) setSync('ok', 'synced · live'); });
      setInterval(onChange, 30 * 1000); // rede de segurança caso o tempo real caia
    },
  };
  const store = sb ? remoteStore : localStore;

  async function refresh() {
    try {
      meetings = await store.load(); render();
      if (wasOffline) { wasOffline = false; toast('Back online'); }
    } catch (e) {
      console.error(e); setSync('err', 'offline');
      if (!wasOffline) toast('Could not load the schedule. Check the Wi-Fi.');
      wasOffline = true;
    }
  }
  function friendlyError(e) {
    const msg = String(e && (e.message || e)) || '';
    if ((e && e.code === '23P01') || /meetings_no_overlap|exclusion/i.test(msg)) return 'That slot was just booked from another device.';
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
        <span class="dow">${n ? `${n} mtg${n > 1 ? 's' : ''}` : 'free'}</span></button>`;
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
        html += `<div class="event r${r} ${h < 46 ? 'short' : ''} ${isPast(mt) ? 'past' : ''}" data-id="${esc(mt.id)}" style="top:${minToPx(mt.start)}px;height:${h - 3}px">
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
        <div class="list-item r${m.room} ${isPast(m) ? 'past' : ''}" data-id="${esc(m.id)}">
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
  const timeOptions = (from, to) => { let o = ''; for (let m = from; m <= to; m += SNAP) o += `<option value="${m}">${fmtTime(m)}</option>`; return o; };
  let formStart = DAY_START; // início atual do formulário, para manter a duração ao trocá-lo
  function setTimes(start, end) {
    start = clamp(Math.round(start / SNAP) * SNAP, DAY_START, DAY_END - SNAP);
    formStart = start;
    end = clamp(Math.round(end / SNAP) * SNAP, start + SNAP, DAY_END);
    $('#fStart').innerHTML = timeOptions(DAY_START, DAY_END - SNAP); $('#fStart').value = start;
    $('#fEnd').innerHTML = timeOptions(start + SNAP, DAY_END); $('#fEnd').value = end;   // só horários válidos
  }
  function fillBuList(extra) {
    const list = extra && !DEFAULT_BUS.includes(extra) ? [...DEFAULT_BUS, extra] : DEFAULT_BUS;
    $('#fBu').innerHTML = '<option value="">Select…</option>' + list.map((b) => `<option value="${esc(b)}">${esc(b)}</option>`).join('');
  }
  $('#fDate').innerHTML = EVENT_DAYS.map((d) => `<option value="${d}">${fmtDate(d)}</option>`).join('');
  function setRoom(r) {
    $('#fRoom').value = r;
    $('#fRoomSeg').querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', b.dataset.room == r));
  }
  function openForm(data) {
    fillBuList(data.bu);
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
    const start = data.start ?? DAY_START + 60;
    setTimes(start, data.end ?? start + DEFAULT_DURATION);
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
    if (!m.name) return showError('Please enter the name of the person the meeting is for.');
    if (!m.bu) return showError('Please enter the Business Unit.');
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
  $('#fRoomSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setRoom(b.dataset.room); });
  $('#fPeopleMinus').addEventListener('click', () => { const i = $('#fPeople'); i.value = Math.max(1, (parseInt(i.value, 10) || 1) - 1); });
  $('#fPeoplePlus').addEventListener('click', () => { const i = $('#fPeople'); i.value = Math.min(99, (parseInt(i.value, 10) || 0) + 1); });
  $('#fStart').addEventListener('change', () => {
    const s = Number($('#fStart').value), dur = Number($('#fEnd').value) - formStart;
    setTimes(s, s + (dur > 0 ? dur : DEFAULT_DURATION));
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeForm(); $('#confirmModal').classList.add('hidden'); } });

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

  // ---------- Toque na grade: criar arrastando / mover ----------
  // Toque curto num horário livre: reunião de 30 min. Segurar e arrastar: define a duração.
  // Segurar e arrastar uma reunião: move. Com mouse não precisa segurar, basta arrastar.
  const grid = $('#calGrid');
  const calScroll = $('#calScroll');
  let drag = null;
  let suppressNextClick = false; // após um arraste, o clique residual não deve abrir o formulário
  const fmtDur = (min) => (min % 60 ? (min > 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`) : `${min / 60} h`);

  grid.addEventListener('click', (e) => {
    if (suppressNextClick) { suppressNextClick = false; return; }
    const ev = e.target.closest('.event');
    if (ev) { const m = meetings.find((o) => o.id === ev.dataset.id); if (m) openForm({ ...m }); return; }
    const slot = e.target.closest('.slot'); if (!slot) return;
    const start = Number(slot.dataset.min); if (start >= DAY_END) return;
    openForm({ room: Number(slot.closest('.room-col').dataset.room), date: selectedDay, start, end: Math.min(DAY_END, start + DEFAULT_DURATION) });
  });

  grid.addEventListener('pointerdown', (e) => {
    suppressNextClick = false;
    if (drag || e.button > 0) return;
    const el = e.target.closest('.event');
    const slot = el ? null : e.target.closest('.slot');
    if (!el && !slot) return;
    const col = (el || slot).closest('.room-col');
    drag = { col, room: Number(col.dataset.room), startX: e.clientX, startY: e.clientY, lifted: false, moved: false };
    if (el) {
      const m = meetings.find((o) => o.id === el.dataset.id); if (!m) { drag = null; return; }
      Object.assign(drag, { mode: 'move', el, m, offsetY: e.clientY - el.getBoundingClientRect().top });
    } else {
      const anchor = Number(slot.dataset.min); if (anchor >= DAY_END) { drag = null; return; }
      Object.assign(drag, { mode: 'create', anchor, start: anchor, end: Math.min(DAY_END, anchor + DEFAULT_DURATION) });
    }
    drag.lift = () => {
      if (!drag || drag.lifted) return;
      drag.lifted = true; clearTimeout(drag.timer);
      if (drag.mode === 'move') { drag.el.classList.add('is-lifted'); drag.el.style.touchAction = 'none'; }
      else {
        drag.el = document.createElement('div');
        drag.el.className = `event r${drag.room} is-new`;
        drag.el.innerHTML = '<span class="ev-time"></span><span class="ev-name">New meeting</span>';
        col.appendChild(drag.el); paintCreate();
      }
      try { col.setPointerCapture(e.pointerId); } catch {}
      if (navigator.vibrate) navigator.vibrate(15);
    };
    if (e.pointerType === 'mouse') drag.liftOnMove = true;     // mouse: arrasta direto
    else drag.timer = setTimeout(drag.lift, LONG_PRESS_MS);     // dedo: segurar para não confundir com rolagem
  });

  function paintCreate() {
    const d = drag; const h = minToPx(d.end) - minToPx(d.start);
    d.el.style.top = `${minToPx(d.start)}px`; d.el.style.height = `${h - 3}px`;
    d.el.classList.toggle('short', h < 46);
    d.el.querySelector('.ev-time').textContent = `${fmtTime(d.start)} – ${fmtTime(d.end)} · ${fmtDur(d.end - d.start)}`;
  }

  grid.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.lifted) {
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 8) {
        if (drag.liftOnMove) drag.lift(); else { clearTimeout(drag.timer); drag = null; } // dedo deslizou: é rolagem
      }
      return;
    }
    e.preventDefault();
    drag.moved = true;
    // rola a grade quando o dedo chega perto da borda de cima ou de baixo
    const sr = calScroll.getBoundingClientRect();
    if (e.clientY < sr.top + 60) calScroll.scrollTop -= 12;
    else if (e.clientY > sr.bottom - 60) calScroll.scrollTop += 12;

    if (drag.mode === 'create') {
      const pm = pxToMin(e.clientY - drag.col.getBoundingClientRect().top);
      if (pm >= drag.anchor) { drag.start = drag.anchor; drag.end = clamp(Math.round(pm / SNAP) * SNAP, drag.anchor + SLOT, DAY_END); }
      else { drag.end = Math.min(DAY_END, drag.anchor + SLOT); drag.start = clamp(Math.round(pm / SNAP) * SNAP, DAY_START, drag.anchor); }
      paintCreate();
      return;
    }
    drag.el.classList.add('is-dragging');
    const target = computeDrop(e.clientX, e.clientY);
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

  function endDrag() {
    if (!drag) return;
    clearTimeout(drag.timer);
    const d = drag; drag = null;
    if (!d.lifted) return; // toque curto: o evento "click" cuida
    suppressNextClick = true;
    if (d.mode === 'create') {
      d.el.remove();
      openForm({ room: d.room, date: selectedDay, start: d.start, end: d.end });
      return;
    }
    d.el.classList.remove('is-lifted', 'is-dragging'); d.el.style.touchAction = '';
    if (!d.moved || !d.target || (d.target.room === d.m.room && d.target.start === d.m.start)) { render(); return; }
    const moved = { ...d.m, room: d.target.room, start: d.target.start, end: d.target.start + (d.m.end - d.m.start) };
    const c = conflict(moved);
    if (c) { render(); toast(`Slot in ${ROOMS[moved.room]} is taken by ${c.name}`); return; }
    $('#confirmText').innerHTML = `<strong>${esc(d.m.name)}</strong> will move to <strong>${ROOMS[moved.room]}</strong>, ${fmtTime(moved.start)} – ${fmtTime(moved.end)}.`;
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
  // no touch, impede a rolagem da página só depois que a reunião foi "levantada"
  grid.addEventListener('touchmove', (e) => { if (drag && drag.lifted) e.preventDefault(); }, { passive: false });
  grid.addEventListener('contextmenu', (e) => { if (e.target.closest('.event, .slot')) e.preventDefault(); });

  // ---------- Backup / restauração (só com ?admin no endereço, para ninguém clicar por engano) ----------
  if (new URLSearchParams(location.search).has('admin')) $('#adminTools').classList.remove('hidden');
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
      const scope = sb ? ' on ALL devices' : '';
      if (!confirm(`Replace the current schedule${scope} with ${data.length} meeting(s) from this file?`)) return;
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
  render();
  // rola para o horário atual (ou 8h) e atualiza a linha "agora"
  const scrollTo = selectedDay === todayIso() ? clamp(nowMin() - 60, DAY_START, DAY_END) : DAY_START;
  $('#calScroll').scrollTop = minToPx(scrollTo);
  setInterval(() => { if (!listMode && !drag) renderCalendar(); }, 60 * 1000);

  if (sb) setSync('', 'connecting…'); else setSync('', 'this device only');
  refresh().then(() => store.subscribe(() => { if (!drag && $('#modal').classList.contains('hidden')) refresh(); }));
  // ao voltar para o app (trocar de aba, destravar o tablet), recarrega
  document.addEventListener('visibilitychange', () => { if (sb && document.visibilityState === 'visible' && !drag) refresh(); });
})();
