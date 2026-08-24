export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  read: boolean;
  link: string | null;
  created_at: string;
}
