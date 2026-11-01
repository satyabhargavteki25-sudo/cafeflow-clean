import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "../../../../lib/firebase-admin";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const cafeId = body.cafeId;
    const endpoint = body.endpoint;

    if (
      typeof cafeId !== "string" ||
      !cafeId.trim() ||
      typeof endpoint !== "string" ||
      !endpoint.trim()
    ) {
      return NextResponse.json(
        { success: false, message: "Cafe ID and endpoint are required." },
        { status: 400 }
      );
    }

    const subscriptionsRef = adminDb.collection("push_subscriptions");

    const snapshot = await subscriptionsRef
      .where("cafeId", "==", cafeId)
      .where("subscription.endpoint", "==", endpoint)
      .get();

    if (snapshot.empty) {
      return NextResponse.json({
        success: true,
        message: "Subscription was already inactive or not found.",
      });
    }

    const batch = adminDb.batch();

    snapshot.docs.forEach((document) => {
      batch.update(document.ref, {
        active: false,
        unsubscribedAt: new Date(),
        updatedAt: new Date(),
      });
    });

    await batch.commit();

    return NextResponse.json({
      success: true,
      message: "Subscription deactivated successfully.",
    });
  } catch (error) {
    console.error("Push unsubscribe error:", error);

    return NextResponse.json(
      { success: false, message: "Unable to unsubscribe." },
      { status: 500 }
    );
  }
}