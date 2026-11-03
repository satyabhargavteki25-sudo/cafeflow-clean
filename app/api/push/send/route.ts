
import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getApp } from "firebase-admin/app";
import type { DocumentReference } from "firebase-admin/firestore";
import webpush from "web-push";

import { adminDb } from "@/lib/firebase-admin";

type CampaignData = Record<string, any>;

function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    throw new Error("Missing Web Push VAPID environment variables.");
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
}

async function verifyCafeOwner(
  request: NextRequest,
  cafeId: string
): Promise<boolean> {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return false;
  }

  try {
    const token = authorization.slice("Bearer ".length).trim();

    const decodedToken = await getAuth(
      getApp("cafeflow-admin")
    ).verifyIdToken(token);

    return decodedToken.uid === cafeId;
  } catch (error) {
    console.error("CafeFlow owner verification failed:", error);
    return false;
  }
}

export async function POST(request: NextRequest) {
  let campaignRef: DocumentReference | undefined;
  let campaignClaimed = false;

  try {
    const body = await request.json();

    const cafeId =
      typeof body.cafeId === "string"
        ? body.cafeId.trim()
        : "";

    const campaignId =
      typeof body.campaignId === "string"
        ? body.campaignId.trim()
        : "";

    if (!cafeId || !campaignId) {
      return NextResponse.json(
        { error: "Cafe ID and campaign ID are required." },
        { status: 400 }
      );
    }

    // Verify that the authenticated user owns this cafe.
    const isOwner = await verifyCafeOwner(request, cafeId);

    if (!isOwner) {
      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401 }
      );
    }

    configureWebPush();

    // campaignId is the Firestore document ID in push_campaigns.
    campaignRef = adminDb
      .collection("push_campaigns")
      .doc(campaignId);

    // Claim the campaign to prevent duplicate simultaneous sends.
    const campaign: CampaignData = await adminDb.runTransaction(
      async (transaction): Promise<CampaignData> => {
        const snapshot = await transaction.get(campaignRef!);

        if (!snapshot.exists) {
          throw new Error("CAMPAIGN_NOT_FOUND");
        }

        const data = snapshot.data();

        // Ensure the campaign belongs to the requested cafe.
        if (!data || data.cafeId !== cafeId) {
          throw new Error("CAMPAIGN_NOT_FOUND");
        }

        if (
          data.status === "sent" ||
          data.status === "sending"
        ) {
          throw new Error("CAMPAIGN_ALREADY_PROCESSED");
        }

        if (data.status === "scheduled") {
          const scheduledAt = data.scheduledAt?.toDate?.();

          if (scheduledAt && scheduledAt > new Date()) {
            throw new Error("CAMPAIGN_NOT_DUE");
          }
        }

        if (
          typeof data.title !== "string" ||
          !data.title.trim() ||
          typeof data.message !== "string" ||
          !data.message.trim()
        ) {
          throw new Error("INVALID_CAMPAIGN");
        }

        transaction.update(campaignRef!, {
          status: "sending",
          updatedAt: new Date(),
        });

        return data;
      }
    );

    campaignClaimed = true;

    /*
     * Subscriptions are saved by the subscribe API here:
     *
     * cafes/{cafeId}/subscriptions/{subscriptionId}
     *
     * Read from this same location.
     */
    const subscribersSnapshot = await adminDb
      .collection("cafes")
      .doc(cafeId)
      .collection("subscriptions")
      .where("active", "==", true)
      .get();

    /*
     * IMPORTANT FIX:
     *
     * The offer page expects a campaignId.
     * Do NOT use cafeId in the offer URL.
     *
     * request.nextUrl.origin uses the current app origin:
     * - localhost during local testing
     * - your Vercel domain in production
     */
    const offerUrl = new URL(
      `/offer/${encodeURIComponent(campaignId)}`,
      request.nextUrl.origin
    ).toString();

    const payload = JSON.stringify({
      title: campaign.title,
      body: campaign.message,
      url: offerUrl,
      icon: "/logo.jpeg",
      badge: "/logo.jpeg",
      campaignId,
    });

    const results = await Promise.allSettled(
      subscribersSnapshot.docs.map(async (subscriberDoc) => {
        const subscriber = subscriberDoc.data();
        const subscription = subscriber.subscription;

        if (
          !subscription?.endpoint ||
          !subscription?.keys?.p256dh ||
          !subscription?.keys?.auth
        ) {
          await subscriberDoc.ref.update({
            active: false,
            updatedAt: new Date(),
          });

          return false;
        }

        try {
          await webpush.sendNotification(
            subscription,
            payload
          );

          return true;
        } catch (error: any) {
          console.error(
            "CafeFlow push delivery failed:",
            error?.statusCode ?? error
          );

          // Deactivate expired or invalid browser subscriptions.
          if (
            error?.statusCode === 404 ||
            error?.statusCode === 410
          ) {
            await subscriberDoc.ref.update({
              active: false,
              updatedAt: new Date(),
            });
          }

          return false;
        }
      })
    );

    const sentCount = results.filter(
      (result) =>
        result.status === "fulfilled" &&
        result.value === true
    ).length;

    const failedCount = results.length - sentCount;

    await campaignRef.update({
      status: "sent",
      sentAt: new Date(),
      updatedAt: new Date(),
      sentCount,
      failedCount,
    });

    return NextResponse.json({
      success: true,
      message: "Campaign sending completed.",
      subscriberCount: subscribersSnapshot.size,
      sentCount,
      failedCount,
      offerUrl,
    });
  } catch (error: any) {
    console.error("CafeFlow push send API error:", error);

    if (
      campaignClaimed &&
      campaignRef &&
      error?.message !== "CAMPAIGN_ALREADY_PROCESSED" &&
      error?.message !== "CAMPAIGN_NOT_DUE"
    ) {
      try {
        await campaignRef.update({
          status: "draft",
          updatedAt: new Date(),
        });
      } catch (resetError) {
        console.error(
          "Unable to reset campaign status:",
          resetError
        );
      }
    }

    if (error?.message === "CAMPAIGN_NOT_FOUND") {
      return NextResponse.json(
        { error: "Campaign not found." },
        { status: 404 }
      );
    }

    if (
      error?.message === "CAMPAIGN_ALREADY_PROCESSED"
    ) {
      return NextResponse.json(
        {
          error:
            "This campaign has already been sent or is being sent.",
        },
        { status: 409 }
      );
    }

    if (error?.message === "CAMPAIGN_NOT_DUE") {
      return NextResponse.json(
        {
          error:
            "This campaign is scheduled for a future time.",
        },
        { status: 400 }
      );
    }

    if (error?.message === "INVALID_CAMPAIGN") {
      return NextResponse.json(
        { error: "Campaign title or message is invalid." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Unable to send campaign." },
      { status: 500 }
    );
  }
}
