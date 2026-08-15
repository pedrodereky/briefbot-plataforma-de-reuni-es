export interface Meeting {
  id: string;
  user_id: string;
  calendar_event_id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  attendees: unknown;
  organizer: string | null;
  briefing_sent: boolean | null;
  summary_sent: boolean | null;
  created_at: string | null;
}

export interface Briefing {
  id: string;
  meeting_id: string;
  type: 'pre' | 'post';
  content_md: string;
  sent_at: string | null;
  channels: string[] | null;
  created_at: string | null;
}

export interface ActionItem {
  id: string;
  meeting_id: string;
  owner: string;
  task: string;
  due_date: string | null;
  done: boolean | null;
  created_at: string | null;
}

export interface UserSettings {
  id: string;
  user_id: string;
  slack_webhook_url: string | null;
  slack_enabled: boolean | null;
  custom_pre_prompt: string | null;
  custom_post_prompt: string | null;
  created_at: string | null;
}
