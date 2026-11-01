
"use client";

import { useState } from "react";

type CopyCouponButtonProps = {
  couponCode: string;
};

export default function CopyCouponButton({
  couponCode,
}: CopyCouponButtonProps) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  async function handleCopy() {
    setError("");

    try {
      await navigator.clipboard.writeText(couponCode);

      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      setCopied(false);
      setError("Unable to copy. Please select the code manually.");
    }
  }

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={handleCopy}
        className="w-full rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white transition hover:bg-emerald-800 active:scale-[0.98]"
      >
        {copied ? "✓ Coupon Copied!" : "Copy Coupon Code"}
      </button>

      {error && (
        <p className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
