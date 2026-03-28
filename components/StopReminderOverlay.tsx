import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import StopPickerOverlay from './StopPickerOverlay';
import HelpHint from './HelpHint';
import { formatEta } from '../utils/stop-data';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const StopReminderOverlay: React.FC<Props> = ({ isOpen, onClose }) => {
  const {
    activeRoute,
    stopReminders,
    setStopReminders,
    reminderSettings,
    setReminderSettings,
    showToast
  } = useApp();
  const [isStopPickerOpen, setIsStopPickerOpen] = useState(false);
  const [draftStopName, setDraftStopName] = useState('');
  const [passengerCount, setPassengerCount] = useState('1');

  const routeReminders = useMemo(
    () => stopReminders.filter(reminder => reminder.routeId === activeRoute.id),
    [activeRoute.id, stopReminders]
  );

  if (!isOpen) return null;

  const toggleReminderSetting = (key: keyof typeof reminderSettings) => {
    setReminderSettings(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleAddReminder = () => {
    if (!draftStopName) {
      showToast('Pick a stop first before queueing passengers.', 'info');
      return;
    }

    const nextPassengerCount = Math.max(1, parseInt(passengerCount, 10) || 1);

    setStopReminders(prev => {
      const existingReminder = prev.find(
        reminder =>
          reminder.routeId === activeRoute.id &&
          reminder.stopName === draftStopName &&
          reminder.status !== 'done'
      );

      if (existingReminder) {
        return prev.map(reminder =>
          reminder.id === existingReminder.id
            ? {
                ...reminder,
                passengerCount: reminder.passengerCount + nextPassengerCount,
                enabled: true
              }
            : reminder
        );
      }

      return [
        {
          id: `reminder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          routeId: activeRoute.id,
          routeLabel: activeRoute.label,
          stopName: draftStopName,
          passengerCount: nextPassengerCount,
          enabled: true,
          status: 'active',
          createdAt: Date.now(),
          alertsTriggered: {
            twoMinute: false,
            oneMinute: false,
            arrival: false
          }
        },
        ...prev
      ];
    });

    setDraftStopName('');
    setPassengerCount('1');
    showToast('Drop-off reminder saved');
  };

  const toggleReminder = (reminderId: string) => {
    setStopReminders(prev =>
      prev.map(reminder =>
        reminder.id === reminderId
          ? { ...reminder, enabled: !reminder.enabled }
          : reminder
      )
    );
  };

  const markReminderDone = (reminderId: string) => {
    setStopReminders(prev =>
      prev.map(reminder =>
        reminder.id === reminderId
          ? { ...reminder, status: 'done', enabled: false }
          : reminder
      )
    );
  };

  const removeReminder = (reminderId: string) => {
    setStopReminders(prev => prev.filter(reminder => reminder.id !== reminderId));
  };

  return (
    <>
      <div className="fixed inset-0 z-[165] bg-white dark:bg-black flex flex-col animate-fade-in">
        <header
          className="px-4 pb-4 border-b border-slate-100 dark:border-white/10 flex items-center justify-between"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}
        >
          <button onClick={onClose} className="p-2 -ml-2 active:opacity-50 transition-opacity">
            <span className="material-icons text-slate-600 dark:text-white">chevron_left</span>
          </button>
          <div className="text-center">
            <h1 className="text-sm font-900 tracking-widest uppercase text-slate-800 dark:text-white">Drop-Off Alerts</h1>
            <p className="text-[10px] font-black uppercase tracking-widest text-primary">{activeRoute.shortLabel}</p>
          </div>
          <div className="w-10" />
        </header>

        <div className="p-4 bg-slate-50 dark:bg-night-charcoal border-b border-slate-100 dark:border-white/5">
          <div className="grid grid-cols-3 gap-2">
            {[
              { key: 'enabled', label: 'Alerts', value: reminderSettings.enabled },
              { key: 'soundEnabled', label: 'Sound', value: reminderSettings.soundEnabled },
              { key: 'vibrationEnabled', label: 'Vibrate', value: reminderSettings.vibrationEnabled }
            ].map(item => (
              <button
                key={item.key}
                onClick={() => toggleReminderSetting(item.key as keyof typeof reminderSettings)}
                className={`rounded-2xl px-3 py-4 text-center transition-all ${
                  item.value
                    ? 'bg-primary text-white'
                    : 'bg-white text-slate-500 shadow-sm dark:bg-black/30 dark:text-slate-300'
                }`}
              >
                <p className="text-[10px] font-black uppercase tracking-widest">{item.label}</p>
                <p className="mt-2 text-xs font-black">{item.value ? 'ON' : 'OFF'}</p>
              </button>
            ))}
          </div>
          <div className="mt-4 flex items-start gap-2">
            <HelpHint
              label="Alerts watch the selected stop while the app is open. Sound and vibration can be turned on or off separately."
              triggerClassName="inline-flex cursor-help rounded-md text-xs font-semibold text-slate-500 underline decoration-dotted underline-offset-4 dark:text-slate-300"
            >
              Alerts work best while the app is open and GPS is allowed on the phone.
            </HelpHint>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="rounded-[2rem] bg-white p-5 shadow-sm dark:bg-night-charcoal">
            <div className="flex items-center justify-between gap-3">
              <div>
                <HelpHint
                  label="Step 1: pick a stop. Step 2: enter how many passengers will go down there. Step 3: tap Queue to save the reminder."
                  triggerClassName="inline-flex cursor-help rounded-md text-[10px] font-black uppercase tracking-widest text-slate-400 underline decoration-dotted underline-offset-4"
                >
                  Add Stop
                </HelpHint>
                <h2 className="mt-2 text-xl font-black text-slate-900 dark:text-white">
                  {draftStopName || 'Choose a drop-off stop'}
                </h2>
                <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-300">
                  {draftStopName
                    ? 'Stop selected. Enter passengers, then tap Queue.'
                    : 'Pick the stop first, then enter the passenger count.'}
                </p>
              </div>
              <button
                onClick={() => setIsStopPickerOpen(true)}
                className="rounded-[1.5rem] bg-primary px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white active:scale-95"
              >
                {draftStopName ? 'Change Stop' : 'Pick Stop'}
              </button>
            </div>

            <div className="mt-4 grid grid-cols-[1fr_auto] gap-3">
              <input
                type="number"
                min="1"
                value={passengerCount}
                onChange={event => setPassengerCount(event.target.value)}
                className="rounded-[1.5rem] border border-slate-200 bg-white px-4 py-4 text-sm font-black text-slate-700 outline-none focus:border-primary dark:border-white/10 dark:bg-black dark:text-white"
                placeholder="Passengers getting down"
              />
              <button
                onClick={handleAddReminder}
                disabled={!draftStopName}
                className="rounded-[1.5rem] bg-slate-900 px-5 py-4 text-[10px] font-black uppercase tracking-widest text-white active:scale-95 disabled:opacity-50 dark:bg-white dark:text-slate-900"
              >
                Queue
              </button>
            </div>
          </div>

            <div className="rounded-[2rem] bg-white p-5 shadow-sm dark:bg-night-charcoal">
              <div className="flex items-center justify-between gap-3">
                <div>
                <HelpHint
                  label="These are the stops currently being watched for reminders. You can turn each one on or off, mark it done, or remove it."
                  triggerClassName="inline-flex cursor-help rounded-md text-[10px] font-black uppercase tracking-widest text-slate-400 underline decoration-dotted underline-offset-4"
                >
                  Queued Stops
                </HelpHint>
                <h2 className="mt-2 text-xl font-black text-slate-900 dark:text-white">{routeReminders.length} saved</h2>
              </div>
              <span className="rounded-full bg-primary/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-primary">
                {reminderSettings.enabled ? 'Monitoring' : 'Paused'}
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {routeReminders.length === 0 && (
                <div className="rounded-[1.5rem] bg-slate-50 px-4 py-6 text-center dark:bg-black/30">
                  <p className="text-sm font-bold text-slate-500 dark:text-slate-300">
                    No drop-off reminders queued for this route yet.
                  </p>
                </div>
              )}

              {routeReminders.map(reminder => {
                const reminderStop = activeRoute.stops.find(stop => stop.name === reminder.stopName);
                const statusLabel =
                  reminder.status === 'done'
                    ? 'Completed'
                    : reminder.alertsTriggered.arrival
                      ? 'Arriving now'
                      : reminder.alertsTriggered.oneMinute
                        ? '1 min alerted'
                        : reminder.alertsTriggered.twoMinute
                          ? '2 min alerted'
                          : 'Queued';

                return (
                  <div
                    key={reminder.id}
                    className="rounded-[1.5rem] border border-slate-100 bg-slate-50 px-4 py-4 dark:border-white/10 dark:bg-black/30"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-black text-slate-900 dark:text-white">{reminder.stopName}</p>
                        <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                          {reminderStop ? `KM ${reminderStop.km}` : 'Stop queued'} • {reminder.passengerCount} passenger{reminder.passengerCount > 1 ? 's' : ''}
                        </p>
                        <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-300">{statusLabel}</p>
                      </div>
                      <button
                        onClick={() => toggleReminder(reminder.id)}
                        className={`rounded-2xl px-3 py-2 text-[10px] font-black uppercase tracking-widest ${
                          reminder.enabled
                            ? 'bg-primary text-white'
                            : 'bg-white text-slate-500 dark:bg-black dark:text-slate-300'
                        }`}
                      >
                        {reminder.enabled ? 'On' : 'Off'}
                      </button>
                    </div>

                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={() => markReminderDone(reminder.id)}
                        className="flex-1 rounded-[1.25rem] bg-slate-900 py-3 text-[10px] font-black uppercase tracking-widest text-white active:scale-95 dark:bg-white dark:text-slate-900"
                      >
                        Mark Done
                      </button>
                      <button
                        onClick={() => removeReminder(reminder.id)}
                        className="rounded-[1.25rem] border border-slate-200 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 active:scale-95 dark:border-white/10 dark:text-slate-300"
                      >
                        Remove
                      </button>
                    </div>

                    {(reminder.alertsTriggered.oneMinute || reminder.alertsTriggered.twoMinute) && reminder.status !== 'done' && (
                      <p className="mt-3 text-[11px] font-semibold text-slate-500 dark:text-slate-300">
                        Auto reminders are based on phone GPS and estimated travel speed, so exact seconds can still vary.
                      </p>
                    )}
                    {reminder.status === 'arriving' && (
                      <p className="mt-3 text-[11px] font-semibold text-primary">
                        Arrival alert is using the stop zone, not a strict {formatEta(5)} timer.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <StopPickerOverlay
        isOpen={isStopPickerOpen}
        onClose={() => setIsStopPickerOpen(false)}
        onSelect={name => {
          setDraftStopName(name);
          setIsStopPickerOpen(false);
          showToast(`${name} selected. Enter passengers, then tap Queue.`, 'info');
        }}
        title="Drop-Off Stop"
      />
    </>
  );
};

export default StopReminderOverlay;
