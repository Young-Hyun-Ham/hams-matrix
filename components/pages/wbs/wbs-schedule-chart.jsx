import React, { useState, useRef, useEffect, useMemo } from 'react';
import './wbs-schedule-chart.css';
import { useWbsSchedule } from './use-wbs-schedule';
import { WbsTaskDialog } from './wbs-task-dialog';
import { WbsOverview } from './wbs-overview';
import { WbsPublicationActions } from './wbs-publication-actions';
import { WbsDatePicker } from './wbs-date-picker';
import { ConfirmationDialog } from '@/components/shared/confirmation-dialog';
import { koreaToday } from '@/lib/wbs-schedule';
import { taskMetrics } from '@/lib/integration';
import { 
  ChevronRight, 
  ChevronDown, 
  Plus, 
  Trash2, 
  Layers, 
  Search,
  Filter
} from 'lucide-react';

// Helper functions for Date Manipulation
const parseDate = (value) => new Date(`${value}T00:00:00Z`);
const formatDate = (date) => date.toISOString().slice(0, 10);
const addDays = (date, days) => new Date(date.getTime() + days * 86400000);
const getDaysDiff = (start, end) => Math.round((parseDate(end) - parseDate(start)) / 86400000);

// Keep WBS + title visible; each following step restores one complete column.
const REGISTRATION_WIDTHS = [320, 444, 568, 692, 772, 860];
const REGISTRATION_COLUMNS = ['64px', 'minmax(180px, 1fr)', '124px', '124px', '124px', '80px', '88px'];

export default function WbsComponement() {
  const model = useWbsSchedule();
  const { tasks, setTasks } = model;
  const [viewMode, setViewMode] = useState('Day'); // 'Day' | 'Week' | 'Month'
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [splitStep, setSplitStep] = useState(REGISTRATION_WIDTHS.length - 1);
  const registrationWidth = REGISTRATION_WIDTHS[splitStep];
  const visibleColumnCount = splitStep + 2;
  const [isResizingSplit, setIsResizingSplit] = useState(false);

  // Dragging state for Gantt Bar
  const [dragState, setDragState] = useState(null); // { taskId, type: 'move'|'resize-left'|'resize-right', startX, originalStartDate, originalEndDate }
  const [hoveredTask, setHoveredTask] = useState(null);

  // Refs for scrolling synchronization
  const splitContainerRef = useRef(null);
  const overviewDialogRef = useRef(null);
  const overviewButtonRef = useRef(null);
  const tableHeaderRef = useRef(null);
  const tableBodyRef = useRef(null);
  const timelineHeaderRef = useRef(null);
  const timelineBodyRef = useRef(null);

  // Column width config in pixels depending on viewMode
  const columnWidth = useMemo(() => {
    switch (viewMode) {
      case 'Day': return 42;
      case 'Week': return 90;
      case 'Month': return 140;
      default: return 42;
    }
  }, [viewMode]);

  // Calculate Date Range for Timeline
  const { startDateRange, totalDays, datesHeader } = useMemo(() => {
    if (tasks.length === 0) {
      const today = parseDate(koreaToday());
      return { startDateRange: today, totalDays: 30, datesHeader: Array.from({ length: 30 }, (_, index) => addDays(today, index)) };
    }

    let minDate = parseDate(tasks[0].startDate);
    let maxDate = parseDate(tasks[0].endDate);

    tasks.forEach(task => {
      const s = parseDate(task.startDate);
      const e = parseDate(task.endDate);
      if (s < minDate) minDate = s;
      if (e > maxDate) maxDate = e;
    });

    // Add padding around date bounds
    // Leave just one empty timeline column before the earliest task in every view.
    const start = addDays(minDate, -1);
    const end = addDays(maxDate, 15);
    const days = Math.max(30, getDaysDiff(formatDate(start), formatDate(end)) + 1);

    // Build header dates array
    const dates = [];
    let curr = new Date(start);
    for (let i = 0; i < days; i++) {
      dates.push(new Date(curr));
      curr.setUTCDate(curr.getUTCDate() + 1);
    }

    return { startDateRange: start, totalDays: days, datesHeader: dates };
  }, [tasks]);

  // Synchronize Vertical Scroll between Table and Timeline Body
  const handleTableScroll = (e) => {
    if (timelineBodyRef.current) {
      timelineBodyRef.current.scrollTop = e.target.scrollTop;
    }
  };

  const handleTimelineScroll = (e) => {
    if (tableBodyRef.current) {
      tableBodyRef.current.scrollTop = e.target.scrollTop;
    }
    if (timelineHeaderRef.current) {
      timelineHeaderRef.current.scrollLeft = e.target.scrollLeft;
    }
  };

  // Toggle Parent Collapse/Expand
  const toggleExpand = model.toggleExpand;

  // Inline Cell Edit Handler
  const handleTaskChange = (id, field, value) => {
    setTasks(tasks.map(t => {
      if (t.id === id) {
        const updatedTask = { ...t, [field]: value };
        // Ensure start <= end
        if (field === 'startDate' && updatedTask.endDate < value) {
          updatedTask.endDate = value;
        }
        if (field === 'endDate' && updatedTask.startDate > value) {
          updatedTask.startDate = value;
        }
        return updatedTask;
      }
      return t;
    }));
  };

  const handleAddTask = model.openTask;

  // Delete Task
  const handleDeleteTask = (id) => {
    // Delete task and all child tasks
    const idsToDelete = [id];
    const findChildren = (pId) => {
      tasks.filter(t => t.parentId === pId).forEach(c => {
        idsToDelete.push(c.id);
        findChildren(c.id);
      });
    };
    findChildren(id);

    setTasks(tasks.filter(t => !idsToDelete.includes(t.id)));
  };

  // Timeline Mouse Interaction Handlers for Dragging/Resizing
  const handleBarMouseDown = (e, task, type) => {
    if (!model.canEdit || task.artifact.fields.taskType === "요약") return;
    e.stopPropagation();
    e.preventDefault();
    setDragState({
      taskId: task.id,
      type: type, // 'move' | 'resize-left' | 'resize-right'
      startX: e.clientX,
      originalStartDate: task.startDate,
      originalEndDate: task.endDate
    });
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!dragState) return;

      const deltaPixels = e.clientX - dragState.startX;
      const daysShift = Math.round(deltaPixels / columnWidth);


      setTasks(prevTasks => prevTasks.map(t => {
        if (t.id !== dragState.taskId) return t;

        const origStart = parseDate(dragState.originalStartDate);
        const origEnd = parseDate(dragState.originalEndDate);

        let newStart = t.startDate;
        let newEnd = t.endDate;

        if (dragState.type === 'move') {
          newStart = formatDate(addDays(origStart, daysShift));
          newEnd = formatDate(addDays(origEnd, daysShift));
        } else if (dragState.type === 'resize-left') {
          const shifted = addDays(origStart, daysShift);
          if (shifted <= parseDate(dragState.originalEndDate)) {
            newStart = formatDate(shifted);
          }
        } else if (dragState.type === 'resize-right') {
          const shifted = addDays(origEnd, daysShift);
          if (shifted >= parseDate(dragState.originalStartDate)) {
            newEnd = formatDate(shifted);
          }
        }

        return { ...t, startDate: newStart, endDate: newEnd };
      }));
    };

    const handleMouseUp = () => {
      setDragState(null);
    };

    if (dragState) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, columnWidth, setTasks]);

  // Splitter Resizing
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizingSplit) return;
      const bounds = splitContainerRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const requestedWidth = e.clientX - bounds.left;
      const nextStep = REGISTRATION_WIDTHS.reduce((closest, width, index) => (
        Math.abs(width - requestedWidth) < Math.abs(REGISTRATION_WIDTHS[closest] - requestedWidth)
          ? index : closest
      ), 0);
      setSplitStep(nextStep);
    };

    const handleMouseUp = () => {
      setIsResizingSplit(false);
    };

    if (isResizingSplit) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingSplit]);

  // Filter Tasks based on hierarchy expansion and search query
  const visibleTasks = useMemo(() => {
    const isVisible = (task) => {
      if (!task.parentId) return true;
      const parent = tasks.find(t => t.id === task.parentId);
      if (!parent || !parent.expanded) return false;
      return isVisible(parent);
    };

    return tasks.filter(t => {
      const matchesSearch = t.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            t.assignee.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            t.wbs.includes(searchTerm);
      const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
      return isVisible(t) && matchesSearch && matchesStatus;
    });
  }, [tasks, searchTerm, statusFilter]);

  // Calculate position & width of task bar in timeline
  const getTaskBarPosition = (task) => {
    const startOffsetDays = getDaysDiff(formatDate(startDateRange), task.startDate);
    const durationDays = getDaysDiff(task.startDate, task.endDate) + 1;

    const left = startOffsetDays * columnWidth;
    const width = durationDays * columnWidth;

    return { left, width };
  };

  const renderOverview = (expanded = false) => <WbsOverview tasks={visibleTasks} start={formatDate(startDateRange)} days={totalDays} expanded={expanded} />;

  // Quick stats calculation
  const stats = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter(t => t.progress === 100).length;
    const inProgress = tasks.filter(t => t.progress > 0 && t.progress < 100).length;
    const avgProgress = taskMetrics(tasks.map(task => task.artifact)).progress;
    return { total, completed, inProgress, avgProgress };
  }, [tasks]);

  return (
    <div className="wbs-chart flex flex-col overflow-hidden select-none">
      
      {/* HEADER TOOLBAR */}
      <header className="flex items-center justify-between px-6 py-3.5 bg-slate-800/80 backdrop-blur border-b border-slate-700/60 z-20">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-indigo-600/20 text-indigo-400 rounded-lg border border-indigo-500/30">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              WBS System
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                Live Edit
              </span>
            </h1>
            <p className="text-xs text-slate-400">인터랙티브 스플릿 뷰 스마트 WBS 일정 관리자</p>
          </div>
        </div>

        {/* Stats Summary Badges */}
        <div className="hidden lg:flex items-center space-x-6 text-xs bg-slate-900/60 px-4 py-1.5 rounded-lg border border-slate-700/50">
          <div className="flex items-center space-x-2">
            <span className="text-slate-400">전체 항목:</span>
            <span className="font-bold text-slate-200">{stats.total}개</span>
          </div>
          <div className="h-3 w-px bg-slate-700" />
          <div className="flex items-center space-x-2">
            <span className="text-slate-400">진행 중:</span>
            <span className="font-bold text-amber-400">{stats.inProgress}개</span>
          </div>
          <div className="h-3 w-px bg-slate-700" />
          <div className="flex items-center space-x-2">
            <span className="text-slate-400">완료:</span>
            <span className="font-bold text-emerald-400">{stats.completed}개</span>
          </div>
          <div className="h-3 w-px bg-slate-700" />
          <div className="flex items-center space-x-2">
            <span className="text-slate-400">전체 달성률:</span>
            <div className="w-16 bg-slate-700 rounded-full h-2 overflow-hidden">
              <div 
                className="bg-indigo-500 h-full rounded-full transition-all duration-500" 
                style={{ width: `${stats.avgProgress}%` }}
              />
            </div>
            <span className="font-bold text-indigo-400">{stats.avgProgress}%</span>
          </div>
        </div>

        {/* Controls & Actions */}
        <div className="flex items-center space-x-3">
          {/* Zoom Level Toggle */}
          <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-700/80 text-xs">
            {['Day', 'Week', 'Month'].map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1 rounded-md font-medium transition-all ${
                  viewMode === mode 
                    ? 'bg-indigo-600 text-white shadow-sm' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {mode === 'Day' ? '일간' : mode === 'Week' ? '주간' : '월간'}
              </button>
            ))}
          </div>

          <button
            disabled={!model.canCreate}
            onClick={() => handleAddTask(null)}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-all shadow-lg shadow-indigo-600/20 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>최상위 WBS 추가</span>
          </button>
        </div>
      </header>

      {/* FILTER & SEARCH BAR */}
      <div className="wbs-filter-toolbar px-6 py-2 bg-slate-800/40 border-b border-slate-700/40 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-3">
          <div className="wbs-search">
            <Search size={14} aria-hidden="true" />
            <input
              type="search"
              aria-label="작업명, 담당자, WBS 검색"
              placeholder="작업명, 담당자 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-md pl-8 pr-3 py-1 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-52"
            />
          </div>

          <div className="flex items-center space-x-1 text-slate-400">
            <Filter className="w-3.5 h-3.5" />
            <span>상태 필터:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="all">전체 상태</option>
              <option value="초안">초안</option>
              <option value="검토 중">검토 중</option>
              <option value="승인">승인</option>
              <option value="진행 중">진행 중</option>
              <option value="완료">완료</option>
              <option value="보류">보류</option>
            </select>
          </div>
          <button type="button" className="button" disabled={model.busy} onClick={model.query}>조회</button>
          <button type="button" className="button primary" disabled={!(model.canEdit || model.canCreate || model.canDelete) || !model.dirty} onClick={model.save}>저장</button>
          <WbsPublicationActions data={model.baseline} dirty={model.dirty} disabled={model.busy || model.remoteChanged} />
        </div>

        <div className="text-slate-400 text-[11px] flex items-center gap-2">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span> 드래그하여 일정 및 기간 변경 가능
          </span>
        </div>
      </div>

      <div className="wbs-save-status" role="status">{model.busy ? '처리 중…' : model.dirty ? `미저장 변경 ${model.dirtyCount}건` : '저장본과 동일'} {model.message}</div>
      {model.remoteChanged && <p className="wbs-save-status" role="status">서버 일정이 변경되었습니다. 조회 버튼으로 최신 내용을 확인해 주세요. 편집 중인 내용은 유지됩니다.</p>}
      {model.error && <p role="alert" className="matrix-error">{model.error}</p>}
      {model.editing && <WbsTaskDialog artifact={model.editing} artifacts={model.otherArtifacts} error={model.error} onSave={model.applyTask} onClose={() => model.setEditing(null)} />}
      {model.confirmReload && <ConfirmationDialog title="일정 다시 조회" confirmLabel="변경사항 버리고 조회" onConfirm={model.load} onClose={() => model.setConfirmReload(false)}><p>미저장 변경사항을 버리고 서버의 최신 일정을 조회하시겠습니까?</p></ConfirmationDialog>}
      <button
        ref={overviewButtonRef}
        type="button"
        className="wbs-overview-thumbnail"
        aria-haspopup="dialog"
        onClick={() => overviewDialogRef.current?.showModal()}
      >
        <span className="wbs-overview-caption"><strong>전체 일정 미리보기</strong><span>클릭하여 크게 보기 ↗</span></span>
        {renderOverview()}
      </button>
      <dialog
        ref={overviewDialogRef}
        className="wbs-overview-dialog"
        aria-labelledby="wbs-overview-title"
        onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}
        onClose={() => overviewButtonRef.current?.focus()}
      >
        <div className="wbs-overview-modal">
          <div className="wbs-overview-heading">
            <div><h2 id="wbs-overview-title">전체 일정</h2><p>현재 표시된 작업 {visibleTasks.length}개 · 긴 일정은 좌우로 스크롤하세요.</p></div>
            <button type="button" autoFocus onClick={() => overviewDialogRef.current?.close()} aria-label="전체 일정 닫기">닫기 ×</button>
          </div>
          <div className="wbs-overview-scroll" >
            {renderOverview(true)}
          </div>
        </div>
      </dialog>

      {/* MAIN SPLIT-VIEW CONTENT AREA */}
      <div ref={splitContainerRef} style={{ minWidth: registrationWidth + 246 }} className="wbs-split-content flex-1 flex overflow-hidden relative">
        
        {/* LEFT PANEL: TREE TABLE GRID */}
        <div 
          data-visible-columns={visibleColumnCount}
          style={{
            width: registrationWidth,
            '--registration-columns': REGISTRATION_COLUMNS.slice(0, visibleColumnCount).join(' '),
          }}
          className="wbs-registration-panel flex flex-col bg-slate-900/90 border-r border-slate-700/80 overflow-hidden"
        >
          {/* Table Header */}
          <div 
            ref={tableHeaderRef}
            className="wbs-registration-grid wbs-registration-header flex items-center bg-slate-800/90 border-b border-slate-700 font-semibold text-xs text-slate-300 min-h-[40px] px-2 uppercase tracking-wider"
          >
            <div className="w-16 px-2 text-center text-slate-400">WBS</div>
            <div className="flex-1 px-3">작업명</div>
            <div className="w-24 px-2 text-center">담당자</div>
            <div className="w-24 px-2 text-center">시작일</div>
            <div className="w-24 px-2 text-center">종료일</div>
            <div className="w-16 px-2 text-center">진척도</div>
            <div className="w-12 px-2 text-center">관리</div>
          </div>

          {/* Table Body */}
          <div 
            ref={tableBodyRef}
            onScroll={handleTableScroll}
            className="wbs-registration-body flex-1 overflow-y-auto overflow-x-hidden divide-y divide-slate-800/60"
          >
            {visibleTasks.map((task) => {
              const hasChildren = task.artifact.fields.taskType === '요약';
              const isParent = !task.parentId;

              return (
                <div 
                  key={task.id}
                  onMouseEnter={() => setHoveredTask(task.id)}
                  onMouseLeave={() => setHoveredTask(null)}
                  className={`wbs-registration-grid flex items-center min-h-[44px] text-xs transition-colors hover:bg-slate-800/50 ${
                    hoveredTask === task.id ? 'bg-slate-800/40' : ''
                  } ${isParent ? 'font-semibold bg-slate-800/20' : ''}`}
                >
                  {/* WBS Code */}
                  <div className="w-16 px-2 text-center text-indigo-400 font-mono text-[11px] truncate">
                    <button type="button" className="wbs-task-detail" disabled={!model.canEdit} title="작업 상세 편집" onClick={() => model.openTask(null, task.id)}>{task.wbs}</button>
                  </div>

                  {/* Task Title (Editable) */}
                  <div className="flex-1 px-2 flex items-center min-w-0">
                    <div style={{ marginLeft: `${task.parentId ? 18 : 0}px` }} className="flex items-center w-full">
                      {hasChildren ? (
                        <button 
                          onClick={() => toggleExpand(task.id)} 
                          className="p-1 hover:bg-slate-700 rounded mr-1 text-slate-400 hover:text-slate-200"
                        >
                          {task.expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </button>
                      ) : (
                        <span className="w-5" />
                      )}
                      
                      <input
                        type="text"
                        disabled={!model.canEdit}
                        maxLength={200}
                        value={task.title}
                        onChange={(e) => handleTaskChange(task.id, 'title', e.target.value)}
                        className={`bg-transparent w-full focus:bg-slate-800 px-1 py-0.5 rounded border border-transparent focus:border-slate-600 focus:outline-none truncate ${
                          isParent ? 'text-slate-100 font-bold' : 'text-slate-300'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Assignee */}
                  <div className="w-24 px-2">
                    <input
                      disabled={!model.canEdit}
                      type="text"
                      value={task.assignee}
                      onChange={(e) => handleTaskChange(task.id, 'assignee', e.target.value)}
                      className="bg-transparent text-center w-full focus:bg-slate-800 px-1 py-0.5 rounded border border-transparent focus:border-slate-600 focus:outline-none text-slate-400 truncate"
                    />
                  </div>

                  <div className="w-24 px-1"><WbsDatePicker label={`${task.title} 시작일`} value={task.startDate} disabled={!model.canEdit || hasChildren} required onChange={(value) => handleTaskChange(task.id, 'startDate', value)} /></div>
                  <div className="w-24 px-1"><WbsDatePicker label={`${task.title} 종료일`} value={task.endDate} disabled={!model.canEdit || hasChildren} required onChange={(value) => handleTaskChange(task.id, 'endDate', value)} /></div>

                  {/* Progress % */}
                  <div className="w-16 px-1 flex items-center justify-center">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={task.progress}
                      disabled={!model.canEdit || hasChildren}
                      onChange={(e) => handleTaskChange(task.id, 'progress', Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                      className="bg-transparent text-center w-10 focus:bg-slate-800 px-0.5 py-0.5 rounded border border-transparent focus:border-slate-600 focus:outline-none text-slate-300 text-[11px] disabled:opacity-50"
                    />
                    <span className="text-[10px] text-slate-500">%</span>
                  </div>

                  {/* Actions */}
                  <div className="wbs-registration-actions w-12 px-1 flex items-center justify-center space-x-1">
                    {hasChildren && (
                      <button
                        disabled={!model.canCreate}
                          onClick={() => handleAddTask(task.id)}
                        title="하위 작업 추가"
                        className="p-1 hover:bg-indigo-600/30 text-indigo-400 rounded transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      disabled={!model.canDelete}
                      onClick={() => handleDeleteTask(task.id)}
                      title="작업 삭제"
                      className="p-1 hover:bg-rose-600/30 text-slate-500 hover:text-rose-400 rounded transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* DRAGGABLE RESIZER HANDLE */}
        <div
          role="separator"
          aria-label="Registration panel width"
          aria-orientation="vertical"
          aria-valuemin={REGISTRATION_WIDTHS[0]}
          aria-valuemax={REGISTRATION_WIDTHS[REGISTRATION_WIDTHS.length - 1]}
          aria-valuenow={registrationWidth}
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              event.preventDefault();
              setSplitStep(step => Math.max(0, Math.min(REGISTRATION_WIDTHS.length - 1,
                step + (event.key === 'ArrowLeft' ? -1 : 1))));
            }
          }}
          onMouseDown={(event) => { event.preventDefault(); setIsResizingSplit(true); }}
          className={`w-1.5 hover:w-2 bg-slate-800 hover:bg-indigo-500 cursor-col-resize z-30 transition-all ${
            isResizingSplit ? 'bg-indigo-500 w-2' : ''
          }`}
        />

        {/* RIGHT PANEL: INTERACTIVE GANTT TIMELINE */}
        <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden relative">
          
          {/* Timeline Header (Dates Axis) */}
          <div 
            ref={timelineHeaderRef}
            className="flex bg-slate-800/90 border-b border-slate-700 min-h-[40px] overflow-x-hidden text-xs text-slate-400 select-none"
          >
            <div className="flex" style={{ width: `${totalDays * columnWidth}px` }}>
              {datesHeader.map((d, index) => {
                const dayNum = d.getUTCDate();
                const isWeekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
                const isToday = formatDate(d) === koreaToday();

                return (
                  <div
                    key={index}
                    style={{ width: `${columnWidth}px` }}
                    className={`flex flex-col items-center justify-center border-r border-slate-700/40 text-[11px] ${
                      isWeekend ? 'bg-slate-900/40 text-slate-500' : ''
                    } ${isToday ? 'bg-indigo-900/30 font-bold text-indigo-400' : ''}`}
                  >
                    <span>{d.getUTCMonth() + 1}/{dayNum}</span>
                    <span className="text-[9px] opacity-60">
                      {['일', '월', '화', '수', '목', '금', '토'][d.getUTCDay()]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Timeline Body Canvas */}
          <div
            ref={timelineBodyRef}
            onScroll={handleTimelineScroll}
            className="flex-1 overflow-auto relative"
          >
            <div 
              className="relative" 
              style={{ 
                width: `${totalDays * columnWidth}px`,
                height: `${visibleTasks.length * 44}px`
              }}
            >
              {/* Background Grid Columns */}
              <div className="absolute inset-0 flex pointer-events-none">
                {datesHeader.map((d, index) => {
                  const isWeekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
                  const isToday = formatDate(d) === koreaToday();

                  return (
                    <div
                      key={index}
                      style={{ width: `${columnWidth}px` }}
                      className={`h-full border-r border-slate-800/40 ${
                        isWeekend ? 'bg-slate-900/20' : ''
                      } ${isToday ? 'bg-indigo-500/5 border-r border-indigo-500/20' : ''}`}
                    />
                  );
                })}
              </div>

              {/* Horizontal Row Guides */}
              <div className="absolute inset-0 flex flex-col pointer-events-none">
                {visibleTasks.map((task) => (
                  <div 
                    key={task.id} 
                    className={`h-[44px] border-b border-slate-800/40 ${
                      hoveredTask === task.id ? 'bg-slate-800/20' : ''
                    }`} 
                  />
                ))}
              </div>

              {/* Task Gantt Bars Container */}
              {visibleTasks.map((task, index) => {
                const { left, width } = getTaskBarPosition(task);
                const hasChildren = task.artifact.fields.taskType === '요약';
                const isHovered = hoveredTask === task.id;

                return (
                  <div
                    key={task.id}
                    style={{
                      top: `${index * 44 + 8}px`,
                      left: `${left}px`,
                      width: `${width}px`,
                      height: '28px'
                    }}
                    onMouseEnter={() => setHoveredTask(task.id)}
                    onMouseLeave={() => setHoveredTask(null)}
                    className={`absolute rounded-md group transition-all ${
                      hasChildren 
                        ? 'bg-slate-700/80 border border-slate-500/60' 
                        : 'bg-indigo-600/90 hover:bg-indigo-500 border border-indigo-400/50 shadow-md shadow-indigo-950'
                    }`}
                  >
                    {/* Progress Bar overlay */}
                    <div
                      style={{ width: `${task.progress}%` }}
                      className={`h-full rounded-l-md transition-all ${
                        hasChildren 
                          ? 'bg-slate-500' 
                          : task.progress === 100 
                            ? 'bg-emerald-500' 
                            : 'bg-indigo-400'
                      }`}
                    />

                    {/* Left Resize Handle (Child tasks only) */}
                    {!hasChildren && (
                      <div
                        onMouseDown={(e) => handleBarMouseDown(e, task, 'resize-left')}
                        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/40 rounded-l-md opacity-0 group-hover:opacity-100 transition-opacity"
                      />
                    )}

                    {/* Middle Drag Move Handle */}
                    {!hasChildren && (
                      <div
                        onMouseDown={(e) => handleBarMouseDown(e, task, 'move')}
                        className="absolute inset-x-2 top-0 bottom-0 cursor-grab active:cursor-grabbing flex items-center justify-between px-2 text-[11px] font-medium text-white select-none overflow-hidden"
                      >
                        <span className="truncate drop-shadow-sm">{task.title}</span>
                        <span className="text-[10px] opacity-80 font-mono">{task.progress}%</span>
                      </div>
                    )}

                    {/* Parent task label */}
                    {hasChildren && (
                      <div className="absolute inset-0 flex items-center px-2 text-[11px] font-semibold text-slate-200 truncate select-none">
                        {task.title} ({task.progress}%)
                      </div>
                    )}

                    {/* Right Resize Handle */}
                    {!hasChildren && (
                      <div
                        onMouseDown={(e) => handleBarMouseDown(e, task, 'resize-right')}
                        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/40 rounded-r-md opacity-0 group-hover:opacity-100 transition-opacity"
                      />
                    )}

                    {/* Tooltip on Hover */}
                    {isHovered && (
                      <div className="absolute left-1/2 -top-12 transform -translate-x-1/2 bg-slate-800 text-slate-100 text-[11px] py-1 px-2.5 rounded shadow-xl border border-slate-700 pointer-events-none z-50 whitespace-nowrap flex items-center gap-2">
                        <span className="font-bold text-indigo-400">{task.wbs} {task.title}</span>
                        <span className="text-slate-400">|</span>
                        <span>{task.startDate} ~ {task.endDate}</span>
                        <span className="text-slate-400">|</span>
                        <span className="text-emerald-400">{task.progress}% 완료</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
