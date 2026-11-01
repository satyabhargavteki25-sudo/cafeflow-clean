
function urlBase64ToUint8Array(
  base64String: string
): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat(
    (4 - (base64String.length % 4)) % 4
  );

  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);

  // Create a Uint8Array backed by a regular ArrayBuffer.
  // This avoids the newer TypeScript BufferSource type error.
  const bytes = new Uint8Array(
    new ArrayBuffer(rawData.length)
  );

  for (let index = 0; index < rawData.length; index++) {
    bytes[index] = rawData.charCodeAt(index);
  }

  return bytes;
}

export async function subscribeToPush(): Promise<PushSubscription> {
  if (typeof window === "undefined") {
    throw new Error(
      "Push notifications are only available in the browser."
    );
  }

  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) {
    throw new Error(
      "This browser does not support push notifications."
    );
  }

  if (!("Notification" in window)) {
    throw new Error(
      "Notifications are not supported in this browser."
    );
  }

  const publicKey =
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  if (!publicKey) {
    throw new Error(
      "The public VAPID key is missing from .env.local."
    );
  }

  const permission = await Notification.requestPermission();

  if (permission !== "granted") {
    throw new Error(
      "Notification permission was not granted."
    );
  }

  const registration =
    await navigator.serviceWorker.register("/sw.js");

  await navigator.serviceWorker.ready;

  let subscription =
    await registration.pushManager.getSubscription();

  if (!subscription) {
    const applicationServerKey =
      urlBase64ToUint8Array(publicKey);

    subscription =
      await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
  }

  return subscription;
}

export async function unsubscribeFromPush(): Promise<boolean> {
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator)
  ) {
    return false;
  }

  const registration =
    await navigator.serviceWorker.getRegistration("/sw.js");

  if (!registration) {
    return false;
  }

  const subscription =
    await registration.pushManager.getSubscription();

  if (!subscription) {
    return false;
  }

  return subscription.unsubscribe();
}
