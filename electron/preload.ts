// Written and refined by Gemini - Continuing from previous agent's milestone
// Preload script exposing typed Electron API to renderer process securely via contextBridge

import { contextBridge, ipcRenderer } from 'electron';
import {
  AppSettings,
  BotStatusPayload,
  ClassSchedule,
  ElectronAPI,
  ImportedCourse,
  LogEntry,
  NextClassInfo,
} from './types';

const api: ElectronAPI = {
  getClasses: () => ipcRenderer.invoke('classes:get'),
  saveClass: (cls: ClassSchedule) => ipcRenderer.invoke('classes:save', cls),
  deleteClass: (id: string) => ipcRenderer.invoke('classes:delete', id),
  toggleClass: (id: string, enabled: boolean) =>
    ipcRenderer.invoke('classes:toggle', id, enabled),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (settings: Partial<AppSettings>) =>
    ipcRenderer.invoke('settings:update', settings),
  openGoogleLogin: () => ipcRenderer.invoke('auth:login'),
  triggerClassNow: (id: string) => ipcRenderer.invoke('bot:triggerNow', id),
  cancelActiveTask: () => ipcRenderer.invoke('bot:cancel'),
  getBotStatus: () => ipcRenderer.invoke('bot:getStatus'),
  getLogs: () => ipcRenderer.invoke('logs:get'),
  clearLogs: () => ipcRenderer.invoke('logs:clear'),
  fetchClassroomCourses: () => ipcRenderer.invoke('classroom:fetchCourses'),
  syncClassroom: () => ipcRenderer.invoke('classroom:sync'),
  getNextClass: () => ipcRenderer.invoke('bot:getNextClass'),

  onStatusUpdate: (callback: (status: BotStatusPayload) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: BotStatusPayload) =>
      callback(status);
    ipcRenderer.on('bot:statusUpdate', listener);
    return () => ipcRenderer.removeListener('bot:statusUpdate', listener);
  },

  onNewLog: (callback: (log: LogEntry) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, log: LogEntry) => callback(log);
    ipcRenderer.on('logs:new', listener);
    return () => ipcRenderer.removeListener('logs:new', listener);
  },

  onClassesUpdated: (callback: (classes: ClassSchedule[]) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, classes: ClassSchedule[]) =>
      callback(classes);
    ipcRenderer.on('classes:updated', listener);
    return () => ipcRenderer.removeListener('classes:updated', listener);
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);