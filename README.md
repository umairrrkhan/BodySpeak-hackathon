# BodySpeak

**Understand what your body is telling you — using physics, not medical jargon.**

BodySpeak is a health reasoning engine that translates your symptoms into plain-physics explanations. Describe what you feel — headaches, dizziness, foamy urine — and it converts each sensation into cause-and-effect chains based on fluid pressure, osmosis, filtration, and electrical signaling. No disease names. No diagnosis. Just the language your body actually speaks.

---

## Features

###  Physics-Based Reasoning
Every symptom is broken down into physical events using first principles:
- **Fluid dynamics** — pressure, flow, resistance, osmosis, diffusion
- **Thermodynamics** — heat, energy transfer
- **Basic chemistry** — pH, ions, reactions
- **Core biology** — the body as a hydraulic system (pump, pipes, filters)

###  Symptom Chat
Type what you feel in natural language. The AI responds with a structured 5-section card:

| Section | What it does |
|---|---|
| **Symptom Translation** | Converts each feeling into physical terms |
| **Causal Map** | Shows cause-effect chains with `→` arrows |
| **Hidden Culprit** | Identifies the most dangerous underlying physical instability |
| **Immediate Action** | Zero-cost actions targeting the root mechanism |
| **Feedback Loop** | A concrete way to track improvement |

Responses stream token-by-token, building the analysis in real time.

###  Interactive Causal Graph (D3.js)
As the AI reasons, a force-directed graph builds on the right panel:
- **Teal nodes** — symptoms you feel
- **Blue nodes** — internal body processes
- **Purple node** — the hidden culprit
- **Arrows** — causal relationships with physics labels
- Drag, zoom, pan — fully interactive

###  Health Tracker
Track your measurements with large, accessible forms:
- Blood Pressure
- Heart Rate
- Weight
- Temperature
- Blood Glucose
- Custom measurements

All data is saved locally in your browser. Nothing leaves your machine.

###  Trend Charts
View your measurements over time with D3.js line charts. Filter by type and see visual trends directly in the history panel.

###  Voice Input (browser speech recognition)
Speak instead of type. Click the microphone button and describe your symptoms with your voice.

###  Export
Download your entire conversation as a text file to share with a healthcare provider.

###  Medical Term Blocker
The system automatically detects and flags medical labels (disease names, diagnostic terms) to ensure the explanation stays purely physical — never a diagnosis.

---

## Design Philosophy

### For Everyone, Especially Non-Tech Users
- **Large text** — 17px body, 22px headings
- **High contrast** — light theme with dark text
- **Big touch targets** — 48px minimum tap area
- **Clear labels** — buttons say what they do ("Track health", not just an icon)
- **Suggestion chips** — one-tap common concerns
- **Enter to send** — works like every other app

### Privacy First
- No accounts, no sign-up
- No data sent to any server (except the AI API call)
- All measurements stored in `localStorage`
- Clear conversations with one button
- Clear all measurement data with confirmation

### Startup-Ready Design
- Clean, professional medical aesthetic
- Apple-inspired design principles
- Responsive layout (works on mobile)
- Smooth animations and micro-interactions
- Consistent design system with CSS variables

---

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) v18 or later
- A [DeepSeek API key](https://platform.deepseek.com/)

### Installation

```bash
# Clone the repository
git clone https://github.com/umairrrkhan/BodySpeak-hackathon.git
cd BodySpeak-hackathon

# Install dependencies
npm install

# Create environment file
echo "DEEPSEEK_API_KEY=your-api-key-here" > .env
echo "PORT=3000" >> .env
echo "DEEPSEEK_MODEL=deepseek-v4-flash" >> .env

# Start the server
npm start
```

### Usage
1. Open `http://localhost:3000` in your browser
2. Type or speak what you're feeling
3. Read the physics-based explanation
4. Watch the causal map build in real time
5. Track your measurements to see trends
6. Export the conversation to share with your doctor

---

## Project Structure

```
bodyspeak/
├── server.js              # Express backend with streaming SSE
├── package.json
├── .env                   # API key and configuration
├── README.md
└── public/
    ├── index.html          # Main application page
    ├── style.css           # Complete design system
    ├── script.js           # All frontend logic
    └── d3.min.js           # D3.js library (local, no CDN)
```

### API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/` | GET | Serves the application |
| `/api/diagnose` | POST | Non-streaming analysis |
| `/api/diagnose/stream` | POST | Streaming token-by-token analysis (SSE) |

#### Request Format
```json
{
  "symptoms": "I wake up with headaches and feel dizzy when I stand.",
  "measurements": [
    { "type": "bp", "sys": 148, "dia": 96 }
  ],
  "conversation": [
    { "role": "user", "content": "previous message" },
    { "role": "assistant", "content": "previous response" }
  ]
}
```

---

## Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `DEEPSEEK_API_KEY` | — | Your DeepSeek API key |
| `PORT` | `3000` | Server port |
| `DEEPSEEK_MODEL` | `deepseek-chat` | AI model to use |

---

## Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | Vanilla HTML, CSS, JavaScript (no framework) |
| **Graph Visualization** | D3.js force-directed simulation |
| **Backend** | Node.js + Express |
| **AI Provider** | DeepSeek API |
| **Data Storage** | Browser `localStorage` |
| **Streaming** | Server-Sent Events via `fetch` ReadableStream |

---

## How It Works

### 1. Symptom → Physics Translation
When you describe a feeling like "foamy urine," the AI converts it:
> "Foam means there's protein in your pee. Normally, your kidney filters keep protein in. If pressure is too high, it damages the filter mesh and protein leaks through, like egg white makes bubbles."

### 2. Causal Chain Building
The AI traces the chain of cause and effect:
> "High salt intake → water retention (osmosis) → increased blood volume → higher pressure → kidney filter damage → protein leaks → foamy urine"

### 3. Visual Graph
The D3.js graph reads the causal map and renders it as an interactive force-directed network. Nodes represent concepts, arrows represent causal relationships, and you can drag, zoom, and click to explore.

### 4. Feedback Tracking
Based on the action suggested, you can track measurements over time. The AI can then incorporate your latest numbers into follow-up analyses, closing the feedback loop.

---

## Privacy

- **No accounts.** No sign-up, no login.
- **No cloud storage.** All measurements stay in your browser.
- **The only external call** is to the DeepSeek API for AI reasoning.
- **Clear your data** at any time with one click.

---

## License

MIT

---

## Acknowledgements

- Built with [DeepSeek](https://deepseek.com/) for AI reasoning
- Graphs powered by [D3.js](https://d3js.org/)
- Inspired by first-principles thinking and the desire to make health understandable for everyone

---

*BodySpeak is not a medical device. It does not diagnose, treat, or prevent any disease. Always consult a qualified healthcare provider for medical advice.*
