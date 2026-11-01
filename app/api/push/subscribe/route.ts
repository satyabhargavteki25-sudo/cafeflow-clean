import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { adminDb } from "@/lib/firebase-admin";

type PushSubscriptionPayload = {
  endpoint?: unknown;
  keys?: {
    p256dh?: unknown;
    auth?: unknown;
  };
};

type VoucherData = {
  cafeId?: unknown;
  code?: unknown;
  discountType?: unknown;
  discountValue?: unknown;
  expiryDate?: unknown;
  usageLimit?: unknown;
  usageCount?: unknown;
  active?: unknown;
};

function isVoucherExpired(expiryDate: string): boolean {
  if (!expiryDate) return false;
  const today = new Date().toISOString().slice(0, 10);
  return expiryDate < today;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const cafeId = typeof body.cafeId === "string" ? body.cafeId.trim() : "";
    const subscription = body.subscription as PushSubscriptionPayload | undefined;

    if (!cafeId || !subscription) {
      return NextResponse.json(
        { error: "Cafe ID and subscription are required." },
        { status: 400 }
      );
    }

    if (
      typeof subscription.endpoint !== "string" ||
      !subscription.endpoint.startsWith("https://") ||
      typeof subscription.keys?.p256dh !== "string" ||
      typeof subscription.keys?.auth !== "string"
    ) {
      return NextResponse.json(
        { error: "Invalid push subscription." },
        { status: 400 }
      );
    }

    const cafeSnapshot = await adminDb
      .collection("public_cafes")
      .doc(cafeId)
      .get();

    if (!cafeSnapshot.exists) {
      return NextResponse.json(
        { error: "Cafe not found." },
        { status: 404 }
      );
    }

    const subscriptionId = createHash("sha256")
      .update(`${cafeId}:${subscription.endpoint}`)
      .digest("hex");

    // FIX: Save under the subcollection paths targeted by the delivery / cron engine
    const subscriptionRef = adminDb
      .collection("cafes")
      .doc(cafeId)
      .collection("subscriptions")
      .doc(subscriptionId);

    await subscriptionRef.set(
      {
        cafeId,
        subscription,
        active: true,
        updatedAt: new Date(),
      },
      { merge: true }
    );

    const welcomeClaimRef = adminDb
      .collection("push_welcome_claims")
      .doc(subscriptionId);

    const vouchersQuery = adminDb
      .collection("vouchers")
      .where("cafeId", "==", cafeId)
      .where("active", "==", true);

    const welcomeVoucher = await adminDb.runTransaction(
      async (transaction) => {
        const existingClaim = await transaction.get(welcomeClaimRef);

        if (existingClaim.exists) {
          const saved = existingClaim.data();
          return saved?.voucher ? saved.voucher : null;
        }

        const voucherResults = await transaction.get(vouchersQuery);
        const availableVoucher = voucherResults.docs.find((voucherDoc) => {
          const voucher = voucherDoc.data() as VoucherData;
          const usageCount = Number(voucher.usageCount ?? 0);
          const usageLimit = Number(voucher.usageLimit ?? 0);
          const expiryDate = String(voucher.expiryDate ?? "");
          const withinUsageLimit = usageLimit <= 0 || usageCount < usageLimit;

          return (
            voucher.active === true &&
            voucher.cafeId === cafeId &&
            withinUsageLimit &&
            !isVoucherExpired(expiryDate)
          );
        });

        if (!availableVoucher) {
          return null;
        }

        const voucherRef = availableVoucher.ref;
        const voucher = availableVoucher.data() as VoucherData;
        const usageCount = Number(voucher.usageCount ?? 0);
        const usageLimit = Number(voucher.usageLimit ?? 0);
        const expiryDate = String(voucher.expiryDate ?? "");

        const reward = {
          id: availableVoucher.id,
          cafeId,
          code: String(voucher.code ?? ""),
          discountType: voucher.discountType === "fixed" ? "fixed" : "percentage",
          discountValue: Number(voucher.discountValue ?? 0),
          expiryDate,
          usageLimit,
          usageCount: usageCount + 1,
          active: true,
        };

        transaction.update(voucherRef, {
          usageCount: usageCount + 1,
        });

        transaction.set(welcomeClaimRef, {
          cafeId,
          subscriptionId,
          voucherId: availableVoucher.id,
          voucher: reward,
          createdAt: new Date(),
        });

        const engagementRef = adminDb.collection("engagement_logs").doc();
        transaction.set(engagementRef, {
          cafeId,
          action: "push_welcome_coupon_claimed",
          voucherId: availableVoucher.id,
          createdAt: new Date(),
        });

        return reward;
      }
    );

    return NextResponse.json({
      success: true,
      message: "Browser subscription saved.",
      welcomeVoucher,
      welcomeMessage: welcomeVoucher
        ? "Notifications enabled! Your welcome coupon is ready."
        : "Notifications enabled. No eligible welcome coupon is available right now.",
    });
  } catch (error) {
    console.error("Push subscription API error:", error);
    return NextResponse.json(
      { error: "Unable to save the push subscription." },
      { status: 500 }
    );
  }
}
