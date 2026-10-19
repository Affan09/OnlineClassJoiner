// Written and refined by Gemini - Continuing from previous agent's milestone
// Type definitions for IUB Class Joiner automation engine and IPC bridge

export type DayOfWeek = 'Sun' | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat';

export interface ClassSchedule {
  id: string;
  courseCode: string;
  courseName: string;
  section?: string;
  classroomUrl: string;
  googleClassroomId?: string;
  days: DayOfWeek[];
  startTime: string; // 24-hour format "HH:mm" e.g. "09:40"
  endTime: string;   // 24-hour format "HH:mm" e.g. "11:10"
  enabled: boolean;
  autoLeaveAtEnd: boolean;
  needsSchedule?: boolean;
  isScheduleConfigured?: boolean;
  lastJoinedDate?: string; // "YYYY-MM-DD" to prevent duplicate auto-triggers same day
}

export interface ImportedCourse {
  id: string;
  name: string;
  section?: string;
  url: string;
  courseCode?: string;
}

export interface NextClassInfo {
  courseCode: string;
  courseName: string;
  startTime: string;
  minutesUntil: number;
}

export type BotState =
  | 'IDLE'
  | 'AUTH_OPEN'
  | 'SCANNING_CLASSROOM'
  | 'WAITING_RETRY'
  | 'JOINING_MEET'
  | 'IN_CLASS'
  | 'SYNCING_CLASSROOM'
  | 'ERROR';

export interface BotStatusPayload {
  state: BotState;
  activeClassId: string | null;
  activeClassName: string | null;
  message: string;
  attempt?: number;
  maxAttempts?: number;
  nextRetryInSeconds?: number;
}

export type LogLevel = 'info' | 'success' | 'warn' | 'error';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  courseCode?: string;
}

export interface AppSettings {
  scanIntervalSeconds: number; // Default: 30
  maxScanDurationMinutes: number; // Default: 5
  alwaysMuteMic: boolean;
  alwaysTurnOffCam: boolean;
  isGoogleAuthenticated: boolean;
}

export interface ElectronAPI {
  getClasses: () => Promise<ClassSchedule[]>;
  saveClass: (cls: ClassSchedule) => Promise<ClassSchedule[]>;
  deleteClass: (id: string) => Promise<ClassSchedule[]>;
  toggleClass: (id: string, enabled: boolean) => Promise<ClassSchedule[]>;
  getSettings: () => Promise<AppSettings>;
  updateSettings: (settings: Partial<AppSettings>) => Promise<AppSettings>;
  openGoogleLogin: () => Promise<void>;
  triggerClassNow: (id: string) => Promise<void>;
  cancelActiveTask: () => Promise<void>;
  getBotStatus: () => Promise<BotStatusPayload>;
  getLogs: () => Promise<LogEntry[]>;
  clearLogs: () => Promise<void>;
  fetchClassroomCourses: () => Promise<ImportedCourse[]>;
  syncClassroom: () => Promise<ClassSchedule[]>;
  getNextClass: () => Promise<NextClassInfo | null>;
  onStatusUpdate: (callback: (status: BotStatusPayload) => void) => () => void;
  onNewLog: (callback: (log: LogEntry) => void) => () => void;
  onClassesUpdated: (callback: (classes: ClassSchedule[]) => void) => () => void;
}