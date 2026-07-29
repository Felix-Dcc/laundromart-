# LaundroMart — Google Play listing pack

Copy-paste these into the Play Console. Feature graphic is `feature-graphic.png`
(1024×500) in this folder.

## Short description (max 80 chars)
On-demand laundry pickup & delivery with live rider tracking and easy payment.

## Full description (max 4000 chars)
LaundroMart brings your neighbourhood laundry service to your phone. Book a
pickup, track your rider on a live map, and pay securely — all in a few taps.

HOW IT WORKS
1. Choose a laundromat — browse verified laundry services near you, with
   ratings, distance and opening hours.
2. Book a pickup — set your service type, weight estimate, address and time.
   A nearby rider is dispatched to collect your laundry.
3. Relax and track — follow your rider live on the map. When the laundromat
   weighs your items, you get the exact final price before you pay.
4. Pay your way — Mobile Money (MTN, Vodafone, AirtelTigo) or card, powered by
   Paystack. Your clean laundry is delivered back to your door.

WHY LAUNDROMART
• Live rider tracking — see exactly where your laundry is, in real time.
• Transparent pricing — no surprises. You approve the final weight-based price
  before any payment.
• Secure payments — Mobile Money and card, handled by Paystack.
• Real-time updates — push notifications at every step, from pickup to delivery.
• Verified providers — every laundromat is approved before it appears.
• Ratings & reviews — rate your service and help others choose.

Built for busy people — students, professionals and households — who would
rather spend their time on what matters. Skip the queue, skip the trip, and let
LaundroMart handle the laundry.

## App access (reviewer test credentials)
The app requires sign-in. Provide these in Play Console → App content → App access:
- Email: customer@lms.com
- Password: password123
(A demo customer account with data to review. Confirm it still works before you
submit; reset via the admin dashboard if needed.)

## Data safety form — answer key
Play Console → App content → Data safety. Answer per what the app actually does:

- Does your app collect or share user data? → YES
- Is all data encrypted in transit? → YES (all traffic is HTTPS)
- Do you provide a way to request data deletion? → see NOTE below

Data types COLLECTED (purpose = App functionality; not shared for ads):
- Location → Precise location. (GPS for nearby laundromats + live rider tracking.)
- Personal info → Name, Email address, Phone number, Address.
- Financial info → Payment info + Purchase history. (Card details are entered in
  Paystack's secure flow — the app itself does not store card numbers.)
- App activity → your order history within the app.

Third parties that process data on your behalf (declare as processors, not
"shared for their own use"):
- Paystack — payment processing.
- Google Maps Platform — maps, geocoding, directions (uses location).
- Expo / FCM & APNs — push notifications (device token).

For each type, typical answers: Collected = Yes, Shared = No, Processed
ephemerally = No, Required (not optional) = Yes for the ones core to the service
(location, name, phone, payment), Optional for the rest.

⚠️ NOTE — account deletion: Google requires either in-app account deletion OR a
web URL where users can request deletion. Confirm the app/website offers this; if
not, add a simple "Delete my account" flow or a deletion-request page and put its
URL in the form. This is a common submission blocker.

## Other declarations (quick answers)
- Ads → No (the app shows no ads).
- Content rating questionnaire → no mature content → rates Everyone / PEGI 3.
- Target audience → 18+ (the app handles payments).
- Financial features → Yes, facilitates payments (via Paystack). Not a lending/
  banking app.
- Government app → No.
- Privacy policy URL → REQUIRED. Host one and paste the URL. (Must mention the
  data types above and how they're used.)
