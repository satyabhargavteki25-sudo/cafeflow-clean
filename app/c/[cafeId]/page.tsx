
"use client";

import {
  Suspense,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

import {
  useParams,
  useSearchParams,
} from "next/navigation";

import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";

import { db } from "../../../lib/firebase";
import { subscribeToPush } from "../../../lib/push";

const feedbackCategories = [
  "Food Quality",
  "Service Speed",
  "Staff Behavior",
  "Cleanliness",
  "Ambience",
];

const touchpointOptions = [
  ...Array.from({ length: 20 }, (_, index) => `Table ${index + 1}`),
  "Takeaway",
  "Delivery",
];

type PublicCafe = {
  cafeName: string;
  primaryColor: string;
  googleReviewLink: string;
  managerPhone: string;
};

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
};

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);

    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function isVoucherExpired(expiryDate: string) {
  if (!expiryDate) {
    return true;
  }

  // Expected format: YYYY-MM-DD.
  // Comparing these date strings is safe when the format is consistent.
  const today = new Date().toISOString().slice(0, 10);

  return expiryDate < today;
}

function getVoucherRemaining(voucher: Voucher) {
  return Math.max(
    0,
    voucher.usageLimit - voucher.usageCount
  );
}

function CustomerFeedbackPageContent() {
  const params = useParams<{ cafeId: string }>();
  const searchParams = useSearchParams();

  const cafeId = params.cafeId;

  const initialTouchpoint = searchParams.get("table") || "Table 1";

  const [selectedTouchpoint, setSelectedTouchpoint] = useState(
    touchpointOptions.includes(initialTouchpoint)
      ? initialTouchpoint
      : "Table 1"
  );

  const [cafe, setCafe] = useState<PublicCafe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [rating, setRating] = useState(0);
  const [categories, setCategories] = useState<string[]>([]);
  const [message, setMessage] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // Existing loyalty voucher states.
  const [couponClaimed, setCouponClaimed] = useState(false);
  const [claimedVoucher, setClaimedVoucher] = useState<Voucher | null>(
    null
  );
  const [claimingCoupon, setClaimingCoupon] = useState(false);

  // Browser push notification states.
  const [pushMessage, setPushMessage] = useState("");
  const [pushLoading, setPushLoading] = useState(false);

  // Separate voucher for the notification welcome reward.
  const [welcomeVoucher, setWelcomeVoucher] =
    useState<Voucher | null>(null);

  const pageViewTracked = useRef(false);

  // Load public cafe details.
  useEffect(() => {
    let isMounted = true;

    async function loadCafe() {
      try {
        const cafeRef = doc(db, "public_cafes", cafeId);
        const cafeSnapshot = await getDoc(cafeRef);

        if (!isMounted) {
          return;
        }

        if (!cafeSnapshot.exists()) {
          setError("This cafe could not be found.");
          return;
        }

        const data = cafeSnapshot.data();

        setCafe({
          cafeName: data.cafeName ?? "CafeFlow Cafe",
          primaryColor: data.primaryColor ?? "#F97316",
          googleReviewLink: data.googleReviewLink ?? "",
          managerPhone: data.managerPhone ?? "",
        });
      } catch (err) {
        console.error("Failed to load cafe:", err);

        if (isMounted) {
          setError("Unable to load cafe details. Please try again.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    if (cafeId) {
      loadCafe();
    } else {
      setError("Invalid cafe link.");
      setLoading(false);
    }

    return () => {
      isMounted = false;
    };
  }, [cafeId]);

  // Record a customer feedback page visit.
  useEffect(() => {
    if (!cafe || !cafeId || pageViewTracked.current) {
      return;
    }

    pageViewTracked.current = true;

    addDoc(collection(db, "engagement_logs"), {
      cafeId,
      action: "page_view",
      createdAt: serverTimestamp(),
    }).catch((err) => {
      console.error("Failed to record page visit:", err);
    });
  }, [cafe, cafeId]);

  function toggleCategory(category: string) {
    setCategories((previous) => {
      if (previous.includes(category)) {
        return previous.filter((item) => item !== category);
      }

      if (previous.length >= 5) {
        return previous;
      }

      return [...previous, category];
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (rating < 1 || rating > 5) {
      setError("Please select a rating.");
      return;
    }

    if (!touchpointOptions.includes(selectedTouchpoint)) {
      setError("Please select a valid table number or order type.");
      return;
    }

    if (!cafeId) {
      setError("Invalid cafe link.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      await addDoc(collection(db, "feedback"), {
        cafeId,

        // Keep this field for existing dashboard compatibility.
        tableId: selectedTouchpoint,

        // Descriptive field for future workflow improvements.
        touchpoint: selectedTouchpoint,

        rating,
        categories,
        message: message.trim(),
        status: rating <= 3 ? "pending" : "completed",
        createdAt: serverTimestamp(),
      });

      setIsSubmitted(true);
    } catch (err) {
      console.error("Feedback submission failed:", err);

      setError("Unable to submit feedback. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleGoogleReview() {
    if (!cafe?.googleReviewLink) {
      setError("The cafe has not added its Google Review link yet.");
      return;
    }

    if (!isValidHttpUrl(cafe.googleReviewLink)) {
      setError("The cafe's Google Review link is invalid.");
      return;
    }

    setError("");

    window.open(
      cafe.googleReviewLink,
      "_blank",
      "noopener,noreferrer"
    );

    addDoc(collection(db, "engagement_logs"), {
      cafeId,
      action: "google_click",
      createdAt: serverTimestamp(),
    }).catch((err) => {
      console.error("Failed to record Google Review click:", err);
    });
  }

  // Existing loyalty voucher claim.
  // This feature remains separate from the notification welcome coupon.
  async function handleClaimCoupon() {
    if (couponClaimed || claimingCoupon) {
      return;
    }

    if (!cafeId) {
      setError("Invalid cafe link.");
      return;
    }

    setClaimingCoupon(true);
    setError("");

    try {
      // Find active vouchers belonging to this cafe.
      const vouchersQuery = query(
        collection(db, "vouchers"),
        where("cafeId", "==", cafeId),
        where("active", "==", true)
      );

      const voucherSnapshot = await getDocs(vouchersQuery);

      if (voucherSnapshot.empty) {
        setError("There are no active loyalty vouchers available.");
        return;
      }

      // Select an available, non-expired voucher.
      const availableVoucher = voucherSnapshot.docs.find((document) => {
        const data = document.data();

        const usageCount = Number(data.usageCount ?? 0);
        const usageLimit = Number(data.usageLimit ?? 0);
        const expiryDate = String(data.expiryDate ?? "");

        return (
          data.active === true &&
          usageLimit > usageCount &&
          !isVoucherExpired(expiryDate)
        );
      });

      if (!availableVoucher) {
        setError(
          "All loyalty vouchers are expired or have reached their usage limit."
        );
        return;
      }

      const voucherRef = doc(
        db,
        "vouchers",
        availableVoucher.id
      );

      const engagementRef = doc(
        collection(db, "engagement_logs")
      );

      // Atomically increment usageCount and create the claim log.
      const claimedVoucherData = await runTransaction(
        db,
        async (transaction) => {
          const voucherSnapshot = await transaction.get(voucherRef);

          if (!voucherSnapshot.exists()) {
            throw new Error("This voucher no longer exists.");
          }

          const data = voucherSnapshot.data();

          const usageCount = Number(data.usageCount ?? 0);
          const usageLimit = Number(data.usageLimit ?? 0);
          const expiryDate = String(data.expiryDate ?? "");

          if (data.cafeId !== cafeId) {
            throw new Error(
              "This voucher does not belong to this cafe."
            );
          }

          if (data.active !== true) {
            throw new Error("This voucher is no longer active.");
          }

          if (isVoucherExpired(expiryDate)) {
            throw new Error("This voucher has expired.");
          }

          if (usageCount >= usageLimit) {
            throw new Error(
              "This voucher has reached its usage limit."
            );
          }

          transaction.update(voucherRef, {
            usageCount: usageCount + 1,
          });

          transaction.set(engagementRef, {
            cafeId,
            action: "coupon_claimed",
            voucherId: voucherSnapshot.id,
            createdAt: serverTimestamp(),
          });

          return {
            id: voucherSnapshot.id,
            cafeId: String(data.cafeId),
            code: String(data.code ?? ""),
            discountType:
              data.discountType === "fixed"
                ? "fixed"
                : "percentage",
            discountValue: Number(data.discountValue ?? 0),
            expiryDate,
            usageLimit,
            usageCount: usageCount + 1,
            active: true,
          } satisfies Voucher;
        }
      );

      setClaimedVoucher(claimedVoucherData);
      setCouponClaimed(true);
    } catch (err) {
      console.error("Failed to claim voucher:", err);

      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Unable to claim the voucher. Please try again.");
      }
    } finally {
      setClaimingCoupon(false);
    }
  }

  // Enable browser push notifications and issue the welcome coupon.
  async function handleEnableNotifications() {
    setPushLoading(true);
    setPushMessage("");
    setWelcomeVoucher(null);

    try {
      // subscribeToPush() requests permission and throws unless
      // the browser permission is actually granted.
      const subscription = await subscribeToPush();

      // Explicitly verify browser permission.
      if (
        typeof Notification === "undefined" ||
        Notification.permission !== "granted"
      ) {
        throw new Error(
          "Please allow browser notifications to receive the welcome coupon."
        );
      }

      // Save the subscription.
      // The API handles the one-time welcome voucher assignment.
      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cafeId,
          subscription: subscription.toJSON(),
        }),
      });

      const result = await response.json();

      if (!response.ok || result.success !== true) {
        throw new Error(
          result.error ||
            "Unable to save the notification subscription."
        );
      }

      // Display the welcome voucher returned by the API.
      if (result.welcomeVoucher) {
        setWelcomeVoucher(result.welcomeVoucher as Voucher);
      }

      setPushMessage(
        result.welcomeMessage ||
          "Notifications enabled successfully!"
      );
    } catch (err) {
      console.error("Failed to enable notifications:", err);

      setPushMessage(
        err instanceof Error
          ? err.message
          : "Unable to enable notifications. Please try again."
      );
    } finally {
      setPushLoading(false);
    }
  }

  // Create a detailed WhatsApp message for low ratings.
  function getWhatsAppLink() {
    if (!cafe?.managerPhone) {
      return "";
    }

    const phone = cafe.managerPhone.replace(/\D/g, "");

    if (!phone) {
      return "";
    }

    const categoryDetails =
      categories.length > 0
        ? categories.map((category) => `• ${category}`).join("\n")
        : "No specific category selected";

    const customerComment =
      message.trim().length > 0
        ? message.trim()
        : "No additional comment provided.";

    const alertMessage = `
🚨 CafeFlow - New Customer Complaint

Cafe: ${cafe.cafeName}

Rating: ⭐ ${rating}/5

Location: ${selectedTouchpoint}

Problem Categories:
${categoryDetails}

Customer Comment:
"${customerComment}"

Action Required:
Please review this customer complaint and take the necessary action to improve their experience.

Sent from CafeFlow Feedback System.
`.trim();

    return `https://wa.me/${phone}?text=${encodeURIComponent(
      alertMessage
    )}`;
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#FFF7ED] p-6">
        <p className="font-semibold text-slate-600">
          Loading cafe...
        </p>
      </main>
    );
  }

  if (error && !cafe) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#FFF7ED] p-6">
        <div className="w-full max-w-md rounded-3xl border border-orange-100 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-2xl">
            🏪
          </div>

          <h1 className="mt-5 text-2xl font-extrabold text-slate-900">
            Cafe unavailable
          </h1>

          <p className="mt-3 text-sm leading-6 text-slate-500">
            {error}
          </p>

          <p className="mt-6 text-xs text-slate-400">
            Powered by CafeFlow
          </p>
        </div>
      </main>
    );
  }

  if (!cafe) {
    return null;
  }

  if (isSubmitted) {
    return (
      <main className="min-h-screen bg-[#FFF7ED] px-4 py-10">
        <section className="mx-auto max-w-md rounded-3xl border border-orange-100 bg-white p-6 text-center shadow-sm sm:p-8">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-100 text-3xl text-orange-600">
            ✓
          </div>

          <h1 className="mt-5 text-2xl font-extrabold text-slate-900">
            Thank you!
          </h1>

          <p className="mt-3 text-sm leading-6 text-slate-600">
            Your feedback has been submitted to{" "}
            <strong>{cafe.cafeName}</strong>.
          </p>

          <p className="mt-2 text-sm font-semibold text-slate-500">
            Feedback location: {selectedTouchpoint}
          </p>

          {/* WhatsApp alert for ratings 1, 2, and 3 */}
          {rating <= 3 && (
            <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5 text-left">
              <h2 className="text-lg font-extrabold text-red-800">
                Need help with your experience?
              </h2>

              <p className="mt-2 text-sm leading-6 text-red-700">
                You can share your feedback directly with the cafe
                manager through WhatsApp. Your selected problems and
                comments will be included in the message.
              </p>

              {cafe.managerPhone ? (
                getWhatsAppLink() ? (
                  <a
                    href={getWhatsAppLink()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 flex w-full items-center justify-center rounded-xl bg-green-600 px-4 py-3 text-center font-bold text-white transition hover:bg-green-700"
                  >
                    Send Feedback to Manager on WhatsApp
                  </a>
                ) : (
                  <p className="mt-3 text-sm text-red-700">
                    The cafe's WhatsApp number is invalid.
                  </p>
                )
              ) : (
                <p className="mt-3 text-sm text-red-700">
                  The cafe has not configured its manager WhatsApp
                  number.
                </p>
              )}
            </div>
          )}

          {/* Google Review, browser notifications, and loyalty voucher */}
          <div className="mt-8 rounded-2xl border border-orange-100 bg-orange-50/50 p-5">
            <h2 className="text-lg font-extrabold text-slate-900">
              Stay connected with us
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              Thank you for sharing your experience. You can also
              claim a loyalty voucher for your next visit.
            </p>

            {/* Browser notification opt-in */}
            <div className="mt-5 rounded-xl border border-orange-200 bg-white p-4 text-left">
              <h3 className="font-bold text-slate-900">
                Get cafe updates
              </h3>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                Enable browser notifications to receive special offers
                and updates from this cafe.
              </p>

              <button
                type="button"
                onClick={handleEnableNotifications}
                disabled={pushLoading}
                className="mt-4 w-full rounded-xl px-4 py-3 font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                style={{ backgroundColor: cafe.primaryColor }}
              >
                {pushLoading
                  ? "Enabling Notifications..."
                  : "Enable Notifications"}
              </button>

              {pushMessage && (
                <p
                  role="status"
                  className="mt-3 text-sm text-slate-600"
                >
                  {pushMessage}
                </p>
              )}

              {/* Notification welcome coupon */}
              {welcomeVoucher && (
                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-sm font-bold text-emerald-800">
                    Your notification welcome coupon
                  </p>

                  <p className="mt-2 text-2xl font-extrabold tracking-wider text-emerald-700">
                    {welcomeVoucher.code}
                  </p>

                  <p className="mt-2 text-sm font-semibold text-emerald-800">
                    {welcomeVoucher.discountType === "percentage"
                      ? `${welcomeVoucher.discountValue}% off`
                      : `₹${welcomeVoucher.discountValue} off`}
                  </p>

                  {welcomeVoucher.expiryDate && (
                    <p className="mt-2 text-xs text-emerald-700">
                      Valid until: {welcomeVoucher.expiryDate}
                    </p>
                  )}

                  <p className="mt-2 text-xs text-emerald-700">
                    Show this coupon to the cafe staff on your next visit.
                  </p>
                </div>
              )}
            </div>

            {/* Google Review */}
            <button
              type="button"
              onClick={handleGoogleReview}
              className="mt-5 w-full rounded-xl px-4 py-3 font-bold text-white transition hover:opacity-90"
              style={{ backgroundColor: cafe.primaryColor }}
            >
              Write a Google Review
            </button>

            {/* Existing loyalty voucher */}
            <button
              type="button"
              onClick={handleClaimCoupon}
              disabled={couponClaimed || claimingCoupon}
              className="mt-3 w-full rounded-xl border border-orange-200 bg-white px-4 py-3 font-bold text-orange-700 transition hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {claimingCoupon
                ? "Claiming Voucher..."
                : couponClaimed
                  ? "Voucher Claimed"
                  : "Claim Loyalty Voucher"}
            </button>

            {couponClaimed && claimedVoucher && (
              <div className="mt-4 rounded-xl border border-orange-200 bg-white p-4">
                <p className="text-sm text-slate-600">
                  Your voucher code
                </p>

                <p className="mt-1 text-xl font-extrabold tracking-wider text-orange-600">
                  {claimedVoucher.code}
                </p>

                <p className="mt-2 text-sm font-semibold text-slate-700">
                  {claimedVoucher.discountType === "percentage"
                    ? `${claimedVoucher.discountValue}% off`
                    : `₹${claimedVoucher.discountValue} off`}
                </p>

                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Show this code to the cafe staff on your next visit.
                </p>

                <p className="mt-2 text-xs text-slate-500">
                  Voucher expiry: {claimedVoucher.expiryDate}
                </p>
              </div>
            )}
          </div>

          {error && (
            <p role="alert" className="mt-4 text-sm text-red-600">
              {error}
            </p>
          )}

          <p className="mt-6 text-xs text-slate-400">
            Powered by CafeFlow
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#FFF7ED] px-4 py-8 sm:py-12">
      <section className="mx-auto max-w-md">
        <div className="mb-6 text-center">
          <div
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl text-2xl font-extrabold text-white shadow-lg"
            style={{ backgroundColor: cafe.primaryColor }}
          >
            {cafe.cafeName.charAt(0).toUpperCase()}
          </div>

          <h1 className="mt-4 text-2xl font-extrabold text-slate-900">
            {cafe.cafeName}
          </h1>

          <p className="mt-2 text-sm text-slate-600">
            How was your experience?
          </p>

          <p className="mt-1 text-xs text-slate-400">
            Feedback for {selectedTouchpoint}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-orange-100 bg-white p-5 shadow-sm sm:p-7"
        >
          {/* Customer touchpoint dropdown */}
          <div className="mb-7">
            <label
              htmlFor="touchpoint"
              className="block font-extrabold text-slate-900"
            >
              Table Number / Order Type
            </label>

            <p className="mt-1 text-sm text-slate-500">
              Where did you place your order?
            </p>

            <select
              id="touchpoint"
              value={selectedTouchpoint}
              onChange={(event) =>
                setSelectedTouchpoint(event.target.value)
              }
              className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
            >
              {touchpointOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="text-center">
            <h2 className="font-extrabold text-slate-900">
              Rate your experience
            </h2>

            <div className="mt-4 flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => {
                    setRating(star);
                    setError("");
                  }}
                  aria-label={`Rate ${star} out of 5 stars`}
                  className={`text-4xl transition ${
                    star <= rating
                      ? "text-orange-400"
                      : "text-slate-200"
                  }`}
                >
                  ★
                </button>
              ))}
            </div>

            <p className="mt-2 text-sm text-slate-500">
              {rating === 0
                ? "Tap a star to rate"
                : rating === 1
                  ? "Poor"
                  : rating === 2
                    ? "Fair"
                    : rating === 3
                      ? "Good"
                      : rating === 4
                        ? "Very Good"
                        : "Excellent"}
            </p>
          </div>

          <div className="mt-7">
            <h2 className="font-extrabold text-slate-900">
              What would you like to tell us about?
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Select any that apply.
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              {feedbackCategories.map((category) => {
                const selected = categories.includes(category);

                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => toggleCategory(category)}
                    className={`rounded-full border px-3 py-2 text-sm font-medium transition ${
                      selected
                        ? "border-orange-500 bg-orange-50 text-orange-700"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-orange-50"
                    }`}
                  >
                    {selected ? "✓ " : ""}
                    {category}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-7">
            <label
              htmlFor="message"
              className="font-extrabold text-slate-900"
            >
              Additional comments
              <span className="font-normal text-slate-400">
                {" "}
                (optional)
              </span>
            </label>

            <textarea
              id="message"
              value={message}
              onChange={(event) =>
                setMessage(event.target.value.slice(0, 1000))
              }
              placeholder="Tell us more about your experience..."
              rows={4}
              maxLength={1000}
              className="mt-3 w-full resize-y rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
            />

            <p className="mt-1 text-right text-xs text-slate-400">
              {message.length}/1000
            </p>
          </div>

          {error && (
            <p
              role="alert"
              className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || rating === 0}
            className="mt-6 w-full rounded-xl px-4 py-3 font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: cafe.primaryColor }}
          >
            {submitting ? "Submitting..." : "Submit Feedback"}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-slate-400">
          Powered by CafeFlow
        </p>
      </section>
    </main>
  );
}

export default function CustomerFeedbackPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#FFF7ED] p-6">
          <p className="font-semibold text-slate-600">
            Loading feedback page...
          </p>
        </main>
      }
    >
      <CustomerFeedbackPageContent />
    </Suspense>
  );
}
