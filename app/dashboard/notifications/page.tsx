
"use client";

import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import type { User } from "firebase/auth";
import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type Voucher = {
  id: string;
  code: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  expiryDate: string;
  usageLimit: number;
  usageCount: number;
  active: boolean;
};

type CampaignTimestamp =
  | string
  | number
  | {
      seconds?: number;
      _seconds?: number;
      nanoseconds?: number;
      _nanoseconds?: number;
    }
  | null;

type Campaign = {
  id: string;
  title: string;
  message: string;
  status: string;
  voucherId?: string | null;
  voucherCode?: string | null;
  sentCount?: number;
  failedCount?: number;
  createdAt?: CampaignTimestamp;
  scheduledAt?: CampaignTimestamp;
};

type OfferTemplate = {
  name: string;
  title: string;
  message: string;
};

const offerTemplates: OfferTemplate[] = [
  {
    name: "Weekend Special",
    title: "Weekend Special 🎉",
    message:
      "Make your weekend delicious! Visit us this Saturday and Sunday for your favorite dishes. We look forward to serving you!",
  },
  {
    name: "Saturday Food Fest",
    title: "Saturday Food Fest 🍽️",
    message:
      "Your weekend starts here! Come enjoy delicious food and a wonderful dining experience at our cafe today.",
  },
  {
    name: "Sunday Special",
    title: "Sunday Special 🍛",
    message:
      "Make your Sunday delicious! Visit us today and enjoy your favorite meals with family and friends.",
  },
  {
    name: "Biryani Weekend",
    title: "Biryani Weekend 🍛",
    message:
      "Craving biryani? Treat yourself to your favorite biryani this weekend. Visit us today!",
  },
  {
    name: "Family Feast",
    title: "Family Feast Weekend 👨‍👩‍👧‍👦",
    message:
      "Good food, great family time! Bring your loved ones and enjoy a delicious meal together this weekend.",
  },
  {
    name: "Happy Hours",
    title: "Happy Hours 🎁",
    message:
      "It's time for a tasty break! Visit our cafe and enjoy your favorite food and drinks. See you soon!",
  },
  {
    name: "New Menu",
    title: "New Menu Alert ✨",
    message:
      "Something delicious is waiting for you! Explore our latest menu items and discover your new favorite dish.",
  },
];

export default function NotificationManagementPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(false);

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [voucherId, setVoucherId] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });

    return unsubscribe;
  }, []);

  const getToken = useCallback(async () => {
    if (!user) {
      throw new Error("Please sign in again.");
    }

    return user.getIdToken();
  }, [user]);

  const loadVouchers = useCallback(async () => {
    if (!user) return;

    try {
      const voucherQuery = query(
        collection(db, "vouchers"),
        where("cafeId", "==", user.uid)
      );

      const snapshot = await getDocs(voucherQuery);

      const loadedVouchers: Voucher[] = snapshot.docs.map((document) => {
        const data = document.data();

        return {
          id: document.id,
          code: String(data.code ?? ""),
          discountType:
            data.discountType === "fixed" ? "fixed" : "percentage",
          discountValue: Number(data.discountValue ?? 0),
          expiryDate: String(data.expiryDate ?? ""),
          usageLimit: Number(data.usageLimit ?? 0),
          usageCount: Number(data.usageCount ?? 0),
          active: Boolean(data.active),
        };
      });

      setVouchers(loadedVouchers);
    } catch (err) {
      console.error("Unable to load vouchers:", err);

      setError(
        "Unable to load vouchers. Please check your Firebase rules."
      );
    }
  }, [user]);

  const loadCampaigns = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    setError("");

    try {
      const token = await getToken();

      const response = await fetch(
        `/api/push/campaigns?cafeId=${encodeURIComponent(user.uid)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to load campaigns.");
      }

      setCampaigns(data.campaigns ?? []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load campaigns."
      );
    } finally {
      setLoading(false);
    }
  }, [user, getToken]);

  useEffect(() => {
    if (user) {
      void loadVouchers();
      void loadCampaigns();
    }
  }, [user, loadVouchers, loadCampaigns]);

  const selectedVoucher = vouchers.find(
    (voucher) => voucher.id === voucherId
  );

  function formatDiscount(voucher: Voucher) {
    return voucher.discountType === "percentage"
      ? `${voucher.discountValue}% OFF`
      : `₹${voucher.discountValue} OFF`;
  }

  function formatDate(timestamp?: CampaignTimestamp) {
    if (timestamp == null) {
      return "—";
    }

    let date: Date;

    if (typeof timestamp === "string") {
      date = new Date(timestamp);
    } else if (typeof timestamp === "number") {
      date = new Date(
        timestamp < 100000000000
          ? timestamp * 1000
          : timestamp
      );
    } else {
      const seconds =
        timestamp.seconds ?? timestamp._seconds;

      if (typeof seconds !== "number") {
        return "—";
      }

      const nanoseconds =
        timestamp.nanoseconds ??
        timestamp._nanoseconds ??
        0;

      date = new Date(
        seconds * 1000 + nanoseconds / 1000000
      );
    }

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    return date.toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Kolkata",
    });
  }

  function getLocalDateTimeMinimum() {
    const minimumDate = new Date(Date.now() + 60000);

    const offset = minimumDate.getTimezoneOffset();

    const localDate = new Date(
      minimumDate.getTime() - offset * 60000
    );

    return localDate.toISOString().slice(0, 16);
  }

  function toLocalDateTimeInput(date: Date) {
    const offset = date.getTimezoneOffset();

    const localDate = new Date(
      date.getTime() - offset * 60000
    );

    return localDate.toISOString().slice(0, 16);
  }

  function setNextWeekendSchedule(day: 6 | 0) {
    const now = new Date();
    const nextDate = new Date(now);

    const currentDay = now.getDay();

    let daysUntil = (day - currentDay + 7) % 7;

    nextDate.setHours(10, 0, 0, 0);

    if (
      daysUntil === 0 &&
      nextDate.getTime() <= now.getTime()
    ) {
      daysUntil = 7;
    }

    nextDate.setDate(nextDate.getDate() + daysUntil);

    setScheduledAt(toLocalDateTimeInput(nextDate));

    setError("");
    setNotice("");
  }

  function applyTemplate(templateName: string) {
    setSelectedTemplate(templateName);

    const template = offerTemplates.find(
      (item) => item.name === templateName
    );

    if (template) {
      setTitle(template.title);
      setMessage(template.message);
    }

    setError("");
    setNotice("");
  }

  async function createCampaign(
    action: "draft" | "scheduled" | "send"
  ) {
    setError("");
    setNotice("");

    if (!user) {
      setError("Please sign in again.");
      return;
    }

    if (!title.trim() || !message.trim()) {
      setError(
        "Please enter an offer title and message."
      );
      return;
    }

    let scheduledDate: Date | null = null;

    if (action === "scheduled") {
      if (!scheduledAt) {
        setError(
          "Please select a date and time for the campaign."
        );
        return;
      }

      scheduledDate = new Date(scheduledAt);

      if (Number.isNaN(scheduledDate.getTime())) {
        setError("Please select a valid schedule date and time.");
        return;
      }

      if (scheduledDate.getTime() <= Date.now()) {
        setError(
          "Please select a future date and time."
        );
        return;
      }
    }

    if (voucherId && !selectedVoucher) {
      setError(
        "The selected voucher could not be found. Please select it again."
      );
      return;
    }

    setLoading(true);

    try {
      const token = await getToken();

      const campaignStatus =
        action === "scheduled"
          ? "scheduled"
          : "draft";

      const response = await fetch(
        "/api/push/campaigns",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            cafeId: user.uid,
            title: title.trim(),
            message: message.trim(),
            status: campaignStatus,
            voucherId: voucherId || null,
            scheduledAt:
              action === "scheduled" && scheduledDate
                ? scheduledDate.toISOString()
                : null,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Unable to create campaign."
        );
      }

      if (action === "send") {
        const sendResponse = await fetch(
          "/api/push/send",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              cafeId: user.uid,
              campaignId: data.campaignId,
            }),
          }
        );

        const sendData = await sendResponse.json();

        if (!sendResponse.ok) {
          throw new Error(
            sendData.error ||
              "Campaign created, but sending failed."
          );
        }

        setNotice(
          `Campaign sent. Successful deliveries: ${
            sendData.sentCount ?? 0
          }. Failed: ${sendData.failedCount ?? 0}.`
        );
      } else if (action === "scheduled") {
        setNotice(
          "Campaign scheduled successfully. It will be processed by the scheduled notification service."
        );
      } else {
        setNotice("Campaign saved as a draft.");
      }

      setTitle("");
      setMessage("");
      setScheduledAt("");
      setVoucherId("");
      setSelectedTemplate("");

      await loadCampaigns();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }

  if (authLoading) {
    return (
      <main className="p-6">
        <p className="text-gray-500">
          Checking your login...
        </p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="p-6">
        <p className="text-gray-600">
          Please sign in to manage notifications.
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-indigo-600">
              CafeFlow
            </p>

            <h1 className="mt-1 text-2xl font-bold text-gray-900 sm:text-3xl">
              Notification Management
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              Create special offers and reach customers who
              subscribed to your cafe notifications.
            </p>
          </div>

          <button
            onClick={() => {
              void loadVouchers();
              void loadCampaigns();
            }}
            disabled={loading}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-100 disabled:opacity-50"
          >
            Refresh campaigns
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {notice && (
          <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
            {notice}
          </div>
        )}

        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5">
            <h2 className="text-lg font-bold text-gray-900">
              Create a special offer
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Choose a ready-made template or create your own
              offer. You can optionally attach a voucher.
            </p>
          </div>

          <div className="space-y-4">
            {/* Offer templates */}
            <div>
              <label
                htmlFor="offer-template"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                Offer suggestions
              </label>

              <select
                id="offer-template"
                value={selectedTemplate}
                onChange={(event) =>
                  applyTemplate(event.target.value)
                }
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              >
                <option value="">
                  Choose an offer template
                </option>

                {offerTemplates.map((template) => (
                  <option
                    key={template.name}
                    value={template.name}
                  >
                    {template.name}
                  </option>
                ))}
              </select>

              <p className="mt-1 text-xs text-gray-500">
                Selecting a template automatically fills the
                offer title and notification message. You can
                edit both fields afterward.
              </p>
            </div>

            {/* Offer title */}
            <div>
              <label
                htmlFor="campaign-title"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                Offer title
              </label>

              <input
                id="campaign-title"
                value={title}
                onChange={(event) =>
                  setTitle(event.target.value)
                }
                maxLength={100}
                placeholder="Weekend Special - 15% OFF"
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />

              <p className="mt-1 text-right text-xs text-gray-400">
                {title.length}/100
              </p>
            </div>

            {/* Notification message */}
            <div>
              <label
                htmlFor="campaign-message"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                Notification message
              </label>

              <textarea
                id="campaign-message"
                value={message}
                onChange={(event) =>
                  setMessage(event.target.value)
                }
                maxLength={500}
                rows={4}
                placeholder="Enjoy a delicious weekend at our cafe!"
                className="w-full resize-y rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />

              <p className="mt-1 text-right text-xs text-gray-400">
                {message.length}/500
              </p>
            </div>

            {/* Voucher */}
            <div>
              <label
                htmlFor="campaign-voucher"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                Attach voucher (optional)
              </label>

              <select
                id="campaign-voucher"
                value={voucherId}
                onChange={(event) =>
                  setVoucherId(event.target.value)
                }
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              >
                <option value="">
                  No voucher attached
                </option>

                {vouchers.map((voucher) => (
                  <option
                    key={voucher.id}
                    value={voucher.id}
                  >
                    {voucher.code} —{" "}
                    {formatDiscount(voucher)}
                    {voucher.active
                      ? ""
                      : " (Inactive)"}
                  </option>
                ))}
              </select>

              {vouchers.length === 0 && (
                <p className="mt-1 text-xs text-amber-600">
                  No vouchers found. Create a voucher
                  first in Voucher Management.
                </p>
              )}

              {selectedVoucher && (
                <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50 p-4">
                  <p className="font-semibold text-indigo-900">
                    {selectedVoucher.code}
                  </p>

                  <p className="mt-1 text-sm text-indigo-800">
                    Discount:{" "}
                    {formatDiscount(selectedVoucher)}
                  </p>

                  <p className="mt-1 text-sm text-indigo-800">
                    Expiry:{" "}
                    {selectedVoucher.expiryDate ||
                      "Not specified"}
                  </p>

                  <p className="mt-1 text-sm text-indigo-800">
                    Usage:{" "}
                    {selectedVoucher.usageCount} /{" "}
                    {selectedVoucher.usageLimit}
                  </p>

                  <p className="mt-2 text-xs text-indigo-700">
                    Status:{" "}
                    {selectedVoucher.active
                      ? "Active"
                      : "Inactive"}
                  </p>
                </div>
              )}
            </div>

            {/* Schedule */}
            <div>
              <label
                htmlFor="campaign-schedule"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                Schedule date and time
              </label>

              <input
                id="campaign-schedule"
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) =>
                  setScheduledAt(event.target.value)
                }
                min={getLocalDateTimeMinimum()}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setNextWeekendSchedule(6)
                  }
                  className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                >
                  Next Saturday · 10 AM
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setNextWeekendSchedule(0)
                  }
                  className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                >
                  Next Sunday · 10 AM
                </button>
              </div>

              <p className="mt-2 text-xs text-gray-500">
                The weekend buttons use your browser's local
                timezone. For India, this means 10:00 AM IST.
                Leave the date empty to save a draft or send
                immediately.
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:flex-wrap">
              <button
                onClick={() =>
                  void createCampaign("draft")
                }
                disabled={loading}
                className="rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Save draft
              </button>

              <button
                onClick={() =>
                  void createCampaign("scheduled")
                }
                disabled={loading || !scheduledAt}
                className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {loading
                  ? "Please wait..."
                  : "Schedule campaign"}
              </button>

              <button
                onClick={() => {
                  if (
                    window.confirm(
                      "Send this notification to all active subscribers of your cafe now?"
                    )
                  ) {
                    void createCampaign("send");
                  }
                }}
                disabled={
                  loading || Boolean(scheduledAt)
                }
                className="rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {loading
                  ? "Please wait..."
                  : "Send now"}
              </button>
            </div>
          </div>
        </section>

        {/* Campaign history */}
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                Campaign history
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                View your saved, scheduled, and sent
                campaigns.
              </p>
            </div>

            <span className="rounded-full bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-700">
              {campaigns.length} campaigns
            </span>
          </div>

          {loading && campaigns.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              Loading campaigns...
            </p>
          ) : campaigns.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 px-4 py-10 text-center">
              <div className="text-3xl">🔔</div>

              <p className="mt-3 font-semibold text-gray-800">
                No campaigns yet
              </p>

              <p className="mt-1 text-sm text-gray-500">
                Create your first special offer above.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {campaigns.map((campaign) => (
                <article
                  key={campaign.id}
                  className="rounded-xl border border-gray-100 p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-gray-900">
                        {campaign.title}
                      </h3>

                      <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">
                        {campaign.message}
                      </p>

                      {campaign.voucherCode && (
                        <p className="mt-2 text-sm font-semibold text-indigo-700">
                          Voucher:{" "}
                          {campaign.voucherCode}
                        </p>
                      )}

                      <p className="mt-2 text-xs text-gray-400">
                        Created:{" "}
                        {formatDate(campaign.createdAt)}
                      </p>

                      {campaign.status ===
                        "scheduled" && (
                        <p className="mt-1 text-xs text-indigo-600">
                          Scheduled:{" "}
                          {formatDate(
                            campaign.scheduledAt
                          )}
                        </p>
                      )}

                      {campaign.status === "sent" && (
                        <p className="mt-1 text-xs text-gray-500">
                          Successful deliveries:{" "}
                          {campaign.sentCount ?? 0}
                          {" · "}
                          Failed:{" "}
                          {campaign.failedCount ?? 0}
                        </p>
                      )}
                    </div>

                    <span
                      className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${
                        campaign.status === "sent"
                          ? "bg-green-50 text-green-700"
                          : campaign.status ===
                            "scheduled"
                          ? "bg-indigo-50 text-indigo-700"
                          : campaign.status ===
                            "sending"
                          ? "bg-yellow-50 text-yellow-700"
                          : campaign.status ===
                            "failed"
                          ? "bg-red-50 text-red-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {campaign.status}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
