
"use client";

import {
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  onAuthStateChanged,
  type User,
} from "firebase/auth";

import {
  doc,
  getDoc,
  setDoc,
} from "firebase/firestore";

import { auth, db } from "../../lib/firebase";

type CafeDetails = {
  cafeName: string;
  ownerName: string;
  phone: string;
  address: string;
  googleReviewUrl: string;
};

const initialDetails: CafeDetails = {
  cafeName: "",
  ownerName: "",
  phone: "",
  address: "",
  googleReviewUrl: "",
};

export default function MyCafePage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [details, setDetails] =
    useState<CafeDetails>(initialDetails);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<
    "success" | "error"
  >("success");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (currentUser) => {
        if (!currentUser) {
          router.replace("/");
          return;
        }

        setUser(currentUser);

        try {
          const cafeRef = doc(db, "cafes", currentUser.uid);
          const cafeSnapshot = await getDoc(cafeRef);

          if (cafeSnapshot.exists()) {
            const savedData = cafeSnapshot.data();

            setDetails({
              cafeName: savedData.cafeName ?? "",
              ownerName: savedData.ownerName ?? "",
              phone: savedData.phone ?? "",
              address: savedData.address ?? "",
              googleReviewUrl:
                savedData.googleReviewUrl ?? "",
            });
          }
        } catch (error) {
          console.error(
            "Failed to load cafe details:",
            error
          );

          setMessage(
            "Unable to load cafe details. Please try again."
          );

          setMessageType("error");
        } finally {
          setLoading(false);
        }
      }
    );

    return () => unsubscribe();
  }, [router]);

  function handleChange(
    event: ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement
    >
  ) {
    const { name, value } = event.target;

    setDetails((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  async function handleSave(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!user) {
      setMessage("Please sign in again.");
      setMessageType("error");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const cafeId = user.uid;

      // Save private cafe information.
      await setDoc(
        doc(db, "cafes", cafeId),
        {
          ...details,
          ownerId: user.uid,
          ownerEmail: user.email ?? "",
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      // Publish the customer-facing cafe information.
      // managerPhone is used by the customer WhatsApp alert.
      await setDoc(
        doc(db, "public_cafes", cafeId),
        {
          cafeId,
          cafeName: details.cafeName,
          primaryColor: "#F97316",
          googleReviewLink: details.googleReviewUrl,

          // Manager's WhatsApp number.
          managerPhone: details.phone,

          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      setMessage(
        "Cafe details saved successfully! Manager WhatsApp number updated."
      );

      setMessageType("success");
    } catch (error) {
      console.error(
        "Failed to save cafe details:",
        error
      );

      setMessage(
        "Unable to save details. Please check Firestore rules and try again."
      );

      setMessageType("error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-orange-50">
        <p className="font-semibold text-slate-600">
          Loading cafe details...
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#FFF7ED] text-slate-800">
      <header className="border-b border-orange-100 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <Link
            href="/dashboard"
            className="flex items-center gap-3"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-500 text-xl font-extrabold text-white">
              C
            </div>

            <div>
              <h1 className="text-xl font-extrabold text-slate-900">
                CafeFlow
              </h1>

              <p className="text-xs text-slate-500">
                Restaurant Growth Platform
              </p>
            </div>
          </Link>

          <Link
            href="/dashboard"
            className="rounded-xl border border-orange-200 px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-orange-50"
          >
            ← Dashboard
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-7">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-500">
            Restaurant Settings
          </p>

          <h1 className="mt-2 text-3xl font-extrabold text-slate-900">
            My Cafe
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Manage your cafe information. These details help
            customers recognize your business and find your
            Google Review page.
          </p>
        </div>

        <form
          onSubmit={handleSave}
          className="rounded-3xl border border-orange-100 bg-white p-5 shadow-sm sm:p-8"
        >
          <div className="mb-7 flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-2xl">
              🏪
            </div>

            <div>
              <h2 className="text-xl font-extrabold text-slate-900">
                Cafe Information
              </h2>

              <p className="text-sm text-slate-500">
                Keep your business details up to date.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field
              label="Cafe / Restaurant Name"
              name="cafeName"
              value={details.cafeName}
              onChange={handleChange}
              placeholder="Enter restaurant name"
              required
            />

            <Field
              label="Owner Name"
              name="ownerName"
              value={details.ownerName}
              onChange={handleChange}
              placeholder="Enter owner name"
              required
            />

            <div>
              <Field
                label="Manager WhatsApp Number"
                name="phone"
                value={details.phone}
                onChange={handleChange}
                placeholder="+91 9876543210"
                type="tel"
                required
              />

              <p className="mt-2 text-xs leading-5 text-slate-500">
                Include the country code. Example: +91 for India.
                This number receives customer feedback alerts
                through WhatsApp.
              </p>
            </div>

            <Field
              label="Google Review URL"
              name="googleReviewUrl"
              value={details.googleReviewUrl}
              onChange={handleChange}
              placeholder="https://g.page/r/..."
              type="url"
            />

            <div className="sm:col-span-2">
              <label
                htmlFor="address"
                className="mb-2 block text-sm font-bold text-slate-700"
              >
                Restaurant Address
              </label>

              <textarea
                id="address"
                name="address"
                value={details.address}
                onChange={handleChange}
                placeholder="Enter complete restaurant address"
                rows={4}
                required
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
              />
            </div>
          </div>

          <div className="mt-7 flex flex-col gap-3 border-t border-orange-100 pt-6 sm:flex-row sm:items-center">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-orange-500 px-6 py-3 font-bold text-white shadow-sm transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving
                ? "Saving..."
                : "Save Cafe Details"}
            </button>

            <Link
              href="/dashboard"
              className="rounded-xl border border-slate-200 px-6 py-3 text-center font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Cancel
            </Link>
          </div>

          {message && (
            <p
              role="status"
              className={`mt-5 rounded-xl p-4 text-sm font-medium ${
                messageType === "success"
                  ? "border border-green-200 bg-green-50 text-green-700"
                  : "border border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {message}
            </p>
          )}
        </form>

        <footer className="py-8 text-center text-sm text-slate-400">
          © 2026 CafeFlow. Built for growing restaurants.
        </footer>
      </section>
    </main>
  );
}

function Field({
  label,
  name,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (
    event: ChangeEvent<HTMLInputElement>
  ) => void;
  placeholder: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label
        htmlFor={name}
        className="mb-2 block text-sm font-bold text-slate-700"
      >
        {label}
      </label>

      <input
        id={name}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
      />
    </div>
  );
}
