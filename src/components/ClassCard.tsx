// Written and refined by Gemini - Continuing from previous agent's milestone
// Component rendering individual class cards with configured and unconfigured (needs schedule) states

import React from 'react';
import {
  Play,
  Edit3,
  Trash2,
  ExternalLink,
  Clock,
  Calendar,
  LogOut,
  AlertTriangle,
  CalendarClock,
} from 'lucide-react';
import { ClassSchedule } from '../../electron/types';

interface ClassCardProps {
  cls: ClassSchedule;
  isCurrentlyScanning: boolean;
  onToggle: (id: string, enabled: boolean) => void;
  onTriggerNow: (id: string) => void;
  onEdit: (cls: ClassSchedule) => void;
  onDelete: (id: string) => void;
}

export const ClassCard: React.FC<ClassCardProps> = ({
  cls,
  isCurrentlyScanning,
  onToggle,
  onTriggerNow,
  onEdit,
  onDelete,
}) => {
  const format12Hour = (time24: string) => {
    const [h, m] = time24.split(':').map((n) => parseInt(n, 10) || 0);
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
  };

  // Render a special card for classes that need their schedule configured
  if (cls.needsSchedule) {
    return (
      <div className="class-card needs-schedule">
        <div className="class-card-top">
          <div className="course-badges">
            <span className="course-code-badge">{cls.courseCode}</span>
            {cls.section && <span className="course-section-badge">{cls.section}</span>}
            <span className="needs-schedule-badge">
              <AlertTriangle size={11} /> Needs Schedule
            </span>
          </div>
        </div>

        <h3 className="course-title">{cls.courseName}</h3>

        <div className="course-url-box" title={cls.classroomUrl}>
          <ExternalLink size={13} className="url-icon" />
          <span className="url-text">{cls.classroomUrl}</span>
        </div>

        <div className="class-card-actions">
          <button
            type="button"
            className="btn-set-schedule"
            onClick={() => onEdit(cls)}
          >
            <CalendarClock size={15} />
            Set Schedule
          </button>

          <div className="card-icon-actions">
            <button
              type="button"
              className="btn-icon-only delete"
              onClick={() => onDelete(cls.id)}
              title="Delete Class"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Regular configured class card
  return (
    <div
      className={`class-card ${!cls.enabled ? 'disabled' : ''} ${
        isCurrentlyScanning ? 'active-scanning' : ''
      }`}
    >
      <div className="class-card-top">
        <div className="course-badges">
          <span className="course-code-badge">{cls.courseCode}</span>
          {cls.section && <span className="course-section-badge">{cls.section}</span>}
          {cls.autoLeaveAtEnd && (
            <span className="course-autoleave-badge" title="Automatically leaves Meet at End Time">
              <LogOut size={11} /> Auto-Leave
            </span>
          )}
        </div>

        <label className="iub-switch" title={cls.enabled ? 'Auto-join enabled' : 'Auto-join paused'}>
          <input
            type="checkbox"
            checked={cls.enabled}
            onChange={(e) => onToggle(cls.id, e.target.checked)}
          />
          <span className="iub-slider" />
        </label>
      </div>

      <h3 className="course-title">{cls.courseName}</h3>

      <div className="course-schedule-meta">
        <div className="meta-row">
          <Calendar size={15} className="meta-icon" />
          <div className="day-badges-inline">
            {cls.days.map((d) => (
              <span key={d} className="day-chip">
                {d}
              </span>
            ))}
          </div>
        </div>

        <div className="meta-row">
          <Clock size={15} className="meta-icon" />
          <span className="time-range-text">
            {format12Hour(cls.startTime)} — {format12Hour(cls.endTime)}
          </span>
        </div>
      </div>

      <div className="course-url-box" title={cls.classroomUrl}>
        <ExternalLink size={13} className="url-icon" />
        <span className="url-text">{cls.classroomUrl}</span>
      </div>

      <div className="class-card-actions">
        <button
          type="button"
          className="btn-scan-now"
          onClick={() => onTriggerNow(cls.id)}
          disabled={isCurrentlyScanning}
          title="Immediately open Classroom, scan for Meet link, and join"
        >
          <Play size={14} />
          {isCurrentlyScanning ? 'Scanning Classroom...' : 'Scan & Join Now'}
        </button>

        <div className="card-icon-actions">
          <button
            type="button"
            className="btn-icon-only"
            onClick={() => onEdit(cls)}
            title="Edit Schedule"
          >
            <Edit3 size={15} />
          </button>
          <button
            type="button"
            className="btn-icon-only delete"
            onClick={() => onDelete(cls.id)}
            title="Delete Class"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    </div>
  );
};