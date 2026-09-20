# 自动化用例全表

对照日期 2026-09-14，仓库内 `it(` 共 **374** 条（299 服务端 + 75 H5）。组合规则、手动走查顺序和截图见 [../FULL_TEST_CASES.md](../FULL_TEST_CASES.md)。

## `server/test/api.admin.test.js`

1. rejects bad admin password and user token
2. returns dashboard kpis
3. drafts route copy without a model key
4. creates updates and off-shelves a route
5. admin publishes schedule, updates cost, settles company group
6. uploads a route photo for admin
7. rejects admin schedule without route or bus

## `server/test/api.auth.test.js`

1. returns product meta
2. serves spa fallback for non-api get
3. rejects invalid phone for sms
4. registers with phone, image captcha and password then logs in
5. rejects login without captcha or with wrong password
6. logs in by sms and auto-creates user
7. wechat demo login
8. requires login for /me and updates profile from id card
9. deletes account and allows the same phone to register again

## `server/test/api.combo.test.js`

1. blocks opening a combo trip unless the user is a student or student org
2. lets approved students enroll and list partner conditions

## `server/test/api.coupon.test.js`

1. admin issues public coupon and short link redirects
2. rejects company tours and requires percent cap
3. claims once per user and decrements stock
4. applies coupon vs member as the lower price, never stacking
5. skips coupon when member 95% is cheaper or equal
6. does not redeem coupon when gift trip applies
7. holds coupon on waitlist and redeems after promote, releases on cancel
8. rejects company enroll with coupon and pauses new claims
9. lists unused coupons for the user
10. member-only campaign rejects non-members and directed needs grant
11. sets claim expiry and rejects after it lapses
12. lets a universal coupon apply on a personal trip but not a company tour
13. stacks coupon on member price when asked
14. filters claim by idle months and trip count
15. randomly grants when more people match than stock
16. issues a free coupon that zeros trip pay
17. searches people and grants by user id
18. guarantees selected users on a member-only coupon
19. reserves a claim slot for allowlisted users even before grant
20. pages people search so large member lists can be browsed
21. lets a public coupon designate people and still stay claimable
22. lists campus people by school and grants coupons to that roster

## `server/test/api.dissolve.test.js`

1. rejects dissolve without reason and by non-organizer
2. organizer dissolves, refunds paid seats and blocks new enroll
3. admin can publish and dissolve a group
4. admin can dissolve every active group at once

## `server/test/api.eligibility.test.js`

1. blocks non-students when the trip is student-only
2. restricts enrollment to listed schools
3. persists limits when admin publishes a trip
4. keeps combo rule when a user publishes a limited trip
5. blocks volunteer leaders who do not meet the school limit
6. lets a second student from another campus be rejected independently
7. still checks school limits on a free campus trip
8. requires school, college and student card on campus certification
9. lets alumni skip student number but still requires a card
10. restricts enrollment to a college and lets the organizer open more later
11. rejects narrowing a school-wide trip down to one college
12. does not treat same-named colleges at two schools as one college
13. matches mixed school-college pairs independently
14. checks major only when a campus target includes one
15. requires a school when opening a named college on a multi-school trip

## `server/test/api.enroll.test.js`

1. rejects incomplete enroll payload
2. individual enroll reserves a seat without wechat pay
3. user can cancel unpaid enrollment and rejoin
4. cancels paid enrollment as refunded and rejects others
5. releases guide when cancel drops below min group size
6. rejects cancel after trip has started
7. company enroll stays pending until organizer settles
8. joins waitlist when seats are full instead of rejecting
9. matches guide after min group size
10. buys membership via mock pay
11. applies one gift trip when member price is within 100
12. favorites crud
13. mock pay missing trade returns 400
14. requires emergency contact, health and waiver
15. city activity enrolls with name and phone only
16. lets a traveler apply as the trip photographer from the schedule page
17. rejects photographer enroll on a city activity

## `server/test/api.guide.test.js`

1. logs in by phone captcha, lists assigned trips and checks in

## `server/test/api.home.test.js`

1. returns home payload with cities, tags, festivals and durations
2. accepts student apply, feedback and photographer enroll waive
3. lists play tags publicly
4. admin can add a play tag
5. admin can update and retire a play tag
6. user publish waits for review and then appears
7. city activities stay off the trip list and route catalog

## `server/test/api.insurance.test.js`

1. lists plans in meta and adds fee to individual enroll

## `server/test/api.leader.test.js`

1. blocks volunteer apply until admin approves the leader role
2. exposes leader recruit copy and code after login
3. keeps company role when a company account is approved as leader
4. lets a rejected applicant submit again

## `server/test/api.lottery.test.js`

1. lets a user draw once before the trip
2. blocks complete and second draw until the trip day after joining
3. completes the trip then allows review, second draw and contest vote
4. lets a paid no-show draw after the trip without check-in or complete
5. lists lottery rows for the admin hub
6. lets admin configure per-trip prizes, rates and a designated winner
7. falls back when a limited prize is gone
8. lets a trip choose enroll-only draw and defers prizes until the trip ends
9. attaches a campaign when publishing with lotteryMode

## `server/test/api.notices.test.js`

1. pushes a campus notice that opens the verify page
2. keeps one unread campus notice per user and clears it after approve
3. notifies group certification and rejects a user token
4. notifies leader applications and opens the verify page

## `server/test/api.oversub.test.js`

1. confirms everyone when applicants do not exceed seats
2. draws when applicants exceed seats and promotes waitlist after a cancel
3. lets approved alumni join only when the trip allows alumni
4. keeps volunteer leaders out of the pending draw pool
5. persists oversub and alumni flags when admin publishes
6. turns on draw for a free campus trip and uses the school name

## `server/test/api.pay.test.js`

1. exposes app id on /meta while keeping mock pay in tests
2. binds wechat openid to a logged-in phone user
3. creates a JSAPI order then settles enrollment after notify
4. opens membership only after wechat query succeeds
5. rejects mock-success when live pay is on
6. asks for wechat login when live pay has no openid
7. refuses live pay when merchant key is missing
8. lets the traveler pay remaining and exposes a share token
9. lets a friend pay the remaining amount as 代付
10. accepts partial crowdfund payments until the fee is covered
11. refunds each crowdfund payer on cancel
12. rejects an unknown pay share token

## `server/test/api.wallet.test.js`

1. shows zero balance and accepts wechat mock topup
2. rejects bank cards and withdraws to wechat with a pin
3. pays enrollment from wallet and refunds back on cancel
4. credits referral rebate and personal bounty into the wallet

## `server/test/api.pulse.test.js`

1. masks names and city, formats relative time and ticker copy
2. lists a recent enrollment on home and hides full names
3. scopes route pulse and records named views with throttle
4. does not invent anonymous browse lines or unknown targets
5. keeps activity enrollments off the home ticker
6. includes reviews and newly opened trips

## `server/test/api.refund.test.js`

1. exposes default global refund ladder on meta and route detail
2. saves global rules and per-route override
3. refunds a paid cancel by ladder and blocks after the trip starts

## `server/test/pay-ledger.test.js`

1. splits a refund across payers with largest remainder
2. parses integer pay amounts against remaining
3. labels self pay, proxy pay and crowdfund

## `server/test/api.reviews.test.js`

1. rejects review unless the user has a joined seat
2. accepts one review per trip and lists it on the route
3. blocks waitlisted and cancelled enrollments
4. lets admin post virtual-user reviews onto a route

## `server/test/api.routes.test.js`

1. lists buses and guides
2. filters routes by days and keyword
3. returns route detail, 404, and favored flag
4. lists and details schedules with masked chain names
5. share token redirects; invalid token 404
6. creates individual and company schedules
7. returns poster qr（封面内嵌 data URL）

## `server/test/api.seats.test.js`

1. builds a 2+2 coach map
2. auto-assigns the first free seat and rejects a taken one

## `server/test/api.social.test.js`

1. exposes official accounts, rules and leader copy on /meta
2. opens the new organizer homepage after the old account was closed
3. returns album and trip buckets on public user homepage
4. lets an enrolled user pick a seat and blocks guests
5. accepts two volunteer leaders and shows empty slot as apply-able
6. records 5% referral on successful enroll
7. moves enrollment to a candidate group when the original dissolves
8. lets ops set realistic virtual enrollments on a schedule and yield seats to real users
9. lets ops grow a shared virtual pool and assign the same people across trips

## `server/test/api.split.test.js`

1. splits company settlement among platform, guide and merchant

## `server/test/api.staff.test.js`

1. returns current admin profile and lists staff
2. creates operator, forbids staff APIs, then admin can update disable and delete
3. rejects deleting or disabling the last admin and self
4. changes own password and rejects wrong old password
5. searches users, grants and revokes membership, adjusts points, closes account
6. admin can cancel another user's enrollment
7. lets leaders lock seats but blocks photographers from money and staff

## `server/test/api.supplies.test.js`

1. lists supplies in meta and adds fee to enroll

## `server/test/api.trip.test.js`

1. exposes bus seats/photos, precise meetup, hourly weather and contacts
2. shows age band on roster, public user page without phone, and allows anyone to pay unpaid
3. lets admin lock a seat and swap two passengers
4. lets assigned guide lock seats

## `server/test/api.waitlist.test.js`

1. joins waitlist when the bus is full and promotes after a cancel
2. does not occupy a seat while waitlisted

## `server/test/app.test.js`

1. can disable spa fallback

## `server/test/auth.middleware.test.js`

1. signs user and admin tokens with distinct typ
2. rejects missing token
3. rejects admin token on user routes
4. rejects expired token
5. accepts query token and sets userId
6. rejects deleted account token
7. continues without token
8. ignores bad token
9. sets userId for valid user token
10. rejects missing and user tokens
11. rejects expired admin token
12. accepts admin token
13. rejects disabled admin token

## `server/test/biz.test.js`

1. sorts by minPeople and keeps the highest unlocked tier
2. uses member price and 100 points = 1 yuan
3. caps offset at 20% and leaves at least 1 yuan
4. does not use member price for non-members
5. applies optional maxAmount cap
6. gives member 1.2x bonus
7. returns finished / full / confirmed / recruiting
8. masks names of various lengths
9. keeps prefix and suffix of a mainland mobile
10. aggregates gender, age and hometown from id cards
11. falls back to birthday when id card is invalid
12. uses parsed age bucket when age is not numeric
13. counts unknown gender for empty list fields

## `server/test/captcha.test.js`

1. creates a png data url without leaking the code in json fields
2. matches codes case-insensitively and rejects empties
3. draws only supported characters

## `server/test/config.test.js`

1. uses isolated temp dirs injected by setup-env

## `server/test/coupons.service.test.js`

1. applies percent as pay rate with cap
2. applies amount off and floor
3. zeros trip pay for a free coupon
4. takes the lower of coupon and member unless stacking
5. sets expiry from valid hours

## `server/test/db.test.js`

1. maps route rows and JSON fields
2. resetDb closes the singleton so getDb reopens
3. dedupes payment trade_no before unique index so startup does not crash

## `server/test/helpers.service.test.js`

1. isMember respects expiry
2. loads route bundle and quotes member vs origin price
3. counts enrollments excluding cancelled
4. matches guide when min group size is reached
5. confirms without guide when roster is empty
6. returns undefined for missing schedule
7. confirms when the route row is missing
8. adds points ledger entries
9. attaches asset host for relative urls
10. rewrites loopback media urls using forwarded host

## `server/test/idcard.test.js`

1. rejects empty and short values
2. rejects 15-digit legacy numbers
3. rejects invalid birthday and checksum
4. parses Beijing male card
5. parses female card and Hebei hometown
6. accepts lowercase x and spaces
7. falls back to unknown province
8. masks middle digits
9. returns short or empty as-is
10. covers every defined bucket and overflow

## `server/test/image-helpers.test.js`

1. renders svg cover with title and days
2. writes svg files for all seed routes
3. falls back to svg when photos are missing
4. uses local jpg for cover and gallery
5. downloadPhotos skips failed and tiny responses
6. downloadPhotos writes large jpeg files

## `server/test/oversub.service.test.js`

1. keeps a copy and can be made deterministic

## `server/test/policy.test.js`

1. splits equipment into packing items and builds a map search url
2. exposes cancel policy, waiver and faqs on /meta

## `server/test/refund.test.js`

1. matches default tiers by days left before start
2. rejects incomplete or duplicate tiers
3. writes proportion copy from the default ladder

## `server/test/route-draft.test.js`

1. infers category and strips day words from the title
2. writes a usable template when no model key is set
3. uses overnight itinerary and 进阶 when the title says so
4. parses model JSON even when wrapped in fences
5. fills missing model fields from the template
6. returns null from llmDraft when no key or the request fails
7. reads a chat completion payload
8. filters unusable search photos
9. matches known places and searches Chinese names, not district names
10. reuses local place photos when the title hits a known album
11. downloads usable Baidu photos and skips junk
12. returns no photos when remote search fails
13. falls back to the local album when remote search is blocked
14. downloads 360 photos when Baidu has nothing
15. skips a file when the image url is missing or the download throws
16. does not hit the network during unit tests without a fetch mock
17. returns null when the model answers with non-json
18. rejects a blank title
19. uses the template and injected photos
20. keeps copy when the model works and photos fail
21. drafts from the template without live net in unit tests
22. falls back to the template when the model throws

## `server/test/share-poster.test.js`

1. encodes and decodes a compact mini-program scene with ref
2. builds h5 query and mini path with referral code
3. embeds a local cover so SVG used as an image can show the photo
4. skips embed when the cover file is missing

## `server/test/routes-data.test.js`

1. contains 30 unique route codes
2. only uses 1/2/3/5 day products
3. uses distinct covers for Mutianyu and Badaling
4. gives every Great Wall route a unique cover key
5. uses Wutai cover for R29
6. does not use generic Unsplash or Forbidden City photos as covers
7. defines four Beijing meetup points

## `server/test/story.service.test.js`

1. drops empty blocks and keeps text then image
2. weaves description paragraphs with the first gallery photos
3. prefers a saved story over the auto weave
4. keeps an optional photo on each itinerary stop

## `server/test/video.test.js`

1. keeps http urls and drops scripts
2. embeds a Bilibili BV share link
3. embeds a Bilibili av link
4. falls back to an open link for b23 short urls
5. embeds youtube and plays a direct mp4
6. caps the list and skips duplicates

## `server/test/weather.test.js`

1. maps suburban regions and returns stable mock forecast
2. serves GET /weather

## `server/test/wechat.test.js`

1. generates stable openid from code
2. code2session returns demo session without AppSecret
3. code2session stays mock when pay mock is off but secret is demo
4. code2session calls wechat when AppSecret is configured
5. mockPrepay returns demo pay params
6. signs and parses wechat xml
7. refunds as mock when live pay is off

## `web/src/utils/activityKind.test.js`

1. reads kind from title or play tags
2. filters a list by kind
3. formats date blocks
4. detects dates in the current week

## `web/src/utils/auth.test.js`

1. allows access when token exists
2. replaces to login with redirect query when logged out
3. falls back to /m/mine when fullPath is missing

## `web/src/utils/chinaAreas.test.js`

1. shortens province and county suffixes
2. flattens municipalities and province-owned counties
3. builds a tree from raw pca json
4. formats a cascader path
5. maps old seed labels and slash paths back to cascader values
6. maps extra labels and leaves mixed custom text unmapped

## `web/src/utils/couponTime.test.js`

1. counts remaining time against claim expiry
2. marks expired instances
3. keeps unused coupons that still have time

## `web/src/utils/feedCard.test.js`

1. formats date time like a feed line
2. prefers boarded count, then remaining seats
3. picks host, cover, tagline and free price

## `web/src/utils/feedList.test.js`

1. keeps full trips for waitlist instead of dropping remain=0
2. drops cancelled and pending review
3. searches title, city and host
4. sorts by soon, filling, newest
5. filters company, campus and a named school
6. cycles sort labels

## `web/src/utils/media.test.js`

1. keeps site-relative static paths
2. builds css background and svg fallback
3. opens the matching route from a home slide

## `web/src/utils/pulse.test.js`

1. reuses the same visitor id and builds ticker links

## `web/src/utils/routeMeta.test.js`

1. lists the types and difficulties used by existing routes
2. keeps preset order and appends extras already on a route
3. fills member price at 95 percent
4. starts a new route with four people brackets
5. reads both camelCase and snake_case rows and drops empty people
6. keeps meetup name and drops blank rows

## `web/src/utils/scanFacts.test.js`

1. keeps full trips as waitlist people line
2. shows pay / cancel / insurance chips
3. builds dock price and enroll CTA
4. turns enroll and publish into ticket states
5. joins date and meetup time

## `web/src/utils/share.test.js`

1. does not use system share inside WeChat webview
2. builds a schedule share url with optional token
3. writes invite copy for the poster card
4. builds a pay share link and copy

## `web/src/utils/story.test.js`

1. interleaves paragraphs and photos
2. hides photos already used in the story

## `web/src/utils/trips.test.js`

1. puts future joined trips in upcoming, cancelled and past in history
2. keeps waitlist out of 待出行
3. treats today as upcoming
4. labels activity vs outdoor

## `web/src/utils/weatherChart.test.js`

1. builds a smooth path from hourly temps
2. returns null without temperatures

## `web/src/utils/wechatPay.test.js`

1. is false for mock or completed pay
2. is true when the server returns a real JSAPI package

## `web/src/utils/idcard.test.js`

1. normalizes spaces and lowercase x
2. accepts a Beijing male card used by enroll
3. rejects empty, 15-digit and bad checksum
4. rejects impossible birthdays

## `web/src/utils/labels.test.js`

1. clamps star ratings to five glyphs
2. maps gender and insurance codes
3. labels enroll and pay states including oversub pending
4. shortens organizer type and schedule status

## `web/src/utils/offer.test.js`

1. returns the matching offer including campus-style free
2. falls back when the key is missing

## `web/src/utils/pageChrome.test.js`

1. sets and clears the mobile title bar
2. defaults both fields to empty

## `web/src/utils/phone.test.js`

1. builds a tel link for mainland mobiles
2. allows international numbers and rejects junk

## `web/src/utils/staff.test.js`

1. labels known roles and defaults unknown to super admin copy
2. gives admin every cap and photographer only roster and photo
3. prefers explicit caps on the session over the role map
