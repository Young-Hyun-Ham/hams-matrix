import React, { useState, useRef, useEffect, useMemo } from 'react';
import './wbs-schedule-chart.css';
import { 
  ChevronRight, 
  ChevronDown, 
  Plus, 
  Trash2, 
  Layers, 
  Search,
  Filter
} from 'lucide-react';

// Initial WBS Sample Data
const INITIAL_TASKS = [
  {
    id: '1',
    wbs: '1.0',
    title: '프로젝트 기획 및 요구사항 정의',
    assignee: '김철수',
    startDate: '2025-03-01',
    endDate: '2025-03-12',
    progress: 100,
    status: 'completed',
    parentId: null,
    expanded: true,
  },
  {
    id: '1-1',
    wbs: '1.1',
    title: '요구사항 수집 및 분석',
    assignee: '김철수',
    startDate: '2025-03-01',
    endDate: '2025-03-05',
    progress: 100,
    status: 'completed',
    parentId: '1',
  },
  {
    id: '1-2',
    wbs: '1.2',
    title: '시스템 정보 구조(IA) 설계',
    assignee: '이영희',
    startDate: '2025-03-06',
    endDate: '2025-03-12',
    progress: 100,
    status: 'completed',
    parentId: '1',
  },
  {
    id: '2',
    wbs: '2.0',
    title: 'UI/UX 디자인 및 시안 제작',
    assignee: '이영희',
    startDate: '2025-03-10',
    endDate: '2025-03-22',
    progress: 60,
    status: 'in-progress',
    parentId: null,
    expanded: true,
  },
  {
    id: '2-1',
    wbs: '2.1',
    title: '와이어프레임 작성',
    assignee: '이영희',
    startDate: '2025-03-10',
    endDate: '2025-03-15',
    progress: 100,
    status: 'completed',
    parentId: '2',
  },
  {
    id: '2-2',
    wbs: '2.2',
    title: '메인 디자인 컴포넌트 설계',
    assignee: '박민수',
    startDate: '2025-03-16',
    endDate: '2025-03-22',
    progress: 20,
    status: 'in-progress',
    parentId: '2',
  },
  {
    id: '3',
    wbs: '3.0',
    title: '프론트엔드 및 백엔드 개발',
    assignee: '박민수',
    startDate: '2025-03-18',
    endDate: '2025-04-10',
    progress: 25,
    status: 'in-progress',
    parentId: null,
    expanded: true,
  },
  {
    id: '3-1',
    wbs: '3.1',
    title: '데이터베이스 스키마 및 API 설계',
    assignee: '정다은',
    startDate: '2025-03-18',
    endDate: '2025-03-25',
    progress: 70,
    status: 'in-progress',
    parentId: '3',
  },
  {
    id: '3-2',
    wbs: '3.2',
    title: 'WBS 타임라인 드래그 컴포넌트 개발',
    assignee: '박민수',
    startDate: '2025-03-24',
    endDate: '2025-04-05',
    progress: 10,
    status: 'in-progress',
    parentId: '3',
  },
  {
    id: '3-3',
    wbs: '3.3',
    title: '실시간 양방향 데이터 동기화 구현',
    assignee: '최현우',
    startDate: '2025-03-30',
    endDate: '2025-04-10',
    progress: 0,
    status: 'pending',
    parentId: '3',
  },
  {
    id: '4',
    wbs: '4.0',
    title: '통합 테스트 및 배포',
    assignee: '최현우',
    startDate: '2025-04-08',
    endDate: '2025-04-20',
    progress: 0,
    status: 'pending',
    parentId: null,
    expanded: true,
  }
];

// Helper functions for Date Manipulation
const parseDate = (str) => {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const formatDate = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const getDaysDiff = (start, end) => {
  const ms = parseDate(end).getTime() - parseDate(start).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
};

export default function WbsComponement() {
  const [tasks, setTasks] = useState(INITIAL_TASKS);
  const [viewMode, setViewMode] = useState('Day'); // 'Day' | 'Week' | 'Month'
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [splitPosition, setSplitPosition] = useState(45); // Left side width %
  const [isResizingSplit, setIsResizingSplit] = useState(false);

  // Dragging state for Gantt Bar
  const [dragState, setDragState] = useState(null); // { taskId, type: 'move'|'resize-left'|'resize-right', startX, originalStartDate, originalEndDate }
  const [hoveredTask, setHoveredTask] = useState(null);

  // Refs for scrolling synchronization
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
      const today = new Date();
      return { startDateRange: today, totalDays: 30, datesHeader: [] };
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
    const start = addDays(minDate, -5);
    const end = addDays(maxDate, 15);
    const days = Math.max(30, getDaysDiff(formatDate(start), formatDate(end)) + 1);

    // Build header dates array
    const dates = [];
    let curr = new Date(start);
    for (let i = 0; i < days; i++) {
      dates.push(new Date(curr));
      curr.setDate(curr.getDate() + 1);
    }

    return { startDateRange: start, totalDays: days, datesHeader: dates };
  }, [tasks]);

  // Handle Parent-Child Task calculation (Auto aggregate parent start/end/progress)
  useEffect(() => {
    setTasks(prevTasks => {
      const updated = [...prevTasks];
      let hasChanges = false;

      // Group subtasks by parent
      const parentIds = [...new Set(updated.filter(t => t.parentId).map(t => t.parentId))];

      parentIds.forEach(pId => {
        const subtasks = updated.filter(t => t.parentId === pId);
        const parentIndex = updated.findIndex(t => t.id === pId);

        if (parentIndex !== -1 && subtasks.length > 0) {
          let minStart = subtasks[0].startDate;
          let maxEnd = subtasks[0].endDate;
          let totalProgress = 0;

          subtasks.forEach(st => {
            if (st.startDate < minStart) minStart = st.startDate;
            if (st.endDate > maxEnd) maxEnd = st.endDate;
            totalProgress += st.progress;
          });

          const avgProgress = Math.round(totalProgress / subtasks.length);

          const parent = updated[parentIndex];
          if (parent.startDate !== minStart || parent.endDate !== maxEnd || parent.progress !== avgProgress) {
            updated[parentIndex] = {
              ...parent,
              startDate: minStart,
              endDate: maxEnd,
              progress: avgProgress
            };
            hasChanges = true;
          }
        }
      });

      return hasChanges ? updated : prevTasks;
    });
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
  const toggleExpand = (taskId) => {
    setTasks(tasks.map(t => t.id === taskId ? { ...t, expanded: !t.expanded } : t));
  };

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

  // Add Task
  const handleAddTask = (parentId = null) => {
    const todayStr = formatDate(new Date());
    const nextWeekStr = formatDate(addDays(new Date(), 5));
    
    let newWbs = `${tasks.length + 1}.0`;
    if (parentId) {
      const parent = tasks.find(t => t.id === parentId);
      const siblingCount = tasks.filter(t => t.parentId === parentId).length;
      newWbs = `${parent.wbs}.${siblingCount + 1}`;
    }

    const newTask = {
      id: Date.now().toString(),
      wbs: newWbs,
      title: parentId ? '신규 하위 작업' : '신규 모듈 작업',
      assignee: '담당자 미정',
      startDate: todayStr,
      endDate: nextWeekStr,
      progress: 0,
      status: 'pending',
      parentId: parentId,
      expanded: true
    };

    if (parentId) {
      // Expand parent if adding subtask
      setTasks(prev => prev.map(t => t.id === parentId ? { ...t, expanded: true } : t).concat(newTask));
    } else {
      setTasks(prev => [...prev, newTask]);
    }
  };

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

      if (daysShift === 0) return;

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
  }, [dragState, columnWidth]);

  // Splitter Resizing
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizingSplit) return;
      const newWidthPercent = (e.clientX / window.innerWidth) * 100;
      if (newWidthPercent > 20 && newWidthPercent < 75) {
        setSplitPosition(newWidthPercent);
      }
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

  // Quick stats calculation
  const stats = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter(t => t.progress === 100).length;
    const inProgress = tasks.filter(t => t.progress > 0 && t.progress < 100).length;
    const avgProgress = Math.round(tasks.reduce((acc, curr) => acc + curr.progress, 0) / (total || 1));
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
              WBS & Gantt Chart System
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
            onClick={() => handleAddTask(null)}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-all shadow-lg shadow-indigo-600/20 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>최상위 WBS 추가</span>
          </button>
        </div>
      </header>

      {/* FILTER & SEARCH BAR */}
      <div className="px-6 py-2 bg-slate-800/40 border-b border-slate-700/40 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 transform -translate-y-1/2" />
            <input
              type="text"
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
              <option value="completed">완료</option>
              <option value="in-progress">진행 중</option>
              <option value="pending">대기 중</option>
            </select>
          </div>
        </div>

        <div className="text-slate-400 text-[11px] flex items-center gap-2">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span> 드래그하여 일정 및 기간 변경 가능
          </span>
        </div>
      </div>

      {/* MAIN SPLIT-VIEW CONTENT AREA */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* LEFT PANEL: TREE TABLE GRID */}
        <div 
          style={{ width: `${splitPosition}%` }} 
          className="flex flex-col bg-slate-900/90 border-r border-slate-700/80 overflow-hidden"
        >
          {/* Table Header */}
          <div 
            ref={tableHeaderRef}
            className="flex items-center bg-slate-800/90 border-b border-slate-700 font-semibold text-xs text-slate-300 min-h-[40px] px-2 uppercase tracking-wider"
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
            className="flex-1 overflow-y-auto overflow-x-hidden divide-y divide-slate-800/60"
          >
            {visibleTasks.map((task) => {
              const hasChildren = tasks.some(t => t.parentId === task.id);
              const isParent = !task.parentId;

              return (
                <div 
                  key={task.id}
                  onMouseEnter={() => setHoveredTask(task.id)}
                  onMouseLeave={() => setHoveredTask(null)}
                  className={`flex items-center min-h-[44px] text-xs transition-colors hover:bg-slate-800/50 ${
                    hoveredTask === task.id ? 'bg-slate-800/40' : ''
                  } ${isParent ? 'font-semibold bg-slate-800/20' : ''}`}
                >
                  {/* WBS Code */}
                  <div className="w-16 px-2 text-center text-indigo-400 font-mono text-[11px] truncate">
                    {task.wbs}
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
                      type="text"
                      value={task.assignee}
                      onChange={(e) => handleTaskChange(task.id, 'assignee', e.target.value)}
                      className="bg-transparent text-center w-full focus:bg-slate-800 px-1 py-0.5 rounded border border-transparent focus:border-slate-600 focus:outline-none text-slate-400 truncate"
                    />
                  </div>

                  {/* Start Date */}
                  <div className="w-24 px-1">
                    <input
                      type="date"
                      value={task.startDate}
                      disabled={hasChildren}
                      onChange={(e) => handleTaskChange(task.id, 'startDate', e.target.value)}
                      className="bg-transparent text-center w-full focus:bg-slate-800 px-0.5 py-0.5 rounded border border-transparent focus:border-slate-600 focus:outline-none text-slate-300 text-[11px] disabled:opacity-50"
                    />
                  </div>

                  {/* End Date */}
                  <div className="w-24 px-1">
                    <input
                      type="date"
                      value={task.endDate}
                      disabled={hasChildren}
                      onChange={(e) => handleTaskChange(task.id, 'endDate', e.target.value)}
                      className="bg-transparent text-center w-full focus:bg-slate-800 px-0.5 py-0.5 rounded border border-transparent focus:border-slate-600 focus:outline-none text-slate-300 text-[11px] disabled:opacity-50"
                    />
                  </div>

                  {/* Progress % */}
                  <div className="w-16 px-1 flex items-center justify-center">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={task.progress}
                      disabled={hasChildren}
                      onChange={(e) => handleTaskChange(task.id, 'progress', Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                      className="bg-transparent text-center w-10 focus:bg-slate-800 px-0.5 py-0.5 rounded border border-transparent focus:border-slate-600 focus:outline-none text-slate-300 text-[11px] disabled:opacity-50"
                    />
                    <span className="text-[10px] text-slate-500">%</span>
                  </div>

                  {/* Actions */}
                  <div className="w-12 px-1 flex items-center justify-center space-x-1">
                    {isParent && (
                      <button
                        onClick={() => handleAddTask(task.id)}
                        title="하위 작업 추가"
                        className="p-1 hover:bg-indigo-600/30 text-indigo-400 rounded transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
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
          onMouseDown={() => setIsResizingSplit(true)}
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
                const dayNum = d.getDate();
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                const isToday = formatDate(d) === formatDate(new Date());

                return (
                  <div
                    key={index}
                    style={{ width: `${columnWidth}px` }}
                    className={`flex flex-col items-center justify-center border-r border-slate-700/40 text-[11px] ${
                      isWeekend ? 'bg-slate-900/40 text-slate-500' : ''
                    } ${isToday ? 'bg-indigo-900/30 font-bold text-indigo-400' : ''}`}
                  >
                    <span>{d.getMonth() + 1}/{dayNum}</span>
                    <span className="text-[9px] opacity-60">
                      {['일', '월', '화', '수', '목', '금', '토'][d.getDay()]}
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
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  const isToday = formatDate(d) === formatDate(new Date());

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
                const hasChildren = tasks.some(t => t.parentId === task.id);
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
