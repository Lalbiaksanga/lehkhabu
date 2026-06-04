import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  subscribeToNotifications,
  subscribeToUserRole,
  subscribeToApplicationStatus,
  type Notification,
} from '../services/author.service';

interface UseNotificationsReturn {
  notifications: Notification[];
  unreadCount: number;
  approvalPopup: Notification | null;
  dismissPopup: () => void;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

export function useNotifications(): UseNotificationsReturn {
  const { profile, user, loadProfile } = useAuthStore();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [approvalPopup, setApprovalPopup] = useState<Notification | null>(null);

  const userId = profile?.id;

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await fetchNotifications(userId);
      setNotifications(data);
      // Show popup for any unread AUTHOR_APPROVED notification
      const popup = data.find((n) => n.type === 'AUTHOR_APPROVED' && !n.is_read);
      if (popup) setApprovalPopup(popup);
    } catch {
      // Silent fail
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  // Real-time: new notifications
  useEffect(() => {
    if (!userId) return;
    const channel = subscribeToNotifications(userId, (newNotif) => {
      setNotifications((prev) => [newNotif, ...prev]);
      // Show popup for approval/rejection
      if (newNotif.type === 'AUTHOR_APPROVED' || newNotif.type === 'AUTHOR_REJECTED') {
        setApprovalPopup(newNotif);
      }
    });
    return () => { channel.unsubscribe(); };
  }, [userId]);

  // Real-time: role changes → refresh profile
  useEffect(() => {
    if (!userId || !user) return;
    const channel = subscribeToUserRole(userId, () => {
      loadProfile(user.id);
    });
    return () => { channel.unsubscribe(); };
  }, [userId, user, loadProfile]);

  // Real-time: application status changes
  useEffect(() => {
    if (!userId) return;
    const channel = subscribeToApplicationStatus(userId, () => {
      // Re-fetch notifications to pick up any new ones
      load();
    });
    return () => { channel.unsubscribe(); };
  }, [userId, load]);

  const markRead = useCallback(async (id: string) => {
    await markNotificationRead(id);
    setNotifications((prev) =>
      prev.map((n) => n.id === id ? { ...n, is_read: true } : n)
    );
    if (approvalPopup?.id === id) setApprovalPopup(null);
  }, [approvalPopup]);

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    await markAllNotificationsRead(userId);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setApprovalPopup(null);
  }, [userId]);

  const dismissPopup = useCallback(() => {
    if (approvalPopup) {
      markNotificationRead(approvalPopup.id).catch(() => {});
      setNotifications((prev) =>
        prev.map((n) => n.id === approvalPopup.id ? { ...n, is_read: true } : n)
      );
      setApprovalPopup(null);
    }
  }, [approvalPopup]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return { notifications, unreadCount, approvalPopup, dismissPopup, markRead, markAllRead };
}
