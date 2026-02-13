# 🍞 Sourdough Timeline

A beautiful web app to track your sourdough bread baking journey. Manage timers, follow recipe steps, and create detailed bake logs.
<img width="1198" height="786" alt="image" src="https://github.com/user-attachments/assets/6a5e7d75-cbe4-4e64-a8f9-69ec164fc093" />

## Features

- **Visual Timeline**: See your progress through all baking stages at a glance
- **Step-by-Step Instructions**: Markdown-based instructions that are easy to customize
- **Integrated Timers**: Automatic countdown timers between stages with audio alerts
- **Ingredient Tracking**: Record ingredients used during the Autolyse stage
- **Detailed Bake Log**: Generate a summary of your entire bake for your notes
- **Beautiful Design**: Clean, functional UI with sea-green color scheme

## Getting Started

### Prerequisites

- Python 3.x (for local server)
- A modern web browser

### Running the App

```bash
cd SourdoughTimeline
python3 serve.py
```

Then open http://localhost:8000 in your browser.

Alternatively, you can use any static file server:

```bash
# Using Python directly
python3 -m http.server 8000

# Using Node.js
npx serve

# Using PHP
php -S localhost:8000
```

## Customization

### Editing Stages

Edit `recipes/classic-sourdough.json` to modify the baking stages:

```json
{
  "id": "stage-id",
  "name": "Full Stage Name",
  "shortName": "Short Name",
  "instructionsFile": "stage-name.md",
  "durationMinutes": 30,
  "colorGroup": "mixing",
  "hasIngredientInput": false,
  "subStages": null
}
```

**Fields:**
- `id`: Unique identifier for the stage
- `name`: Full display name
- `shortName`: Abbreviated name for the timeline
- `instructionsFile`: Markdown file in `/instructions/`
- `durationMinutes`: Timer duration (0 = no timer)
- `colorGroup`: Color theme (uses `stage` - sea green)
- `hasIngredientInput`: Show ingredient inputs during this stage
- `subStages`: Array of sub-stages (optional)

### Editing Default Ingredients

Ingredients are defined in the recipe file (`recipes/classic-sourdough.json`) in the `ingredients` array:

```json
{
  "id": "bread-flour",
  "name": "Bread Flour",
  "defaultAmount": 450,
  "unit": "g"
}
```

### Editing Instructions

Each stage has a corresponding markdown file in the `/instructions/` folder. Edit these to customize the instructions shown for each stage.

## Project Structure

```
SourdoughTimeline/
├── index.html              # Main HTML file
├── serve.py                # Local development server
├── recipes/
│   ├── index.json          # Recipe list
│   └── classic-sourdough.json  # Default recipe (stages, ingredients)
├── css/
│   └── styles.css          # Styling with natural theme
├── js/
│   └── app.js              # Main application logic
└── instructions/
    ├── autolyse.md
    ├── mix-levain.md
    ├── mix-salt.md
    ├── initial-fold.md
    ├── lamination.md
    ├── stretch-fold-1.md
    ├── stretch-fold-2.md
    ├── stretch-fold-3.md
    ├── shape.md
    ├── bench-rest.md
    └── refrigerate.md
```

## Color Scheme

The app uses a calming sea-green color palette:
- **Primary**: Viridian (#344945) - Buttons and headings
- **Stages**: Sea Green (#C8DCD8) - Timeline and stage indicators
- **Background**: Shell (#F7F5F1) - Clean neutral background

## Bake Log Output

At the end of your bake, you'll get a summary like this:

```
═══════════════════════════════════════
        SOURDOUGH BAKE LOG
═══════════════════════════════════════

Date: Thursday, February 6, 2026
Started: 8:00 AM
Ended: 6:30 PM
Total Duration: 10h 30m

───────────────────────────────────────
INGREDIENTS
───────────────────────────────────────
  Bread Flour: 450g
  Whole Wheat Flour: 50g
  Water: 375g
  Salt: 10g
  Sourdough Starter: 100g

───────────────────────────────────────
STAGES
───────────────────────────────────────
  ● Feed the Sourdough Starter: 4h 2m
  ● Autolyse: 1h 5m
  ● Mix the Levain: 32m 15s
  ...

═══════════════════════════════════════
```

## License

This project is for personal use. Happy baking! 🥖
