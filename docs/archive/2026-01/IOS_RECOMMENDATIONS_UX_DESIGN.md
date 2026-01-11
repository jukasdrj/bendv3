# iOS Recommendations UX/UI Design - books-v3

**Target**: iOS app (SwiftUI + Capacitor)
**Goal**: Seamlessly integrate personalized recommendations into existing library experience
**Principle**: "Discover → Save → Rate → Discover more"

---

## Design Philosophy

**Core Insight**: Your wife uses this to track her library and discover what to read next. Recommendations should feel like a natural extension of her reading journey, not a separate feature.

**Key Principles**:
1. **Contextual Discovery** - Show recommendations where she's already browsing
2. **Low Friction** - One tap to save a book, one tap to rate
3. **Trust Building** - Show why we recommend each book
4. **Progressive Enhancement** - Works great with 3 ratings, better with 10+

---

## Navigation Integration

### Option A: Tab Bar Item (RECOMMENDED)
```
┌─────────────────────────────────────┐
│           App Header                │
├─────────────────────────────────────┤
│                                     │
│        Main Content Area            │
│                                     │
├─────────────────────────────────────┤
│  [Library] [Search] [✨] [Profile] │
└─────────────────────────────────────┘
         ^            ^
      Current    NEW: Discover
```

**Rationale**:
- Primary feature deserves primary placement
- iOS users expect tab bar for main sections
- "Discover" or "For You" with sparkle icon ✨
- Always accessible, no hunting in menus

**Tab Icon Ideas**:
- ✨ Sparkle (magical recommendations)
- 🎯 Target (personalized for you)
- 💡 Light bulb (discover new ideas)
- 🔮 Crystal ball (what's next)

### Option B: Prominent Menu Item
```
[≡] Menu
  → My Library
  → ✨ Discover Books (new!)
  → Search
  → Settings
```

**Rationale**:
- Less UI change (no new tab)
- Clear "this is new!" positioning
- Can add badge notification
- Good for slower adoption

---

## Main Screens

### 1. Discover / For You Screen

**Purpose**: Primary recommendations destination

```
┌─────────────────────────────────────┐
│  ← For You                    [⚙︎]  │ Settings (preferences)
├─────────────────────────────────────┤
│                                     │
│  📚 10 books picked for you         │
│  Based on your 15 ratings           │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ 🖼️     Harry Potter and the   │ │
│  │      Prisoner of Azkaban      │ │
│  │                               │ │
│  │  J.K. Rowling                 │ │
│  │  ⭐️ 87% match                 │ │
│  │                               │ │
│  │  ✓ Fantasy, magic, wizards    │ │
│  │  ✓ 3 shared themes            │ │
│  │                               │ │
│  │  [+ Add to Library]  [›]      │ │ View details
│  └───────────────────────────────┘ │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ 🖼️     Next recommendation    │ │
│  │       ...                     │ │
│  └───────────────────────────────┘ │
│                                     │
│  [Load More]                        │
│                                     │
└─────────────────────────────────────┘
```

**Key Features**:
- **Match score** - Large, prominent (builds trust)
- **Reasons** - Why we recommend it (transparency)
- **Quick actions** - Add without leaving page
- **Visual hierarchy** - Cover → Title → Why → Action
- **Pull to refresh** - Get fresh recommendations

**States**:
- **Loading**: Skeleton cards with shimmer
- **Empty (Cold Start)**: "Let's get started!" → Genre picker
- **Empty (No Matches)**: "Broaden your preferences" → Settings
- **Error**: "Can't load recommendations" → Retry button

---

### 2. Book Detail View (Enhanced)

**Purpose**: When user taps a recommendation for more info

```
┌─────────────────────────────────────┐
│  ← Back                             │
├─────────────────────────────────────┤
│        🖼️ Large Cover               │
│                                     │
│  Harry Potter and the Prisoner...  │
│  J.K. Rowling                       │
│                                     │
│  ⭐️ 87% match for you              │ ← New badge
│  ✓ Fantasy, magic, wizards          │ ← Reasons
│                                     │
│  ─────────────────────────────────  │
│                                     │
│  📖 309 pages                       │
│  📅 Published 1999                  │
│  🏢 Scholastic                      │
│                                     │
│  ─────────────────────────────────  │
│                                     │
│  Description...                     │
│                                     │
│  ─────────────────────────────────  │
│                                     │
│  [+ Add to Library]                 │ ← Primary CTA
│                                     │
└─────────────────────────────────────┘
```

**New Elements**:
- **Match badge** - "87% match for you" (only on recommended books)
- **Match reasons** - Why it's recommended (checkmarks)
- **Contextual CTA** - "Add to Library" if not owned

---

### 3. Library View (Enhanced with Recommendations)

**Purpose**: Surface recommendations in context of existing library

**Option A: Dedicated Section**
```
┌─────────────────────────────────────┐
│  My Library                   [+]   │
├─────────────────────────────────────┤
│                                     │
│  📚 Currently Reading (2)           │
│  ┌─────┐ ┌─────┐                   │
│  │ 🖼️  │ │ 🖼️  │                   │
│  └─────┘ └─────┘                   │
│                                     │
│  ✨ Recommended for You      [See all] │
│  ┌─────┐ ┌─────┐ ┌─────┐           │
│  │ 🖼️  │ │ 🖼️  │ │ 🖼️  │           │
│  │87%  │ │82%  │ │78%  │           │
│  └─────┘ └─────┘ └─────┘           │
│                                     │
│  📖 Want to Read (15)               │
│  ┌─────┐ ┌─────┐                   │
│  │ 🖼️  │ │ 🖼️  │                   │
│  └─────┘ └─────┘                   │
│                                     │
└─────────────────────────────────────┘
```

**Rationale**:
- Discovers books while browsing library
- Natural "what's next?" moment
- Horizontal scroll = quick preview
- [See all] → Full recommendations screen

**Option B: Smart Banner**
```
┌─────────────────────────────────────┐
│  My Library                   [+]   │
├─────────────────────────────────────┤
│  ┌─────────────────────────────────┐│
│  │ ✨ 3 new books for you  [View] ││ Dismissible
│  └─────────────────────────────────┘│
│                                     │
│  📚 Currently Reading (2)           │
│  ┌─────┐ ┌─────┐                   │
│  │ 🖼️  │ │ 🖼️  │                   │
│  └─────┘ └─────┘                   │
│                                     │
└─────────────────────────────────────┘
```

**Rationale**:
- Less intrusive
- Notification-style (creates urgency)
- Can be dismissed if not interested
- Weekly refresh keeps it relevant

---

### 4. Book Detail View - Rate & Improve

**Purpose**: After user reads a book, encourage rating

**Context: User viewing a book in their library**
```
┌─────────────────────────────────────┐
│  ← Back                             │
├─────────────────────────────────────┤
│        🖼️ Cover                     │
│                                     │
│  Harry Potter and the...            │
│  J.K. Rowling                       │
│                                     │
│  In your library since Jan 2026     │
│                                     │
│  ─────────────────────────────────  │
│                                     │
│  📖 How was it?                     │
│  ⭐️ ⭐️ ⭐️ ⭐️ ⭐️                    │ Star rating
│      (Tap to rate)                  │
│                                     │
│  💡 Rating helps us recommend       │
│     books you'll love               │
│                                     │
└─────────────────────────────────────┘
```

**After Rating (Confirmation + Upsell)**:
```
┌─────────────────────────────────────┐
│  ✓ Rated 5 stars!                  │
│                                     │
│  🎯 Your recommendations are now    │
│     even better!                    │
│                                     │
│  [See What We Recommend]            │ ← Navigate to Discover
│                                     │
│  [Maybe Later]                      │
└─────────────────────────────────────┘
```

**Smart Timing**:
- Show rating prompt when:
  - User marks book as "Read"
  - User hasn't rated in 3+ days
  - User visits book detail 3+ times (implies interest)

---

### 5. Onboarding Flow (First Time User)

**Purpose**: Collect initial preferences to enable cold start recommendations

**Screen 1: Welcome**
```
┌─────────────────────────────────────┐
│                                     │
│         ✨                          │
│                                     │
│     Discover Your Next              │
│     Favorite Book                   │
│                                     │
│  We'll recommend books based on     │
│  your tastes. Let's get started!    │
│                                     │
│                                     │
│  [Let's Go!]                        │
│                                     │
│  [Skip for Now]                     │
│                                     │
└─────────────────────────────────────┘
```

**Screen 2: Pick Genres (Required)**
```
┌─────────────────────────────────────┐
│  ← Back              Skip →          │
├─────────────────────────────────────┤
│  What do you like to read?          │
│  (Pick at least 3)                  │
│                                     │
│  ┌─────────┐ ┌─────────┐           │
│  │✓ Fantasy│ │ Mystery │           │ Chip style
│  └─────────┘ └─────────┘           │ Tappable
│  ┌─────────┐ ┌─────────┐           │
│  │✓ Romance│ │Thriller │           │
│  └─────────┘ └─────────┘           │
│  ┌─────────┐ ┌─────────┐           │
│  │ Sci-Fi  │ │✓ History│           │
│  └─────────┘ └─────────┘           │
│  ┌─────────┐ ┌─────────┐           │
│  │Biography│ │ Horror  │           │
│  └─────────┘ └─────────┘           │
│                                     │
│  [Continue] (3 selected)            │ Disabled until 3 picked
│                                     │
└─────────────────────────────────────┘
```

**Screen 3: Reading Mood (Optional)**
```
┌─────────────────────────────────────┐
│  ← Back              Skip →          │
├─────────────────────────────────────┤
│  What's your reading mood?          │
│  (Optional)                         │
│                                     │
│  ○ 🌟 Light & Fun                  │
│  ○ 🌑 Dark & Intense               │
│  ● 🗡️ Epic Adventures              │ Selected
│  ○ ☕️ Cozy & Comforting           │
│  ○ ⚡️ Thrilling & Fast-paced      │
│                                     │
│  [Continue]                         │
│                                     │
└─────────────────────────────────────┘
```

**Screen 4: First Recommendations!**
```
┌─────────────────────────────────────┐
│  🎉 Here are your first picks!      │
├─────────────────────────────────────┤
│                                     │
│  ┌───────────────────────────────┐ │
│  │ 🖼️ Book 1                     │ │
│  │ ⭐️ Great match                │ │
│  │ [+ Add]                       │ │
│  └───────────────────────────────┘ │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ 🖼️ Book 2                     │ │
│  │ ⭐️ Great match                │ │
│  │ [+ Add]                       │ │
│  └───────────────────────────────┘ │
│                                     │
│  💡 Tip: Rate books you've read    │
│     to get even better picks!      │
│                                     │
│  [See All Recommendations]          │
│  [Go to My Library]                 │
│                                     │
└─────────────────────────────────────┘
```

**Onboarding Triggers**:
- First app launch
- User has no preferences set
- User taps "Get Started" button
- Can be skipped (don't force it)

---

### 6. Settings / Preferences Screen

**Purpose**: Manage recommendation preferences

```
┌─────────────────────────────────────┐
│  ← Settings                         │
├─────────────────────────────────────┤
│  Recommendation Preferences         │
│                                     │
│  ─────────────────────────────────  │
│                                     │
│  📚 Favorite Genres                │
│  Fantasy, Mystery, Romance          │
│  [Edit]                             │
│                                     │
│  ─────────────────────────────────  │
│                                     │
│  🎭 Reading Mood                   │
│  Epic Adventures                    │
│  [Change]                           │
│                                     │
│  ─────────────────────────────────  │
│                                     │
│  📖 Book Length                    │
│  Any length                         │
│  [Set Range] (e.g., 200-400 pages) │
│                                     │
│  ─────────────────────────────────  │
│                                     │
│  📅 Publication Year               │
│  Any year                           │
│  [Set Range] (e.g., 2010-2024)     │
│                                     │
│  ─────────────────────────────────  │
│                                     │
│  🚫 Exclude Genres                 │
│  None                               │
│  [Add Exclusions]                   │
│                                     │
│  ─────────────────────────────────  │
│                                     │
│  [Reset to Defaults]                │
│                                     │
└─────────────────────────────────────┘
```

**Access Points**:
- Settings → Recommendations
- Discover screen → ⚙︎ icon (top right)
- Empty recommendations → "Update Preferences"

---

## Interaction Patterns

### Star Rating Component
```
┌─────────────────────────────────────┐
│  How was it?                        │
│                                     │
│  ⭐️ ⭐️ ⭐️ ⭐️ ⭐️                    │ Large, tappable
│                                     │
│  (Tap to rate)                      │
│                                     │
└─────────────────────────────────────┘
```

**Interaction**:
- Tap star = set rating
- Half-stars not supported (simpler UX)
- Immediate save (no "Submit" button)
- Haptic feedback on tap
- Visual confirmation (filled star + checkmark)

**Placement**:
- Book detail view (for owned books)
- After marking book as "Read"
- Optional rating prompt (dismissible)

---

### Add to Library Flow
```
User on Discover screen
    ↓
Tap [+ Add to Library]
    ↓
┌─────────────────────────┐
│ ✓ Added to Want to Read│ Toast notification
└─────────────────────────┘
    ↓
Book disappears from recommendations (excluded)
    ↓
[Undo] option (3 seconds)
```

**Smart Defaults**:
- Recommended books → "Want to Read" shelf
- User can change shelf after adding
- Auto-exclude from future recommendations

---

### Pull to Refresh
```
User pulls down on Discover screen
    ↓
Spinner appears
    ↓
"Finding new recommendations..."
    ↓
Fresh recommendations load
    ↓
Visual feedback (cards slide in)
```

**When to Refresh**:
- User pulls to refresh
- User rates a new book
- User updates preferences
- Weekly automatic refresh

---

## Visual Design System

### Match Score Display

**High Match (80-100%)**
```
⭐️ 92% match
[Bright green badge]
```

**Good Match (60-79%)**
```
⭐️ 72% match
[Yellow-green badge]
```

**Okay Match (40-59%)**
```
⭐️ 58% match
[Yellow badge]
```

### Reason Tags
```
✓ Fantasy    ✓ Magic    ✓ Wizards
[Small chips with checkmarks, subtle background]
```

### Empty States

**No Preferences Set**
```
┌─────────────────────────────────────┐
│          📚                         │
│                                     │
│   Let's Find Books You'll Love!    │
│                                     │
│  Tell us what you like to read     │
│  and we'll recommend great books.  │
│                                     │
│  [Set Your Preferences]             │
│                                     │
└─────────────────────────────────────┘
```

**No Matches Found**
```
┌─────────────────────────────────────┐
│          🔍                         │
│                                     │
│   No Matches Right Now             │
│                                     │
│  Try broadening your preferences   │
│  or rating more books.             │
│                                     │
│  [Update Preferences]               │
│  [Browse Library]                   │
│                                     │
└─────────────────────────────────────┘
```

---

## Implementation Priority

### Phase 1: MVP (1-2 weeks)
1. **Tab bar item** - "Discover" with ✨ icon
2. **Main Discover screen** - Recommendations list
3. **Recommendation cards** - Cover, title, score, reasons, [Add] button
4. **Genre picker** - Onboarding + preferences screen
5. **Basic error/empty states**

**Outcome**: Users can set preferences and see recommendations.

### Phase 2: Enhanced UX (1 week)
1. **Star rating widget** - Add to book detail
2. **Full onboarding flow** - 3-step wizard
3. **Library integration** - "Recommended for You" section
4. **Match badge** on book detail - "87% match for you"
5. **Pull to refresh**

**Outcome**: Better recommendations over time, smoother experience.

### Phase 3: Polish (1 week)
1. **Preferences settings** - Full preferences management
2. **Mood selector** - Optional preference
3. **Constraints** - Page count, year filters
4. **Animation polish** - Card transitions, loading states
5. **Analytics** - Track what users engage with

**Outcome**: Production-ready, delightful experience.

---

## User Flows

### Flow 1: First Time User (Cold Start)
```
Launch app (first time)
    ↓
Onboarding: "Let's get started!"
    ↓
Pick 3+ genres (Fantasy, Mystery, Romance)
    ↓
Optional: Pick mood (Epic Adventures)
    ↓
"Here are your first picks!" (3 recommendations)
    ↓
[Add Book 1] → Added to Want to Read
    ↓
[See All Recommendations] → Discover screen (10 recommendations)
    ↓
Navigate to Library → See added book
```

### Flow 2: Returning User (Preference-Based)
```
Open app → Library screen
    ↓
See "✨ Recommended for You" section (3 books, horizontal scroll)
    ↓
Tap [See all] → Navigate to Discover screen
    ↓
Browse 10 recommendations
    ↓
Tap book → View detail
    ↓
[+ Add to Library] → Added
    ↓
← Back to Discover → Book removed from list
    ↓
Scroll down → [Load More] → 10 more recommendations
```

### Flow 3: Rating Flow (Improving Recommendations)
```
User finishes reading book
    ↓
Mark as "Read" in library
    ↓
Prompt: "How was it? ⭐️⭐️⭐️⭐️⭐️"
    ↓
Tap 5 stars
    ↓
Toast: "✓ Rated 5 stars! Your recommendations are now better!"
    ↓
[See What We Recommend] → Navigate to Discover
    ↓
Fresh recommendations based on new rating
```

### Flow 4: Updating Preferences
```
Discover screen → Tap ⚙︎ (top right)
    ↓
Preferences screen
    ↓
Tap "Edit" next to Favorite Genres
    ↓
Add "Thriller" to genres
    ↓
[Save]
    ↓
← Back to Discover
    ↓
Pull to refresh
    ↓
New recommendations with Thriller books
```

---

## Notification Strategy (Optional Phase 3)

### Weekly Recommendation Digest
```
📬 Notification (Sunday 9 AM)
"3 new books for you this week!"

Tap → Opens Discover screen
```

**Cadence**: Weekly (not daily - avoid annoyance)
**Opt-out**: Easy toggle in settings
**Content**: "N new books based on your recent ratings"

---

## Analytics to Track

### Engagement Metrics
- [ ] % of users who complete onboarding
- [ ] % of users who set preferences
- [ ] % of users who view Discover screen
- [ ] Average recommendations viewed per session
- [ ] Click-through rate (view detail)
- [ ] Conversion rate (add to library)
- [ ] % of recommended books that get rated 4-5 stars

### Quality Metrics
- [ ] Average match score of added books
- [ ] Time from recommendation to "Add to Library"
- [ ] Recommendation refresh frequency
- [ ] Error rate (no recommendations shown)

---

## Design Specs for Developers

### Colors
- **Match Score Badge**:
  - 80-100%: `#10B981` (Green)
  - 60-79%: `#F59E0B` (Amber)
  - 40-59%: `#EF4444` (Red - but hide these)
- **Reason Tags**: `#F3F4F6` background, `#6B7280` text
- **CTA Button**: Primary brand color

### Typography
- **Match Score**: 16pt, Bold
- **Book Title**: 18pt, Semibold
- **Author**: 14pt, Regular, Secondary color
- **Reasons**: 12pt, Regular

### Spacing
- **Card padding**: 16pt
- **Card gap**: 12pt
- **Horizontal scroll cards**: 140pt width, 8pt gap

### Icons
- **Tab bar**: ✨ Sparkles (SF Symbol: `sparkles`)
- **Preferences**: ⚙︎ Gear (SF Symbol: `gearshape`)
- **Add**: + Plus (SF Symbol: `plus.circle.fill`)
- **Rating**: ⭐️ Star (SF Symbol: `star.fill`)

---

## Technical Notes

### API Integration
```swift
// Recommendation service
class RecommendationService {
    func getRecommendations(limit: Int = 10, exclude: [String] = []) async throws -> [Recommendation]
    func getUserPreferences() async throws -> UserPreferences
    func updatePreferences(_ preferences: UserPreferences) async throws
    func rateBook(isbn: String, rating: Int) async throws
}
```

### Caching Strategy
- Cache recommendations for 5 minutes
- Invalidate on:
  - New rating added
  - Preferences updated
  - User pulls to refresh
- Background refresh: Weekly

### Error Handling
- Network errors: Show retry button
- No recommendations: Show helpful message
- Authentication errors: Redirect to login

---

## Success Criteria

**MVP is successful if**:
1. 70%+ of users set at least 3 genre preferences
2. 50%+ of users view Discover screen
3. 10%+ of recommendations get added to library
4. Average match score of added books: >75%
5. <5% error rate

**Long-term success**:
- Users check Discover weekly
- 80%+ add at least one recommended book
- Average rating of recommended books: 4+ stars
- Feature is in top 3 most-used in app

---

## Open Questions for Team

1. **Navigation**: Tab bar vs menu item? (I recommend tab bar)
2. **Onboarding**: Required vs optional? (I recommend optional with nudges)
3. **Rating prompt**: Intrusive vs subtle? (I recommend subtle with smart timing)
4. **Visual style**: Match existing design system?
5. **Analytics**: What do we want to measure most?

---

**Next Steps**:
1. Review this design with your wife (primary user!)
2. Get feedback from frontend team
3. Create wireframes/mockups in Figma
4. Build Phase 1 MVP
5. User test with your wife
6. Iterate based on feedback

---

**Version**: 1.0.0
**Created**: 2026-01-09
**Status**: Design proposal - awaiting feedback
