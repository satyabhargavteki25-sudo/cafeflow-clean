
export const instant = false;

import { connection } from "next/server";
import { notFound } from "next/navigation";

import { adminDb } from "@/lib/firebase-admin";
import CopyCouponButton from "./CopyCouponButton";

type OfferPageProps = {
  params: Promise<{
    campaignId: string;
  }>;
};

export default async function OfferPage({
  params,
}: OfferPageProps) {
  // Prevent Next.js from prerendering this dynamic offer page.
  await connection();

  const { campaignId } = await params;

  // Load the campaign using its Firestore document ID.
  const campaignSnapshot = await adminDb
    .collection("push_campaigns")
    .doc(campaignId)
    .get();

  if (!campaignSnapshot.exists) {
    notFound();
  }

  const campaign = campaignSnapshot.data();

  if (
    !campaign ||
    typeof campaign.title !== "string" ||
    typeof campaign.message !== "string" ||
    typeof campaign.cafeId !== "string"
  ) {
    notFound();
  }

  const cafeId = campaign.cafeId;

  // Load the cafe details.
  const cafeSnapshot = await adminDb
    .collection("public_cafes")
    .doc(cafeId)
    .get();

  let cafeName = "CafeFlow Special Offer";

  if (cafeSnapshot.exists) {
    const cafe = cafeSnapshot.data();

    if (
      typeof cafe?.name === "string" &&
      cafe.name.trim()
    ) {
      cafeName = cafe.name.trim();
    }
  }

  // Temporary coupon code derived from the campaign ID.
  // This is not connected to checkout redemption yet.
  const couponCode = `CF-${campaignId
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 8)
    .toUpperCase()}`;

  return (
    <main className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-white px-4 py-10">
      <div className="mx-auto max-w-lg">
        <div className="overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-xl">

          {/* CafeFlow branding */}
          <div className="flex flex-col items-center bg-emerald-700 px-6 py-8 text-center text-white">
            <img
              src="/logo.jpeg"
              alt="CafeFlow logo"
              className="mb-4 h-20 w-20 rounded-2xl border-4 border-white/20 bg-white object-contain"
            />

            <p className="text-sm font-medium text-emerald-100">
              {cafeName}
            </p>

            <h1 className="mt-2 text-3xl font-bold">
              Special Offer
            </h1>

            <p className="mt-2 text-sm text-emerald-100">
              A special treat just for you!
            </p>
          </div>

          {/* Offer details */}
          <div className="px-6 py-8 text-center">
            <div className="mb-5 inline-flex rounded-full bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-800">
              Exclusive Customer Offer
            </div>

            <h2 className="text-3xl font-bold tracking-tight text-gray-900">
              {campaign.title}
            </h2>

            <p className="mt-4 whitespace-pre-wrap leading-7 text-gray-600">
              {campaign.message}
            </p>

            {/* Coupon code */}
            <div className="mt-8 rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">
                Your Coupon Code
              </p>

              <p className="mt-3 break-all text-3xl font-extrabold tracking-wider text-emerald-900">
                {couponCode}
              </p>

              <div className="mt-5">
                <CopyCouponButton
                  couponCode={couponCode}
                />
              </div>
            </div>

            <p className="mt-6 text-xs leading-5 text-gray-500">
              Show this offer to the cafe staff when
              placing your order. Coupon redemption and
              discount validation will be added to
              CafeFlow's checkout system.
            </p>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          Powered by CafeFlow
        </p>
      </div>
    </main>
  );
}
