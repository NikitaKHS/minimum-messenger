export async function requestNotificationPermission(): Promise<void> {
  if ("Notification" in window && Notification.permission === "default") {
    await Notification.requestPermission();
  }
}

export function showNewMessageNotification(
  senderName: string,
  preview: string,
  chatId: string,
  onOpen: (chatId: string) => void,
): void {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (document.visibilityState === "visible") return;

  const opts: NotificationOptions & { renotify?: boolean } = {
    body: preview,
    icon: "/icon.png",
    tag: `chat-${chatId}`,
    renotify: true,
  };
  const n = new Notification(senderName, opts);

  n.onclick = () => {
    window.focus();
    onOpen(chatId);
    n.close();
  };
}
