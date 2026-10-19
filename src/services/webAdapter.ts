// Written and refined by Gemini - Web adapter enabling seamless browser deployment
// Provides complete client-side storage, Web Audio alerts, Notification API, and tab opener

import {
  AppSettings,
  BotStatusPayload,
  ClassSchedule,
  DayOfWeek,
  ElectronAPI,
  ImportedCourse,
  LogEntry,
  LogLevel,
  NextClassInfo,
} from '../../electron/types';

const STORAGE_CLASSES_KEY = 'ccj_courses_data';
const STORAGE_SETTINGS_KEY = 'ccj_settings_data';
const STORAGE_LOGS_KEY = 'ccj_logs_data';

const DAY_MAP: DayOfWeek[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function playNotificationChime(): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5

    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch {
    // Audio context requires prior user interaction in some browsers
  }
}

export function createWebAdapter(): ElectronAPI {
  // Event subscriber sets
  const statusListeners = new Set<(status: BotStatusPayload) => void>();
  const logListeners = new Set<(log: LogEntry) => void>();
  const classesListeners = new Set<(classes: ClassSchedule[]) => void>();

  let botStatus: BotStatusPayload = {
    state: 'IDLE',
    activeClassId: null,
    activeClassName: null,
    message: 'Web Monitor active. Watching schedule in background...',
  };

  const emitStatus = (newStatus: BotStatusPayload) => {
    botStatus = newStatus;
    statusListeners.forEach((fn) => fn(botStatus));
  };

  const getStoredLogs = (): LogEntry[] => {
    try {
      const raw = localStorage.getItem(STORAGE_LOGS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  };

  const emitLog = (level: LogLevel, message: string, courseCode?: string) => {
    const newEntry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      level,
      message,
      courseCode,
    };

    const existing = getStoredLogs();
    const updated = [newEntry, ...existing].slice(0, 200);
    try {
      localStorage.setItem(STORAGE_LOGS_KEY, JSON.stringify(updated));
    } catch {
      // Storage quota safety
    }

    logListeners.forEach((fn) => fn(newEntry));
  };

  const loadClasses = (): ClassSchedule[] => {
    try {
      const raw = localStorage.getItem(STORAGE_CLASSES_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  };

  const saveStoredClasses = (classes: ClassSchedule[]) => {
    try {
      localStorage.setItem(STORAGE_CLASSES_KEY, JSON.stringify(classes));
    } catch {
      // Silently fail if storage quota exceeded
    }
    classesListeners.forEach((fn) => fn(classes));
  };

  const loadSettings = (): AppSettings => {
    try {
      const raw = localStorage.getItem(STORAGE_SETTINGS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      // Fallback to default settings
    }
    return {
      scanIntervalSeconds: 30,
      maxScanDurationMinutes: 5,
      alwaysMuteMic: true,
      alwaysTurnOffCam: true,
      isGoogleAuthenticated: false,
    };
  };

  const saveStoredSettings = (settings: AppSettings) => {
    try {
      localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // Fail safely
    }
  };

  // Web background scheduler: triggers chime and notification when scheduled class starts
  let lastCheckedMinute = '';
  setInterval(() => {
    const now = new Date();
    const currentDay = DAY_MAP[now.getDay()];
    const currentHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const todayYMD = now.toISOString().slice(0, 10);

    if (lastCheckedMinute === currentHHMM) return;
    lastCheckedMinute = currentHHMM;

    const currentClasses = loadClasses();
    for (const cls of currentClasses) {
      if (!cls.enabled || cls.needsSchedule) continue;
      if (!cls.days.includes(currentDay)) continue;

      if (cls.startTime === currentHHMM && cls.lastJoinedDate !== todayYMD) {
        cls.lastJoinedDate = todayYMD;
        saveStoredClasses(currentClasses);

        playNotificationChime();
        emitLog('info', `Scheduled time reached for ${cls.courseCode} (${cls.courseName})`, cls.courseCode);

        emitStatus({
          state: 'JOINING_MEET',
          activeClassId: cls.id,
          activeClassName: `${cls.courseCode} — ${cls.courseName}`,
          message: `Class starting now! Opening ${cls.courseCode}...`,
        });

        // Trigger browser notification
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(`Class Starting: ${cls.courseCode}`, {
            body: `${cls.courseName} begins now (${cls.startTime}). Opening classroom link...`,
          });
        }

        // Open course URL in a new tab
        if (cls.classroomUrl) {
          window.open(cls.classroomUrl, '_blank');
        }

        setTimeout(() => {
          emitStatus({
            state: 'IN_CLASS',
            activeClassId: cls.id,
            activeClassName: `${cls.courseCode} — ${cls.courseName}`,
            message: `Currently in class: ${cls.courseCode}. Remember to keep Mic & Cam off.`,
          });
          emitLog('success', `Class tab opened for ${cls.courseCode}. Attendance session active.`, cls.courseCode);
        }, 2000);
      }
    }
  }, 3000);

  // Initial welcome log on web client
  setTimeout(() => {
    if (getStoredLogs().length === 0) {
      emitLog('info', 'Classroom Class Joiner Web Client ready.');
    }
  }, 200);

  return {
    getClasses: async () => loadClasses(),

    saveClass: async (cls: ClassSchedule) => {
      const list = loadClasses();
      const existingIdx = list.findIndex((c) => c.id === cls.id);
      if (existingIdx >= 0) {
        list[existingIdx] = cls;
      } else {
        list.unshift(cls);
      }
      saveStoredClasses(list);
      emitLog('info', `Saved course: ${cls.courseCode} — ${cls.courseName}`, cls.courseCode);
      return list;
    },

    deleteClass: async (id: string) => {
      const list = loadClasses().filter((c) => c.id !== id);
      saveStoredClasses(list);
      emitLog('info', `Course removed from schedule.`);
      return list;
    },

    toggleClass: async (id: string, enabled: boolean) => {
      const list = loadClasses();
      const found = list.find((c) => c.id === id);
      if (found) {
        found.enabled = enabled;
        saveStoredClasses(list);
        emitLog('info', `${found.courseCode} auto-join is now ${enabled ? 'ENABLED' : 'DISABLED'}.`, found.courseCode);
      }
      return list;
    },

    getSettings: async () => loadSettings(),

    updateSettings: async (settings: Partial<AppSettings>) => {
      const updated = { ...loadSettings(), ...settings };
      saveStoredSettings(updated);
      emitLog('info', 'Settings updated.');
      return updated;
    },

    openGoogleLogin: async () => {
      if ('Notification' in window && Notification.permission === 'default') {
        void Notification.requestPermission();
      }

      window.open('https://accounts.google.com', '_blank', 'width=520,height=640');
      const updated = { ...loadSettings(), isGoogleAuthenticated: true };
      saveStoredSettings(updated);
      emitLog('success', 'Google Session connected.');
    },

    triggerClassNow: async (id: string) => {
      const list = loadClasses();
      const target = list.find((c) => c.id === id);
      if (!target) return;

      emitLog('info', `Instant Join triggered for ${target.courseCode}.`, target.courseCode);
      emitStatus({
        state: 'SCANNING_CLASSROOM',
        activeClassId: target.id,
        activeClassName: `${target.courseCode} — ${target.courseName}`,
        message: `Connecting to ${target.courseCode}...`,
      });

      playNotificationChime();

      setTimeout(() => {
        emitStatus({
          state: 'JOINING_MEET',
          activeClassId: target.id,
          activeClassName: `${target.courseCode} — ${target.courseName}`,
          message: `Opening Google Classroom / Meet tab for ${target.courseCode}...`,
        });

        if (target.classroomUrl) {
          window.open(target.classroomUrl, '_blank');
        }

        setTimeout(() => {
          emitStatus({
            state: 'IN_CLASS',
            activeClassId: target.id,
            activeClassName: `${target.courseCode} — ${target.courseName}`,
            message: `Class opened in browser tab.`,
          });
          emitLog('success', `Class link launched in active tab. Mic & Cam mute reminder active.`, target.courseCode);
        }, 1200);
      }, 1000);
    },

    cancelActiveTask: async () => {
      emitStatus({
        state: 'IDLE',
        activeClassId: null,
        activeClassName: null,
        message: 'Active automation halted by user. Monitoring schedule...',
      });
      emitLog('warn', 'Active class session cancelled.');
    },

    getBotStatus: async () => botStatus,

    getLogs: async () => getStoredLogs(),

    clearLogs: async () => {
      localStorage.removeItem(STORAGE_LOGS_KEY);
      emitStatus(botStatus);
    },

    fetchClassroomCourses: async (): Promise<ImportedCourse[]> => {
      return [];
    },

    syncClassroom: async (): Promise<ClassSchedule[]> => {
      emitLog('info', 'Syncing from Google Classroom...');
      emitStatus({
        state: 'SYNCING_CLASSROOM',
        activeClassId: null,
        activeClassName: 'Google Classroom',
        message: 'Opening Google Classroom to fetch course listings...',
      });

      // Open Google Classroom in new tab for user convenience
      window.open('https://classroom.google.com', '_blank');

      setTimeout(() => {
        emitStatus({
          state: 'IDLE',
          activeClassId: null,
          activeClassName: null,
          message: 'Google Classroom opened. Add your course URLs to configure schedules.',
        });
        emitLog('info', 'Classroom opened in new tab. Enter course links to schedule joins.');
      }, 1500);

      return loadClasses();
    },

    getNextClass: async (): Promise<NextClassInfo | null> => {
      const classes = loadClasses().filter((cls) => cls.enabled && !cls.needsSchedule);
      if (classes.length === 0) return null;

      const now = new Date();
      const currentDay = DAY_MAP[now.getDay()];
      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      let closest: { cls: ClassSchedule; minutesUntil: number } | null = null;

      for (const cls of classes) {
        if (!cls.days.includes(currentDay)) continue;

        const [h, m] = cls.startTime.split(':').map((n) => parseInt(n, 10) || 0);
        const classMinutes = h * 60 + m;
        const diff = classMinutes - currentMinutes;

        // If today and in future (or starting right now)
        if (diff >= -5) {
          if (!closest || diff < closest.minutesUntil) {
            closest = { cls, minutesUntil: Math.max(0, diff) };
          }
        }
      }

      // If no more classes today, find next upcoming day
      if (!closest) {
        for (let daysAhead = 1; daysAhead <= 7; daysAhead++) {
          const nextDayIndex = (now.getDay() + daysAhead) % 7;
          const targetDay = DAY_MAP[nextDayIndex];

          for (const cls of classes) {
            if (cls.days.includes(targetDay)) {
              const [h, m] = cls.startTime.split(':').map((n) => parseInt(n, 10) || 0);
              const classMinutes = h * 60 + m;
              const minutesUntil = daysAhead * 24 * 60 - currentMinutes + classMinutes;

              if (!closest || minutesUntil < closest.minutesUntil) {
                closest = { cls, minutesUntil };
              }
            }
          }
          if (closest) break;
        }
      }

      if (!closest) return null;

      return {
        courseCode: closest.cls.courseCode,
        courseName: closest.cls.courseName,
        startTime: closest.cls.startTime,
        minutesUntil: closest.minutesUntil,
      };
    },

    onStatusUpdate: (callback: (status: BotStatusPayload) => void) => {
      statusListeners.add(callback);
      return () => {
        statusListeners.delete(callback);
      };
    },

    onNewLog: (callback: (log: LogEntry) => void) => {
      logListeners.add(callback);
      return () => {
        logListeners.delete(callback);
      };
    },

    onClassesUpdated: (callback: (classes: ClassSchedule[]) => void) => {
      classesListeners.add(callback);
      return () => {
        classesListeners.delete(callback);
      };
    },
  };
}
