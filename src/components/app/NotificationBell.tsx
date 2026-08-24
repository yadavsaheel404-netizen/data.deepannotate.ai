import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/integrations/supabase/client';
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '@/services/notificationService';
import type { Notification } from '@/types/notification';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
// ScrollArea removed — using native overflow for reliable max-height behavior
import { Bell, CheckCheck, Inbox } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default function NotificationBell() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const load = useCallback(async () => {
    try {
      const data = await fetchNotifications();
      setNotifications(data);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    load();

    // Realtime subscription
    const channel = supabase
      .channel(`user-notifications-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newNotif = payload.new as unknown as Notification;
          setNotifications((prev) => [newNotif, ...prev]);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, load]);

  const handleClick = async (notif: Notification) => {
    if (!notif.read) {
      await markNotificationRead(notif.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n)),
      );
    }
    if (notif.link) {
      navigate(notif.link);
      setOpen(false);
    }
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={10}
        collisionPadding={12}
        className="w-80 max-w-[90vw] p-0 z-[1000] flex flex-col max-h-[70vh] overflow-hidden rounded-xl shadow-[0_10px_25px_rgba(0,0,0,0.15)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-2 data-[state=closed]:slide-out-to-top-2"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3 shrink-0">
          <h3 className="font-display text-sm font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground"
              onClick={handleMarkAllRead}
            >
              <CheckCheck className="h-3 w-3 mr-1" />
              Mark all read
            </Button>
          )}
        </div>

        <div
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain scroll-smooth"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <Inbox className="h-8 w-8 mb-2" />
              <p className="text-xs">No notifications yet</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map((notif) => (
                <button
                  key={notif.id}
                  onClick={() => handleClick(notif)}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 ${
                    !notif.read ? 'bg-primary/5' : ''
                  }`}
                >
                  {!notif.read && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  )}
                  <div className={`flex-1 min-w-0 ${notif.read ? 'ml-5' : ''}`}>
                    <p className="text-sm font-medium leading-tight">{notif.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {notif.message}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
