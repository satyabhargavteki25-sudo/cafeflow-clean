# CafeFlow MVP Execution Plan

## Business Target
- 10 paying cafes/restaurants
- ₹1,999 per cafe per month
- Target MRR: ₹19,990
- MVP infrastructure budget: ₹0
- Firebase Spark Plan

## Technology
- Next.js App Router
- TypeScript
- Tailwind CSS
- Firebase Authentication
- Cloud Firestore

## Completed
- Firebase project created: cafe-review-saas
- Firebase Authentication configured
- Firestore database created
- Firebase client configuration created
- Login and signup implemented
- Owner dashboard implemented
- My Cafe page implemented
- Firestore security rules published
- Cafe profile saved successfully

## Current Phase
Phase 1 - Security Foundation

## Execution Roadmap
1. Review Firestore security rules
2. Protect cafe owner data
3. Separate private cafe profiles from public branding
4. Build customer feedback page
5. Add Google Review action tracking
6. Add loyalty voucher claiming
7. Build owner feedback triage dashboard
8. Add QR code generation
9. Test with real cafes
10. Prepare for first paying customers

## Important Architecture
- Private cafe profiles: cafes/{cafeId}
- Public cafe branding: public_cafes/{cafeId}
- Customer feedback: feedback/{feedbackId}
- Engagement telemetry: engagement_logs/{logId}
- Every feedback and engagement record must contain cafeId.
- Firestore Security Rules must enforce tenant isolation.
- Never rely only on frontend filtering for security.

## Current Next Task
Update app/my-cafe/page.tsx to save public cafe branding separately.
Then build app/c/[cafeId]/page.tsx.
