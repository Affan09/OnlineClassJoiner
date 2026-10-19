// Written and refined by Gemini - Continuing from previous agent's milestone
// Main Electron process coordinating window lifecycle, IPC handlers, scheduler, and Google Classroom automation

import { app, BrowserWindow, ipcMain, Notification } from 'electron';
import * as path from 'path';
import { ConfigStore } from './store';
import { AutomationEngine } from './automation';
import { ClassScheduler } from './scheduler';
import { AppSettings, ClassSchedule, ImportedCourse } from './types';

let mainWindow: BrowserWindow | null = null;
let store: ConfigStore;
let engine: AutomationEngine;
let scheduler: ClassScheduler;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1024,
    minHeight: 700,
    title: 'Classroom Class Joiner (Alpha) — Classroom & Meet Automation',
    backgroundColor: '#09090D',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

export function showSystemNotification(title: string, body: string): void {
  if (Notification.isSupported()) {
    new Notification({
      title,
      body,
    }).show();
  }
}

app.whenReady().then(() => {
  store = new ConfigStore();

  engine = new AutomationEngine(
    store,
    (status) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('bot:statusUpdate', status);
      }
    },
    (log) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('logs:new', log);
      }
    }
  );

  scheduler = new ClassScheduler(store, engine, (updatedClasses) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('classes:updated', updatedClasses);
    }
  });

  // Register Core IPC Handlers
  ipcMain.handle('classes:get', () => store.getClasses());

  ipcMain.handle('classes:save', (_event, cls: ClassSchedule) => {
    const updated = store.saveClass(cls);
    engine.log(
      'info',
      `Saved schedule for ${cls.courseCode} (${cls.days.join(', ')} @ ${cls.startTime})`,
      cls.courseCode
    );
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('classes:updated', updated);
    }
    return updated;
  });

  ipcMain.handle('classes:delete', (_event, id: string) => {
    const target = store.getClasses().find((c) => c.id === id);
    const updated = store.deleteClass(id);
    if (target) {
      engine.log('warn', `Deleted course schedule: ${target.courseCode}`, target.courseCode);
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('classes:updated', updated);
    }
    return updated;
  });

  ipcMain.handle('classes:toggle', (_event, id: string, enabled: boolean) => {
    const updated = store.toggleClass(id, enabled);
    const target = updated.find((c) => c.id === id);
    if (target) {
      engine.log(
        'info',
        `${enabled ? 'Enabled' : 'Paused'} auto-join for ${target.courseCode}`,
        target.courseCode
      );
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('classes:updated', updated);
    }
    return updated;
  });

  ipcMain.handle('settings:get', () => store.getSettings());

  ipcMain.handle('settings:update', (_event, partial: Partial<AppSettings>) => {
    const updated = store.updateSettings(partial);
    engine.log('info', 'Updated automation preferences.');
    return updated;
  });

  ipcMain.handle('auth:login', async () => {
    await engine.openGoogleAuthentication();
  });

  ipcMain.handle('bot:triggerNow', async (_event, id: string) => {
    const cls = store.getClasses().find((c) => c.id === id);
    if (cls) {
      void engine.runClassJoinWorkflow(cls);
    }
  });

  ipcMain.handle('bot:cancel', async () => {
    await engine.cancelActiveTask();
  });

  ipcMain.handle('bot:getStatus', () => engine.getStatus());
  ipcMain.handle('logs:get', () => engine.getLogs());
  ipcMain.handle('logs:clear', () => engine.clearLogs());

  // Google Classroom Integration Handlers (written by Gemini)
  ipcMain.handle('classroom:fetchCourses', async () => {
    return engine.scrapeClassroomCourses();
  });

  ipcMain.handle('classroom:sync', async () => {
    engine.log('info', 'Starting Google Classroom course sync...');
    try {
      const courses: ImportedCourse[] = await engine.scrapeClassroomCourses();
      const existingClasses = store.getClasses();
      const existingMap = new Map<string, ClassSchedule>();

      for (const cls of existingClasses) {
        if (cls.googleClassroomId) {
          existingMap.set(cls.googleClassroomId, cls);
        } else {
          const match = cls.classroomUrl.match(/\/c\/([a-zA-Z0-9_-]+)/);
          if (match) {
            existingMap.set(match[1], cls);
          }
        }
      }

      const mergedClasses: ClassSchedule[] = [...existingClasses];
      let importedCount = 0;
      let updatedCount = 0;

      for (const course of courses) {
        const existing = existingMap.get(course.id);
        if (existing) {
          // Keep existing schedule settings, but repair corrupt names/codes like "Home"
          if (course.name && (existing.courseName === 'Home' || !existing.courseName || existing.courseName.startsWith('Course ') || course.name !== existing.courseName)) {
            existing.courseName = course.name;
          }
          if (course.courseCode && (!existing.courseCode || existing.courseCode === 'HOME' || existing.courseCode.startsWith('AUTUMN') || existing.courseCode.startsWith('COURSE'))) {
            existing.courseCode = course.courseCode;
          }
          if (course.section) {
            existing.section = course.section;
          }
          existing.classroomUrl = course.url;
          existing.googleClassroomId = course.id;
          updatedCount++;
        } else {
          // Infer an abbreviated course code from the course title if available
          let inferredCode = course.courseCode;
          if (!inferredCode) {
            const codeMatch = course.name.match(/\b([A-Z]{2,5})\s*[-_]?\s*([0-9]{3}[A-Z]?)\b/i);
            inferredCode = codeMatch
              ? `${codeMatch[1].toUpperCase()} ${codeMatch[2].toUpperCase()}`
              : course.name.length <= 10
              ? course.name.trim().toUpperCase()
              : course.name.slice(0, 8).trim().toUpperCase();
          }

          const newClass: ClassSchedule = {
            id: `classroom-${course.id}`,
            courseCode: inferredCode,
            courseName: course.name,
            section: course.section,
            classroomUrl: course.url,
            googleClassroomId: course.id,
            days: ['Sun', 'Tue'], // Standard default, will be flagged for user configuration
            startTime: '09:40',
            endTime: '11:10',
            enabled: true,
            autoLeaveAtEnd: false,
            needsSchedule: true,
            isScheduleConfigured: false,
          };
          mergedClasses.push(newClass);
          importedCount++;
        }
      }

      store.bulkSaveClasses(mergedClasses);
      const allUpdated = store.getClasses();

      engine.log(
        'success',
        `Classroom sync finished: ${importedCount} new course(s) imported, ${updatedCount} existing course(s) updated.`
      );

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('classes:updated', allUpdated);
      }

      return allUpdated;
    } catch (error: any) {
      const msg = error?.message || String(error);
      engine.log('error', `Classroom sync encountered an error: ${msg}`);
      throw error;
    }
  });

  ipcMain.handle('bot:getNextClass', () => {
    return engine.getNextScheduledClass();
  });

  createWindow();
  scheduler.start();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (scheduler) scheduler.stop();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});