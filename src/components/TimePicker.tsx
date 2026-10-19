import React, { useState } from 'react';
import { Clock, Calendar, Sparkles, ChevronUp, ChevronDown } from 'lucide-react';
import { DayOfWeek } from '../../electron/types';

const ALL_DAYS: { key: DayOfWeek; label: string; full: string }[] = [
  { key: 'Sun', label: 'S', full: 'Sun' },
  { key: 'Mon', label: 'M', full: 'Mon' },
  { key: 'Tue', label: 'T', full: 'Tue' },
  { key: 'Wed', label: 'W', full: 'Wed' },
  { key: 'Thu', label: 'R', full: 'Thu' },
  { key: 'Fri', label: 'F', full: 'Fri' },
  { key: 'Sat', label: 'A', full: 'Sat' },
];

// Official IUB Standard Class Slot Presets
const IUB_SLOT_PRESETS = [
  { label: 'Slot 1 (08:00 - 09:30)', start: '08:00', end: '09:30' },
  { label: 'Slot 2 (09:40 - 11:10)', start: '09:40', end: '11:10' },
  { label: 'Slot 3 (11:20 - 12:50)', start: '11:20', end: '12:50' },
  { label: 'Slot 4 (13:00 - 14:30)', start: '13:00', end: '14:30' },
  { label: 'Slot 5 (14:40 - 16:10)', start: '14:40', end: '16:10' },
  { label: 'Slot 6 (16:20 - 17:50)', start: '16:20', end: '17:50' },
];

interface TimePickerProps {
  selectedDays: DayOfWeek[];
  onChangeDays: (days: DayOfWeek[]) => void;
  startTime: string; // "HH:mm"
  onChangeStartTime: (time: string) => void;
  endTime: string;   // "HH:mm"
  onChangeEndTime: (time: string) => void;
}

export const TimePicker: React.FC<TimePickerProps> = ({
  selectedDays,
  onChangeDays,
  startTime,
  onChangeStartTime,
  endTime,
  onChangeEndTime,
}) => {
  const [activeField, setActiveField] = useState<'start' | 'end'>('start');
  const [dialMode, setDialMode] = useState<'hour' | 'minute'>('hour');

  const current24Time = activeField === 'start' ? startTime : endTime;
  const setCurrent24Time = activeField === 'start' ? onChangeStartTime : onChangeEndTime;

  // Parse "HH:mm" into 12-hour parts
  const [rawHour, rawMinute] = current24Time.split(':').map((n) => parseInt(n, 10) || 0);
  const period: 'AM' | 'PM' = rawHour >= 12 ? 'PM' : 'AM';
  const displayHour12 = rawHour % 12 === 0 ? 12 : rawHour % 12;

  const updateTimeFrom12Hour = (newHour12: number, newMinute: number, newPeriod: 'AM' | 'PM') => {
    let h24 = newHour12 % 12;
    if (newPeriod === 'PM') h24 += 12;
    const formatted = `${String(h24).padStart(2, '0')}:${String(newMinute).padStart(2, '0')}`;
    setCurrent24Time(formatted);
  };

  const handleToggleDay = (day: DayOfWeek) => {
    if (selectedDays.includes(day)) {
      onChangeDays(selectedDays.filter((d) => d !== day));
    } else {
      onChangeDays([...selectedDays, day]);
    }
  };

  const applyDayCombo = (combo: DayOfWeek[]) => {
    onChangeDays(combo);
  };

  const stepMinute = (delta: number) => {
    const totalMinutes = (rawHour * 60 + rawMinute + delta + 1440) % 1440;
    const nextH = Math.floor(totalMinutes / 60);
    const nextM = totalMinutes % 60;
    setCurrent24Time(`${String(nextH).padStart(2, '0')}:${String(nextM).padStart(2, '0')}`);
  };

  const applyDurationFromStart = (minutesToAdd: number) => {
    const [sH, sM] = startTime.split(':').map((n) => parseInt(n, 10) || 0);
    const total = (sH * 60 + sM + minutesToAdd) % 1440;
    const eH = Math.floor(total / 60);
    const eM = total % 60;
    onChangeEndTime(`${String(eH).padStart(2, '0')}:${String(eM).padStart(2, '0')}`);
  };

  const format12HourReadable = (time24: string) => {
    const [h, m] = time24.split(':').map((n) => parseInt(n, 10) || 0);
    const p = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${p}`;
  };

  // Clock geometry
  const clockRadius = 92;
  const center = 115;
  const activeAngleDeg =
    dialMode === 'hour' ? (displayHour12 % 12) * 30 : (rawMinute % 60) * 6;
  const activeAngleRad = ((activeAngleDeg - 90) * Math.PI) / 180;
  const handX = center + (clockRadius - 22) * Math.cos(activeAngleRad);
  const handY = center + (clockRadius - 22) * Math.sin(activeAngleRad);

  const dialNumbers =
    dialMode === 'hour'
      ? [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
      : [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  return (
    <div className="time-picker-container">
      {/* Section 1: Day-of-Week Selector & IUB Day Pairs */}
      <div className="tp-section">
        <div className="tp-section-header">
          <span className="tp-section-title">
            <Calendar size={15} /> Class Days
          </span>
          <div className="tp-quick-combos">
            <button
              type="button"
              className="tp-combo-btn"
              onClick={() => applyDayCombo(['Sun', 'Tue'])}
              title="Sunday & Tuesday"
            >
              ST (Sun/Tue)
            </button>
            <button
              type="button"
              className="tp-combo-btn"
              onClick={() => applyDayCombo(['Mon', 'Wed'])}
              title="Monday & Wednesday"
            >
              MW (Mon/Wed)
            </button>
            <button
              type="button"
              className="tp-combo-btn"
              onClick={() => applyDayCombo(['Thu', 'Sat'])}
              title="Thursday & Saturday"
            >
              RA (Thu/Sat)
            </button>
          </div>
        </div>

        <div className="tp-days-grid">
          {ALL_DAYS.map((day) => {
            const isSelected = selectedDays.includes(day.key);
            return (
              <button
                key={day.key}
                type="button"
                className={`tp-day-pill ${isSelected ? 'selected' : ''}`}
                onClick={() => handleToggleDay(day.key)}
              >
                <span className="tp-day-short">{day.full}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Section 2: Quick IUB Official Slot Presets */}
      <div className="tp-section">
        <div className="tp-section-header">
          <span className="tp-section-title">
            <Sparkles size={15} /> Quick Class Time Slots
          </span>
        </div>
        <div className="tp-presets-grid">
          {IUB_SLOT_PRESETS.map((slot) => {
            const isMatch = startTime === slot.start && endTime === slot.end;
            return (
              <button
                key={slot.label}
                type="button"
                className={`tp-preset-chip ${isMatch ? 'active' : ''}`}
                onClick={() => {
                  onChangeStartTime(slot.start);
                  onChangeEndTime(slot.end);
                }}
              >
                {slot.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Section 3: Interactive Visual Clock Dial + Digital Controller */}
      <div className="tp-clock-workspace">
        <div className="tp-digital-column">
          {/* Start vs End Switcher Cards */}
          <div className="tp-time-tabs">
            <button
              type="button"
              className={`tp-time-tab ${activeField === 'start' ? 'active' : ''}`}
              onClick={() => {
                setActiveField('start');
                setDialMode('hour');
              }}
            >
              <span className="tp-tab-label">START TIME (SCAN AT)</span>
              <span className="tp-tab-value">{format12HourReadable(startTime)}</span>
            </button>

            <button
              type="button"
              className={`tp-time-tab ${activeField === 'end' ? 'active' : ''}`}
              onClick={() => {
                setActiveField('end');
                setDialMode('hour');
              }}
            >
              <span className="tp-tab-label">END TIME</span>
              <span className="tp-tab-value">{format12HourReadable(endTime)}</span>
            </button>
          </div>

          {/* Fine Digital Readout & +/-1 Minute Steppers */}
          <div className="tp-digital-readout-box">
            <div className="tp-digital-digits">
              <button
                type="button"
                className={`tp-digit-btn ${dialMode === 'hour' ? 'focused' : ''}`}
                onClick={() => setDialMode('hour')}
              >
                {String(displayHour12).padStart(2, '0')}
              </button>
              <span className="tp-colon">:</span>
              <button
                type="button"
                className={`tp-digit-btn ${dialMode === 'minute' ? 'focused' : ''}`}
                onClick={() => setDialMode('minute')}
              >
                {String(rawMinute).padStart(2, '0')}
              </button>

              <div className="tp-minute-stepper">
                <button
                  type="button"
                  onClick={() => stepMinute(1)}
                  title="+1 Minute"
                  className="tp-step-icon-btn"
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => stepMinute(-1)}
                  title="-1 Minute"
                  className="tp-step-icon-btn"
                >
                  <ChevronDown size={14} />
                </button>
              </div>
            </div>

            <div className="tp-ampm-toggle">
              <button
                type="button"
                className={`tp-ampm-btn ${period === 'AM' ? 'active' : ''}`}
                onClick={() => updateTimeFrom12Hour(displayHour12, rawMinute, 'AM')}
              >
                AM
              </button>
              <button
                type="button"
                className={`tp-ampm-btn ${period === 'PM' ? 'active' : ''}`}
                onClick={() => updateTimeFrom12Hour(displayHour12, rawMinute, 'PM')}
              >
                PM
              </button>
            </div>
          </div>

          {/* Duration Helper Buttons */}
          <div className="tp-duration-helpers">
            <span className="tp-helper-caption">Set End Time from Start:</span>
            <div className="tp-duration-btns">
              <button type="button" onClick={() => applyDurationFromStart(90)}>
                +1h 30m (Theory)
              </button>
              <button type="button" onClick={() => applyDurationFromStart(150)}>
                +2h 30m (Lab)
              </button>
            </div>
          </div>
        </div>

        {/* Interactive SVG Analog Clock Dial */}
        <div className="tp-analog-column">
          <div className="tp-dial-mode-switch">
            <button
              type="button"
              className={dialMode === 'hour' ? 'active' : ''}
              onClick={() => setDialMode('hour')}
            >
              <Clock size={13} /> Select Hour
            </button>
            <button
              type="button"
              className={dialMode === 'minute' ? 'active' : ''}
              onClick={() => setDialMode('minute')}
            >
              Select Minute
            </button>
          </div>

          <svg className="tp-clock-svg" width="230" height="230" viewBox="0 0 230 230">
            {/* Outer Dial Face */}
            <circle
              cx={center}
              cy={center}
              r={clockRadius + 14}
              fill="#001938"
              stroke="#1E3A5F"
              strokeWidth="2"
            />

            {/* Clock Hand Line */}
            <line
              x1={center}
              y1={center}
              x2={handX}
              y2={handY}
              stroke="#FFB81C"
              strokeWidth="3"
              strokeLinecap="round"
            />

            {/* Center Pin */}
            <circle cx={center} cy={center} r="5" fill="#FFB81C" />

            {/* Interactive Clock Numbers */}
            {dialNumbers.map((num, idx) => {
              const angleDeg = idx * 30;
              const angleRad = ((angleDeg - 90) * Math.PI) / 180;
              const x = center + (clockRadius - 12) * Math.cos(angleRad);
              const y = center + (clockRadius - 12) * Math.sin(angleRad);

              const isSelected =
                dialMode === 'hour'
                  ? displayHour12 === num
                  : rawMinute === num;

              return (
                <g
                  key={num}
                  className="tp-clock-number-group"
                  onClick={() => {
                    if (dialMode === 'hour') {
                      updateTimeFrom12Hour(num, rawMinute, period);
                      setDialMode('minute');
                    } else {
                      updateTimeFrom12Hour(displayHour12, num, period);
                    }
                  }}
                >
                  <circle
                    cx={x}
                    cy={y}
                    r="16"
                    fill={isSelected ? '#FFB81C' : 'transparent'}
                    className="tp-clock-num-circle"
                  />
                  <text
                    x={x}
                    y={y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={isSelected ? '#002147' : '#F8FAFC'}
                    fontWeight={isSelected ? '700' : '500'}
                    fontSize="12"
                  >
                    {dialMode === 'minute' ? String(num).padStart(2, '0') : num}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
};