import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase/client';

interface NotificationTemplate {
  id: string;
  name: string;
  description: string | null;
  channel: 'email' | 'teams';
  is_enabled: boolean;
  subject: string | null;
  body: string;
  recipient_role: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  day_of_week: number | null;
  send_time: string;
  timezone: string;
  created_at: string;
  updated_at: string;
}

interface DeliveryLog {
  id: string;
  template_name: string | null;
  channel: string;
  recipient_name: string | null;
  status: 'sent' | 'failed' | 'test';
  error_message: string | null;
  sent_at: string;
}

interface GlobalSettings {
  id: string;
  is_paused: boolean;
}

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const CHANNEL_LABELS: Record<string, string> = {
  email: 'Email',
  teams: 'Microsoft Teams',
};

const FREQUENCY_LABELS: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

const PLACEHOLDERS = [
  { key: '{{recipient_name}}', desc: 'Full name of the recipient' },
  { key: '{{recipient_first_name}}', desc: 'First name of the recipient' },
  { key: '{{recipient_role}}', desc: 'Role of the recipient' },
  { key: '{{organisation_name}}', desc: 'Organisation name' },
  { key: '{{app_link}}', desc: 'Link back to the app' },
  { key: '{{current_date}}', desc: 'Today\'s date' },
  { key: '{{week_commencing_date}}', desc: 'Start of the current week' },
  { key: '{{period_start_date}}', desc: 'Start of the current period' },
  { key: '{{period_end_date}}', desc: 'End of the current period' },
  { key: '{{services}}', desc: 'Full service delivery dataset for the month' },
  { key: '{{services_this_week}}', desc: 'Services focus for this week' },
  { key: '{{service_name}}', desc: 'Name of a service' },
  { key: '{{service_target_count}}', desc: 'Monthly target for the service' },
  { key: '{{service_completed_count}}', desc: 'Items completed so far' },
  { key: '{{service_remaining_count}}', desc: 'Items remaining' },
  { key: '{{service_net_position}}', desc: 'Ahead or behind run rate' },
  { key: '{{service_status}}', desc: 'On track / at risk / behind' },
  { key: '{{service_forecast_status}}', desc: 'Forecast: likely on track / at risk / likely to fail' },
  { key: '{{delivery_trend}}', desc: 'Improving / flat / deteriorating' },
  { key: '{{avg_weekly_delivery_rate}}', desc: 'Average weekly delivery rate from past performance' },
  { key: '{{required_weekly_delivery_rate}}', desc: 'Required weekly rate to hit target' },
];

const emptyTemplate = (): Omit<NotificationTemplate, 'id' | 'created_at' | 'updated_at'> => ({
  name: '',
  description: '',
  channel: 'email',
  is_enabled: false,
  subject: '',
  body: '',
  recipient_role: 'accountant',
  frequency: 'weekly',
  day_of_week: 1,
  send_time: '08:00',
  timezone: 'Europe/London',
});

export const NotificationsSettings: React.FC = () => {
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [logs, setLogs] = useState<DeliveryLog[]>([]);
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [activeView, setActiveView] = useState<'templates' | 'logs' | 'placeholders'>('templates');
  const [editingTemplate, setEditingTemplate] = useState<NotificationTemplate | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState(emptyTemplate());
  const [isSaving, setIsSaving] = useState(false);
  const [showPlaceholders, setShowPlaceholders] = useState(false);
  const [testSending, setTestSending] = useState<string | null>(null);

  const setTimedFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    window.setTimeout(() => setFeedback(null), 5000);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [templatesRes, logsRes, settingsRes] = await Promise.all([
        supabase.from('notification_templates').select('*').order('created_at'),
        supabase.from('notification_delivery_logs').select('*').order('sent_at', { ascending: false }).limit(100),
        supabase.from('notification_global_settings').select('*').limit(1).maybeSingle(),
      ]);

      if (!templatesRes.error) setTemplates((templatesRes.data || []) as NotificationTemplate[]);
      if (!logsRes.error) setLogs((logsRes.data || []) as DeliveryLog[]);
      if (!settingsRes.error && settingsRes.data) setGlobalSettings(settingsRes.data as GlobalSettings);
    } catch {
      setTimedFeedback('error', 'Failed to load notification data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleToggleGlobalPause = async () => {
    if (!globalSettings) return;
    const newPaused = !globalSettings.is_paused;
    const { error } = await supabase
      .from('notification_global_settings')
      .update({ is_paused: newPaused, updated_at: new Date().toISOString() })
      .eq('id', globalSettings.id);

    if (error) {
      setTimedFeedback('error', 'Failed to update global pause setting');
    } else {
      setGlobalSettings(prev => prev ? { ...prev, is_paused: newPaused } : prev);
      setTimedFeedback('success', newPaused ? 'All notifications paused' : 'Notifications resumed');
    }
  };

  const handleToggleTemplate = async (template: NotificationTemplate) => {
    const { error } = await supabase
      .from('notification_templates')
      .update({ is_enabled: !template.is_enabled, updated_at: new Date().toISOString() })
      .eq('id', template.id);

    if (error) {
      setTimedFeedback('error', 'Failed to update template');
    } else {
      setTemplates(prev => prev.map(t => t.id === template.id ? { ...t, is_enabled: !t.is_enabled } : t));
    }
  };

  const handleEditTemplate = (template: NotificationTemplate) => {
    setEditingTemplate(template);
    setIsCreating(false);
    setFormData({
      name: template.name,
      description: template.description || '',
      channel: template.channel,
      is_enabled: template.is_enabled,
      subject: template.subject || '',
      body: template.body,
      recipient_role: template.recipient_role,
      frequency: template.frequency,
      day_of_week: template.day_of_week,
      send_time: template.send_time,
      timezone: template.timezone,
    });
    setShowPlaceholders(false);
  };

  const handleNewTemplate = () => {
    setEditingTemplate(null);
    setIsCreating(true);
    setFormData(emptyTemplate());
    setShowPlaceholders(false);
  };

  const handleCancelEdit = () => {
    setEditingTemplate(null);
    setIsCreating(false);
    setFormData(emptyTemplate());
  };

  const handleSaveTemplate = async () => {
    if (!formData.name.trim() || !formData.body.trim()) {
      setTimedFeedback('error', 'Template name and body are required');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        name: formData.name.trim(),
        description: formData.description?.trim() || null,
        channel: formData.channel,
        is_enabled: formData.is_enabled,
        subject: formData.channel === 'email' ? (formData.subject?.trim() || null) : null,
        body: formData.body.trim(),
        recipient_role: formData.recipient_role,
        frequency: formData.frequency,
        day_of_week: formData.frequency === 'weekly' ? formData.day_of_week : null,
        send_time: formData.send_time,
        timezone: formData.timezone,
        updated_at: new Date().toISOString(),
      };

      if (editingTemplate) {
        const { error } = await supabase
          .from('notification_templates')
          .update(payload)
          .eq('id', editingTemplate.id);

        if (error) throw error;
        setTimedFeedback('success', 'Template updated successfully');
      } else {
        const { error } = await supabase
          .from('notification_templates')
          .insert({ ...payload, created_at: new Date().toISOString() });

        if (error) throw error;
        setTimedFeedback('success', 'Template created successfully');
      }

      await fetchData();
      handleCancelEdit();
    } catch {
      setTimedFeedback('error', 'Failed to save template');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTemplate = async (template: NotificationTemplate) => {
    if (!window.confirm(`Delete template "${template.name}"? This cannot be undone.`)) return;

    const { error } = await supabase
      .from('notification_templates')
      .delete()
      .eq('id', template.id);

    if (error) {
      setTimedFeedback('error', 'Failed to delete template');
    } else {
      setTemplates(prev => prev.filter(t => t.id !== template.id));
      setTimedFeedback('success', 'Template deleted');
      if (editingTemplate?.id === template.id) handleCancelEdit();
    }
  };

  const handleTestSend = async (template: NotificationTemplate) => {
    setTestSending(template.id);
    try {
      const { error } = await supabase
        .from('notification_delivery_logs')
        .insert({
          template_id: template.id,
          template_name: template.name,
          channel: template.channel,
          recipient_name: 'Test Send',
          status: 'test',
          error_message: null,
          sent_at: new Date().toISOString(),
        });

      if (error) throw error;
      setTimedFeedback('success', `Test send logged for "${template.name}" (${CHANNEL_LABELS[template.channel]}). Configure your channel integration to enable actual delivery.`);
      await fetchData();
    } catch {
      setTimedFeedback('error', 'Failed to log test send');
    } finally {
      setTestSending(null);
    }
  };

  const insertPlaceholder = (placeholder: string) => {
    setFormData(prev => ({ ...prev, body: prev.body + placeholder }));
  };

  const insertSubjectPlaceholder = (placeholder: string) => {
    setFormData(prev => ({ ...prev, subject: (prev.subject || '') + placeholder }));
  };

  if (loading) {
    return <div className="py-10 text-center text-gray-500">Loading notifications…</div>;
  }

  const isEditing = editingTemplate !== null || isCreating;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Notification System</h3>
            <p className="text-sm text-gray-500 mt-1">
              Create and manage notification templates for Email and Microsoft Teams delivery.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {globalSettings && (
              <button
                onClick={handleToggleGlobalPause}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold border transition-colors ${
                  globalSettings.is_paused
                    ? 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100'
                    : 'bg-gray-50 border-gray-300 text-gray-700 hover:bg-gray-100'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${globalSettings.is_paused ? 'bg-amber-500' : 'bg-green-500'}`} />
                {globalSettings.is_paused ? 'Notifications Paused — Click to Resume' : 'Notifications Active — Click to Pause All'}
              </button>
            )}
          </div>
        </div>
      </div>

      {feedback && (
        <div className={`p-4 border rounded-md text-sm ${
          feedback.type === 'success'
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {feedback.message}
        </div>
      )}

      {/* Sub-nav */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-6">
          {(['templates', 'logs', 'placeholders'] as const).map(view => (
            <button
              key={view}
              onClick={() => setActiveView(view)}
              className={`py-2 px-1 border-b-2 font-medium text-sm capitalize ${
                activeView === view
                  ? 'border-[#001B47] text-[#001B47]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {view === 'templates' ? 'Templates' : view === 'logs' ? 'Delivery Logs' : 'Placeholder Reference'}
            </button>
          ))}
        </nav>
      </div>

      {/* Templates View */}
      {activeView === 'templates' && (
        <div className="space-y-6">
          {!isEditing && (
            <div className="flex justify-end">
              <button
                onClick={handleNewTemplate}
                className="px-4 py-2 bg-[#001B47] text-white rounded-md hover:bg-[#00245F] text-sm font-bold transition-colors"
              >
                + New Template
              </button>
            </div>
          )}

          {isEditing ? (
            /* Template Editor */
            <div className="bg-white shadow rounded-lg overflow-hidden">
              <div className="bg-[#001B47] px-6 py-3">
                <h4 className="text-white font-bold">
                  {isCreating ? 'New Notification Template' : `Edit: ${editingTemplate?.name}`}
                </h4>
              </div>

              <div className="p-6 space-y-6">
                {/* Basic Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Template Name *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#001B47]"
                      placeholder="e.g. Weekly Service Delivery Summary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Description</label>
                    <input
                      type="text"
                      value={formData.description || ''}
                      onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#001B47]"
                      placeholder="Internal description / purpose"
                    />
                  </div>
                </div>

                {/* Channel & Recipients */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Delivery Channel</label>
                    <select
                      value={formData.channel}
                      onChange={e => setFormData(p => ({ ...p, channel: e.target.value as 'email' | 'teams' }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#001B47]"
                    >
                      <option value="email">Email</option>
                      <option value="teams">Microsoft Teams</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Recipient Role</label>
                    <select
                      value={formData.recipient_role}
                      onChange={e => setFormData(p => ({ ...p, recipient_role: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#001B47]"
                    >
                      <option value="accountant">Accountant</option>
                      <option value="admin">Admin</option>
                      <option value="all">All Users</option>
                    </select>
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <div
                        onClick={() => setFormData(p => ({ ...p, is_enabled: !p.is_enabled }))}
                        className={`relative w-10 h-6 rounded-full transition-colors cursor-pointer ${formData.is_enabled ? 'bg-green-500' : 'bg-gray-300'}`}
                      >
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${formData.is_enabled ? 'translate-x-5' : 'translate-x-1'}`} />
                      </div>
                      <span className="text-sm font-medium text-gray-700">
                        {formData.is_enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </label>
                  </div>
                </div>

                {/* Scheduling */}
                <div className="border border-gray-200 rounded-lg p-4 space-y-4">
                  <h5 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Scheduling</h5>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Frequency</label>
                      <select
                        value={formData.frequency}
                        onChange={e => setFormData(p => ({ ...p, frequency: e.target.value as 'daily' | 'weekly' | 'monthly' }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#001B47]"
                      >
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </div>
                    {formData.frequency === 'weekly' && (
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Day of Week</label>
                        <select
                          value={formData.day_of_week ?? 1}
                          onChange={e => setFormData(p => ({ ...p, day_of_week: Number(e.target.value) }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#001B47]"
                        >
                          {DAYS_OF_WEEK.map((day, idx) => (
                            <option key={idx} value={idx}>{day}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Send Time</label>
                      <input
                        type="time"
                        value={formData.send_time}
                        onChange={e => setFormData(p => ({ ...p, send_time: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#001B47]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Timezone</label>
                      <select
                        value={formData.timezone}
                        onChange={e => setFormData(p => ({ ...p, timezone: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#001B47]"
                      >
                        <option value="Europe/London">UK (Europe/London)</option>
                        <option value="UTC">UTC</option>
                        <option value="Europe/Paris">Europe/Paris</option>
                        <option value="America/New_York">America/New_York</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Email Subject (email only) */}
                {formData.channel === 'email' && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold text-gray-500 uppercase">Email Subject *</label>
                      <button
                        type="button"
                        onClick={() => setShowPlaceholders(p => !p)}
                        className="text-xs text-[#001B47] font-semibold hover:underline"
                      >
                        {showPlaceholders ? 'Hide' : 'Show'} placeholders
                      </button>
                    </div>
                    <input
                      type="text"
                      value={formData.subject || ''}
                      onChange={e => setFormData(p => ({ ...p, subject: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#001B47]"
                      placeholder="e.g. Your Weekly Service Delivery Summary — {{week_commencing_date}}"
                    />
                    {showPlaceholders && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {PLACEHOLDERS.slice(0, 10).map(p => (
                          <button
                            key={p.key}
                            type="button"
                            onClick={() => insertSubjectPlaceholder(p.key)}
                            title={p.desc}
                            className="px-2 py-0.5 bg-blue-50 border border-blue-200 text-blue-700 rounded text-xs font-mono hover:bg-blue-100 transition-colors"
                          >
                            {p.key}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Message Body */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-gray-500 uppercase">
                      Message Body * {formData.channel === 'email' ? '(HTML or plain text)' : '(Plain text or Markdown)'}
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowPlaceholders(p => !p)}
                      className="text-xs text-[#001B47] font-semibold hover:underline"
                    >
                      {showPlaceholders ? 'Hide' : 'Show'} placeholders
                    </button>
                  </div>

                  {showPlaceholders && (
                    <div className="mb-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                      <p className="text-xs font-bold text-gray-500 uppercase mb-2">Click to insert placeholder</p>
                      <div className="flex flex-wrap gap-1">
                        {PLACEHOLDERS.map(p => (
                          <button
                            key={p.key}
                            type="button"
                            onClick={() => insertPlaceholder(p.key)}
                            title={p.desc}
                            className="px-2 py-0.5 bg-blue-50 border border-blue-200 text-blue-700 rounded text-xs font-mono hover:bg-blue-100 transition-colors"
                          >
                            {p.key}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <textarea
                    value={formData.body}
                    onChange={e => setFormData(p => ({ ...p, body: e.target.value }))}
                    rows={16}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#001B47] resize-y"
                    placeholder="Enter your message body. Use {{placeholder}} syntax for dynamic values."
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    Placeholders are resolved at send time using live data from the tracker.
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md text-sm font-bold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveTemplate}
                    disabled={isSaving}
                    className="px-6 py-2 bg-[#001B47] hover:bg-[#00245F] text-white rounded-md text-sm font-bold transition-colors disabled:opacity-50"
                  >
                    {isSaving ? 'Saving…' : editingTemplate ? 'Save Changes' : 'Create Template'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Template List */
            <div className="space-y-4">
              {templates.length === 0 ? (
                <div className="bg-white shadow rounded-lg p-10 text-center text-gray-500">
                  <p className="text-lg font-medium mb-2">No notification templates yet</p>
                  <p className="text-sm mb-4">Create your first template to get started.</p>
                  <button
                    onClick={handleNewTemplate}
                    className="px-4 py-2 bg-[#001B47] text-white rounded-md text-sm font-bold hover:bg-[#00245F] transition-colors"
                  >
                    + New Template
                  </button>
                </div>
              ) : (
                templates.map(template => (
                  <div
                    key={template.id}
                    className="bg-white shadow rounded-lg border border-gray-200 overflow-hidden"
                  >
                    <div className="px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex items-start gap-3">
                        {/* Channel badge */}
                        <span className={`mt-0.5 inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wide shrink-0 ${
                          template.channel === 'email'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-purple-50 text-purple-700 border border-purple-200'
                        }`}>
                          {template.channel === 'email' ? '✉ Email' : '💬 Teams'}
                        </span>

                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-gray-900">{template.name}</h4>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${
                              template.is_enabled
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-500'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${template.is_enabled ? 'bg-green-500' : 'bg-gray-400'}`} />
                              {template.is_enabled ? 'Enabled' : 'Disabled'}
                            </span>
                          </div>
                          {template.description && (
                            <p className="text-sm text-gray-500 mt-0.5">{template.description}</p>
                          )}
                          <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-gray-400">
                            <span>
                              {FREQUENCY_LABELS[template.frequency]}
                              {template.frequency === 'weekly' && template.day_of_week !== null
                                ? ` · ${DAYS_OF_WEEK[template.day_of_week]}`
                                : ''}
                              {' · '}{template.send_time} {template.timezone}
                            </span>
                            <span>Recipients: {template.recipient_role}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleToggleTemplate(template)}
                          className={`px-3 py-1.5 rounded-md text-xs font-bold border transition-colors ${
                            template.is_enabled
                              ? 'bg-gray-50 border-gray-300 text-gray-600 hover:bg-gray-100'
                              : 'bg-green-50 border-green-300 text-green-700 hover:bg-green-100'
                          }`}
                        >
                          {template.is_enabled ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          onClick={() => handleTestSend(template)}
                          disabled={testSending === template.id}
                          className="px-3 py-1.5 rounded-md text-xs font-bold border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-50"
                        >
                          {testSending === template.id ? 'Sending…' : 'Test Send'}
                        </button>
                        <button
                          onClick={() => handleEditTemplate(template)}
                          className="px-3 py-1.5 rounded-md text-xs font-bold border border-[#001B47] bg-white text-[#001B47] hover:bg-blue-50 transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteTemplate(template)}
                          className="px-3 py-1.5 rounded-md text-xs font-bold border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Delivery Logs View */}
      {activeView === 'logs' && (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h4 className="font-bold text-gray-900">Delivery Logs</h4>
            <button
              onClick={fetchData}
              className="text-xs text-[#001B47] font-semibold hover:underline"
            >
              Refresh
            </button>
          </div>

          {logs.length === 0 ? (
            <div className="px-6 py-10 text-center text-gray-500 text-sm">
              No delivery logs yet. Logs appear here after test sends or scheduled deliveries.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-500">Date / Time</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-500">Template</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-500">Channel</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-500">Recipient</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-500">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-500">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {logs.map((log, idx) => {
                    const date = new Date(log.sent_at);
                    return (
                      <tr key={log.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          <div>{date.toLocaleDateString('en-GB')}</div>
                          <div className="text-xs text-gray-400">{date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{log.template_name || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
                            log.channel === 'email'
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-purple-50 text-purple-700'
                          }`}>
                            {CHANNEL_LABELS[log.channel] || log.channel}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">{log.recipient_name || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${
                            log.status === 'sent'
                              ? 'bg-green-100 text-green-700'
                              : log.status === 'test'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-red-100 text-red-700'
                          }`}>
                            {log.status === 'sent' ? '✓ Sent' : log.status === 'test' ? '⚡ Test' : '✗ Failed'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">{log.error_message || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Placeholder Reference View */}
      {activeView === 'placeholders' && (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="bg-[#001B47] px-6 py-3">
            <h4 className="text-white font-bold">Placeholder Reference</h4>
            <p className="text-white/70 text-xs mt-0.5">All placeholders are resolved at send time using live data from the tracker.</p>
          </div>

          <div className="divide-y divide-gray-100">
            {[
              { group: 'Context & Identity', items: PLACEHOLDERS.slice(0, 5) },
              { group: 'Time & Period', items: PLACEHOLDERS.slice(5, 9) },
              { group: 'Service Delivery Datasets', items: PLACEHOLDERS.slice(9, 11) },
              { group: 'Per-Service Fields', items: PLACEHOLDERS.slice(11, 17) },
              { group: 'Forecasting & Trends', items: PLACEHOLDERS.slice(17) },
            ].map(section => (
              <div key={section.group}>
                <div className="px-6 py-2 bg-gray-50 border-b border-gray-100">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-500">{section.group}</span>
                </div>
                {section.items.map(p => (
                  <div key={p.key} className="px-6 py-3 flex items-start gap-4">
                    <code className="shrink-0 px-2 py-0.5 bg-blue-50 border border-blue-200 text-blue-700 rounded text-xs font-mono">
                      {p.key}
                    </code>
                    <span className="text-sm text-gray-600">{p.desc}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="px-6 py-4 bg-amber-50 border-t border-amber-100">
            <p className="text-xs text-amber-800 font-medium">
              <strong>Note:</strong> Dataset placeholders like <code className="bg-amber-100 px-1 rounded">{'{{services}}'}</code> and <code className="bg-amber-100 px-1 rounded">{'{{services_this_week}}'}</code> are rendered as structured lists at send time, formatted appropriately for each channel (plain text for Teams, HTML table for Email).
            </p>
          </div>
        </div>
      )}
    </div>
  );
};