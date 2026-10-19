import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { AppSettings, ClassSchedule } from './types';

interface PersistedData {
  classes: ClassSchedule[];
  settings: AppSettings;
}

const DEFAULT_DATA: PersistedData = {
  classes: [],
  settings: {
    scanIntervalSeconds: 30,
    maxScanDurationMinutes: 5,
    alwaysMuteMic: true,
    alwaysTurnOffCam: true,
    isGoogleAuthenticated: false,
  },
};

export class ConfigStore {
  private filePath: string;
  private data: PersistedData;

  constructor() {
    const userDataDir = app.getPath('userData');
    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
    }
    this.filePath = path.join(userDataDir, 'iub-class-joiner-config.json');
    this.data = this.load();
  }

  private load(): PersistedData {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<PersistedData>;
        return {
          classes: Array.isArray(parsed.classes) ? parsed.classes : DEFAULT_DATA.classes,
          settings: { ...DEFAULT_DATA.settings, ...(parsed.settings || {}) },
        };
      }
    } catch (error) {
      console.error('Failed to load config store, falling back to defaults:', error);
    }
    return JSON.parse(JSON.stringify(DEFAULT_DATA));
  }

  private persist(): void {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to write config file:', error);
    }
  }

  public getClasses(): ClassSchedule[] {
    return this.data.classes;
  }

  public saveClass(item: ClassSchedule): ClassSchedule[] {
    const index = this.data.classes.findIndex((c) => c.id === item.id);
    if (index >= 0) {
      this.data.classes[index] = item;
    } else {
      this.data.classes.push(item);
    }
    this.persist();
    return this.data.classes;
  }

  public deleteClass(id: string): ClassSchedule[] {
    this.data.classes = this.data.classes.filter((c) => c.id !== id);
    this.persist();
    return this.data.classes;
  }

  public toggleClass(id: string, enabled: boolean): ClassSchedule[] {
    const target = this.data.classes.find((c) => c.id === id);
    if (target) {
      target.enabled = enabled;
      this.persist();
    }
    return this.data.classes;
  }

  public markClassJoinedToday(id: string, dateStr: string): ClassSchedule[] {
    const target = this.data.classes.find((c) => c.id === id);
    if (target) {
      target.lastJoinedDate = dateStr;
      this.persist();
    }
    return this.data.classes;
  }

  /**
   * Saves multiple classes at once, inserting new ones and updating existing ones by ID.
   */
  public bulkSaveClasses(classes: ClassSchedule[]): ClassSchedule[] {
    for (const item of classes) {
      const index = this.data.classes.findIndex((c) => c.id === item.id);
      if (index >= 0) {
        this.data.classes[index] = item;
      } else {
        this.data.classes.push(item);
      }
    }
    this.persist();
    return this.data.classes;
  }

  public getSettings(): AppSettings {
    return this.data.settings;
  }

  public updateSettings(partial: Partial<AppSettings>): AppSettings {
    this.data.settings = { ...this.data.settings, ...partial };
    this.persist();
    return this.data.settings;
  }

  public getProfileDirectory(): string {
    const profileDir = path.join(app.getPath('userData'), 'iub-chrome-profile');
    if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true });
    }
    return profileDir;
  }
}