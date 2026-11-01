import { NextResponse } from "next/server";
import {
  Timestamp,
  type DocumentReference,
} from "firebase-admin/firestore";
import webpush from "web-push";

import { adminDb } from "@/lib/firebase-admin";


type CampaignData = {
  cafeId: string;
  title: string;
  message: string;
  voucherId?: string | null;
  voucherCode?: string | null;
  status: string;
  scheduledAt?: Timestamp | null;
};

type ClaimResult =
  | {
      claimed: false;
      reason:
        | "not_found"
        | "already_processed"
        | "invalid_schedule"
        | "not_due"
        | "invalid_campaign";
    }
  | {
      claimed: true;
      campaign: CampaignData;
    };

function configureWebPush() {
  const publicKey =
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  const privateKey =
    process.env.VAPID_PRIVATE_KEY;

  const subject =
    process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    throw new Error(
      "Missing Web Push VAPID environment variables. Check NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT."
    );
  }

  webpush.setVapidDetails(
    subject,
    publicKey,
    privateKey
  );
}

function isAuthorized(request: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error(
      "CRON_SECRET is not configured."
    );

    return false;
  }

  const authorization =
    request.headers.get("authorization");

  return (
    authorization === `Bearer ${cronSecret}`
  );
}

async function sendCampaign(
  campaignId: string,
  campaignRef: DocumentReference,
  now: Date
) {
  // Claim the campaign transactionally.
  // This prevents multiple cron requests from
  // processing the same campaign simultaneously.
  const claimResult =
    await adminDb.runTransaction(
      async (
        transaction
      ): Promise<ClaimResult> => {
        const snapshot =
          await transaction.get(campaignRef);

        if (!snapshot.exists) {
          return {
            claimed: false,
            reason: "not_found",
          };
        }

        const campaign =
          snapshot.data() as
            | CampaignData
            | undefined;

        if (!campaign) {
          return {
            claimed: false,
            reason: "invalid_campaign",
          };
        }

        if (
          campaign.status !== "scheduled"
        ) {
          return {
            claimed: false,
            reason: "already_processed",
          };
        }

        const scheduledDate =
          campaign.scheduledAt?.toDate?.();

        if (
          !scheduledDate ||
          Number.isNaN(
            scheduledDate.getTime()
          )
        ) {
          return {
            claimed: false,
            reason: "invalid_schedule",
          };
        }

        if (scheduledDate > now) {
          return {
            claimed: false,
            reason: "not_due",
          };
        }

        if (
          typeof campaign.cafeId !== "string" ||
          typeof campaign.title !== "string" ||
          typeof campaign.message !== "string"
        ) {
          return {
            claimed: false,
            reason: "invalid_campaign",
          };
        }

        transaction.update(campaignRef, {
          status: "sending",
          updatedAt: Timestamp.fromDate(now),
        });

        return {
          claimed: true,
          campaign,
        };
      }
    );

  if (!claimResult.claimed) {
    return {
      campaignId,
      status: "skipped",
      reason: claimResult.reason,
    };
  }

  const campaign =
    claimResult.campaign;

  try {
    // Find active browser subscriptions
    // belonging to this cafe.
    const subscribersSnapshot =
      await adminDb
        .collection("push_subscriptions")
        .where(
          "cafeId",
          "==",
          campaign.cafeId
        )
        .where(
          "active",
          "==",
          true
        )
        .get();

    const subscriberCount =
      subscribersSnapshot.size;

    console.log(
      `Campaign ${campaignId}: found ${subscriberCount} active subscription(s).`
    );

    // Do not report success when nobody can receive
    // the notification.
    if (subscriberCount === 0) {
      await campaignRef.update({
        status: "failed",
        updatedAt: Timestamp.fromDate(
          new Date()
        ),
        sentCount: 0,
        failedCount: 0,
        error:
          "No active push subscriptions found for this cafe.",
      });

      return {
        campaignId,
        status: "failed",
        sentCount: 0,
        failedCount: 0,
        error:
          "No active push subscriptions found for this cafe.",
      };
    }

    const payload = JSON.stringify({
      title: campaign.title,
      body: campaign.message,
      url: `/c/${campaign.cafeId}`,
      icon: "/logo.jpeg",
      badge: "/logo.jpeg",
      campaignId,
      voucherId:
        campaign.voucherId ?? null,
      voucherCode:
        campaign.voucherCode ?? null,
    });

    const results =
      await Promise.allSettled(
        subscribersSnapshot.docs.map(
          async (subscriberDoc) => {
            const subscriber =
              subscriberDoc.data();

            const subscription =
              subscriber.subscription;

            // Deactivate malformed subscriptions.
            if (
              !subscription?.endpoint ||
              !subscription?.keys?.p256dh ||
              !subscription?.keys?.auth
            ) {
              await subscriberDoc.ref.update({
                active: false,
                updatedAt: Timestamp.fromDate(
                  new Date()
                ),
              });

              return false;
            }

            try {
              await webpush.sendNotification(
                subscription,
                payload
              );

              console.log(
                `Push delivered to subscription ${subscriberDoc.id}.`
              );

              return true;
            } catch (error: unknown) {
              const pushError =
                error as {
                  statusCode?: number;
                  message?: string;
                };

              console.error(
                `Push delivery failed for subscription ${subscriberDoc.id}:`,
                pushError.statusCode,
                pushError.message ?? error
              );

              // 404 and 410 usually mean the
              // subscription is no longer valid.
              if (
                pushError.statusCode === 404 ||
                pushError.statusCode === 410
              ) {
                await subscriberDoc.ref.update({
                  active: false,
                  updatedAt: Timestamp.fromDate(
                    new Date()
                  ),
                });
              }

              return false;
            }
          }
        )
      );

    const sentCount =
      results.filter(
        (result) =>
          result.status === "fulfilled" &&
          result.value === true
      ).length;

    const failedCount =
      results.length - sentCount;

    // At least one successful push is required
    // for the campaign to be marked as sent.
    const finalStatus =
      sentCount > 0
        ? "sent"
        : "failed";

    await campaignRef.update({
      status: finalStatus,
      sentAt:
        sentCount > 0
          ? Timestamp.fromDate(new Date())
          : null,
      updatedAt: Timestamp.fromDate(
        new Date()
      ),
      sentCount,
      failedCount,
      error:
        sentCount === 0
          ? "Push delivery failed for all active subscriptions."
          : null,
    });

    console.log(
      `Campaign ${campaignId} finished. Status: ${finalStatus}. Sent: ${sentCount}. Failed: ${failedCount}.`
    );

    return {
      campaignId,
      status: finalStatus,
      sentCount,
      failedCount,
    };
  } catch (error) {
    console.error(
      `Campaign ${campaignId} processing failed:`,
      error
    );

    await campaignRef.update({
      status: "failed",
      updatedAt: Timestamp.fromDate(
        new Date()
      ),
      error:
        error instanceof Error
          ? error.message
          : "Unknown campaign processing error",
    });

    return {
      campaignId,
      status: "failed",
    };
  }
}

export async function GET(
  request: Request
) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      {
        success: false,
        error: "Unauthorized.",
      },
      { status: 401 }
    );
  }

  try {
    configureWebPush();

    const now = new Date();

    // Get scheduled campaigns whose scheduled time
    // has arrived.
    const dueCampaigns =
      await adminDb
        .collection("push_campaigns")
        .where(
          "status",
          "==",
          "scheduled"
        )
        .where(
          "scheduledAt",
          "<=",
          Timestamp.fromDate(now)
        )
        .limit(25)
        .get();

    console.log(
      `Push cron started. Due campaigns: ${dueCampaigns.size}.`
    );

    const results =
      await Promise.all(
        dueCampaigns.docs.map(
          (document) =>
            sendCampaign(
              document.id,
              document.ref,
              now
            )
        )
      );

    const sentCampaigns =
      results.filter(
        (result) =>
          result.status === "sent"
      ).length;

    const failedCampaigns =
      results.filter(
        (result) =>
          result.status === "failed"
      ).length;

    return NextResponse.json({
      success: true,
      checkedAt: now.toISOString(),
      checkedCampaigns:
        dueCampaigns.size,
      sentCampaigns,
      failedCampaigns,
      results,
    });
  } catch (error) {
    console.error(
      "CafeFlow push cron error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to process scheduled campaigns.",
      },
      { status: 500 }
    );
  }
}

