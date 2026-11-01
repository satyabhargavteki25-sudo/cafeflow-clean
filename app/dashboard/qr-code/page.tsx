

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeCanvas } from "qrcode.react";
import { onAuthStateChanged, type User } from "firebase/auth";

import { auth } from "../../../lib/firebase";

export default function CafeQRCodePage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");

  const qrRef = useRef<HTMLCanvasElement>(null);

  // Get the browser origin after the component mounts.
  // This avoids using window during server rendering.
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // Authenticate the cafe owner.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        setUser(null);
        setLoading(false);
        router.replace("/");
        return;
      }

      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [router]);

  const feedbackUrl =
    user && origin ? `${origin}/c/${user.uid}` : "";

  function downloadQRCode() {
    const canvas = qrRef.current;

    if (!canvas || !feedbackUrl) {
      alert("QR code is not ready yet.");
      return;
    }

    try {
      const imageUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");

      link.href = imageUrl;
      link.download = "cafeflow-feedback-qr.png";

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("QR code download failed:", error);
      alert("Could not download the QR code. Please try again.");
    }
  }

  async function copyFeedbackLink() {
    if (!feedbackUrl) {
      alert("Feedback link is not ready yet.");
      return;
    }

    try {
      await navigator.clipboard.writeText(feedbackUrl);

      setCopied(true);

      window.setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (error) {
      console.error("Could not copy feedback link:", error);

      alert(
        `Could not copy the link automatically.\n\nPlease copy it manually:\n${feedbackUrl}`
      );
    }
  }

  function printQRCode() {
    const canvas = qrRef.current;

    if (!canvas || !feedbackUrl) {
      alert("QR code is not ready yet.");
      return;
    }

    try {
      const imageUrl = canvas.toDataURL("image/png");
      const printWindow = window.open("", "_blank");

      if (!printWindow) {
        alert("Please allow pop-ups to print the QR code.");
        return;
      }

      // Escape text before placing it inside the print document.
      const safeFeedbackUrl = feedbackUrl
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

      printWindow.document.write(`
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>CafeFlow Feedback QR Code</title>

            <style>
              * {
                box-sizing: border-box;
              }

              body {
                font-family: Arial, sans-serif;
                text-align: center;
                padding: 40px;
                color: #1e293b;
              }

              h1 {
                margin-bottom: 8px;
                color: #ea580c;
              }

              p {
                color: #64748b;
                overflow-wrap: anywhere;
              }

              img {
                width: 320px;
                height: 320px;
                max-width: 100%;
                object-fit: contain;
                margin: 20px auto;
              }

              @media print {
                body {
                  padding: 0;
                }
              }
            </style>
          </head>

          <body>
            <h1>CafeFlow</h1>
            <p>Scan to share your feedback</p>

            <img
              id="feedback-qr"
              src="${imageUrl}"
              alt="CafeFlow feedback QR code"
            />

            <p>${safeFeedbackUrl}</p>

            <script>
              const qrImage = document.getElementById("feedback-qr");

              qrImage.onload = function () {
                window.print();
              };

              if (qrImage.complete) {
                window.print();
              }
            </script>
          </body>
        </html>
      `);

      printWindow.document.close();
    } catch (error) {
      console.error("QR code printing failed:", error);
      alert("Could not prepare the QR code for printing.");
    }
  }

  if (loading) {
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
        <p className="text-slate-600">
          Redirecting to login...
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#FFF7ED] text-slate-800">
      {/* Header */}
      <header className="border-b border-orange-100 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">
              CafeFlow
            </h1>

            <p className="text-sm text-slate-500">
              Cafe Feedback QR Code
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="rounded-xl border border-orange-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-orange-50"
          >
            ← Dashboard
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {/* Welcome banner */}
        <section className="mb-8 rounded-3xl bg-gradient-to-br from-orange-500 to-orange-600 p-6 text-white shadow-lg sm:p-9">
          <p className="text-xs font-bold uppercase tracking-widest text-orange-100">
            Customer Engagement
          </p>

          <h2 className="mt-2 text-3xl font-extrabold">
            Your Cafe QR Code
          </h2>

          <p className="mt-3 max-w-2xl text-sm leading-6 text-orange-50">
            Use one QR code throughout your cafe. Customers can scan it
            to open your feedback page and share their experience.
          </p>
        </section>

        {/* QR code and actions */}
        <section className="grid gap-6 md:grid-cols-2">
          {/* QR preview */}
          <article className="rounded-3xl border border-orange-100 bg-white p-6 shadow-sm">
            <div className="flex flex-col items-center">
              <div className="flex min-h-[312px] items-center justify-center rounded-2xl border border-slate-100 bg-white p-4">
                {feedbackUrl ? (
                  <QRCodeCanvas
                    ref={qrRef}
                    value={feedbackUrl}
                    size={280}
                    level="H"
                    includeMargin
                  />
                ) : (
                  <p className="text-sm text-slate-500">
                    Preparing QR code...
                  </p>
                )}
              </div>

              <h3 className="mt-5 text-xl font-extrabold text-slate-900">
                Scan to Give Feedback
              </h3>

              <p className="mt-2 text-center text-sm text-slate-500">
                Place this QR code on your tables or at your billing
                counter.
              </p>
            </div>
          </article>

          {/* QR actions */}
          <article className="rounded-3xl border border-orange-100 bg-white p-6 shadow-sm">
            <h3 className="text-xl font-extrabold text-slate-900">
              QR Code Actions
            </h3>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              Download your QR code, print it, or copy the feedback
              page link to share with customers.
            </p>

            <div className="mt-6 space-y-3">
              <button
                type="button"
                onClick={downloadQRCode}
                disabled={!feedbackUrl}
                className="w-full rounded-xl bg-orange-500 px-4 py-3 font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Download QR Code (PNG)
              </button>

              <button
                type="button"
                onClick={printQRCode}
                disabled={!feedbackUrl}
                className="w-full rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 font-bold text-orange-700 transition hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Print QR Code
              </button>

              <button
                type="button"
                onClick={copyFeedbackLink}
                disabled={!feedbackUrl}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {copied ? "Feedback Link Copied!" : "Copy Feedback Link"}
              </button>
            </div>

            <div className="mt-6 rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Customer feedback link
              </p>

              <p className="mt-2 break-all text-sm text-slate-700">
                {feedbackUrl || "Preparing feedback link..."}
              </p>
            </div>
          </article>
        </section>

        {/* QR information */}
        <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-800">
          <strong>Note:</strong> This QR code opens your cafe&apos;s
          general feedback page. It does not identify a specific table.
        </div>
      </div>
    </main>
  );
}

