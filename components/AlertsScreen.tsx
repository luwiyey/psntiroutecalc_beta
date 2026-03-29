import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import StopPickerOverlay from './StopPickerOverlay';
import HelpHint from './HelpHint';
import { formatEta } from '../utils/stop-data';

interface Props {
  onExit?: () => void;
}

const AlertsScreen: React.FC<Props> = ({ onExit }) => {
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
    <div className="flex min-h-full flex-col bg-[#f8f6f6] pb-24 transition-all dark:bg-black">
      <header className="sticky top-0 z-40 flex shrink-0 items-center justify-between bg-primary px-6 py-4 shadow-md">
        <div className="flex items-center gap-3">
          <span className="material-icons text-2xl text-white">notifications_active</span>
          <div>
            <h1 className="text-xl font-medium tracking-tight text-white">Alerts</h1>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/75">{activeRoute.shortLabel}</p>
          </div>
        </div>
        <button
          onClick={onExit}
          className="flex items-center justify-center rounded-xl bg-white/20 p-2 text-white transition-colors hover:bg-white/30"
        >
          <span className="material-icons text-lg leading-none">close</span>
        </button>
      </header>

      <div className="space-y-5 p-4">
        <div className="grid grid-cols-3 gap-2 max-[360px]:gap-1.5">
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
                  : 'bg-white text-slate-500 shadow-sm dark:bg-night-charcoal dark:text-slate-300'
              }`}
            >
              <p className="text-[10px] font-black uppercase tracking-widest">{item.label}</p>
              <p className="mt-2 text-xs font-black">{item.value ? 'ON' : 'OFF'}</p>
            </button>
          ))}
        </div>

        <div className="rounded-[1.75rem] bg-white px-4 py-4 shadow-sm dark:bg-night-charcoal">
          <HelpHint
            label="Drop-off alerts watch the selected stop while the app stays open. Queue the stop and passenger count here so conductors know who is getting down at that place."
            triggerClassName="inline-flex cursor-pointer rounded-md text-xs font-semibold text-slate-500 dark:text-slate-300"
          >
            Alerts work best while the app is open and GPS is allowed on the phone.
          </HelpHint>
        </div>

        <section className="rounded-[2rem] bg-white p-5 shadow-sm dark:bg-night-charcoal">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <HelpHint
                label="Pick the exact KM-post stop for this drop-off. If you only know the place or landmark, search it first and then choose the nearest route stop."
                triggerClassName="inline-flex cursor-pointer rounded-md text-[10px] font-black uppercase tracking-widest text-slate-400"
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
              className="w-full shrink-0 rounded-[1.5rem] bg-primary px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white active:scale-95 sm:w-auto"
            >
              {draftStopName ? 'Change Stop' : 'Pick Or Search Stop'}
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <input
              type="number"
              min="1"
              inputMode="numeric"
              value={passengerCount}
              onChange={event => setPassengerCount(event.target.value)}
              className="min-w-0 rounded-[1.5rem] border border-slate-200 bg-white px-4 py-4 text-sm font-black text-slate-700 caret-primary outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 dark:border-white/10 dark:bg-black dark:text-white"
              placeholder="Passengers getting down"
            />
            <button
              onClick={handleAddReminder}
              disabled={!draftStopName}
              className="w-full rounded-[1.5rem] bg-slate-900 px-5 py-4 text-[10px] font-black uppercase tracking-widest text-white active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-900 sm:w-auto"
            >
              Queue
            </button>
          </div>
        </section>

        <section className="rounded-[2rem] bg-white p-5 shadow-sm dark:bg-night-charcoal">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <HelpHint
                label="These are the stops currently being watched for reminders. You can turn each one on or off, mark it done, or remove it."
                triggerClassName="inline-flex cursor-pointer rounded-md text-[10px] font-black uppercase tracking-widest text-slate-400"
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
                        {reminderStop ? `KM ${reminderStop.km}` : 'Stop queued'} | {reminder.passengerCount} passenger{reminder.passengerCount > 1 ? 's' : ''}
                      </p>
                      <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-300">{statusLabel}</p>
                      {reminder.lastEtaSeconds ? (
                        <p className="mt-1 text-xs font-semibold text-slate-400">
                          Last ETA {formatEta(reminder.lastEtaSeconds)}
                        </p>
                      ) : null}
                    </div>
                    <label className="relative inline-flex cursor-pointer items-center">
                      <input
                        type="checkbox"
                        checked={reminder.enabled}
                        onChange={() => toggleReminder(reminder.id)}
                        className="peer sr-only"
                      />
                      <div className="h-6 w-11 rounded-full bg-slate-200 transition-all after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-full dark:bg-slate-700" />
                    </label>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <button
                      onClick={() => markReminderDone(reminder.id)}
                      className="rounded-[1.2rem] bg-primary px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white active:scale-95"
                    >
                      Mark Done
                    </button>
                    <button
                      onClick={() => removeReminder(reminder.id)}
                      className="rounded-[1.2rem] border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 active:scale-95 dark:border-white/10 dark:text-slate-300"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <StopPickerOverlay
        isOpen={isStopPickerOpen}
        onClose={() => setIsStopPickerOpen(false)}
        onSelect={(name) => {
          setDraftStopName(name);
          setIsStopPickerOpen(false);
          showToast(`Drop-off set to ${name}`);
        }}
        title="Drop-Off Stop"
      />
    </div>
  );
};

export default AlertsScreen;
