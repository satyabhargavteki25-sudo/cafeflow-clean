/* CafeFlow Push Notification Service Worker */

const DEFAULT_TITLE = "CafeFlow";
const DEFAULT_BODY = "You have a new cafe offer!";
const DEFAULT_URL = "/";

// Standard fallback icon path. Make sure this file exists in your public folder!
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
    console.error("CafeFlow: Invalid notification URL", error);
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
          if (payload && typeof payload === "object") {
            data = { ...data, ...payload };
          }
        } catch (error) {
          try {
            data.body = event.data.text() || DEFAULT_BODY;
          } catch {
            data.body = DEFAULT_BODY;
          }
        }
      }

      const title = typeof data.title === "string" && data.title.trim() ? data.title.trim() : DEFAULT_TITLE;
      const body = typeof data.body === "string" && data.body.trim() ? data.body.trim() : DEFAULT_BODY;
      const targetUrl = getSafeUrl(data.url || data.data?.url);

      // Check if a payload-specific icon path was sent, otherwise use base branding asset
      const notificationIcon = typeof data.icon === "string" && data.icon.trim() ? data.icon : NOTIFICATION_ICON;
      const notificationBadge = typeof data.badge === "string" && data.badge.trim() ? data.badge : NOTIFICATION_BADGE;

      const options = {
        body,
        icon: notificationIcon,
        badge: notificationBadge,
        image: typeof data.image === "string" ? data.image : undefined,
        data: {
          url: targetUrl,
          campaignId: data.campaignId || null,
        },
        tag: data.campaignId ? `cafeflow-campaign-${data.campaignId}` : `cafeflow-notification-${Date.now()}`,
        renotify: false,
      };

      try {
        await self.registration.showNotification(title, options);
      } catch (error) {
        console.error("CafeFlow: Unable to display push notification", error);
      }
    })()
  );
});

/**
 * Open the special offer when the customer clicks a notification.
 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = getSafeUrl(event.notification.data?.url || DEFAULT_URL);

  event.waitUntil(
    (async () => {
      try {
        const windowClients = await clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });

        // Reuse an existing open CafeFlow tab if possible
        for (const client of windowClients) {
          if (client.url === targetUrl && "focus" in client) {
            return client.focus();
          }
        }

        // If no matching tab is open, open a new window path
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      } catch (error) {
        console.error("CafeFlow: Error handling notification click", error);
      }
    })()
  );
});