// Written and refined by Gemini - Continuing from previous agent's milestone
// Background schedule monitor with robust time-window matching, early warnings, and auto-leave triggers

import { AutomationEngine } from './automation';
import { ConfigStore } from './store';
import { ClassSchedule, DayOfWeek } from './types';
import { showSystemNotification } from './main';

const DAY_MAP: DayOfWeek[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export class ClassScheduler {
  private store: ConfigStore;
  private engine: AutomationEngine;
  private timer: NodeJS.Timeout | null = null;
  private onClassesUpdated: (classes: ClassSchedule[]) => void;
  /** Track which classes have already had the 1-minute warning logged today */
  private warnedClasses: Set<string> = new Set();

  constructor(
    store: ConfigStore,
    engine: AutomationEngine,
    onClassesUpdated: (classes: ClassSchedule[]) => void
  ) {
    this.store = store;
    this.engine = engine;
    this.onClassesUpdated = onClassesUpdated;
  }

  public start(): void {
    if (this.timer) clearInterval(this.timer);
    this.engine.log('info', 'Background schedule monitor active (checking system clock every 5s).');
    this.tick();
    this.timer = setInterval(() => this.tick(), 5000);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private tick(): void {
    const now = new Date();
    const currentDay: DayOfWeek = DAY_MAP[now.getDay()];
    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentHHMM = `${String(currentHours).padStart(2, '0')}:${String(
      currentMinutes
    ).padStart(2, '0')}`;
    const todayDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
      2,
      '0'
    )}-${String(now.getDate()).padStart(2, '0')}`;

    // Reset the warned set at midnight
    if (currentHours === 0 && currentMinutes === 0) {
      this.warnedClasses.clear();
    }

    const classes = this.store.getClasses();

    for (const cls of classes) {
      if (!cls.enabled) continue;

      // Skip classes that haven't been scheduled yet (e.g. freshly imported from Classroom)
      if (cls.needsSchedule === true) continue;
      if (cls.isScheduleConfigured === false) continue;
      if (!cls.startTime || !cls.days || cls.days.length === 0) continue;

      // Only evaluate if scheduled for today
      if (!cls.days.includes(currentDay)) continue;

      // Parse the class startTime "HH:mm"
      const timeParts = cls.startTime.split(':').map(Number);
      if (timeParts.length < 2 || isNaN(timeParts[0]) || isNaN(timeParts[1])) continue;
      const [startH, startM] = timeParts;

      // Calculate minutes until start from current time
      const currentTotalMin = currentHours * 60 + currentMinutes;
      const startTotalMin = startH * 60 + startM;
      const minutesUntilStart = startTotalMin - currentTotalMin;
      const minutesPastStart = currentTotalMin - startTotalMin;

      // 1-minute early notification: warn once when class is 1 minute away
      if (minutesUntilStart === 1 && !this.warnedClasses.has(`${cls.id}-${todayDateStr}`)) {
        this.warnedClasses.add(`${cls.id}-${todayDateStr}`);
        this.engine.log(
          'warn',
          `Class ${cls.courseCode} (${cls.courseName}) starts in 1 minute at ${cls.startTime}!`,
          cls.courseCode
        );
        showSystemNotification(
          'Upcoming Class in 1 Minute',
          `${cls.courseCode}: ${cls.courseName} begins at ${cls.startTime}. Preparing automation.`
        );
      }

      // Auto-join window: triggers at exact minute (09:40) or within a 2-minute grace window (up to 09:42)
      // if the application was started slightly past the top of the minute, ensuring no classes are missed
      const isWithinJoinWindow =
        (currentHHMM === cls.startTime) || (minutesPastStart >= 0 && minutesPastStart <= 2);

      if (isWithinJoinWindow && cls.lastJoinedDate !== todayDateStr) {
        const updated = this.store.markClassJoinedToday(cls.id, todayDateStr);
        this.onClassesUpdated(updated);

        this.engine.log(
          'info',
          `Scheduled start time (${cls.startTime}) reached for ${cls.courseCode}! Launching automation...`,
          cls.courseCode
        );
        showSystemNotification(
          'Joining Scheduled Class Now',
          `Opening Google Classroom & Meet for ${cls.courseCode} (${cls.courseName})`
        );
        void this.engine.runClassJoinWorkflow(cls);
      }

      // Check if auto-leave is enabled and current time matches endTime
      if (
        cls.autoLeaveAtEnd &&
        cls.endTime === currentHHMM &&
        this.engine.getStatus().state === 'IN_CLASS' &&
        this.engine.getStatus().activeClassId === cls.id
      ) {
        void this.engine.leaveCurrentMeetSession(cls);
      }
    }
  }
}