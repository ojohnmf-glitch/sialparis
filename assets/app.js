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
  const DEFAULT_BUS = ['Friboi', 'Seara', 'Swift', 'JBS Couros', 'JBS Novos Negócios', 'Pilgrim\'s', 'JBS USA', 'JBS Austrália', 'Alimentos Preparados', 'Friboi Internacional'];
  const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  // ---------- Estado ----------
  let meetings, selectedDay, roomFilter = 'all', listMode = false;

  // ---------- Utilitários ----------
  const $ = (sel) => document.querySelector(sel);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const pad = (n) => String(n).padStart(2, '0');
  const fmtTime = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const fmtDate = (iso) => { const d = new Date(iso + 'T12:00:00'); return `${DOW[d.getDay()]} ${d.getDate()}/${pad(d.getMonth() + 1)}`; };
  const fmtDateLong = (iso) => { const d = new Date(iso + 'T12:00:00'); return `${['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'][d.getDay()]}, ${d.getDate()} de outubro`; };
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
  function load() {
    try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : []; } catch { return []; }
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(meetings)); }
    catch { toast('Não foi possível salvar neste navegador.'); }
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

  meetings = load();
  selectedDay = pickInitialDay();

  // ---------- Render ----------
  function renderDayTabs() {
    const t = todayIso();
    $('#dayTabs').innerHTML = EVENT_DAYS.map((d) => {
      const dt = new Date(d + 'T12:00:00');
      const n = meetings.filter((m) => m.date === d).length;
      return `<button class="day-tab ${d === selectedDay ? 'is-active' : ''} ${d === t ? 'is-today' : ''}" data-day="${d}">
        <span class="dow">${DOW[dt.getDay()]}</span><span class="dom">${dt.getDate()}</span>
        ${n ? `<span class="dow">${n} reun.</span>` : ''}</button>`;
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
      return `<div class="room-head r${r}">${ROOMS[r]}<small>${n ? `${n} reunião${n > 1 ? 'ões' : ''}` : 'livre o dia todo'}</small></div>`;
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
          <span class="ev-meta">${esc(mt.bu)} · ${mt.people} ${mt.people > 1 ? 'pessoas' : 'pessoa'}${mt.company ? ' · ' + esc(mt.company) : ''}</span>
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
          <div class="li-time">${fmtTime(m.start)}<small>até ${fmtTime(m.end)}</small></div>
          <div><div class="li-name">${esc(m.name)}</div>
            <div class="li-meta">${esc(m.bu)} · ${m.people} ${m.people > 1 ? 'pessoas' : 'pessoa'}${m.company ? ' · com ' + esc(m.company) : ''}</div></div>
          <span class="li-room">${ROOMS[m.room]}</span>
        </div>`).join('') : '<div class="list-empty">Nenhuma reunião neste dia.</div>');
  }

  function render() {
    renderDayTabs();
    $('#calendar').classList.toggle('hidden', listMode);
    $('#listView').classList.toggle('hidden', !listMode);
    $('#btnList').querySelector('.ico').textContent = listMode ? '▦' : '☰';
    $('#btnList').querySelector('.long').textContent = listMode ? ' Grade' : ' Lista';
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
    $('#modalTitle').textContent = editing ? 'Editar reunião' : 'Adicionar reunião';
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

  form.addEventListener('submit', (ev) => {
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
    if (!m.name) return showError('Informe o nome da pessoa.');
    if (!m.bu) return showError('Informe a Unidade de Negócio.');
    if (m.end <= m.start) return showError('O horário de fim precisa ser depois do início.');
    const c = conflict(m);
    if (c) return showError(`Conflito: ${ROOMS[m.room]} já tem "${c.name}" das ${fmtTime(c.start)} às ${fmtTime(c.end)}.`);
    const idx = meetings.findIndex((o) => o.id === m.id);
    if (idx >= 0) meetings[idx] = m; else meetings.push(m);
    save(); selectedDay = m.date; closeForm(); render();
    toast(idx >= 0 ? 'Reunião atualizada' : 'Reunião adicionada');
  });

  $('#btnDelete').addEventListener('click', () => {
    const id = $('#fId').value; const m = meetings.find((o) => o.id === id);
    if (!m) return;
    if (!confirm(`Excluir a reunião de ${m.name} (${fmtTime(m.start)}–${fmtTime(m.end)})?`)) return;
    meetings = meetings.filter((o) => o.id !== id); save(); closeForm(); render(); toast('Reunião excluída');
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
    if (c) { render(); toast(`Horário ocupado em ${ROOMS[moved.room]} por ${c.name}`); return; }
    $('#confirmText').innerHTML = `<b style="color:inherit">${esc(d.m.name)}</b> vai para <strong>${ROOMS[moved.room]}</strong>, ${fmtTime(moved.start)} – ${fmtTime(moved.end)}.`;
    $('#confirmModal').classList.remove('hidden');
    $('#confirmYes').onclick = () => {
      const idx = meetings.findIndex((o) => o.id === moved.id); meetings[idx] = moved; save();
      $('#confirmModal').classList.add('hidden'); render(); toast('Reunião movida');
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
    a.download = `agenda-sial-${todayIso()}.json`; a.click(); URL.revokeObjectURL(a.href);
  });
  $('#fileImport').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!Array.isArray(data)) throw new Error();
      if (!confirm(`Substituir a agenda atual por ${data.length} reunião(ões) do arquivo?`)) return;
      meetings = data.filter((m) => m && m.id && ROOMS[m.room] && EVENT_DAYS.includes(m.date));
      save(); render(); toast('Agenda restaurada');
    } catch { toast('Arquivo inválido'); }
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
})();
