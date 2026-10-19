// Written and refined by Gemini - Continuing from previous agent's milestone
// Core Playwright automation engine for Google Classroom scraping, Meet detection, Mic/Cam toggles, and lobby joining

import { chromium, BrowserContext, Page } from 'playwright';
import * as fs from 'fs';
import {
  AppSettings,
  BotStatusPayload,
  ClassSchedule,
  DayOfWeek,
  ImportedCourse,
  LogEntry,
  LogLevel,
  NextClassInfo,
} from './types';
import { ConfigStore } from './store';

type StatusEmitter = (status: BotStatusPayload) => void;
type LogEmitter = (log: LogEntry) => void;

const DAY_MAP: DayOfWeek[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export class AutomationEngine {
  private store: ConfigStore;
  private context: BrowserContext | null = null;
  private activePage: Page | null = null;
  private emitStatus: StatusEmitter;
  private emitLog: LogEmitter;
  private currentStatus: BotStatusPayload = {
    state: 'IDLE',
    activeClassId: null,
    activeClassName: null,
    message: 'Waiting for scheduled class time...',
  };
  private abortController: AbortController | null = null;
  private logs: LogEntry[] = [];

  constructor(store: ConfigStore, emitStatus: StatusEmitter, emitLog: LogEmitter) {
    this.store = store;
    this.emitStatus = emitStatus;
    this.emitLog = emitLog;
  }

  public getStatus(): BotStatusPayload {
    return this.currentStatus;
  }

  public getLogs(): LogEntry[] {
    return this.logs;
  }

  public clearLogs(): void {
    this.logs = [];
  }

  public log(level: LogLevel, message: string, courseCode?: string): void {
    const entry: LogEntry = {
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
    this.logs = [entry, ...this.logs].slice(0, 250);
    this.emitLog(entry);
  }

  private setStatus(partial: Partial<BotStatusPayload>): void {
    this.currentStatus = { ...this.currentStatus, ...partial };
    this.emitStatus(this.currentStatus);
  }

  /**
   * Resolves a system browser executable on Linux/Windows if available to ensure
   * smooth Google OAuth login, or gracefully falls back to bundled Playwright Chromium.
   */
  private detectSystemBrowserExecutable(): string | undefined {
    const candidates: string[] =
      process.platform === 'win32'
        ? [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            `${process.env.LOCALAPPDATA || ''}\\Google\\Chrome\\Application\\chrome.exe`,
            'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
          ]
        : [
            '/usr/bin/google-chrome-stable',
            '/usr/bin/google-chrome',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/usr/bin/brave-browser',
          ];

    for (const candidate of candidates) {
      if (candidate && fs.existsSync(candidate)) {
        return candidate;
      }
    }
    return undefined;
  }

  /**
   * Launches or reuses the persistent Chromium profile.
   */
  private async ensurePersistentContext(): Promise<BrowserContext> {
    if (this.context) {
      try {
        // Check if context is still alive
        this.context.pages();
        return this.context;
      } catch {
        this.context = null;
      }
    }

    // Check if an existing browser window is already running with remote debugging
    try {
      const cdpBrowser = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 1500 });
      const cdpContexts = cdpBrowser.contexts();
      if (cdpContexts.length > 0) {
        this.context = cdpContexts[0];
        this.log('info', 'Connected to already opened browser window via port 9222.');
        return this.context;
      }
    } catch {
      // No running CDP browser found, proceeding with profile launch
    }

    const userDataDir = this.store.getProfileDirectory();
    const executablePath = this.detectSystemBrowserExecutable();

    // Remove stale Chromium singleton locks if previous session closed abruptly
    for (const lockFile of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
      const fullPath = `${userDataDir}/${lockFile}`;
      if (fs.existsSync(fullPath)) {
        try {
          fs.unlinkSync(fullPath);
        } catch {
          // Ignore if actively locked
        }
      }
    }

    const launchOptions: Parameters<typeof chromium.launchPersistentContext>[1] = {
      headless: false,
      viewport: null,
      ignoreDefaultArgs: ['--enable-automation'],
      permissions: ['microphone', 'camera', 'notifications'],
      args: [
        '--remote-debugging-port=9222',
        '--disable-blink-features=AutomationControlled',
        '--start-maximized',
        '--use-fake-ui-for-media-stream',
        '--disable-infobars',
        '--no-default-browser-check',
      ],
    };

    if (executablePath) {
      launchOptions.executablePath = executablePath;
      this.log('info', `Using browser binary: ${executablePath}`);
    } else {
      this.log('info', 'Launching bundled Playwright Chromium engine...');
    }

    this.context = await chromium.launchPersistentContext(userDataDir, launchOptions);

    // Mask automation fingerprint so Google Workspace login never blocks sign-in
    await this.context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });

    this.context.on('close', () => {
      this.context = null;
      this.activePage = null;
      if (this.currentStatus.state !== 'IDLE') {
        this.setStatus({
          state: 'IDLE',
          activeClassId: null,
          activeClassName: null,
          message: 'Browser window closed. Waiting for next scheduled class...',
          attempt: undefined,
          maxAttempts: undefined,
          nextRetryInSeconds: undefined,
        });
      }
    });

    return this.context;
  }

  /**
   * Searches all open tabs across the browser context to find an existing Google Classroom,
   * Google Accounts, or relevant page. Prioritizes Classroom tabs, then login tabs, then blank tabs.
   */
  public findExistingPage(context: BrowserContext, targetUrlSubstring?: string): Page | null {
    const pages = context.pages().filter((p) => !p.isClosed());
    if (pages.length === 0) return null;

    // 1. Look for specific target URL match if provided
    if (targetUrlSubstring) {
      for (const p of pages) {
        try {
          if (p.url().includes(targetUrlSubstring)) {
            return p;
          }
        } catch {
          // Ignore
        }
      }
    }

    // 2. Look for an existing tab on Google Classroom
    for (const p of pages) {
      try {
        if (p.url().includes('classroom.google.com')) {
          return p;
        }
      } catch {
        // Ignore
      }
    }

    // 3. Look for an existing tab on Google Accounts / login
    for (const p of pages) {
      try {
        if (p.url().includes('accounts.google.com')) {
          return p;
        }
      } catch {
        // Ignore
      }
    }

    // 4. Look for an existing Google Meet tab
    for (const p of pages) {
      try {
        if (p.url().includes('meet.google.com')) {
          return p;
        }
      } catch {
        // Ignore
      }
    }

    // 5. Look for an empty/blank tab that can be repurposed without opening a new window/tab
    for (const p of pages) {
      try {
        const u = p.url();
        if (u === 'about:blank' || u === '') {
          return p;
        }
      } catch {
        // Ignore
      }
    }

    return null;
  }

  /**
   * Checks if the page is currently authenticated into Google Classroom.
   */
  public async checkIfGoogleClassroomLoggedIn(page: Page): Promise<boolean> {
    try {
      const url = page.url();
      if (url.includes('accounts.google.com')) {
        return false;
      }
      if (!url.includes('classroom.google.com')) {
        return false;
      }

      // Check DOM for authenticated user elements
      const authenticated = await page.evaluate(() => {
        // If login inputs are visible, definitely not logged in
        if (document.querySelector('input[type="email"], input[type="password"]')) {
          return false;
        }

        // Check for Google account avatar, course cards, or classroom main header
        const hasAccountAvatar = !!document.querySelector(
          '[aria-label*="Google Account" i], [aria-label*="Google-konto" i], a[href*="SignOutOptions"], img[src*="googleusercontent.com"]'
        );
        const hasCoursesOrClasses = !!document.querySelector(
          'a[href*="/c/"], [data-course-id], .YVvGBb, main, [role="main"]'
        );
        const hasGoogleBar = !!document.querySelector('header, [role="banner"]');

        return (hasAccountAvatar || hasCoursesOrClasses) && hasGoogleBar;
      });

      return authenticated;
    } catch {
      return false;
    }
  }

  /**
   * Opens or checks Google Classroom authentication:
   * 1. Checks for already opened browser windows/tabs first.
   * 2. If an existing window is found:
   *    - Brings it to the front instead of opening another window.
   *    - If already logged in, verifies the session immediately.
   *    - If not logged in, points it to the login page in the same window.
   * 3. Only opens a new window/tab if no relevant browser window is currently open.
   */
  public async openGoogleAuthentication(): Promise<void> {
    try {
      this.setStatus({
        state: 'AUTH_OPEN',
        activeClassId: null,
        activeClassName: null,
        message: 'Checking for opened Google Classroom windows...',
      });
      this.log('info', 'Checking for opened Google Classroom windows and tabs first...');

      const context = await this.ensurePersistentContext();

      // Step 1: Check for an already opened page in the browser
      let page = this.findExistingPage(context, 'classroom.google.com') ||
                 this.findExistingPage(context, 'accounts.google.com');

      if (page) {
        this.activePage = page;
        await page.bringToFront();
        this.log('info', `Found opened browser window (${page.url()}). Brought to front instead of opening a new one.`);
      } else {
        // No Classroom/Account tab open. Check if we have any open tab in context to reuse
        const pages = context.pages().filter((p) => !p.isClosed());
        if (pages.length > 0) {
          page = pages[0];
          this.activePage = page;
          await page.bringToFront();
          this.log('info', 'Reusing existing browser window instead of opening another window.');
        } else {
          this.log('info', 'No opened browser window found. Opening browser for authentication...');
          page = await context.newPage();
          this.activePage = page;
        }
      }

      // Step 2: Check current page URL & authentication status
      const currentUrl = page.url();

      if (currentUrl.includes('classroom.google.com')) {
        this.log('info', 'Verifying login status on existing Google Classroom page...');
        const isLoggedIn = await this.checkIfGoogleClassroomLoggedIn(page);
        if (isLoggedIn) {
          this.store.updateSettings({ isGoogleAuthenticated: true });
          this.setStatus({
            state: 'IDLE',
            activeClassId: null,
            activeClassName: null,
            message: 'Already logged in to Google Classroom! Session verified.',
          });
          this.log('success', 'Existing Google Classroom session verified! You are already logged in.');
          return;
        }
      }

      // Step 3: If not on Classroom or Accounts, navigate the existing page to Classroom
      if (!currentUrl.includes('classroom.google.com') && !currentUrl.includes('accounts.google.com')) {
        this.log('info', 'Navigating existing window to https://classroom.google.com...');
        await page.goto('https://classroom.google.com', {
          waitUntil: 'domcontentloaded',
          timeout: 60000,
        });
      }

      await page.bringToFront();

      // Step 4: Check if login was preserved/instant
      await this.sleep(2500);
      const isLoggedInNow = await this.checkIfGoogleClassroomLoggedIn(page);
      if (isLoggedInNow) {
        this.store.updateSettings({ isGoogleAuthenticated: true });
        this.setStatus({
          state: 'IDLE',
          activeClassId: null,
          activeClassName: null,
          message: 'Google Classroom session verified and saved!',
        });
        this.log('success', 'Google Classroom session active. Saved automatically!');
      } else {
        this.setStatus({
          state: 'AUTH_OPEN',
          activeClassId: null,
          activeClassName: null,
          message: 'Google Classroom login window ready. Please complete sign-in in the browser.',
        });
        this.log('info', 'Please complete sign-in in the focused browser window. Your login will be saved.');
      }
    } catch (error: any) {
      const msg = error?.message || String(error);
      this.log('error', `Failed to verify or open Google Classroom authentication: ${msg}`);
      this.setStatus({
        state: 'ERROR',
        message: `Auth error: ${msg}`,
      });
    }
  }

  /**
   * Cancels any ongoing Refresh & Scan loop.
   */
  public async cancelActiveTask(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.log('warn', 'Active automation scan cancelled by user.');
    this.setStatus({
      state: 'IDLE',
      activeClassId: null,
      activeClassName: null,
      message: 'Waiting for scheduled class time...',
      attempt: undefined,
      maxAttempts: undefined,
      nextRetryInSeconds: undefined,
    });
  }

  /**
   * Core "Refresh & Scan" Engine:
   * 1. Navigates to the course's Google Classroom URL.
   * 2. Scans the DOM for an active Google Meet link (banner button or stream post).
   * 3. If not found, refreshes every 30 seconds for up to 5 minutes.
   * 4. Once found, navigates to Meet, turns off Mic & Camera, and clicks "Join now".
   */
  public async runClassJoinWorkflow(cls: ClassSchedule): Promise<void> {
    if (
      this.currentStatus.state === 'SCANNING_CLASSROOM' ||
      this.currentStatus.state === 'WAITING_RETRY' ||
      this.currentStatus.state === 'JOINING_MEET'
    ) {
      this.log(
        'warn',
        `Skipping trigger for ${cls.courseCode} because an automation workflow is already running.`,
        cls.courseCode
      );
      return;
    }

    this.abortController = new AbortController();
    const { signal } = this.abortController;
    const settings: AppSettings = this.store.getSettings();

    const intervalSec = Math.max(10, settings.scanIntervalSeconds || 30);
    const maxDurationMin = Math.max(1, settings.maxScanDurationMinutes || 5);
    const maxAttempts = Math.floor((maxDurationMin * 60) / intervalSec) + 1;

    try {
      this.log(
        'info',
        `Starting Refresh & Scan Engine for ${cls.courseCode} (${cls.courseName})`,
        cls.courseCode
      );

      const context = await this.ensurePersistentContext();
      let page = this.findExistingPage(context, cls.classroomUrl) ||
                 this.findExistingPage(context, 'classroom.google.com');

      if (page) {
        this.activePage = page;
        await page.bringToFront();
        this.log('info', 'Found opened browser window. Reusing without opening another window.', cls.courseCode);
      } else {
        const pages = context.pages().filter((p) => !p.isClosed());
        page = pages.length > 0 ? pages[0] : await context.newPage();
        this.activePage = page;
        await page.bringToFront();
      }

      let meetUrl: string | null = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (signal.aborted) return;

        this.setStatus({
          state: 'SCANNING_CLASSROOM',
          activeClassId: cls.id,
          activeClassName: `${cls.courseCode} - ${cls.courseName}`,
          message:
            attempt === 1
              ? `Opening Classroom page for ${cls.courseCode}...`
              : `Refreshing Classroom page (Attempt ${attempt}/${maxAttempts})...`,
          attempt,
          maxAttempts,
          nextRetryInSeconds: undefined,
        });

        if (attempt === 1) {
          if (!page.url().includes(cls.classroomUrl)) {
            this.log('info', `Navigating to Classroom URL: ${cls.classroomUrl}`, cls.courseCode);
            await page.goto(cls.classroomUrl, {
              waitUntil: 'domcontentloaded',
              timeout: 45000,
            });
          } else {
            this.log('info', `Already on course page: ${cls.classroomUrl}`, cls.courseCode);
          }
        } else {
          this.log(
            'info',
            `Refreshing Classroom page (Scan ${attempt} of ${maxAttempts})...`,
            cls.courseCode
          );
          await page.reload({
            waitUntil: 'domcontentloaded',
            timeout: 45000,
          });
        }

        // Wait 4 seconds for Google Classroom SPA components & stream posts to hydrate
        await this.sleep(4000, signal);
        if (signal.aborted) return;

        // Scan DOM for active Google Meet link
        meetUrl = await this.scanClassroomDomForMeetLink(page);

        if (meetUrl) {
          this.log('success', `Active Google Meet link found: ${meetUrl}`, cls.courseCode);
          break;
        }

        if (attempt < maxAttempts) {
          this.log(
            'warn',
            `No active Meet link found yet. Auto-refreshing in ${intervalSec} seconds (Attempt ${attempt}/${maxAttempts})...`,
            cls.courseCode
          );

          for (let remaining = intervalSec; remaining > 0; remaining--) {
            if (signal.aborted) return;
            this.setStatus({
              state: 'WAITING_RETRY',
              activeClassId: cls.id,
              activeClassName: `${cls.courseCode} - ${cls.courseName}`,
              message: `Meet link not posted yet. Refreshing in ${remaining}s...`,
              attempt,
              maxAttempts,
              nextRetryInSeconds: remaining,
            });
            await this.sleep(1000, signal);
          }
        }
      }

      if (signal.aborted) return;

      if (!meetUrl) {
        this.log(
          'error',
          `Timed out after ${maxDurationMin} minutes scanning Classroom for ${cls.courseCode}. Instructor has not posted a Meet link.`,
          cls.courseCode
        );
        this.setStatus({
          state: 'IDLE',
          activeClassId: null,
          activeClassName: null,
          message: `No Meet link found for ${cls.courseCode} after ${maxDurationMin}m window.`,
          attempt: undefined,
          maxAttempts: undefined,
        });
        return;
      }

      // Navigate to Google Meet & join
      await this.joinGoogleMeetSession(page, meetUrl, cls, settings, signal);
    } catch (error: any) {
      if (signal.aborted) return;
      const errMsg = error?.message || String(error);
      this.log('error', `Automation error for ${cls.courseCode}: ${errMsg}`, cls.courseCode);
      this.setStatus({
        state: 'ERROR',
        activeClassId: cls.id,
        activeClassName: `${cls.courseCode} - ${cls.courseName}`,
        message: `Error: ${errMsg}`,
      });
    }
  }

  /**
   * Scans the Google Classroom DOM for both:
   * 1. The dedicated Classroom Header Banner Meet button (`a[href*="meet.google.com"]`)
   * 2. Stream announcement links or text containing a valid Google Meet URL
   */
  private async scanClassroomDomForMeetLink(page: Page): Promise<string | null> {
    try {
      // Allow directly testing with a meet.google.com URL if user entered one
      const currentUrl = page.url();
      if (/https?:\/\/meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3}|lookup\/[^\s/?#]+)/i.test(currentUrl)) {
        return currentUrl;
      }

      const foundLink = await page.evaluate(() => {
        const meetRegex =
          /https?:\/\/meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3}|lookup\/[a-zA-Z0-9_-]+|[a-zA-Z0-9_-]{10,})/i;

        // 1. Check all anchor tags with href containing meet.google.com
        const anchors = Array.from(
          document.querySelectorAll<HTMLAnchorElement>('a[href*="meet.google.com"]')
        );
        for (const a of anchors) {
          const href = a.href.trim();
          // Ensure it's visible and not a generic root link
          const rect = a.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0 && meetRegex.test(href)) {
            return href;
          }
        }

        // 2. Fallback: Check any anchor tag in the DOM even if hidden in a collapsed container
        for (const a of anchors) {
          if (meetRegex.test(a.href.trim())) {
            return a.href.trim();
          }
        }

        // 3. Scan stream post text content for raw Meet URLs pasted without anchor tags
        const mainRegion = document.querySelector('main') || document.body;
        const textMatch = mainRegion.innerText.match(meetRegex);
        if (textMatch && textMatch[0]) {
          return textMatch[0];
        }

        return null;
      });

      return foundLink;
    } catch (error) {
      return null;
    }
  }

  /**
   * Navigates to the Google Meet URL, mutes Microphone, turns off Camera,
   * and clicks "Join now" or "Ask to join".
   */
  private async joinGoogleMeetSession(
    page: Page,
    meetUrl: string,
    cls: ClassSchedule,
    settings: AppSettings,
    signal: AbortSignal
  ): Promise<void> {
    this.setStatus({
      state: 'JOINING_MEET',
      activeClassId: cls.id,
      activeClassName: `${cls.courseCode} - ${cls.courseName}`,
      message: `Meet link found! Configuring Mic/Cam and joining ${cls.courseCode}...`,
      attempt: undefined,
      maxAttempts: undefined,
      nextRetryInSeconds: undefined,
    });

    this.log('info', `Opening Google Meet lobby: ${meetUrl}`, cls.courseCode);
    await page.goto(meetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Wait for Meet pre-join screen controls to initialize
    await this.sleep(5000, signal);
    if (signal.aborted) return;

    // Dismiss any "Continue without microphone and camera" or modal popups if present
    try {
      const dismissBtn = page.locator(
        'button:has-text("Continue without"), button:has-text("Got it"), button:has-text("Dismiss")'
      );
      if ((await dismissBtn.count()) > 0) {
        await dismissBtn.first().click({ timeout: 2000 }).catch(() => {});
      }
    } catch {
      // Ignore if no popup exists
    }

    // 1. Mute Microphone if unmuted
    if (settings.alwaysMuteMic) {
      await this.ensureDeviceMuted(page, 'microphone', cls.courseCode);
    }

    // 2. Turn Off Camera if active
    if (settings.alwaysTurnOffCam) {
      await this.ensureDeviceMuted(page, 'camera', cls.courseCode);
    }

    await this.sleep(1000, signal);
    if (signal.aborted) return;

    // 3. Click "Join now" or "Ask to join"
    this.log('info', 'Looking for "Join now" / "Ask to join" button...', cls.courseCode);

    const joinSelectors = [
      'button:has-text("Join now")',
      'button:has-text("Ask to join")',
      'button:has-text("Join anyway")',
      'button:has-text("Switch here")',
      '[ role="button" ]:has-text("Join now")',
      '[ role="button" ]:has-text("Ask to join")',
    ];

    let joined = false;
    for (const selector of joinSelectors) {
      const locator = page.locator(selector).first();
      if ((await locator.count()) > 0 && (await locator.isVisible())) {
        await locator.click({ timeout: 5000 });
        joined = true;
        break;
      }
    }

    if (joined) {
      this.log(
        'success',
        `Successfully clicked Join for ${cls.courseCode} (${cls.courseName}) with Mic & Camera muted!`,
        cls.courseCode
      );
      this.setStatus({
        state: 'IN_CLASS',
        activeClassId: cls.id,
        activeClassName: `${cls.courseCode} - ${cls.courseName}`,
        message: `Connected to ${cls.courseCode} Google Meet (Mic & Cam OFF)`,
      });
    } else {
      this.log(
        'warn',
        `Meet lobby opened for ${cls.courseCode}, but "Join now" button was not immediately clickable. Please check the browser window.`,
        cls.courseCode
      );
      this.setStatus({
        state: 'IN_CLASS',
        activeClassId: cls.id,
        activeClassName: `${cls.courseCode} - ${cls.courseName}`,
        message: `Meet page open for ${cls.courseCode}. Verify join status in browser.`,
      });
    }
  }

  /**
   * Inspects Google Meet's pre-join media toggle buttons and mutes the device
   * only if it is currently active/unmuted.
   */
  private async ensureDeviceMuted(
    page: Page,
    device: 'microphone' | 'camera',
    courseCode: string
  ): Promise<void> {
    try {
      // Check if button with "Turn off microphone" / "Turn off camera" or data-is-muted="false" exists
      const unmutedSelector =
        device === 'microphone'
          ? '[aria-label*="Turn off microphone" i], [data-is-muted="false"][aria-label*="microphone" i]'
          : '[aria-label*="Turn off camera" i], [data-is-muted="false"][aria-label*="camera" i]';

      const alreadyMutedSelector =
        device === 'microphone'
          ? '[aria-label*="Turn on microphone" i], [data-is-muted="true"][aria-label*="microphone" i]'
          : '[aria-label*="Turn on camera" i], [data-is-muted="true"][aria-label*="camera" i]';

      const unmutedBtn = page.locator(unmutedSelector).first();
      if ((await unmutedBtn.count()) > 0 && (await unmutedBtn.isVisible())) {
        await unmutedBtn.click({ timeout: 3000 });
        this.log('info', `Automatically turned OFF ${device}.`, courseCode);
        return;
      }

      const mutedBtn = page.locator(alreadyMutedSelector).first();
      if ((await mutedBtn.count()) > 0) {
        this.log('info', `${device.charAt(0).toUpperCase() + device.slice(1)} is already OFF.`, courseCode);
        return;
      }

      // Keyboard shortcut fallback if standard button selectors haven't settled
      const shortcut =
        device === 'microphone'
          ? process.platform === 'darwin'
            ? 'Meta+d'
            : 'Control+d'
          : process.platform === 'darwin'
          ? 'Meta+e'
          : 'Control+e';

      await page.keyboard.press(shortcut);
      this.log('info', `Sent ${shortcut} toggle to ensure ${device} is muted.`, courseCode);
    } catch (err) {
      this.log('warn', `Could not verify ${device} state automatically; check Meet lobby.`, courseCode);
    }
  }

  /**
   * Automatically leaves the active Google Meet session when class endTime is reached
   * if autoLeaveAtEnd is enabled for the class.
   */
  public async leaveCurrentMeetSession(cls: ClassSchedule): Promise<void> {
    if (!this.activePage) return;
    try {
      this.log('info', `Class end time reached for ${cls.courseCode}. Leaving Meet call...`, cls.courseCode);
      const leaveBtn = this.activePage
        .locator('[aria-label*="Leave call" i], button:has-text("Leave call")')
        .first();
      if ((await leaveBtn.count()) > 0 && (await leaveBtn.isVisible())) {
        await leaveBtn.click({ timeout: 3000 });
      } else {
        await this.activePage.goto('about:blank');
      }
      this.log('success', `Left ${cls.courseCode} at scheduled end time.`, cls.courseCode);
      this.setStatus({
        state: 'IDLE',
        activeClassId: null,
        activeClassName: null,
        message: `Left ${cls.courseCode} at scheduled end time. Waiting for next class...`,
        attempt: undefined,
        maxAttempts: undefined,
        nextRetryInSeconds: undefined,
      });
    } catch (error) {
      // Ignore if page was already closed manually
      this.setStatus({
        state: 'IDLE',
        activeClassId: null,
        activeClassName: null,
        message: 'Waiting for scheduled class time...',
        attempt: undefined,
        maxAttempts: undefined,
        nextRetryInSeconds: undefined,
      });
    }
  }

  /**
   * Scrapes enrolled courses from the Google Classroom homepage.
   * Opens Classroom in the persistent browser and extracts course cards.
   */
  public async scrapeClassroomCourses(): Promise<ImportedCourse[]> {
    this.log('info', 'Connecting to Google Classroom to retrieve enrolled courses...');

    try {
      const context = await this.ensurePersistentContext();
      let page = this.findExistingPage(context, 'classroom.google.com');

      if (page) {
        this.activePage = page;
        await page.bringToFront();
        this.log('info', 'Found already opened Google Classroom window. Reusing without opening a new window.');
      } else {
        const pages = context.pages().filter((p) => !p.isClosed());
        page = pages.length > 0 ? pages[0] : await context.newPage();
        this.activePage = page;
        await page.bringToFront();
      }

      // Ensure page is on the home classes dashboard (/u/0/h) so all enrolled course cards are loaded
      const currentUrl = page.url();
      const isDashboard = /\/h(\/classes)?(\?.*)?$/i.test(currentUrl) || /classroom\.google\.com\/?(\?.*)?$/i.test(currentUrl);
      if (!isDashboard) {
        this.log('info', 'Navigating to Google Classroom classes dashboard (https://classroom.google.com/u/0/h)...');
        await page.goto('https://classroom.google.com/u/0/h', {
          waitUntil: 'domcontentloaded',
          timeout: 60000,
        });
      }

      // Wait for Classroom SPA to fully render course cards
      await this.sleep(4500);

      try {
        await page.waitForSelector('a[href*="/c/"]', { timeout: 10000 });
      } catch {
        this.log('warn', 'Waiting for course card elements to settle...');
      }

      const courses = await page.evaluate(() => {
        const results: Array<{
          id: string;
          name: string;
          section?: string;
          url: string;
          courseCode?: string;
        }> = [];

        const seen = new Set<string>();

        // Find all anchor tags pointing to courses, ignoring assignments / student work / classwork / drive
        const allLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/c/"], a[href*="/r/"]'))
          .filter((a) => {
            const h = a.href;
            return (
              !h.includes('/a/') &&
              !h.includes('/sp/') &&
              !h.includes('/w/') &&
              !h.includes('/gb/') &&
              !h.includes('/d/')
            );
          });

        for (const a of allLinks) {
          const match = a.href.match(/\/(?:c|r)\/([a-zA-Z0-9_-]+)/);
          if (!match) continue;
          const courseId = match[1];
          if (seen.has(courseId)) continue;
          seen.add(courseId);

          // Strategy A: Direct title element inside the anchor tag
          // Google Classroom puts the primary course title in .GRvzhf, .ScpeUc, or heading
          const titleEl =
            a.querySelector('.GRvzhf, .ScpeUc, [class*="GRvzhf"], [class*="ScpeUc"]') ||
            a.querySelector('h2, h3, [role="heading"]');
          let title = titleEl ? (titleEl.textContent || '').trim() : '';

          // Subtitle / section element in Google Classroom: .DWJNgb, .FWGURc
          const subtitleEl =
            a.querySelector('.DWJNgb, .FWGURc, [class*="DWJNgb"], [class*="FWGURc"]');
          let subtitle = subtitleEl ? (subtitleEl.textContent || '').trim() : '';

          const ariaLabel = (a.getAttribute('aria-label') || '').trim();

          // Strategy B: If title not found via specific classes, parse aria-label
          if (!title && ariaLabel) {
            const cleanAria = ariaLabel
              .replace(/^open (your work for|options for|folder for|class:?)\s*/i, '')
              .replace(/^options for\s*/i, '')
              .trim();
            const parts = cleanAria.split(',').map((s) => s.trim()).filter(Boolean);
            title = parts[0] || cleanAria;
            if (parts.length > 1 && !subtitle) {
              subtitle = parts[1];
            }
          }

          // Strategy C: Inspect text-bearing leaf nodes inside the link, filtering single-char avatars & icons
          if (!title || title.toLowerCase() === 'home') {
            const textNodes = Array.from(a.querySelectorAll('*'))
              .map((el) => (el.childNodes.length === 1 && el.childNodes[0].nodeType === 3 ? (el.textContent || '').trim() : ''))
              .filter(
                (t) =>
                  t.length > 2 &&
                  t !== 'assignment' &&
                  t !== 'more_vert' &&
                  t.toLowerCase() !== 'home'
              );
            if (textNodes.length > 0) {
              title = textNodes[0];
              if (textNodes.length > 1 && !subtitle) {
                subtitle = textNodes[1];
              }
            }
          }

          // Final fallback: use a cleaned-up non-empty title or Course ID
          if (!title || title.toLowerCase() === 'home') {
            title = ariaLabel || `Course ${courseId}`;
          }

          // Parse courseCode: e.g. "CSE 203T", "BDS 109", "PHY 101L", "CSE 201"
          let courseCode: string | undefined;
          const codeRegex = /\b([A-Z]{2,5})\s*[-_]?\s*([0-9]{3}[A-Z]?)\b/i;
          const codeMatch = (title + ' ' + subtitle).match(codeRegex);
          if (codeMatch) {
            courseCode = `${codeMatch[1].toUpperCase()} ${codeMatch[2].toUpperCase()}`;
          }

          // Parse section: e.g. from "Autumn-2026-CSE203T-10" the section is "10"
          let section: string | undefined;
          const secRegex = /[-_]([0-9]{1,3}[A-Z]?)$/i;
          const secMatch = title.match(secRegex);
          if (secMatch) {
            section = `Sec ${secMatch[1]}`;
          } else if (subtitle) {
            const subSecMatch = subtitle.match(
              /\b(sec(?:tion)?\.?\s*[-_#]?\s*\d+[A-Z]?|period\s*\d+|\d{1,3}[A-Z]?)\b/i
            );
            if (subSecMatch) {
              section = subSecMatch[1].startsWith('Sec')
                ? subSecMatch[1]
                : `Sec ${subSecMatch[1]}`;
            }
          }

          results.push({
            id: courseId,
            name: title,
            section,
            url: a.href.includes('classroom.google.com')
              ? a.href
              : `https://classroom.google.com/c/${courseId}`,
            courseCode,
          });
        }

        return results;
      });

      this.log('success', `Found ${courses.length} course(s) on Google Classroom:`);
      for (const c of courses) {
        this.log(
          'info',
          `• ${c.courseCode ? `[${c.courseCode}] ` : ''}"${c.name}"${c.section ? ` (${c.section})` : ''}`
        );
      }

      return courses;
    } catch (error: any) {
      const msg = error?.message || String(error);
      this.log('error', `Failed to scrape Classroom courses: ${msg}`);
      throw error;
    }
  }

  /**
   * Finds the next upcoming scheduled class based on current time and day.
   * Only considers enabled classes that have a configured schedule.
   */
  public getNextScheduledClass(): NextClassInfo | null {
    const now = new Date();
    const currentDay: DayOfWeek = DAY_MAP[now.getDay()];
    const currentTotalMin = now.getHours() * 60 + now.getMinutes();

    const classes = this.store.getClasses();

    let best: NextClassInfo | null = null;
    let bestMinutes = Infinity;

    for (const cls of classes) {
      // Only consider enabled, schedule-configured classes
      if (!cls.enabled) continue;
      if (cls.isScheduleConfigured === false) continue;
      if (cls.needsSchedule) continue;
      if (!cls.days || cls.days.length === 0) continue;
      if (!cls.startTime) continue;

      const [startH, startM] = cls.startTime.split(':').map(Number);
      const startTotalMin = startH * 60 + startM;

      // Check each day of the week for the next occurrence
      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const checkDayIndex = (now.getDay() + dayOffset) % 7;
        const checkDay = DAY_MAP[checkDayIndex];

        if (!cls.days.includes(checkDay)) continue;

        let minutesUntil: number;
        if (dayOffset === 0) {
          // Same day — only count if the start time is still ahead
          minutesUntil = startTotalMin - currentTotalMin;
          if (minutesUntil <= 0) continue; // Already passed today
        } else {
          // Future day
          minutesUntil = (dayOffset * 24 * 60) + startTotalMin - currentTotalMin;
        }

        if (minutesUntil < bestMinutes) {
          bestMinutes = minutesUntil;
          best = {
            courseCode: cls.courseCode,
            courseName: cls.courseName,
            startTime: cls.startTime,
            minutesUntil,
          };
        }

        // Only consider the first matching day for this class (the nearest occurrence)
        break;
      }
    }

    return best;
  }

  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      if (signal) {
        signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true }
        );
      }
    });
  }
}