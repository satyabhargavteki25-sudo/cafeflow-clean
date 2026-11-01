/* CafeFlow Push Notification Service Worker */

const DEFAULT_TITLE = "CafeFlow";
const DEFAULT_BODY = "You have a new cafe offer!";
const DEFAULT_URL = "/";

// CafeFlow brand logo.
// This file must exist inside the Next.js public folder.
const NOTIFICATION_ICON = "/logo.jpeg";
const NOTIFICATION_BADGE = "/logo.jpeg";

/**
 * Allow only URLs belonging to the current CafeFlow website.
 */
function getSafeUrl(url) {
  try {
    const targetUrl = new URL(
      url || DEFAULT_URL,
      self.location.origin
    );

    if (targetUrl.origin !== self.location.origin) {
      return DEFAULT_URL;
    }

    return targetUrl.href;
  } catch (error) {
    console.error(
      "CafeFlow: Invalid notification URL",
      error
    );

    return DEFAULT_URL;
  }
}

/**
 * Receive push notifications.
 */
self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let data = {
        title: DEFAULT_TITLE,
        body: DEFAULT_BODY,
        url: DEFAULT_URL,
        icon: NOTIFICATION_ICON,
        badge: NOTIFICATION_BADGE,
        campaignId: null,
      };

      if (event.data) {
        try {
          const payload = event.data.json();

          if (
            payload &&
            typeof payload === "object"
          ) {
            data = {
              ...data,
              ...payload,
            };
          }
        } catch (error) {
          try {
            data.body =
              event.data.text() || DEFAULT_BODY;
          } catch {
            data.body = DEFAULT_BODY;
          }
        }
      }

      const title =
        typeof data.title === "string" &&
        data.title.trim()
          ? data.title.trim()
          : DEFAULT_TITLE;

      const body =
        typeof data.body === "string" &&
        data.body.trim()
          ? data.body.trim()
          : DEFAULT_BODY;

      const targetUrl = getSafeUrl(data.url);

      // Use the CafeFlow logo unless a valid custom icon
      // is provided by the notification payload.
      const notificationIcon =
        typeof data.icon === "string" &&
        data.icon.trim()
          ? data.icon
          : NOTIFICATION_ICON;

      const notificationBadge =
        typeof data.badge === "string" &&
        data.badge.trim()
          ? data.badge
          : NOTIFICATION_BADGE;

      const options = {
        body,

        // CafeFlow logo shown in Chrome notifications.
        icon: notificationIcon,

        // Small notification badge.
        badge: notificationBadge,

        // Optional large image.
        image:
          typeof data.image === "string"
            ? data.image
            : undefined,

        data: {
          url: targetUrl,
          campaignId: data.campaignId || null,
        },

        tag: data.campaignId
          ? `cafeflow-campaign-${data.campaignId}`
          : `cafeflow-notification-${Date.now()}`,

        renotify: false,
      };

      try {
        await self.registration.showNotification(
          title,
          options
        );
      } catch (error) {
        console.error(
          "CafeFlow: Unable to display push notification",
          error
        );
      }
    })()
  );
});

/**
 * Open the special offer when the customer clicks
 * a notification.
 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = getSafeUrl(
    event.notification.data?.url || DEFAULT_URL
  );

  event.waitUntil(
    (async () => {
      try {
        const windowClients = await clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });

        // Reuse an existing CafeFlow tab if possible.
        for (const client of windowClients) {
          if (
            client.url.startsWith(self.location.origin)
          ) {
            const focusedClient = await client.focus();

            if (
              focusedClient &&
              focusedClient.navigate
            ) {
              await focusedClient.navigate(targetUrl);
            }

            return;
          }
        }

        // Open a new tab if CafeFlow is not already open.
        await clients.openWindow(targetUrl);
      } catch (error) {
        console.error(
          "CafeFlow: Unable to open notification destination",
          error
        );
      }
    })()
  );
});

/**
 * Install and activate the service worker.
 */
self.addEventListener("install", (event) => {
  console.log("CafeFlow service worker installed.");

  // Activate the updated service worker immediately.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});