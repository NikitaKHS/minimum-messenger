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

  const n = new Notification(senderName, {
    body: preview,
    icon: "/icon.png",
    tag: `chat-${chatId}`,
    renotify: true,
  });

  n.onclick = () => {
    window.focus();
    onOpen(chatId);
    n.close();
  };
}
