// Written and refined by Gemini - Continuing from previous agent's milestone
// Main React application component for Class Joiner dashboard, schedule management, and live monitor

import React, { useEffect, useState, useCallback } from 'react';
import {
  Plus,
  ShieldCheck,
  Settings,
  Clock,
  BookOpen,
  X,
  Check,
  MicOff,
  VideoOff,
  RefreshCw,
  CloudDownload,
  AlertTriangle,
  Bell,
  Terminal,
  Sun,
  Moon,
} from 'lucide-react';
import {
  AppSettings,
  BotStatusPayload,
  ClassSchedule,
  DayOfWeek,
  LogEntry,
  NextClassInfo,
} from '../electron/types';
import { ClassCard } from './components/ClassCard';
import { TimePicker } from './components/TimePicker';
import { LiveConsole } from './components/LiveConsole';

export const App: React.FC = () => {
  const [classes, setClasses] = useState<ClassSchedule[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    scanIntervalSeconds: 30,
    maxScanDurationMinutes: 5,
    alwaysMuteMic: true,
    alwaysTurnOffCam: true,
    isGoogleAuthenticated: false,
  });
  const [botStatus, setBotStatus] = useState<BotStatusPayload>({
    state: 'IDLE',
    activeClassId: null,
    activeClassName: null,
    message: 'Waiting for scheduled class time...',
  });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [systemTime, setSystemTime] = useState<Date>(new Date());
  const [nextClass, setNextClass] = useState<NextClassInfo | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Live Terminal Visibility (persisted in localStorage)
  const [isTerminalVisible, setIsTerminalVisible] = useState<boolean>(() => {
    return localStorage.getItem('class_joiner_terminal_visible') !== 'false';
  });

  const toggleTerminal = useCallback(() => {
    setIsTerminalVisible((prev) => {
      const next = !prev;
      localStorage.setItem('class_joiner_terminal_visible', String(next));
      return next;
    });
  }, []);

  // Theme Mode: Light Mode and Dark Mode (persisted in localStorage)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('class_joiner_theme') as 'dark' | 'light') || 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('class_joiner_theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  // Format countdown into human readable hours and minutes (e.g., "1h 45m" or "45m")
  const formatCountdown = useCallback((totalMinutes: number): string => {
    if (totalMinutes <= 0) return 'Starting now!';
    const days = Math.floor(totalMinutes / (24 * 60));
    const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
    const mins = totalMinutes % 60;

    if (days > 0) {
      if (hours > 0 && mins > 0) return `${days}d ${hours}h ${mins}m`;
      if (hours > 0) return `${days}d ${hours}h`;
      return `${days}d ${mins}m`;
    }
    if (hours > 0) {
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }
    return `${mins}m`;
  }, []);

  // Modal States
  const [isClassModalOpen, setIsClassModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // Form State for Adding/Editing a Class
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingNeedsSchedule, setEditingNeedsSchedule] = useState(false);
  const [courseCode, setCourseCode] = useState('');
  const [courseName, setCourseName] = useState('');
  const [section, setSection] = useState('');
  const [classroomUrl, setClassroomUrl] = useState('');
  const [days, setDays] = useState<DayOfWeek[]>(['Sun', 'Tue']);
  const [startTime, setStartTime] = useState('09:40');
  const [endTime, setEndTime] = useState('11:10');
  const [autoLeaveAtEnd, setAutoLeaveAtEnd] = useState(false);
  const [formError, setFormError] = useState('');

  // Load initial state & subscribe to Electron IPC events
  useEffect(() => {
    const init = async () => {
      const [loadedClasses, loadedSettings, initialStatus, initialLogs] =
        await Promise.all([
          window.electronAPI.getClasses(),
          window.electronAPI.getSettings(),
          window.electronAPI.getBotStatus(),
          window.electronAPI.getLogs(),
        ]);
      setClasses(loadedClasses);
      setSettings(loadedSettings);
      setBotStatus(initialStatus);
      setLogs(initialLogs);

      // Fetch initial next class info
      const next = await window.electronAPI.getNextClass();
      setNextClass(next);
    };
    void init();

    const unsubStatus = window.electronAPI.onStatusUpdate((s) => setBotStatus(s));
    const unsubLogs = window.electronAPI.onNewLog((log) =>
      setLogs((prev) => [log, ...prev].slice(0, 250))
    );
    const unsubClasses = window.electronAPI.onClassesUpdated((updated) =>
      setClasses(updated)
    );

    const clockInterval = setInterval(() => setSystemTime(new Date()), 1000);

    // Poll for next class info every 10 seconds
    const nextClassInterval = setInterval(async () => {
      try {
        const next = await window.electronAPI.getNextClass();
        setNextClass(next);
      } catch {
        // Silently ignore polling errors
      }
    }, 10000);

    return () => {
      unsubStatus();
      unsubLogs();
      unsubClasses();
      clearInterval(clockInterval);
      clearInterval(nextClassInterval);
    };
  }, []);

  const openAddModal = () => {
    setEditingId(null);
    setEditingNeedsSchedule(false);
    setCourseCode('');
    setCourseName('');
    setSection('Sec 1');
    setClassroomUrl('');
    setDays(['Sun', 'Tue']);
    setStartTime('09:40');
    setEndTime('11:10');
    setAutoLeaveAtEnd(false);
    setFormError('');
    setIsClassModalOpen(true);
  };

  const openEditModal = (cls: ClassSchedule) => {
    setEditingId(cls.id);
    setEditingNeedsSchedule(cls.needsSchedule === true);
    setCourseCode(cls.courseCode);
    setCourseName(cls.courseName);
    setSection(cls.section || '');
    setClassroomUrl(cls.classroomUrl);
    setDays(cls.days && cls.days.length > 0 ? cls.days : ['Sun', 'Tue']);
    setStartTime(cls.startTime || '09:40');
    setEndTime(cls.endTime || '11:10');
    setAutoLeaveAtEnd(cls.autoLeaveAtEnd);
    setFormError('');
    setIsClassModalOpen(true);
  };

  const handleSaveClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseCode.trim() || !courseName.trim() || !classroomUrl.trim()) {
      setFormError('Please fill in Course Code, Course Name, and Google Classroom URL.');
      return;
    }
    if (days.length === 0) {
      setFormError('Please select at least one day of the week.');
      return;
    }
    if (!/^https?:\/\//i.test(classroomUrl.trim())) {
      setFormError('Classroom URL must start with https://');
      return;
    }

    const existingCls = classes.find((c) => c.id === editingId);

    const payload: ClassSchedule = {
      id: editingId || `class-${Date.now()}`,
      courseCode: courseCode.trim().toUpperCase(),
      courseName: courseName.trim(),
      section: section.trim() || undefined,
      classroomUrl: classroomUrl.trim(),
      googleClassroomId: existingCls?.googleClassroomId,
      days,
      startTime,
      endTime,
      enabled: true,
      autoLeaveAtEnd,
      // When saving a schedule, clear the needsSchedule flag and mark configured
      needsSchedule: false,
      isScheduleConfigured: true,
    };

    const updated = await window.electronAPI.saveClass(payload);
    setClasses(updated);
    setIsClassModalOpen(false);
  };

  const handleDeleteClass = async (id: string) => {
    const updated = await window.electronAPI.deleteClass(id);
    setClasses(updated);
  };

  const handleToggleClass = async (id: string, enabled: boolean) => {
    const updated = await window.electronAPI.toggleClass(id, enabled);
    setClasses(updated);
  };

  const handleTriggerNow = async (id: string) => {
    await window.electronAPI.triggerClassNow(id);
  };

  const handleGoogleLogin = async () => {
    await window.electronAPI.openGoogleLogin();
    const updatedSettings = await window.electronAPI.getSettings();
    setSettings(updatedSettings);
  };

  const handleUpdateSettings = async (partial: Partial<AppSettings>) => {
    const updated = await window.electronAPI.updateSettings(partial);
    setSettings(updated);
  };

  const handleSyncClassroom = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const updated = await window.electronAPI.syncClassroom();
      setClasses(updated);
    } catch {
      // Error is surfaced via logs/status
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing]);

  // Split classes into unconfigured (needs schedule) and configured
  const unconfiguredClasses = classes.filter((cls) => cls.needsSchedule === true);
  const configuredClasses = classes.filter((cls) => cls.needsSchedule !== true);

  return (
    <div className="app-shell">
      {/* Simplified Header */}
      <header className="iub-header">
        <div className="brand-identity">
          <div className="iub-crest-emblem" title="Classroom Class Joiner">
            <BookOpen size={20} />
          </div>
          <div className="brand-titles">
            <h1>Classroom Class Joiner (Alpha)</h1>
            <p>Classroom & Meet Automation</p>
          </div>
        </div>

        <div className="header-right-controls">
          {/* Live System Clock Pill */}
          <div className="live-clock-pill">
            <Clock size={15} className="gold-icon" />
            <span className="clock-day">
              {systemTime.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
            </span>
            <span className="clock-divider">|</span>
            <span className="clock-time">
              {systemTime.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </span>
          </div>

          {/* Persistent Google Login Button */}
          <button
            type="button"
            className={`btn-google-auth ${settings.isGoogleAuthenticated ? 'authenticated' : ''}`}
            onClick={handleGoogleLogin}
          >
            <ShieldCheck size={16} />
            <span>
              {settings.isGoogleAuthenticated ? 'Google Session Saved' : 'Login with Google'}
            </span>
          </button>

          {/* Terminal Hide/Unhide Toggle Button */}
          <button
            type="button"
            className={`btn-header-terminal ${isTerminalVisible ? 'active' : ''}`}
            onClick={toggleTerminal}
            title={isTerminalVisible ? 'Hide Live Terminal' : 'Show Live Terminal'}
          >
            <Terminal size={16} />
            <span>{isTerminalVisible ? 'Hide Terminal' : 'Show Terminal'}</span>
          </button>

          {/* Light / Dark Mode Toggle Button */}
          <button
            type="button"
            className="btn-header-theme"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>

          {/* Engine Settings Button */}
          <button
            type="button"
            className="btn-header-settings"
            onClick={() => setIsSettingsModalOpen(true)}
            title="Automation Engine Settings"
          >
            <Settings size={18} />
          </button>
        </div>
      </header>

      {/* Main Content Workspace */}
      <main className={`main-workspace ${!isTerminalVisible ? 'terminal-hidden' : ''}`}>
        {/* Left/Center Column: Scheduled Classes Dashboard */}
        <section className="dashboard-column">
          {/* Next Class Countdown Banner */}
          {nextClass && (
            <div className="next-class-banner">
              <div className="next-class-info">
                <Bell size={20} className="next-class-icon" />
                <div className="next-class-details">
                  <h4>Next: {nextClass.courseCode} — {nextClass.courseName}</h4>
                  <p>Starts at {nextClass.startTime}</p>
                </div>
              </div>
              <div className="next-class-countdown">
                {formatCountdown(nextClass.minutesUntil)}
                <small>until class</small>
              </div>
            </div>
          )}

          <div className="dashboard-toolbar">
            <div>
              <h2 className="section-heading">Scheduled Courses</h2>
              <p className="section-subheading">
                At class start time, the engine opens your Classroom page, scans for the Meet link every {settings.scanIntervalSeconds}s (up to {settings.maxScanDurationMinutes} mins), mutes Mic/Cam, and joins.
              </p>
            </div>

            <div className="dashboard-buttons">
              <button
                type="button"
                className="btn-sync-classroom"
                onClick={handleSyncClassroom}
                disabled={isSyncing}
                title="Sync courses from Google Classroom"
              >
                <CloudDownload size={18} className={isSyncing ? 'spinning' : ''} />
                <span>{isSyncing ? 'Syncing...' : 'Sync from Classroom'}</span>
              </button>

              <button type="button" className="btn-add-class" onClick={openAddModal}>
                <Plus size={18} />
                <span>Add Course</span>
              </button>
            </div>
          </div>

          {/* Active Safety Status Pills */}
          <div className="feature-Guarantee-bar">
            <div className="guarantee-pill">
              <MicOff size={14} />
              <span>Auto-Mute Microphone: {settings.alwaysMuteMic ? 'ON' : 'OFF'}</span>
            </div>
            <div className="guarantee-pill">
              <VideoOff size={14} />
              <span>Auto-Camera Off: {settings.alwaysTurnOffCam ? 'ON' : 'OFF'}</span>
            </div>
            <div className="guarantee-pill">
              <RefreshCw size={14} />
              <span>
                Refresh & Scan: Every {settings.scanIntervalSeconds}s for {settings.maxScanDurationMinutes}m
              </span>
            </div>
          </div>

          {/* Unconfigured / Imported Classes Section */}
          {unconfiguredClasses.length > 0 && (
            <div className="unconfigured-section">
              <div className="unconfigured-section-header">
                <AlertTriangle size={16} />
                <span>Imported Courses — Set Schedule ({unconfiguredClasses.length})</span>
              </div>
              <div className="unconfigured-grid">
                {unconfiguredClasses.map((cls) => (
                  <ClassCard
                    key={cls.id}
                    cls={cls}
                    isCurrentlyScanning={false}
                    onToggle={handleToggleClass}
                    onTriggerNow={handleTriggerNow}
                    onEdit={openEditModal}
                    onDelete={handleDeleteClass}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Configured Classes */}
          {configuredClasses.length === 0 && unconfiguredClasses.length === 0 ? (
            <div className="empty-dashboard-card">
              <CloudDownload size={42} className="empty-icon" />
              <h3>No Classes Configured Yet</h3>
              <p>
                Sync your classes from Google Classroom to get started, or add a course manually.
              </p>
              <button
                type="button"
                className="btn-sync-classroom"
                onClick={handleSyncClassroom}
                disabled={isSyncing}
              >
                <CloudDownload size={18} className={isSyncing ? 'spinning' : ''} />
                <span>{isSyncing ? 'Syncing...' : 'Sync from Google Classroom'}</span>
              </button>
            </div>
          ) : configuredClasses.length > 0 ? (
            <div className="classes-grid">
              {configuredClasses.map((cls) => (
                <ClassCard
                  key={cls.id}
                  cls={cls}
                  isCurrentlyScanning={
                    botStatus.activeClassId === cls.id &&
                    botStatus.state !== 'IDLE' &&
                    botStatus.state !== 'ERROR'
                  }
                  onToggle={handleToggleClass}
                  onTriggerNow={handleTriggerNow}
                  onEdit={openEditModal}
                  onDelete={handleDeleteClass}
                />
              ))}
            </div>
          ) : null}
        </section>

        {/* Right Column: Live Status Monitor & Real-Time Log Console */}
        {isTerminalVisible && (
          <LiveConsole
            status={botStatus}
            logs={logs}
            onClearLogs={() => window.electronAPI.clearLogs().then(() => setLogs([]))}
            onCancelTask={() => window.electronAPI.cancelActiveTask()}
            onHide={() => {
              setIsTerminalVisible(false);
              localStorage.setItem('class_joiner_terminal_visible', 'false');
            }}
          />
        )}
      </main>

      {/* Floating Console Toggle Button when Terminal is Hidden */}
      {!isTerminalVisible && (
        <button
          type="button"
          className="btn-floating-terminal"
          onClick={() => {
            setIsTerminalVisible(true);
            localStorage.setItem('class_joiner_terminal_visible', 'true');
          }}
          title="Open Live Terminal & Automation Monitor"
        >
          <span className={`pulse-dot-mini ${botStatus.state.toLowerCase()}`} />
          <Terminal size={15} />
          <span>Live Terminal</span>
        </button>
      )}

      {/* Add / Edit Class Modal with Dedicated Visual Clock TimePicker */}
      {isClassModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-window">
            <div className="modal-header">
              <h2>
                {editingId
                  ? editingNeedsSchedule
                    ? 'Set Course Schedule'
                    : 'Edit Course Schedule'
                  : 'Add New Course Schedule'}
              </h2>
              <button
                type="button"
                className="btn-close-modal"
                onClick={() => setIsClassModalOpen(false)}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveClass} className="modal-body-form">
              {formError && <div className="form-error-banner">{formError}</div>}

              <div className="form-row-three">
                <div className="form-group">
                  <label>Course Code *</label>
                  <input
                    type="text"
                    placeholder="e.g., CSE 203"
                    value={courseCode}
                    onChange={(e) => setCourseCode(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Course Title *</label>
                  <input
                    type="text"
                    placeholder="e.g., Data Structures"
                    value={courseName}
                    onChange={(e) => setCourseName(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Section</label>
                  <input
                    type="text"
                    placeholder="e.g., Sec 2"
                    value={section}
                    onChange={(e) => setSection(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Google Classroom Course URL *</label>
                <input
                  type="url"
                  placeholder="https://classroom.google.com/u/0/c/..."
                  value={classroomUrl}
                  onChange={(e) => setClassroomUrl(e.target.value)}
                />
              </div>

              {/* Dedicated Visual Clock & Day Picker Component */}
              <TimePicker
                selectedDays={days}
                onChangeDays={setDays}
                startTime={startTime}
                onChangeStartTime={setStartTime}
                endTime={endTime}
                onChangeEndTime={setEndTime}
              />

              <div className="form-checkbox-row">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={autoLeaveAtEnd}
                    onChange={(e) => setAutoLeaveAtEnd(e.target.checked)}
                  />
                  <span>
                    Automatically leave Google Meet call when End Time ({endTime}) is reached
                  </span>
                </label>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsClassModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary-gold">
                  <Check size={17} />
                  <span>
                    {editingId
                      ? editingNeedsSchedule
                        ? 'Save Schedule'
                        : 'Update Schedule'
                      : 'Save Class Schedule'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Automation Settings Modal */}
      {isSettingsModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-window settings-modal">
            <div className="modal-header">
              <h2>Refresh & Scan Engine Settings</h2>
              <button
                type="button"
                className="btn-close-modal"
                onClick={() => setIsSettingsModalOpen(false)}
              >
                <X size={20} />
              </button>
            </div>

            <div className="modal-body-form">
              <div className="form-row-two">
                <div className="form-group">
                  <label>Auto-Refresh Interval (Seconds)</label>
                  <input
                    type="number"
                    min={10}
                    max={120}
                    value={settings.scanIntervalSeconds}
                    onChange={(e) =>
                      handleUpdateSettings({
                        scanIntervalSeconds: Number(e.target.value) || 30,
                      })
                    }
                  />
                  <small>Default: 30 seconds between Classroom page reloads</small>
                </div>

                <div className="form-group">
                  <label>Maximum Scan Window (Minutes)</label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={settings.maxScanDurationMinutes}
                    onChange={(e) =>
                      handleUpdateSettings({
                        maxScanDurationMinutes: Number(e.target.value) || 5,
                      })
                    }
                  />
                  <small>Default: 5 minutes total retry window after class starts</small>
                </div>
              </div>

              <div className="form-checkbox-row">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={settings.alwaysMuteMic}
                    onChange={(e) =>
                      handleUpdateSettings({ alwaysMuteMic: e.target.checked })
                    }
                  />
                  <span>Always mute Microphone before clicking "Join now"</span>
                </label>
              </div>

              <div className="form-checkbox-row">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={settings.alwaysTurnOffCam}
                    onChange={(e) =>
                      handleUpdateSettings({ alwaysTurnOffCam: e.target.checked })
                    }
                  />
                  <span>Always turn off Camera before clicking "Join now"</span>
                </label>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-primary-gold"
                  onClick={() => setIsSettingsModalOpen(false)}
                >
                  <Check size={16} /> Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};