import { NextRequest, NextResponse } from "next/server";

import {
  Timestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";

import {
  adminAuth,
  adminDb,
} from "@/lib/firebase-admin";

/**
 * Always return JSON without caching.
 */
function jsonResponse(
  data: Record<string, unknown>,
  status = 200
) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Verify that the signed-in Firebase user owns this cafe.
 *
 * Current CafeFlow setup:
 * Firebase UID === cafeId
 */
async function verifyCafeOwner(
  request: NextRequest,
  cafeId: string
): Promise<boolean> {
  const authorization =
    request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return false;
  }

  const token = authorization
    .slice("Bearer ".length)
    .trim();

  if (!token) {
    return false;
  }

  try {
    const decodedToken =
      await adminAuth.verifyIdToken(token);

    return decodedToken.uid === cafeId;
  } catch (error) {
    console.error(
      "Cafe owner verification failed:",
      error
    );

    return false;
  }
}

/**
 * Convert Firestore timestamps and date values
 * into ISO strings for frontend use.
 */
function timestampToIso(
  value: unknown
): string | null {
  if (value == null) {
    return null;
  }

  try {
    if (value instanceof Timestamp) {
      return value.toDate().toISOString();
    }

    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) {
        return null;
      }

      return value.toISOString();
    }

    if (typeof value === "string") {
      const date = new Date(value);

      return Number.isNaN(date.getTime())
        ? null
        : date.toISOString();
    }

    if (typeof value === "number") {
      const date = new Date(value);

      return Number.isNaN(date.getTime())
        ? null
        : date.toISOString();
    }

    if (typeof value === "object") {
      const timestamp = value as {
        seconds?: number;
        _seconds?: number;
        toDate?: () => Date;
      };

      if (
        typeof timestamp.toDate === "function"
      ) {
        const date = timestamp.toDate();

        return date instanceof Date &&
          !Number.isNaN(date.getTime())
          ? date.toISOString()
          : null;
      }

      const seconds =
        timestamp.seconds ??
        timestamp._seconds;

      if (typeof seconds === "number") {
        const date = new Date(seconds * 1000);

        return Number.isNaN(date.getTime())
          ? null
          : date.toISOString();
      }
    }
  } catch (error) {
    console.error(
      "Date conversion failed:",
      error
    );
  }

  return null;
}

/**
 * Safely serialize a campaign document.
 */
function serializeCampaign(
  document: QueryDocumentSnapshot<DocumentData>
) {
  const data = document.data();

  return {
    ...data,
    id: document.id,

    createdAt: timestampToIso(data.createdAt),
    scheduledAt: timestampToIso(data.scheduledAt),
    sentAt: timestampToIso(data.sentAt),
    updatedAt: timestampToIso(data.updatedAt),
  };
}

/**
 * GET /api/push/campaigns?cafeId=...
 *
 * Load campaigns belonging to the authenticated cafe.
 */
export async function GET(
  request: NextRequest
) {
  try {
    const cafeId =
      request.nextUrl.searchParams
        .get("cafeId")
        ?.trim() ?? "";

    if (!cafeId) {
      return jsonResponse(
        {
          success: false,
          error: "Cafe ID is required.",
        },
        400
      );
    }

    const isOwner =
      await verifyCafeOwner(
        request,
        cafeId
      );

    if (!isOwner) {
      return jsonResponse(
        {
          success: false,
          error:
            "Unauthorized. Please sign in again.",
        },
        401
      );
    }

    const snapshot = await adminDb
      .collection("push_campaigns")
      .where("cafeId", "==", cafeId)
      .get();

    const campaigns = snapshot.docs
      .map((document) =>
        serializeCampaign(document)
      )
      .sort((a, b) => {
        const aTime = a.createdAt
          ? new Date(a.createdAt).getTime()
          : 0;

        const bTime = b.createdAt
          ? new Date(b.createdAt).getTime()
          : 0;

        return bTime - aTime;
      });

    return jsonResponse({
      success: true,
      campaigns,
    });
  } catch (error) {
    console.error(
      "Campaign list error:",
      error
    );

    return jsonResponse(
      {
        success: false,
        error:
          "Unable to load campaigns. Please try again.",
      },
      500
    );
  }
}

/**
 * POST /api/push/campaigns
 *
 * Create a draft or scheduled push campaign.
 */
export async function POST(
  request: NextRequest
) {
  try {
    let body: Record<string, unknown>;

    // Parse request body.
    try {
      const parsedBody: unknown =
        await request.json();

      if (
        !parsedBody ||
        typeof parsedBody !== "object" ||
        Array.isArray(parsedBody)
      ) {
        return jsonResponse(
          {
            success: false,
            error: "Invalid request body.",
          },
          400
        );
      }

      body =
        parsedBody as Record<string, unknown>;
    } catch {
      return jsonResponse(
        {
          success: false,
          error:
            "Request body must contain valid JSON.",
        },
        400
      );
    }

    const cafeId =
      typeof body.cafeId === "string"
        ? body.cafeId.trim()
        : "";

    const title =
      typeof body.title === "string"
        ? body.title.trim()
        : "";

    const message =
      typeof body.message === "string"
        ? body.message.trim()
        : "";

    const voucherId =
      typeof body.voucherId === "string" &&
      body.voucherId.trim()
        ? body.voucherId.trim()
        : null;

    const status =
      body.status === "scheduled"
        ? "scheduled"
        : "draft";

    const scheduledAt =
      typeof body.scheduledAt === "string"
        ? new Date(body.scheduledAt)
        : null;

    // Required fields.
    if (!cafeId || !title || !message) {
      return jsonResponse(
        {
          success: false,
          error:
            "Cafe ID, title, and message are required.",
        },
        400
      );
    }

    // Length validation.
    if (
      title.length > 100 ||
      message.length > 500
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "Title or message is too long.",
        },
        400
      );
    }

    // Validate scheduled date.
    if (
      status === "scheduled" &&
      (!scheduledAt ||
        Number.isNaN(
          scheduledAt.getTime()
        ))
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "A valid scheduled date is required.",
        },
        400
      );
    }

    // A scheduled campaign must be in the future.
    if (
      status === "scheduled" &&
      scheduledAt &&
      scheduledAt.getTime() <= Date.now()
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "Scheduled time must be in the future.",
        },
        400
      );
    }

    // Verify cafe owner.
    const isOwner =
      await verifyCafeOwner(
        request,
        cafeId
      );

    if (!isOwner) {
      return jsonResponse(
        {
          success: false,
          error:
            "Unauthorized. Please sign in again.",
        },
        401
      );
    }

    // Verify cafe exists.
    const cafeSnapshot = await adminDb
      .collection("public_cafes")
      .doc(cafeId)
      .get();

    if (!cafeSnapshot.exists) {
      return jsonResponse(
        {
          success: false,
          error: "Cafe not found.",
        },
        404
      );
    }

    let voucherCode: string | null = null;

    // Validate voucher if one was selected.
    if (voucherId) {
      const voucherSnapshot =
        await adminDb
          .collection("vouchers")
          .doc(voucherId)
          .get();

      if (!voucherSnapshot.exists) {
        return jsonResponse(
          {
            success: false,
            error:
              "The selected voucher was not found.",
          },
          404
        );
      }

      const voucher =
        voucherSnapshot.data();

      if (!voucher) {
        return jsonResponse(
          {
            success: false,
            error:
              "Unable to read the selected voucher.",
          },
          404
        );
      }

      // Check voucher ownership.
      if (voucher.cafeId !== cafeId) {
        return jsonResponse(
          {
            success: false,
            error:
              "This voucher does not belong to your cafe.",
          },
          403
        );
      }

      // Check active status.
      if (voucher.active !== true) {
        return jsonResponse(
          {
            success: false,
            error:
              "The selected voucher is inactive.",
          },
          400
        );
      }

      // Check expiry date.
      const expiryDate =
        typeof voucher.expiryDate === "string"
          ? voucher.expiryDate
          : "";

      const today = new Date()
        .toISOString()
        .slice(0, 10);

      if (
        expiryDate &&
        expiryDate < today
      ) {
        return jsonResponse(
          {
            success: false,
            error:
              "The selected voucher has expired.",
          },
          400
        );
      }

      // Check usage limit.
      const usageLimit = Number(
        voucher.usageLimit ?? 0
      );

      const usageCount = Number(
        voucher.usageCount ?? 0
      );

      if (
        usageLimit > 0 &&
        usageCount >= usageLimit
      ) {
        return jsonResponse(
          {
            success: false,
            error:
              "The selected voucher has reached its usage limit.",
          },
          400
        );
      }

      voucherCode =
        typeof voucher.code === "string"
          ? voucher.code
          : null;
    }

    // Save campaign.
    const now = Timestamp.now();

    const campaignRef = await adminDb
      .collection("push_campaigns")
      .add({
        cafeId,
        title,
        message,

        voucherId,
        voucherCode,

        status,

        scheduledAt:
          status === "scheduled" &&
          scheduledAt
            ? Timestamp.fromDate(
                scheduledAt
              )
            : null,

        createdAt: now,
        updatedAt: now,
        sentAt: null,

        sentCount: 0,
        failedCount: 0,
        error: null,
      });

    console.log(
      `Campaign created: ${campaignRef.id}. Status: ${status}.`
    );

    return jsonResponse({
      success: true,
      campaignId: campaignRef.id,
      message: "Campaign saved.",
    });
  } catch (error) {
    console.error(
      "Campaign creation error:",
      error
    );

    return jsonResponse(
      {
        success: false,
        error:
          "Unable to create campaign. Please try again.",
      },
      500
    );
  }
}