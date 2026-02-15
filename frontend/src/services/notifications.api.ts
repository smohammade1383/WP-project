import { api } from './api.client';

export interface UserNotification {
  id: number;
  message: string;
  is_read: boolean;
  created_at: string;
  case_id: number | null;
  case_title: string | null;
  evidence_id: number | null;
}

export const notificationsApi = {
  list: async (): Promise<UserNotification[]> => {
    return api.get<UserNotification[]>('/cases/notifications/');
  },
  markRead: async (notificationId: number): Promise<UserNotification> => {
    return api.post<UserNotification>(`/cases/notifications/${notificationId}/read/`);
  },
  markAllRead: async (): Promise<{ updated: number }> => {
    return api.post<{ updated: number }>('/cases/notifications/read-all/');
  },
};
