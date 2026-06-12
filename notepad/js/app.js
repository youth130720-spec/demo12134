/* ── DB 연결 체크 ── */
async function checkDbHealth() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    if (!data.ok) {
      const lines = [
        '⚠️  Turso DB 연결 실패',
        '',
        `[코드] ${data.code || 'UNKNOWN'}`,
        `[오류] ${data.error}`,
      ];
      if (data.detail) {
        lines.push('');
        lines.push('[상세]');
        Object.entries(data.detail).forEach(([k, v]) => lines.push(`  ${k}: ${v}`));
      }
      lines.push('');
      lines.push('Render 대시보드 → Environment 에서 환경변수를 확인하세요.');
      alert(lines.join('\n'));
    }
  } catch (err) {
    alert(`⚠️  서버 응답 없음\n\n[오류] ${err.message}\n\n서버가 정상 실행 중인지 확인하세요.`);
  }
}

/* ── 상수 & 유틸 ── */
const STORAGE_KEY = 'notepad_v1';
const COLORS = ['#4CAF50','#2196F3','#FF9800','#E91E63','#9C27B0','#00BCD4','#FF5722','#607D8B'];

const $ = id => document.getElementById(id);
const el = (tag, cls, inner) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (inner !== undefined) e.innerHTML = inner;
  return e;
};

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function formatDate(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);
  if (diffMin < 1) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHr < 24) return `${diffHr}시간 전`;
  if (diffDay < 7) return `${diffDay}일 전`;
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
}

function stripHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || '';
}

/* ── 상태 ── */
let state = {
  notes: [],
  notebooks: [],
  activeNoteId: null,
  activeFilter: 'all',
  activeNotebook: null,
  activeTag: null,
  searchQuery: '',
  sortBy: 'updated',
};

/* ── 저장/불러오기 ── */
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    notes: state.notes,
    notebooks: state.notebooks,
  }));
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    state.notes = data.notes || [];
    state.notebooks = data.notebooks || [];
  } catch (e) {
    console.error('데이터 불러오기 실패', e);
  }
}

/* ── 노트 CRUD ── */
function createNote(notebookId) {
  const nb = notebookId || (state.notebooks[0]?.id) || null;
  const note = {
    id: uid(),
    title: '',
    content: '',
    tags: [],
    notebookId: nb,
    starred: false,
    deleted: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  state.notes.unshift(note);
  save();
  return note;
}

function updateNote(id, patch) {
  const idx = state.notes.findIndex(n => n.id === id);
  if (idx === -1) return;
  Object.assign(state.notes[idx], patch, { updatedAt: Date.now() });
  save();
}

function deleteNote(id, permanent) {
  if (permanent) {
    state.notes = state.notes.filter(n => n.id !== id);
  } else {
    updateNote(id, { deleted: true });
  }
  if (state.activeNoteId === id) state.activeNoteId = null;
  save();
}

function restoreNote(id) {
  updateNote(id, { deleted: false });
}

/* ── 노트북 CRUD ── */
function createNotebook(name) {
  const nb = { id: uid(), name, color: COLORS[state.notebooks.length % COLORS.length] };
  state.notebooks.push(nb);
  save();
  return nb;
}

function renameNotebook(id, name) {
  const nb = state.notebooks.find(n => n.id === id);
  if (nb) { nb.name = name; save(); }
}

function deleteNotebook(id) {
  state.notebooks = state.notebooks.filter(n => n.id !== id);
  state.notes.forEach(n => { if (n.notebookId === id) n.notebookId = null; });
  save();
}

/* ── 필터링 ── */
function getFilteredNotes() {
  let list = state.notes.filter(n => {
    if (state.activeFilter === 'trash') return n.deleted;
    if (n.deleted) return false;
    if (state.activeFilter === 'starred') return n.starred;
    if (state.activeNotebook) return n.notebookId === state.activeNotebook;
    if (state.activeTag) return n.tags.includes(state.activeTag);
    return true;
  });

  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    list = list.filter(n =>
      n.title.toLowerCase().includes(q) ||
      stripHtml(n.content).toLowerCase().includes(q) ||
      n.tags.some(t => t.toLowerCase().includes(q))
    );
  }

  list.sort((a, b) => {
    if (state.sortBy === 'title') return a.title.localeCompare(b.title, 'ko');
    if (state.sortBy === 'created') return b.createdAt - a.createdAt;
    return b.updatedAt - a.updatedAt;
  });

  return list;
}

/* ── 렌더링 ── */
function renderAll() {
  renderSidebar();
  renderNotesList();
  renderEditor();
}

function renderSidebar() {
  // 카운트
  const allCount = state.notes.filter(n => !n.deleted).length;
  const starredCount = state.notes.filter(n => !n.deleted && n.starred).length;
  const trashCount = state.notes.filter(n => n.deleted).length;
  $('countAll').textContent = allCount;
  $('countStarred').textContent = starredCount;
  $('countTrash').textContent = trashCount;

  // 노트북 목록
  const nbList = $('notebookList');
  nbList.innerHTML = '';
  state.notebooks.forEach(nb => {
    const count = state.notes.filter(n => !n.deleted && n.notebookId === nb.id).length;
    const li = el('li', 'section-item' + (state.activeNotebook === nb.id ? ' active' : ''));
    li.dataset.id = nb.id;
    li.innerHTML = `
      <span class="tag-dot" style="background:${nb.color}"></span>
      <span>${nb.name}</span>
      <span class="section-item-count">${count}</span>`;
    li.addEventListener('click', () => {
      state.activeFilter = null;
      state.activeNotebook = nb.id;
      state.activeTag = null;
      document.querySelectorAll('.nav-item').forEach(e => e.classList.remove('active'));
      document.querySelectorAll('.section-item').forEach(e => e.classList.remove('active'));
      li.classList.add('active');
      $('panelTitle').textContent = nb.name;
      renderNotesList();
    });
    li.addEventListener('contextmenu', e => showContextMenu(e, 'notebook', nb.id));
    nbList.appendChild(li);
  });

  // 태그 목록
  const tagSet = new Map();
  state.notes.filter(n => !n.deleted).forEach(n => {
    n.tags.forEach(t => tagSet.set(t, (tagSet.get(t) || 0) + 1));
  });
  const tagList = $('tagList');
  tagList.innerHTML = '';
  tagSet.forEach((count, tag) => {
    const li = el('li', 'section-item' + (state.activeTag === tag ? ' active' : ''));
    li.innerHTML = `
      <span style="font-size:12px">#</span>
      <span>${tag}</span>
      <span class="section-item-count">${count}</span>`;
    li.addEventListener('click', () => {
      state.activeFilter = null;
      state.activeNotebook = null;
      state.activeTag = tag;
      document.querySelectorAll('.nav-item').forEach(e => e.classList.remove('active'));
      document.querySelectorAll('.section-item').forEach(e => e.classList.remove('active'));
      li.classList.add('active');
      $('panelTitle').textContent = `#${tag}`;
      renderNotesList();
    });
    tagList.appendChild(li);
  });

  // 노트북 선택 드롭다운
  const nbSelect = $('notebookSelect');
  nbSelect.innerHTML = '<option value="">노트북 없음</option>';
  state.notebooks.forEach(nb => {
    const opt = document.createElement('option');
    opt.value = nb.id;
    opt.textContent = nb.name;
    nbSelect.appendChild(opt);
  });
  if (state.activeNoteId) {
    const note = state.notes.find(n => n.id === state.activeNoteId);
    if (note) nbSelect.value = note.notebookId || '';
  }
}

function renderNotesList() {
  const list = getFilteredNotes();
  const container = $('notesList');
  const empty = $('notesEmpty');
  container.innerHTML = '';

  if (list.length === 0) {
    empty.classList.add('visible');
    return;
  }
  empty.classList.remove('visible');

  list.forEach(note => {
    const li = el('li', 'note-item' + (note.id === state.activeNoteId ? ' active' : ''));
    const nb = state.notebooks.find(n => n.id === note.notebookId);
    const preview = stripHtml(note.content).slice(0, 80) || '내용 없음';
    li.innerHTML = `
      <div class="note-item-title">
        ${note.starred ? '<span class="star-icon">★</span>' : ''}
        ${note.title || '제목 없음'}
      </div>
      <div class="note-item-preview">${preview}</div>
      <div class="note-item-meta">
        <span>${formatDate(note.updatedAt)}</span>
        ${nb ? `<span class="note-item-notebook">${nb.name}</span>` : ''}
      </div>`;
    li.addEventListener('click', () => openNote(note.id));
    container.appendChild(li);
  });
}

function renderEditor() {
  const note = state.notes.find(n => n.id === state.activeNoteId);
  const placeholder = $('editorPlaceholder');
  const content = $('editorContent');

  if (!note) {
    placeholder.style.display = 'flex';
    content.style.display = 'none';
    return;
  }

  placeholder.style.display = 'none';
  content.style.display = 'flex';

  $('noteTitleInput').value = note.title;
  $('noteEditor').innerHTML = note.content;
  $('noteDate').textContent = formatDate(note.updatedAt);

  // 즐겨찾기
  const starBtn = $('btnStar');
  starBtn.classList.toggle('starred', note.starred);
  starBtn.querySelector('svg').setAttribute('fill', note.starred ? '#FFC107' : 'none');

  // 태그
  renderTags(note.tags);

  // 노트북
  $('notebookSelect').value = note.notebookId || '';
}

function renderTags(tags) {
  const container = $('noteTags');
  container.innerHTML = '';
  tags.forEach(tag => {
    const chip = el('span', 'tag-chip');
    chip.innerHTML = `#${tag}<span class="tag-remove" data-tag="${tag}">×</span>`;
    chip.querySelector('.tag-remove').addEventListener('click', () => {
      const note = state.notes.find(n => n.id === state.activeNoteId);
      if (!note) return;
      updateNote(note.id, { tags: note.tags.filter(t => t !== tag) });
      renderAll();
    });
    container.appendChild(chip);
  });
}

/* ── 노트 열기 ── */
function openNote(id) {
  saveCurrentEditor();
  state.activeNoteId = id;
  renderNotesList();
  renderEditor();
}

/* ── 에디터 저장 ── */
let saveTimer = null;
function scheduleAutoSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveCurrentEditor();
    renderNotesList();
    renderSidebar();
  }, 600);
}

function saveCurrentEditor() {
  if (!state.activeNoteId) return;
  const title = $('noteTitleInput')?.value || '';
  const content = $('noteEditor')?.innerHTML || '';
  updateNote(state.activeNoteId, { title, content });
}

/* ── 컨텍스트 메뉴 ── */
let ctxTarget = null;
function showContextMenu(e, type, id) {
  e.preventDefault();
  e.stopPropagation();
  ctxTarget = { type, id };
  const menu = $('contextMenu');
  menu.classList.add('visible');
  menu.style.left = e.clientX + 'px';
  menu.style.top = e.clientY + 'px';
}

/* ── 모달 ── */
let modalAction = null;
function openModal(title, placeholder, confirmText, action) {
  $('modalTitle').textContent = title;
  $('modalInput').placeholder = placeholder;
  $('modalInput').value = '';
  $('btnModalConfirm').textContent = confirmText || '만들기';
  modalAction = action;
  $('modalOverlay').classList.add('visible');
  setTimeout(() => $('modalInput').focus(), 50);
}
function closeModal() {
  $('modalOverlay').classList.remove('visible');
  modalAction = null;
}

/* ── 이벤트 바인딩 ── */
document.addEventListener('DOMContentLoaded', () => {
  checkDbHealth();
  load();

  // 기본 노트북 생성
  if (state.notebooks.length === 0) {
    createNotebook('기본 노트북');
  }

  renderAll();

  // 새 노트
  $('btnNewNote').addEventListener('click', () => newNoteAction());
  $('btnEmptyCreate').addEventListener('click', () => newNoteAction());

  function newNoteAction() {
    saveCurrentEditor();
    const note = createNote(state.activeNotebook);
    state.activeNoteId = note.id;
    if (state.activeFilter === 'trash') {
      state.activeFilter = 'all';
      document.querySelectorAll('.nav-item').forEach(e => e.classList.remove('active'));
      $('navAll').classList.add('active');
      $('panelTitle').textContent = '모든 노트';
    }
    renderAll();
    setTimeout(() => $('noteTitleInput').focus(), 50);
  }

  // 내비게이션
  ['navAll', 'navStarred', 'navTrash'].forEach(id => {
    const filters = { navAll: 'all', navStarred: 'starred', navTrash: 'trash' };
    const titles = { navAll: '모든 노트', navStarred: '즐겨찾기', navTrash: '휴지통' };
    $(id).addEventListener('click', () => {
      state.activeFilter = filters[id];
      state.activeNotebook = null;
      state.activeTag = null;
      document.querySelectorAll('.nav-item').forEach(e => e.classList.remove('active'));
      document.querySelectorAll('.section-item').forEach(e => e.classList.remove('active'));
      $(id).classList.add('active');
      $('panelTitle').textContent = titles[id];
      renderNotesList();
    });
  });

  // 검색
  $('searchInput').addEventListener('input', e => {
    state.searchQuery = e.target.value;
    renderNotesList();
  });

  // 정렬
  $('sortSelect').addEventListener('change', e => {
    state.sortBy = e.target.value;
    renderNotesList();
  });

  // 에디터 — 제목
  $('noteTitleInput').addEventListener('input', scheduleAutoSave);

  // 에디터 — 본문
  $('noteEditor').addEventListener('input', scheduleAutoSave);

  // 에디터 — 즐겨찾기
  $('btnStar').addEventListener('click', () => {
    if (!state.activeNoteId) return;
    const note = state.notes.find(n => n.id === state.activeNoteId);
    updateNote(note.id, { starred: !note.starred });
    renderAll();
  });

  // 에디터 — 삭제
  $('btnDelete').addEventListener('click', () => {
    if (!state.activeNoteId) return;
    const note = state.notes.find(n => n.id === state.activeNoteId);
    if (note.deleted) {
      if (confirm('노트를 영구 삭제하시겠습니까?')) {
        deleteNote(note.id, true);
        renderAll();
      }
    } else {
      deleteNote(note.id, false);
      renderAll();
    }
  });

  // 에디터 — 노트북 변경
  $('notebookSelect').addEventListener('change', e => {
    if (!state.activeNoteId) return;
    updateNote(state.activeNoteId, { notebookId: e.target.value || null });
    renderSidebar();
    renderNotesList();
  });

  // 태그 입력
  $('tagInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const tag = e.target.value.trim().replace(/,/g, '');
      if (!tag || !state.activeNoteId) return;
      const note = state.notes.find(n => n.id === state.activeNoteId);
      if (!note.tags.includes(tag)) {
        updateNote(note.id, { tags: [...note.tags, tag] });
        renderAll();
      }
      e.target.value = '';
    }
  });

  // 툴바 버튼
  document.querySelectorAll('.tool-btn[data-cmd]').forEach(btn => {
    btn.addEventListener('mousedown', e => {
      e.preventDefault();
      document.execCommand(btn.dataset.cmd, false, null);
      scheduleAutoSave();
    });
  });

  // 제목 스타일
  $('headingSelect').addEventListener('change', e => {
    document.execCommand('formatBlock', false, e.target.value);
    scheduleAutoSave();
  });

  // 글자 색상
  $('fontColor').addEventListener('input', e => {
    document.execCommand('foreColor', false, e.target.value);
    scheduleAutoSave();
  });

  // 노트북 추가
  $('btnAddNotebook').addEventListener('click', e => {
    e.stopPropagation();
    openModal('새 노트북', '노트북 이름을 입력하세요', '만들기', (name) => {
      if (!name) return;
      createNotebook(name);
      renderAll();
    });
  });

  // 모달 확인/취소
  $('btnModalConfirm').addEventListener('click', () => {
    const val = $('modalInput').value.trim();
    if (modalAction) modalAction(val);
    closeModal();
  });
  $('modalInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') $('btnModalConfirm').click();
    if (e.key === 'Escape') closeModal();
  });
  $('btnModalCancel').addEventListener('click', closeModal);
  $('modalClose').addEventListener('click', closeModal);
  $('modalOverlay').addEventListener('click', e => {
    if (e.target === $('modalOverlay')) closeModal();
  });

  // 컨텍스트 메뉴
  $('ctxRename').addEventListener('click', () => {
    $('contextMenu').classList.remove('visible');
    if (!ctxTarget) return;
    if (ctxTarget.type === 'notebook') {
      const nb = state.notebooks.find(n => n.id === ctxTarget.id);
      openModal('노트북 이름 변경', '새 이름', '변경', (name) => {
        if (!name) return;
        renameNotebook(ctxTarget.id, name);
        renderAll();
      });
      $('modalInput').value = nb?.name || '';
    }
  });
  $('ctxDelete').addEventListener('click', () => {
    $('contextMenu').classList.remove('visible');
    if (!ctxTarget) return;
    if (ctxTarget.type === 'notebook') {
      if (confirm('노트북을 삭제하시겠습니까?\n(노트북 안의 노트는 유지됩니다)')) {
        deleteNotebook(ctxTarget.id);
        if (state.activeNotebook === ctxTarget.id) {
          state.activeNotebook = null;
          state.activeFilter = 'all';
          document.querySelectorAll('.nav-item').forEach(e => e.classList.remove('active'));
          $('navAll').classList.add('active');
          $('panelTitle').textContent = '모든 노트';
        }
        renderAll();
      }
    }
  });

  document.addEventListener('click', () => {
    $('contextMenu').classList.remove('visible');
  });

  // 섹션 접기
  $('toggleNotebooks').addEventListener('click', () => {
    $('toggleNotebooks').classList.toggle('collapsed');
    $('notebookList').style.display =
      $('toggleNotebooks').classList.contains('collapsed') ? 'none' : '';
  });
  $('toggleTags').addEventListener('click', () => {
    $('toggleTags').classList.toggle('collapsed');
    $('tagList').style.display =
      $('toggleTags').classList.contains('collapsed') ? 'none' : '';
  });

  // 페이지 떠날 때 저장
  window.addEventListener('beforeunload', saveCurrentEditor);
});
