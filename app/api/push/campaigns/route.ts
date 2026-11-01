import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getApp } from "firebase-admin/app";
import {
  Timestamp,
  type DocumentData,
} from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase-admin";


async function verifyCafeOwner(
  request: NextRequest,
  cafeId: string
) {
  const authorization =
    request.headers.get("authorization");

  if (
    !authorization?.startsWith("Bearer ")
  ) {
    return false;
  }

  const token = authorization.slice(
    "Bearer ".length
  );

  try {
    const decodedToken =
      await getAuth(
        getApp("cafeflow-admin")
      ).verifyIdToken(token);

    // In the current CafeFlow setup,
    // the owner's Firebase UID is the cafeId.
    return decodedToken.uid === cafeId;
  } catch (error) {
    console.error(
      "Cafe owner verification failed:",
      error
    );

    return false;
  }
}

// Convert Firestore timestamps to ISO strings
// so the frontend can display dates consistently.
function timestampToIso(
  value: unknown
): string | null {
  if (!value) {
    return null;
  }

  if (
    value instanceof Timestamp
  ) {
    return value.toDate().toISOString();
  }

  if (
    value instanceof Date
  ) {
    return Number.isNaN(
      value.getTime()
    )
      ? null
      : value.toISOString();
  }

  if (
    typeof value === "string"
  ) {
    const date = new Date(value);

    return Number.isNaN(
      date.getTime()
    )
      ? null
      : date.toISOString();
  }

  if (
    typeof value === "object"
  ) {
    const timestamp =
      value as {
        seconds?: number;
        _seconds?: number;
        toDate?: () => Date;
      };

    if (
      typeof timestamp.toDate === "function"
    ) {
      const date =
        timestamp.toDate();

      return Number.isNaN(
        date.getTime()
      )
        ? null
        : date.toISOString();
    }

    const seconds =
      timestamp.seconds ??
      timestamp._seconds;

    if (
      typeof seconds === "number"
    ) {
      const date =
        new Date(seconds * 1000);

      return Number.isNaN(
        date.getTime()
      )
        ? null
        : date.toISOString();
    }
  }

  return null;
}

function serializeCampaign(
  document: {
    id: string;
    data: () => DocumentData;
  }
) {
  const data = document.data();

  return {
    id: document.id,
    ...data,
    createdAt:
      timestampToIso(data.createdAt),
    scheduledAt:
      timestampToIso(data.scheduledAt),
    sentAt:
      timestampToIso(data.sentAt),
    updatedAt:
      timestampToIso(data.updatedAt),
  };
}

export async function GET(
  request: NextRequest
) {
  try {
    const cafeId =
      request.nextUrl.searchParams
        .get("cafeId")
        ?.trim();

    if (!cafeId) {
      return NextResponse.json(
        {
          error:
            "Cafe ID is required.",
        },
        { status: 400 }
      );
    }

    const isOwner =
      await verifyCafeOwner(
        request,
        cafeId
      );

    if (!isOwner) {
      return NextResponse.json(
        {
          error: "Unauthorized.",
        },
        { status: 401 }
      );
    }

    const snapshot =
      await adminDb
        .collection("push_campaigns")
        .where(
          "cafeId",
          "==",
          cafeId
        )
        .get();

    const campaigns =
      snapshot.docs
        .map((document) =>
          serializeCampaign(document)
        )
        .sort(
          (a, b) => {
            const aTime =
              a.createdAt
                ? new Date(
                    a.createdAt
                  ).getTime()
                : 0;

            const bTime =
              b.createdAt
                ? new Date(
                    b.createdAt
                  ).getTime()
                : 0;

            return bTime - aTime;
          }
        );

    return NextResponse.json({
      success: true,
      campaigns,
    });
  } catch (error) {
    console.error(
      "Campaign list error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to load campaigns.",
      },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest
) {
  try {
    const body =
      await request.json();

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
    if (
      !cafeId ||
      !title ||
      !message
    ) {
      return NextResponse.json(
        {
          error:
            "Cafe ID, title, and message are required.",
        },
        { status: 400 }
      );
    }

    // Length validation.
    if (
      title.length > 100 ||
      message.length > 500
    ) {
      return NextResponse.json(
        {
          error:
            "Title or message is too long.",
        },
        { status: 400 }
      );
    }

    // Validate scheduled date.
    if (
      status === "scheduled" &&
      (
        !scheduledAt ||
        Number.isNaN(
          scheduledAt.getTime()
        )
      )
    ) {
      return NextResponse.json(
        {
          error:
            "A valid scheduled date is required.",
        },
        { status: 400 }
      );
    }

    // A scheduled campaign must be in the future.
    if (
      status === "scheduled" &&
      scheduledAt &&
      scheduledAt.getTime() <=
        Date.now()
    ) {
      return NextResponse.json(
        {
          error:
            "Scheduled time must be in the future.",
        },
        { status: 400 }
      );
    }

    // Verify owner.
    const isOwner =
      await verifyCafeOwner(
        request,
        cafeId
      );

    if (!isOwner) {
      return NextResponse.json(
        {
          error: "Unauthorized.",
        },
        { status: 401 }
      );
    }

    // Verify cafe exists.
    const cafeSnapshot =
      await adminDb
        .collection("public_cafes")
        .doc(cafeId)
        .get();

    if (!cafeSnapshot.exists) {
      return NextResponse.json(
        {
          error: "Cafe not found.",
        },
        { status: 404 }
      );
    }

    let voucherCode:
      string | null = null;

    // Validate voucher if selected.
    if (voucherId) {
      const voucherSnapshot =
        await adminDb
          .collection("vouchers")
          .doc(voucherId)
          .get();

      if (
        !voucherSnapshot.exists
      ) {
        return NextResponse.json(
          {
            error:
              "The selected voucher was not found.",
          },
          { status: 404 }
        );
      }

      const voucher =
        voucherSnapshot.data();

      if (!voucher) {
        return NextResponse.json(
          {
            error:
              "Unable to read the selected voucher.",
          },
          { status: 404 }
        );
      }

      // Check voucher ownership.
      if (
        voucher.cafeId !== cafeId
      ) {
        return NextResponse.json(
          {
            error:
              "This voucher does not belong to your cafe.",
          },
          { status: 403 }
        );
      }

      // Check active status.
      if (
        voucher.active !== true
      ) {
        return NextResponse.json(
          {
            error:
              "The selected voucher is inactive.",
          },
          { status: 400 }
        );
      }

      // Check expiry date.
      const expiryDate =
        typeof voucher.expiryDate === "string"
          ? voucher.expiryDate
          : "";

      const today =
        new Date()
          .toISOString()
          .slice(0, 10);

      if (
        expiryDate &&
        expiryDate < today
      ) {
        return NextResponse.json(
          {
            error:
              "The selected voucher has expired.",
          },
          { status: 400 }
        );
      }

      // Check usage limit.
      const usageLimit =
        Number(
          voucher.usageLimit ?? 0
        );

      const usageCount =
        Number(
          voucher.usageCount ?? 0
        );

      if (
        usageLimit > 0 &&
        usageCount >= usageLimit
      ) {
        return NextResponse.json(
          {
            error:
              "The selected voucher has reached its usage limit.",
          },
          { status: 400 }
        );
      }

      voucherCode =
        typeof voucher.code === "string"
          ? voucher.code
          : null;
    }

    // Save campaign.
    const now = Timestamp.now();

    const campaignRef =
      await adminDb
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

    return NextResponse.json({
      success: true,
      campaignId:
        campaignRef.id,
      message:
        "Campaign saved.",
    });
  } catch (error) {
    console.error(
      "Campaign creation error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to create campaign.",
      },
      { status: 500 }
    );
  }
}

