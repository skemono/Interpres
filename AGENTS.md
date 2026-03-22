# Agent Guidelines for Interpres

Based on the design context and improvements made to the Interpres application, these guidelines should be followed for all future work.

## Design Context

### Users
Business professionals to general customers who need to translate Word documents while preserving all formatting. They use Interpres in work or personal contexts where accuracy and document integrity are paramount.

### Brand Personality
Technical, powerful, professional, and modern. The interface should inspire confidence in translation quality while feeling sophisticated and capable.

### Aesthetic Direction
Elegant and sophisticated with support for both light and dark modes (manual toggle). Avoid generic AI-generated design tropes. Focus on refined typography, purposeful spacing, and a cohesive color palette that communicates trust and precision.

### Design Principles
1. **Clarity over decoration**: Every element should serve a clear purpose in the translation workflow
2. **Visual hierarchy guides action**: Primary actions are immediately apparent; secondary options don't compete for attention
3. **Consistent feedback**: Users always know what's happening through clear status indicators and responsive interactions
4. **Respect user focus**: Minimize distractions during translation while providing necessary progress information
5. **Precision in details**: Typography, spacing, and alignment are meticulously considered to create a polished experience

## Implementation Guidelines

### Color Usage
- Use the sophisticated warm-neutral dark palette defined in src/App.css
- Primary accent: #8b7d6b (warm taupe/greige)
- Semantic colors: 
  - Success: #6b8e23 (olive green)
  - Warning: #daa520 (goldenrod)
  - Danger: #cd5c5c (indian red)
  - Info: #5f9ea0 (cadet blue)
- Avoid AI slop indicators: gradient text, glowing accents, generic purple-blue gradients
- Every color should have a semantic purpose

### Typography
- Primary font: Satoshi (with fallback to system fonts)
- Line height: 1.6 for body text
- Clear hierarchy between heading and body text
- Avoid overused fonts (Inter, Roboto, etc.) as primary UI fonts

### Interactive Elements
- Buttons should have clear hover/active states with subtle transforms
- Primary buttons: var(--accent) background with var(--accent-hover) on hover
- Feedback should be immediate and clear
- Avoid making everything colorful - use color strategically for hierarchy

### Layout and Spacing
- Use purposeful spacing with visual rhythm
- Avoid identical card grids - vary treatment based on content type
- Respect user focus during translation - minimize distractions
- Empty states should guide users toward action

### Components
- Translation flow should provide clear visual feedback on segment status
- Control panel should avoid cognitive overload through progressive disclosure where appropriate
- All interactive elements should have clear affordances
- Status messages should be helpful and non-blaming

### Anti-Patterns to Avoid
- Gradient text for "impact" - decorative rather than meaningful
- Default dark mode with glowing accents - requires no actual design decisions
- Identical card grids with icon + heading + text repeated endlessly
- Glassmorphism used decoratively rather than purposefully
- Rounded elements with thick colored borders on one side (lazy accent)
- Sparkles or decorative elements that convey no meaningful information
- Hero metric layout template (big number, small label, supporting stats, gradient accent)
- Centered everything - left-aligned text with asymmetric layouts feels more designed
- Using the same spacing everywhere without rhythm

## When in Doubt
Ask: "Does this element serve a clear purpose in the translation workflow?" If not, consider removing or modifying it.
Ask: "Would a user know what to do without instructions?" If not, improve affordances.
Ask: "Does this look like every other AI-generated interface from 2024-2025?" If yes, revise.

## Reference Files
- Design context: .impeccable.md
- Color palette: src/App.css (:root variables)
- Typography settings: src/App.css (font-family, line-height)
- Component styles: src/components/*.css