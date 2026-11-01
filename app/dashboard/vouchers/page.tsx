"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  onAuthStateChanged,
  type User,
} from "firebase/auth";

import {
  addDoc,
  collection,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  doc,
  type Timestamp,
} from "firebase/firestore";

import { auth, db } from "../../../lib/firebase";

type Voucher = {
  id: string;
  cafeId: string;
  code: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  expiryDate: string;
  usageLimit: number;
  usageCount: number;
  active: boolean;
  createdAt?: Timestamp;
};

export default function VoucherManagementPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(true);

  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [saving, setSaving] = useState(false);

  const [code, setCode] = useState("");
  const [discountType, setDiscountType] =
    useState<"percentage" | "fixed">("percentage");
  const [discountValue, setDiscountValue] = useState("10");
  const [expiryDate, setExpiryDate] = useState("");
  const [usageLimit, setUsageLimit] = useState("100");

  // Authenticate owner.
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

  // Listen to vouchers belonging to this owner.
  useEffect(() => {
    if (!user) {
      setVouchers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

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

        items.sort((a, b) => {
          return a.code.localeCompare(b.code);
        });

        setVouchers(items);
        setLoading(false);
      },
      (err) => {
        console.error("Voucher loading failed:", err);

        setError(
          "Could not load vouchers. Check your Firestore security rules."
        );

        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  async function handleCreateVoucher(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!user || saving) return;

    setError("");
    setSuccess("");

    const cleanCode = code.trim().toUpperCase();
    const value = Number(discountValue);
    const limit = Number(usageLimit);

    if (!/^[A-Z0-9_-]{3,30}$/.test(cleanCode)) {
      setError(
        "Voucher code must be 3–30 characters using letters, numbers, _ or -."
      );
      return;
    }

    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter a valid discount value.");
      return;
    }

    if (discountType === "percentage" && value > 100) {
      setError("Percentage discount cannot be greater than 100.");
      return;
    }

    if (!expiryDate) {
      setError("Please select an expiry date.");
      return;
    }

    if (expiryDate < new Date().toISOString().slice(0, 10)) {
      setError("Expiry date cannot be in the past.");
      return;
    }

    if (!Number.isInteger(limit) || limit < 1) {
      setError("Usage limit must be at least 1.");
      return;
    }

    const duplicate = vouchers.some(
      (voucher) => voucher.code.toUpperCase() === cleanCode
    );

    if (duplicate) {
      setError("This voucher code already exists.");
      return;
    }

    try {
      setSaving(true);

      await addDoc(collection(db, "vouchers"), {
        cafeId: user.uid,
        code: cleanCode,
        discountType,
        discountValue: value,
        expiryDate,
        usageLimit: limit,
        usageCount: 0,
        active: true,
        createdAt: serverTimestamp(),
      });

      setCode("");
      setDiscountType("percentage");
      setDiscountValue("10");
      setExpiryDate("");
      setUsageLimit("100");

      setSuccess(`Voucher ${cleanCode} created successfully.`);
    } catch (err) {
      console.error("Voucher creation failed:", err);

      setError(
        "Could not create voucher. Check your Firestore security rules."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleVoucher(voucher: Voucher) {
    if (!user) return;

    setError("");
    setSuccess("");

    const expired =
      voucher.expiryDate < new Date().toISOString().slice(0, 10);

    const limitReached =
      voucher.usageCount >= voucher.usageLimit;

    if (!voucher.active && (expired || limitReached)) {
      setError(
        "This voucher has expired or reached its usage limit. Create a new voucher instead."
      );
      return;
    }

    try {
      await updateDoc(doc(db, "vouchers", voucher.id), {
        active: !voucher.active,
      });

      setSuccess(
        `${voucher.code} ${voucher.active ? "deactivated" : "activated"}.`
      );
    } catch (err) {
      console.error("Voucher update failed:", err);

      setError(
        "Could not update voucher. Check your Firestore security rules."
      );
    }
  }

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

  return (
    <main className="min-h-screen bg-[#FFF7ED] text-slate-800">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-orange-500">
              CafeFlow
            </p>

            <h1 className="mt-1 text-3xl font-extrabold text-slate-900">
              Voucher Management
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              Create and manage discounts for your customers.
            </p>
          </div>

          <button
            onClick={() => router.push("/dashboard")}
            className="rounded-xl border border-orange-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-orange-50"
          >
            ← Back to Dashboard
          </button>
        </div>

        {/* Messages */}
        {error && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-5 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
            {success}
          </div>
        )}

        {/* Create voucher */}
        <section className="mb-8 rounded-3xl border border-orange-100 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="text-xl font-extrabold text-slate-900">
            Create New Voucher
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Set a discount, expiry date, and maximum number of uses.
          </p>

          <form
            onSubmit={handleCreateVoucher}
            className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2"
          >
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Voucher Code
              </label>

              <input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="WELCOME10"
                maxLength={30}
                required
                className="w-full rounded-xl border border-orange-200 px-4 py-3 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Discount Type
              </label>

              <select
                value={discountType}
                onChange={(event) =>
                  setDiscountType(
                    event.target.value as "percentage" | "fixed"
                  )
                }
                className="w-full rounded-xl border border-orange-200 bg-white px-4 py-3 outline-none focus:border-orange-500"
              >
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed Amount (₹)</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Discount Value
              </label>

              <input
                type="number"
                min="1"
                max={discountType === "percentage" ? "100" : undefined}
                step="1"
                value={discountValue}
                onChange={(event) =>
                  setDiscountValue(event.target.value)
                }
                required
                className="w-full rounded-xl border border-orange-200 px-4 py-3 outline-none focus:border-orange-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Expiry Date
              </label>

              <input
                type="date"
                value={expiryDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(event) =>
                  setExpiryDate(event.target.value)
                }
                required
                className="w-full rounded-xl border border-orange-200 px-4 py-3 outline-none focus:border-orange-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Maximum Usage
              </label>

              <input
                type="number"
                min="1"
                step="1"
                value={usageLimit}
                onChange={(event) =>
                  setUsageLimit(event.target.value)
                }
                required
                className="w-full rounded-xl border border-orange-200 px-4 py-3 outline-none focus:border-orange-500"
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-xl bg-orange-500 px-5 py-3 font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Creating..." : "Create Voucher"}
              </button>
            </div>
          </form>
        </section>

        {/* Voucher list */}
        <section className="rounded-3xl border border-orange-100 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-extrabold text-slate-900">
                Your Vouchers
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                {vouchers.length} voucher
                {vouchers.length === 1 ? "" : "s"} created
              </p>
            </div>
          </div>

          {loading ? (
            <p className="py-8 text-center text-slate-500">
              Loading vouchers...
            </p>
          ) : vouchers.length === 0 ? (
            <div className="rounded-2xl bg-orange-50 p-8 text-center">
              <p className="text-lg font-bold text-slate-800">
                No vouchers yet
              </p>

              <p className="mt-2 text-sm text-slate-500">
                Create your first discount voucher above.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {vouchers.map((voucher) => {
                const expired =
                  voucher.expiryDate <
                  new Date().toISOString().slice(0, 10);

                const limitReached =
                  voucher.usageCount >= voucher.usageLimit;

                const available =
                  voucher.active && !expired && !limitReached;

                return (
                  <article
                    key={voucher.id}
                    className="rounded-2xl border border-orange-100 p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-xl font-extrabold text-slate-900">
                            {voucher.code}
                          </h3>

                          <span
                            className={`rounded-full px-3 py-1 text-xs font-bold ${
                              available
                                ? "bg-green-50 text-green-700"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {available ? "Available" : "Unavailable"}
                          </span>
                        </div>

                        <p className="mt-2 text-sm font-semibold text-orange-600">
                          {voucher.discountType === "percentage"
                            ? `${voucher.discountValue}% OFF`
                            : `₹${voucher.discountValue} OFF`}
                        </p>

                        <div className="mt-3 space-y-1 text-sm text-slate-500">
                          <p>
                            Expires: {voucher.expiryDate}
                          </p>

                          <p>
                            Usage: {voucher.usageCount} / {voucher.usageLimit}
                          </p>

                          {expired && (
                            <p className="font-semibold text-red-600">
                              This voucher has expired.
                            </p>
                          )}

                          {limitReached && (
                            <p className="font-semibold text-red-600">
                              Usage limit reached.
                            </p>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => handleToggleVoucher(voucher)}
                        className={`rounded-xl px-4 py-2.5 text-sm font-bold transition ${
                          voucher.active
                            ? "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                            : "bg-orange-500 text-white hover:bg-orange-600"
                        }`}
                      >
                        {voucher.active ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}