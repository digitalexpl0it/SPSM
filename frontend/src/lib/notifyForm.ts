import type { TestNotifyPayload } from "./api";

export type NotifyFormSlice = {
  notify_enabled: boolean;
  notify_webhook_enabled: boolean;
  notify_ntfy_enabled: boolean;
  notify_smtp_enabled: boolean;
  notify_webhook_url: string;
  notify_ntfy_topic: string;
  notify_min_severity: "warning" | "critical";
  notify_smtp_host: string;
  notify_smtp_port: number;
  notify_smtp_use_tls: boolean;
  notify_smtp_username: string;
  notify_smtp_password: string;
  notify_smtp_from: string;
  notify_smtp_to: string;
};

export function notifyTestPayload(form: NotifyFormSlice): TestNotifyPayload {
  return {
    notify_enabled: form.notify_enabled,
    notify_webhook_enabled: form.notify_webhook_enabled,
    notify_ntfy_enabled: form.notify_ntfy_enabled,
    notify_smtp_enabled: form.notify_smtp_enabled,
    notify_webhook_url: form.notify_webhook_url,
    notify_ntfy_topic: form.notify_ntfy_topic,
    notify_min_severity: form.notify_min_severity,
    notify_smtp_host: form.notify_smtp_host,
    notify_smtp_port: form.notify_smtp_port,
    notify_smtp_use_tls: form.notify_smtp_use_tls,
    notify_smtp_username: form.notify_smtp_username,
    notify_smtp_password: form.notify_smtp_password,
    notify_smtp_from: form.notify_smtp_from,
    notify_smtp_to: form.notify_smtp_to,
  };
}
