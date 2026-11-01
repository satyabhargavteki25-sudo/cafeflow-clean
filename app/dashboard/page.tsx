
"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  onAuthStateChanged,
  signOut,
  type User,
} from "firebase/auth";

import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Timestamp,
} from "firebase/firestore";

import { auth, db } from "../../lib/firebase";

type ComplaintStatus = "pending" | "in_progress" | "resolved";

type Feedback = {
  id: string;
  cafeId: string;
  rating: number;
  status?: string;
  categories?: string[];
  message?: string;
  tableId?: string;
  createdAt?: Timestamp;
};

type EngagementLog = {
  id: string;
  cafeId: string;
  action: string;
  createdAt?: Timestamp;
};

type Voucher = {
  id: string;
  cafeId: string;
  code?: string;
  active?: boolean;
  usageCount?: number;
  usageLimit?: number;
};

type PushSubscriptionRecord = {
  id: string;
  cafeId: string;
  active?: boolean;
  subscription?: {
    endpoint?: string;
    keys?: {
      p256dh?: string;
      auth?: string;
    };
  };
  updatedAt?: Timestamp;
};

type DateFilter = "today" | "7days" | "30days" | "all";

const complaintStatuses: {
  value: ComplaintStatus;
  label: string;
}[] = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
];

const dateFilterOptions: {
  value: DateFilter;
  label: string;
}[] = [
  { value: "today", label: "Today" },
  { value: "7days", label: "Last 7 days" },
  { value: "30days", label: "Last 30 days" },
  { value: "all", label: "All time" },
];

function getStatusLabel(status?: string) {
  switch (status) {
    case "pending":
      return "Pending";
    case "in_progress":
      return "In Progress";
    case "resolved":
      return "Resolved";
    case "completed":
      return "Completed";
    default:
      return status || "No status";
  }
}

function getStatusStyle(status?: string) {
  switch (status) {
    case "completed":
    case "resolved":
      return "bg-green-50 text-green-700";
    case "in_progress":
      return "bg-blue-50 text-blue-700";
    case "pending":
      return "bg-orange-50 text-orange-700";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

function formatFeedbackDate(createdAt?: Timestamp) {
  if (!createdAt) {
    return "Date unavailable";
  }

  try {
    const date = createdAt.toDate();

    if (Number.isNaN(date.getTime())) {
      return "Date unavailable";
    }

    return date.toLocaleString();
  } catch {
    return "Date unavailable";
  }
}

function getValidComplaintStatus(
  status?: string
): ComplaintStatus {
  if (
    status === "pending" ||
    status === "in_progress" ||
    status === "resolved"
  ) {
    return status;
  }

  return "pending";
}

function getDateFilterStart(filter: DateFilter) {
  const now = new Date();

  if (filter === "today") {
    return new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );
  }

  if (filter === "7days") {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return start;
  }

  if (filter === "30days") {
    const start = new Date(now);
    start.setDate(start.getDate() - 29);
    start.setHours(0, 0, 0, 0);
    return start;
  }

  return null;
}

function isWithinDateFilter(
  createdAt: Timestamp | undefined,
  filter: DateFilter
) {
  if (filter === "all") {
    return true;
  }

  if (!createdAt) {
    return false;
  }

  try {
    const date = createdAt.toDate();
    const start = getDateFilterStart(filter);

    return !!start && date >= start;
  } catch {
    return false;
  }
}

function StatCard({
  title,
  value,
  icon,
  description,
}: {
  title: string;
  value: string;
  icon: string;
  description: string;
}) {
  return (
    <article className="rounded-2xl border border-orange-100 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-500">
          {title}
        </p>

        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-xl">
          {icon}
        </span>
      </div>

      <p className="mt-4 text-3xl font-extrabold text-slate-900">
        {value}
      </p>

      <p className="mt-2 text-sm text-slate-500">
        {description}
      </p>
    </article>
  );
}

function ActionCard({
  href,
  icon,
  title,
  description,
  action,
}: {
  href: string;
  icon: string;
  title: string;
  description: string;
  action: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-orange-100 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-orange-300 hover:shadow-md"
    >
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-2xl">
        {icon}
      </div>

      <h3 className="text-lg font-extrabold text-slate-900">
        {title}
      </h3>

      <p className="mt-2 text-sm leading-6 text-slate-500">
        {description}
      </p>

      <div className="mt-5 font-bold text-orange-600">
        {action}
      </div>
    </Link>
  );
}

function ProgressBar({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const percentage =
    total > 0 ? Math.min(100, (count / total) * 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-slate-600">
          {label}
        </span>

        <span className="font-bold text-slate-800">
          {count}
        </span>
      </div>

      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [feedbackLoading, setFeedbackLoading] = useState(true);
  const [engagementLoading, setEngagementLoading] = useState(true);
  const [voucherLoading, setVoucherLoading] = useState(true);
  const [pushSubscriptionLoading, setPushSubscriptionLoading] =
    useState(true);

  const [logoutLoading, setLogoutLoading] = useState(false);

  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [engagementLogs, setEngagementLogs] = useState<EngagementLog[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [pushSubscriptions, setPushSubscriptions] =
    useState<PushSubscriptionRecord[]>([]);

  const [feedbackError, setFeedbackError] = useState("");
  const [engagementError, setEngagementError] = useState("");
  const [voucherError, setVoucherError] = useState("");
  const [pushSubscriptionError, setPushSubscriptionError] =
    useState("");

  const [updatingFeedbackId, setUpdatingFeedbackId] = useState<
    string | null
  >(null);

  const [dateFilter, setDateFilter] = useState<DateFilter>("7days");
  const [ratingFilter, setRatingFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Authenticate cafe owner.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        setUser(null);
        setAuthLoading(false);
        router.replace("/");
        return;
      }

      setUser(currentUser);
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, [router]);

  // Listen to feedback.
  useEffect(() => {
    if (!user) {
      setFeedback([]);
      setFeedbackLoading(false);
      return;
    }

    setFeedbackLoading(true);
    setFeedbackError("");

    const feedbackQuery = query(
      collection(db, "feedback"),
      where("cafeId", "==", user.uid)
    );

    const unsubscribe = onSnapshot(
      feedbackQuery,
      (snapshot) => {
        const items: Feedback[] = snapshot.docs.map((document) => ({
          id: document.id,
          ...(document.data() as Omit<Feedback, "id">),
        }));

        items.sort((a, b) => {
          const aTime = a.createdAt?.toMillis() ?? 0;
          const bTime = b.createdAt?.toMillis() ?? 0;

          return bTime - aTime;
        });

        setFeedback(items);
        setFeedbackLoading(false);
        setFeedbackError("");
      },
      (error) => {
        console.error("Feedback loading failed:", error);

        setFeedbackError(
          "Could not load feedback. Check your Firestore security rules."
        );

        setFeedbackLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Listen to engagement logs.
  useEffect(() => {
    if (!user) {
      setEngagementLogs([]);
      setEngagementLoading(false);
      return;
    }

    setEngagementLoading(true);
    setEngagementError("");

    const engagementQuery = query(
      collection(db, "engagement_logs"),
      where("cafeId", "==", user.uid)
    );

    const unsubscribe = onSnapshot(
      engagementQuery,
      (snapshot) => {
        const items: EngagementLog[] = snapshot.docs.map((document) => ({
          id: document.id,
          ...(document.data() as Omit<EngagementLog, "id">),
        }));

        setEngagementLogs(items);
        setEngagementLoading(false);
        setEngagementError("");
      },
      (error) => {
        console.error("Engagement loading failed:", error);

        setEngagementError(
          "Could not load engagement metrics. Check your Firestore security rules."
        );

        setEngagementLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Listen to actual voucher usage counts.
  useEffect(() => {
    if (!user) {
      setVouchers([]);
      setVoucherLoading(false);
      return;
    }

    setVoucherLoading(true);
    setVoucherError("");

    const voucherQuery = query(
      collection(db, "vouchers"),
      where("cafeId", "==", user.uid)
    );

    const unsubscribe = onSnapshot(
      voucherQuery,
      (snapshot) => {
        const items: Voucher[] = snapshot.docs.map((document) => ({
          id: document.id,
          ...(document.data() as Omit<Voucher, "id">),
        }));

        setVouchers(items);
        setVoucherLoading(false);
        setVoucherError("");
      },
      (error) => {
        console.error("Voucher loading failed:", error);

        setVoucherError(
          "Could not load voucher metrics. Check your Firestore security rules."
        );

        setVoucherLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Listen to push notification subscriptions.
  useEffect(() => {
    if (!user) {
      setPushSubscriptions([]);
      setPushSubscriptionLoading(false);
      return;
    }

    setPushSubscriptionLoading(true);
    setPushSubscriptionError("");

    const subscriptionsQuery = query(
      collection(db, "push_subscriptions"),
      where("cafeId", "==", user.uid)
    );

    const unsubscribe = onSnapshot(
      subscriptionsQuery,
      (snapshot) => {
        const items: PushSubscriptionRecord[] =
          snapshot.docs.map((document) => ({
            id: document.id,
            ...(document.data() as Omit<
              PushSubscriptionRecord,
              "id"
            >),
          }));

        setPushSubscriptions(items);
        setPushSubscriptionLoading(false);
        setPushSubscriptionError("");
      },
      (error) => {
        console.error(
          "Push subscription loading failed:",
          error
        );

        setPushSubscriptionError(
          "Could not load notification subscribers. Check your Firestore security rules."
        );

        setPushSubscriptionLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  async function handleLogout() {
    try {
      setLogoutLoading(true);
      await signOut(auth);
      router.replace("/");
    } catch (error) {
      console.error("Logout failed:", error);
      setLogoutLoading(false);
    }
  }

  async function handleComplaintStatusUpdate(
    feedbackId: string,
    newStatus: ComplaintStatus
  ) {
    if (!user || updatingFeedbackId) {
      return;
    }

    const selectedFeedback = feedback.find(
      (item) => item.id === feedbackId
    );

    if (!selectedFeedback || selectedFeedback.cafeId !== user.uid) {
      setFeedbackError(
        "You cannot update a complaint that does not belong to your cafe."
      );
      return;
    }

    try {
      setUpdatingFeedbackId(feedbackId);
      setFeedbackError("");

      await updateDoc(doc(db, "feedback", feedbackId), {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Complaint status update failed:", error);

      setFeedbackError(
        "Could not update complaint status. Check your Firestore security rules."
      );
    } finally {
      setUpdatingFeedbackId(null);
    }
  }

  async function copyFeedbackLink() {
    if (!user) {
      return;
    }

    const feedbackUrl = `${window.location.origin}/c/${user.uid}`;

    try {
      await navigator.clipboard.writeText(feedbackUrl);
      alert("Customer feedback link copied!");
    } catch (error) {
      console.error("Could not copy feedback link:", error);

      try {
        const textArea = document.createElement("textarea");

        textArea.value = feedbackUrl;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";

        document.body.appendChild(textArea);
        textArea.select();

        const copied = document.execCommand("copy");
        document.body.removeChild(textArea);

        if (copied) {
          alert("Customer feedback link copied!");
        } else {
          alert(`Copy this feedback link manually:\n${feedbackUrl}`);
        }
      } catch (fallbackError) {
        console.error("Copy fallback failed:", fallbackError);

        alert(`Copy this feedback link manually:\n${feedbackUrl}`);
      }
    }
  }

  // Filter feedback based on selected date.
  const dateFilteredFeedback = useMemo(() => {
    return feedback.filter((item) =>
      isWithinDateFilter(item.createdAt, dateFilter)
    );
  }, [feedback, dateFilter]);

  // Filter engagement logs based on selected date.
  const dateFilteredLogs = useMemo(() => {
    return engagementLogs.filter((item) =>
      isWithinDateFilter(item.createdAt, dateFilter)
    );
  }, [engagementLogs, dateFilter]);

  // Apply rating and status filters to feedback.
  const filteredFeedback = useMemo(() => {
    return dateFilteredFeedback.filter((item) => {
      const matchesRating =
        ratingFilter === "all" ||
        item.rating === Number(ratingFilter);

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "complaints" && item.rating <= 3) ||
        item.status === statusFilter;

      return matchesRating && matchesStatus;
    });
  }, [dateFilteredFeedback, ratingFilter, statusFilter]);

  if (authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-orange-50">
        <p className="font-semibold text-slate-600">
          Loading CafeFlow...
        </p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-orange-50">
        <p className="text-slate-600">Redirecting to login...</p>
      </main>
    );
  }

  const cafeId = user.uid;

  const totalFeedback = dateFilteredFeedback.length;

  const averageRating =
    totalFeedback > 0
      ? dateFilteredFeedback.reduce(
          (total, item) => total + item.rating,
          0
        ) / totalFeedback
      : 0;

  const ratingCounts = [5, 4, 3, 2, 1].map((rating) => ({
    rating,
    count: dateFilteredFeedback.filter(
      (item) => item.rating === rating
    ).length,
  }));

  const pendingComplaints = dateFilteredFeedback.filter(
    (item) => item.rating <= 3 && item.status === "pending"
  ).length;

  const inProgressComplaints = dateFilteredFeedback.filter(
    (item) => item.rating <= 3 && item.status === "in_progress"
  ).length;

  const resolvedComplaints = dateFilteredFeedback.filter(
    (item) =>
      item.rating <= 3 &&
      (item.status === "resolved" || item.status === "completed")
  ).length;

  const complaintCount = dateFilteredFeedback.filter(
    (item) => item.rating <= 3
  ).length;

  const activeInterceptions =
    pendingComplaints + inProgressComplaints;

  const tablePageVisits = dateFilteredLogs.filter(
    (item) => item.action === "page_view"
  ).length;

  const googleReviewTraffic = dateFilteredLogs.filter(
    (item) => item.action === "google_click"
  ).length;

  const googleConversion =
    tablePageVisits > 0
      ? (googleReviewTraffic / tablePageVisits) * 100
      : 0;

  // Actual claims are based on voucher usageCount.
  const couponClaims = vouchers.reduce(
    (total, voucher) =>
      total + Math.max(0, voucher.usageCount ?? 0),
    0
  );

  const activeVouchers = vouchers.filter(
    (voucher) => voucher.active
  );

  // Count subscriptions for this cafe.
  // These are browser/device subscriptions, not unique people.
  const activePushSubscriptions = pushSubscriptions.filter(
    (item) =>
      item.active === true &&
      Boolean(item.subscription?.endpoint)
  );

  const inactivePushSubscriptions = pushSubscriptions.filter(
    (item) => item.active !== true
  );

  const activeSubscriberCount =
    activePushSubscriptions.length;

  const notificationAllowedCount =
    activePushSubscriptions.length;

  const inactiveSubscriberCount =
    inactivePushSubscriptions.length;

  return (
    <main className="min-h-screen bg-[#FFF7ED] text-slate-800">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-orange-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200 sm:h-16 sm:w-16">
              <Image
                src="/logo.jpeg"
                alt="CafeFlow logo"
                width={256}
                height={256}
                priority
                unoptimized
                className="h-full w-full object-contain p-1.5"
              />
            </div>

            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-slate-900">
                CafeFlow
              </h1>

              <p className="text-xs font-medium text-slate-500">
                Restaurant Growth Platform
              </p>
            </div>
          </Link>

          <button
            onClick={handleLogout}
            disabled={logoutLoading}
            className="rounded-xl border border-orange-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-orange-50 disabled:opacity-50"
          >
            {logoutLoading ? "Logging out..." : "Logout"}
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Welcome banner */}
        <section className="relative mb-8 overflow-hidden rounded-3xl bg-gradient-to-br from-orange-500 to-orange-600 p-6 text-white shadow-lg shadow-orange-200 sm:p-9">
          <div className="pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute -bottom-20 right-32 h-48 w-48 rounded-full bg-amber-300/20" />

          <div className="relative">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-orange-100">
              Restaurant Management
            </p>

            <h2 className="text-3xl font-extrabold sm:text-4xl">
              Welcome to CafeFlow 👋
            </h2>

            <p className="mt-3 max-w-2xl text-sm leading-6 text-orange-50 sm:text-base">
              Understand your customers, track their feedback, and grow
              your restaurant with confidence.
            </p>

            <div className="mt-5 inline-flex max-w-full items-center gap-2 rounded-full border border-white/20 bg-white/15 px-4 py-2 text-sm">
              <span className="h-2 w-2 rounded-full bg-green-300" />

              <span className="truncate">
                Signed in as {user.email}
              </span>
            </div>
          </div>
        </section>

        {/* Date filter */}
        <section className="mb-6 flex flex-col gap-3 rounded-2xl border border-orange-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-extrabold text-slate-900">
              Dashboard Overview
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Choose a period to update feedback and engagement metrics.
            </p>
          </div>

          <select
            value={dateFilter}
            onChange={(event) =>
              setDateFilter(event.target.value as DateFilter)
            }
            className="w-full rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 sm:w-48"
          >
            {dateFilterOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </section>

        {/* KPI cards */}
        <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard
            title="Table Page Visits"
            value={
              engagementLoading ? "..." : tablePageVisits.toString()
            }
            icon="📱"
            description="Feedback page visits in selected period"
          />

          <StatCard
            title="Google Review Traffic"
            value={
              engagementLoading
                ? "..."
                : googleReviewTraffic.toString()
            }
            icon="⭐"
            description={`${googleConversion.toFixed(
              1
            )}% of page visits clicked Google Review`}
          />

          <StatCard
            title="Active Interceptions"
            value={
              feedbackLoading
                ? "..."
                : activeInterceptions.toString()
            }
            icon="🚨"
            description="Pending or in-progress complaints"
          />

          <StatCard
            title="Total Feedback"
            value={feedbackLoading ? "..." : totalFeedback.toString()}
            icon="💬"
            description="Responses in selected period"
          />

          <StatCard
            title="Average Rating"
            value={
              feedbackLoading
                ? "..."
                : `${averageRating.toFixed(1)} / 5`
            }
            icon="🌟"
            description="Average customer rating"
          />

          <StatCard
            title="Loyalty Voucher Claims"
            value={voucherLoading ? "..." : couponClaims.toString()}
            icon="🎁"
            description="All-time claims from voucher usage"
          />

          <StatCard
            title="Active Subscribers"
            value={
              pushSubscriptionLoading
                ? "..."
                : activeSubscriberCount.toString()
            }
            icon="🔔"
            description="Active browser/device subscriptions"
          />

          <StatCard
            title="Notifications Allowed"
            value={
              pushSubscriptionLoading
                ? "..."
                : notificationAllowedCount.toString()
            }
            icon="📢"
            description="Active subscriptions eligible for push"
          />

          <StatCard
            title="Inactive Subscriptions"
            value={
              pushSubscriptionLoading
                ? "..."
                : inactiveSubscriberCount.toString()
            }
            icon="🔕"
            description="Subscriptions marked inactive"
          />
        </section>

        {/* Errors */}
        {feedbackError && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {feedbackError}
          </div>
        )}

        {engagementError && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {engagementError}
          </div>
        )}

        {voucherError && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {voucherError}
          </div>
        )}

        {pushSubscriptionError && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {pushSubscriptionError}
          </div>
        )}

        {/* Complaint overview */}
        <section className="mb-8 rounded-3xl border border-orange-100 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-6">
            <p className="text-xs font-bold uppercase tracking-widest text-orange-500">
              Complaint management
            </p>

            <h2 className="mt-1 text-xl font-extrabold text-slate-900">
              Complaint Overview
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Low-rated feedback with a rating of 3 or below.
            </p>
          </div>

          {feedbackLoading ? (
            <p className="text-sm text-slate-500">
              Loading complaints...
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-orange-100 bg-orange-50/70 p-5">
                <p className="text-sm font-semibold text-orange-700">
                  Pending
                </p>

                <p className="mt-2 text-3xl font-extrabold text-slate-900">
                  {pendingComplaints}
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  Waiting for a response
                </p>
              </div>

              <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-5">
                <p className="text-sm font-semibold text-blue-700">
                  In Progress
                </p>

                <p className="mt-2 text-3xl font-extrabold text-slate-900">
                  {inProgressComplaints}
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  Currently being handled
                </p>
              </div>

              <div className="rounded-2xl border border-green-100 bg-green-50/70 p-5">
                <p className="text-sm font-semibold text-green-700">
                  Resolved
                </p>

                <p className="mt-2 text-3xl font-extrabold text-slate-900">
                  {resolvedComplaints}
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  Completed complaint responses
                </p>
              </div>
            </div>
          )}
        </section>

        {/* Rating breakdown */}
        <section className="mb-8 rounded-3xl border border-orange-100 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-6">
            <p className="text-xs font-bold uppercase tracking-widest text-orange-500">
              Customer insights
            </p>

            <h2 className="mt-1 text-xl font-extrabold text-slate-900">
              Rating Breakdown
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              See how customers rate their experience.
            </p>
          </div>

          {feedbackLoading ? (
            <p className="text-sm text-slate-500">
              Loading ratings...
            </p>
          ) : (
            <div className="space-y-4">
              {ratingCounts.map(({ rating, count }) => (
                <ProgressBar
                  key={rating}
                  label={`${rating} ★`}
                  count={count}
                  total={totalFeedback}
                  color="bg-orange-500"
                />
              ))}
            </div>
          )}
        </section>

        {/* Feedback list */}
        <section className="mb-8 rounded-3xl border border-orange-100 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-orange-500">
                Customer experience
              </p>

              <h2 className="mt-1 text-xl font-extrabold text-slate-900">
                Customer Feedback
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                {complaintCount} low-rated response
                {complaintCount === 1 ? "" : "s"} in the selected period.
              </p>
            </div>

            <Link
              href={`/c/${cafeId}`}
              className="inline-flex w-fit items-center rounded-xl bg-orange-50 px-4 py-2.5 text-sm font-bold text-orange-600 transition hover:bg-orange-100"
            >
              Open feedback page →
            </Link>
          </div>

          {/* Feedback filters */}
          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="rating-filter"
                className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500"
              >
                Filter by rating
              </label>

              <select
                id="rating-filter"
                value={ratingFilter}
                onChange={(event) =>
                  setRatingFilter(event.target.value)
                }
                className="w-full rounded-xl border border-orange-200 bg-white px-3 py-3 text-sm font-medium text-slate-700 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
              >
                <option value="all">All ratings</option>
                <option value="5">5 stars</option>
                <option value="4">4 stars</option>
                <option value="3">3 stars</option>
                <option value="2">2 stars</option>
                <option value="1">1 star</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="status-filter"
                className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500"
              >
                Filter by status
              </label>

              <select
                id="status-filter"
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value)
                }
                className="w-full rounded-xl border border-orange-200 bg-white px-3 py-3 text-sm font-medium text-slate-700 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
              >
                <option value="all">All feedback</option>
                <option value="complaints">Low-rated complaints</option>
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-600">
              Showing {filteredFeedback.length} of{" "}
              {dateFilteredFeedback.length} responses
            </p>

            <button
              onClick={() => {
                setRatingFilter("all");
                setStatusFilter("all");
              }}
              className="rounded-lg px-3 py-2 text-xs font-bold text-orange-600 transition hover:bg-orange-50"
            >
              Clear filters
            </button>
          </div>

          {feedbackLoading ? (
            <p className="py-8 text-center text-slate-500">
              Loading customer feedback...
            </p>
          ) : filteredFeedback.length === 0 ? (
            <div className="rounded-2xl bg-orange-50/70 p-8 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm">
                💬
              </div>

              <p className="mt-4 text-lg font-bold text-slate-800">
                No feedback found
              </p>

              <p className="mt-2 text-sm text-slate-500">
                Try changing the date, rating, or status filters.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredFeedback.map((item) => {
                const isComplaint = item.rating <= 3;
                const isUpdating = updatingFeedbackId === item.id;

                return (
                  <article
                    key={item.id}
                    className="rounded-2xl border border-orange-100 p-4 transition hover:border-orange-200 hover:bg-orange-50/30 sm:p-5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-lg font-extrabold text-orange-500">
                          {"★".repeat(
                            Math.max(0, Math.min(5, item.rating))
                          )}

                          <span className="ml-2 text-sm font-semibold text-slate-700">
                            {item.rating} / 5
                          </span>
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          Table: {item.tableId || "General"}
                        </p>
                      </div>

                      {!isComplaint ? (
                        <span
                          className={`rounded-full px-3 py-1.5 text-xs font-bold ${getStatusStyle(
                            item.status
                          )}`}
                        >
                          {getStatusLabel(item.status)}
                        </span>
                      ) : (
                        <div className="flex flex-col items-end gap-1.5">
                          <label
                            htmlFor={`complaint-status-${item.id}`}
                            className="text-xs font-semibold text-slate-500"
                          >
                            Complaint status
                          </label>

                          <select
                            id={`complaint-status-${item.id}`}
                            value={getValidComplaintStatus(item.status)}
                            disabled={
                              isUpdating ||
                              updatingFeedbackId !== null
                            }
                            onChange={(event) =>
                              handleComplaintStatusUpdate(
                                item.id,
                                event.target.value as ComplaintStatus
                              )
                            }
                            className="min-w-36 rounded-xl border border-orange-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {complaintStatuses.map((status) => (
                              <option
                                key={status.value}
                                value={status.value}
                              >
                                {status.label}
                              </option>
                            ))}
                          </select>

                          {isUpdating && (
                            <span className="text-xs text-orange-600">
                              Saving status...
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {item.categories &&
                      item.categories.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {item.categories.map((category) => (
                            <span
                              key={category}
                              className="rounded-full bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700"
                            >
                              {category}
                            </span>
                          ))}
                        </div>
                      )}

                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                      {item.message?.trim()
                        ? item.message
                        : "No written comment provided."}
                    </p>

                    <p className="mt-3 text-xs text-slate-400">
                      {formatFeedbackDate(item.createdAt)}
                    </p>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* Voucher usage */}
        <section className="mb-8 rounded-3xl border border-orange-100 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-orange-500">
                Customer loyalty
              </p>

              <h2 className="mt-1 text-xl font-extrabold text-slate-900">
                Voucher Usage
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Actual claim counts stored in Firestore.
              </p>
            </div>

            <Link
              href="/dashboard/vouchers"
              className="inline-flex w-fit items-center rounded-xl bg-orange-50 px-4 py-2.5 text-sm font-bold text-orange-600 transition hover:bg-orange-100"
            >
              Manage vouchers →
            </Link>
          </div>

          {voucherLoading ? (
            <p className="text-sm text-slate-500">
              Loading vouchers...
            </p>
          ) : vouchers.length === 0 ? (
            <div className="rounded-2xl bg-orange-50/70 p-6 text-center">
              <p className="font-bold text-slate-800">
                No vouchers created yet
              </p>

              <p className="mt-2 text-sm text-slate-500">
                Create a voucher to start tracking customer claims.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {vouchers.map((voucher) => {
                const usageCount = Math.max(
                  0,
                  voucher.usageCount ?? 0
                );

                const usageLimit = Math.max(
                  0,
                  voucher.usageLimit ?? 0
                );

                const usagePercentage =
                  usageLimit > 0
                    ? Math.min(
                        100,
                        (usageCount / usageLimit) * 100
                      )
                    : 0;

                return (
                  <article
                    key={voucher.id}
                    className="rounded-2xl border border-orange-100 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-extrabold text-slate-900">
                          {voucher.code || "Voucher"}
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          {voucher.active
                            ? "Active voucher"
                            : "Inactive voucher"}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-lg font-extrabold text-slate-900">
                          {usageCount}
                          {usageLimit > 0
                            ? ` / ${usageLimit}`
                            : ""}
                        </p>

                        <p className="text-xs text-slate-500">
                          Claims
                        </p>
                      </div>
                    </div>

                    {usageLimit > 0 && (
                      <div className="mt-4 h-2 overflow-hidden rounded-full bg-orange-50">
                        <div
                          className="h-full rounded-full bg-orange-500 transition-all"
                          style={{
                            width: `${usagePercentage}%`,
                          }}
                        />
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-orange-100 pt-4">
            <span className="text-sm font-semibold text-slate-600">
              Active vouchers
            </span>

            <span className="text-sm font-extrabold text-orange-600">
              {activeVouchers.length}
            </span>
          </div>
        </section>

        {/* Quick actions */}
        <section>
          <div className="mb-5">
            <p className="text-xs font-bold uppercase tracking-widest text-orange-500">
              Manage your business
            </p>

            <h2 className="mt-1 text-2xl font-extrabold text-slate-900">
              Quick Actions
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <ActionCard
              href="/my-cafe"
              icon="🏪"
              title="My Cafe"
              description="Manage your cafe name, address, contact details, and review link."
              action="Manage Cafe →"
            />

            <ActionCard
              href={`/c/${cafeId}`}
              icon="⭐"
              title="Customer Feedback"
              description="Open your customer feedback page and test the rating experience."
              action="Open Feedback Page →"
            />

            <ActionCard
              href="/dashboard/qr-code"
              icon="🔳"
              title="Cafe QR Code"
              description="Generate, download, and print a QR code for your customer feedback page."
              action="Generate QR Code →"
            />

            <article className="rounded-2xl border border-orange-100 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-2xl">
                📱
              </div>

              <h3 className="text-lg font-extrabold text-slate-900">
                Feedback Link
              </h3>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Copy your customer feedback link and share it with
                customers.
              </p>

              <button
                onClick={copyFeedbackLink}
                className="mt-5 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-orange-600"
              >
                Copy Feedback Link
              </button>
            </article>

            <ActionCard
              href="/dashboard/vouchers"
              icon="🎁"
              title="Loyalty Vouchers"
              description="Create and manage discounts and customer loyalty vouchers."
              action="Manage Vouchers →"
            />

            <ActionCard
              href="/dashboard/notifications"
              icon="🔔"
              title="Notification Management"
              description="Manage subscribers, send special offers, and view notification campaigns."
              action="Manage Notifications →"
            />
          </div>
        </section>

        <footer className="mt-10 border-t border-orange-100 py-6 text-center">
          <p className="text-sm text-slate-500">
            © 2026 CafeFlow. Built for growing restaurants.
          </p>
        </footer>
      </div>
    </main>
  );
}
