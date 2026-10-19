/// <reference types="vite/client" />
import { ElectronAPI } from '../electron/types';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}