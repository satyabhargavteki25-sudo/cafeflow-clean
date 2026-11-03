
/* CafeFlow Push Notification Service Worker */

const DEFAULT_TITLE = "CafeFlow";
const DEFAULT_BODY = "You have a new cafe offer!";
const DEFAULT_URL = "/";

const NOTIFICATION_ICON = "/logo.jpeg";
const NOTIFICATION_BADGE = "/logo.jpeg";

/**
 * Allow only URLs belonging to the current CafeFlow website.
 */
function getSafeUrl(url) {
  try {
    const targetUrl = new URL(
      typeof url === "string" && url.trim()
        ? url
        : DEFAULT_URL,
      self.location.origin
    );

    // Never allow notifications to open an external website.
    if (targetUrl.origin !== self.location.origin) {
      return new URL(DEFAULT_URL, self.location.origin).href;
    }

    return targetUrl.href;
  } catch (error) {
    console.error("CafeFlow: Invalid notification URL", error);

    return new URL(DEFAULT_URL, self.location.origin).href;
  }
}

/**
 * Activate the new service worker immediately.
 */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

/**
 * Take control of existing CafeFlow tabs.
 */
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

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
            data = {
              ...data,
              ...payload,
            };
          }
        } catch (error) {
          try {
            data.body = event.data.text() || DEFAULT_BODY;
          } catch {
            data.body = DEFAULT_BODY;
          }
        }
      }

      const title =
        typeof data.title === "string" && data.title.trim()
          ? data.title.trim()
          : DEFAULT_TITLE;

      const body =
        typeof data.body === "string" && data.body.trim()
          ? data.body.trim()
          : DEFAULT_BODY;

      // Accept both the top-level URL and nested data URL.
      const notificationUrl =
        data.url ||
        data.data?.url ||
        DEFAULT_URL;

      const targetUrl = getSafeUrl(notificationUrl);

      const notificationIcon =
        typeof data.icon === "string" && data.icon.trim()
          ? data.icon
          : NOTIFICATION_ICON;

      const notificationBadge =
        typeof data.badge === "string" && data.badge.trim()
          ? data.badge
          : NOTIFICATION_BADGE;

      const options = {
        body,
        icon: notificationIcon,
        badge: notificationBadge,

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

        console.log(
          "CafeFlow notification URL:",
          targetUrl
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
 * Open the special offer when a customer clicks a notification.
 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const notificationData = event.notification.data || {};

  const targetUrl = getSafeUrl(
    notificationData.url || DEFAULT_URL
  );

  event.waitUntil(
    (async () => {
      try {
        const windowClients = await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });

        /*
         * Reuse an existing CafeFlow tab if possible.
         *
         * If the tab is on the homepage or login page,
         * navigate it to the offer URL.
         */
        for (const client of windowClients) {
          try {
            const clientUrl = new URL(client.url);

            if (
              clientUrl.origin === self.location.origin &&
              "focus" in client
            ) {
              if (client.url !== targetUrl) {
                await client.navigate(targetUrl);
              }

              return await client.focus();
            }
          } catch (clientError) {
            console.error(
              "CafeFlow: Unable to navigate existing tab",
              clientError
            );
          }
        }

        /*
         * No existing CafeFlow tab found.
         * Open the exact notification URL.
         */
        if (self.clients.openWindow) {
          return await self.clients.openWindow(targetUrl);
        }
      } catch (error) {
        console.error(
          "CafeFlow: Error handling notification click",
          error
        );
      }
    })()
  );
});
