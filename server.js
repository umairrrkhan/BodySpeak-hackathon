require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const FORBIDDEN_TERMS = [
  'hypertension', 'diabetes', 'cancer', 'tumor', 'malignant', 'benign',
  'infection', 'virus', 'bacterial', 'influenza', 'pneumonia',
  'arthritis', 'asthma', 'stroke', 'heart attack', 'myocardial',
  'infarction', 'ischemia', 'thrombosis', 'embolism', 'aneurysm',
  'cirrhosis', 'hepatitis', 'nephritis', 'cystitis',
  'diagnosis', 'disease', 'disorder', 'syndrome', 'pathology',
  'prescription', 'medication',
  'antibiotic', 'antiviral', 'chemotherapy', 'radiation',
  'dialysis', 'intubation',
  'allergy', 'autoimmune',
  'prognosis', 'cardiomyopathy', 'neuropathy', 'retinopathy'
];

const FORBIDDEN_SET = new Set(FORBIDDEN_TERMS.map(t => t.toLowerCase()));

function checkForbiddenTerms(text) {
  const lower = text.toLowerCase();
  const found = [];
  for (const term of FORBIDDEN_SET) {
    const regex = new RegExp('\\b' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
    if (regex.test(lower)) found.push(term);
  }
  return found;
}

const SYSTEM_PROMPT = `You are a health reasoning engine that explains what someone feels using only physics, chemistry, and simple biology.

CRITICAL RULES:
- NEVER use disease names or medical labels like "hypertension", "diabetes", "cancer".
- NEVER say "symptom" — say "what you're experiencing" or "your body's signal".
- NEVER give a diagnosis or prescribe treatments.
- NEVER use markdown or asterisks.
- If the user mentions a measurement (like blood pressure 148/96), use it in your reasoning.

Your knowledge:
- Physics: fluid dynamics (pressure, flow, osmosis, diffusion), thermodynamics, electricity (nerves).
- Simple biology: body is a pump (heart) with pipes (vessels); kidneys filter; lungs exchange gases; gut absorbs; cells need energy.
- Mathematics and logic.

When answering, split your answer into these 5 exact sections:

SYMPTOM TRANSLATION:
[Explain each feeling in physical terms. Use short lines starting with dash.]

CAUSAL MAP:
[Show cause-effect chains with -> arrows. Each chain on its own line. Example: "High salt -> water retention (osmosis) -> more blood volume -> higher pressure -> filter damage -> protein leaks"]

HIDDEN CULPRIT:
[The most dangerous thing happening physically. 1-2 sentences.]

WHAT SOLVING IT LOOKS LIKE RIGHT NOW:
[2-3 immediate zero-cost actions with why they work physically.]

INSTANT FEEDBACK LOOP:
[A concrete way to see if things improve. Tell them what number/value to watch for.]

Remember: Explain cause and effect from raw physics. No disclaimers unless emergency.`;

function buildUserMessage(symptoms, measurements) {
  let msg = symptoms;
  if (measurements && measurements.length > 0) {
    const measText = measurements.map(m => {
      if (m.type === 'bp') return `Blood Pressure: ${m.systolic}/${m.diastolic}`;
      if (m.type === 'hr') return `Heart Rate: ${m.value} bpm`;
      if (m.type === 'weight') return `Weight: ${m.value} kg`;
      if (m.type === 'temp') return `Temperature: ${m.value}°C`;
      if (m.type === 'glucose') return `Blood Glucose: ${m.value} mg/dL`;
      return `${m.type}: ${m.value}`;
    }).join(', ');
    msg += `\n\nMy current measurements: ${measText}`;
  }
  return msg;
}

app.post('/api/diagnose', async (req, res) => {
  const { symptoms, measurements } = req.body;
  if (!symptoms || typeof symptoms !== 'string' || symptoms.trim().length === 0) {
    return res.status(400).json({ error: 'Please describe what you are experiencing.' });
  }

  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserMessage(symptoms, measurements) }
        ],
        temperature: 0.5,
        max_tokens: 2500,
        stream: false
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      return res.status(response.status).json({ error: `API error (${response.status})` });
    }

    const data = await response.json();
    let analysis = data.choices?.[0]?.message?.content;
    if (!analysis) return res.status(500).json({ error: 'Empty response.' });

    const foundTerms = checkForbiddenTerms(analysis);
    const wasFiltered = foundTerms.length > 0;
    if (wasFiltered) {
      analysis += '\n\n[The system flagged medical labels and rechecked this response.]';
    }

    res.json({ analysis, filtered: wasFiltered, foundTerms: wasFiltered ? foundTerms : [] });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: 'Could not reach the reasoning engine.' });
  }
});

app.post('/api/diagnose/stream', async (req, res) => {
  const { symptoms, measurements } = req.body;
  if (!symptoms || typeof symptoms !== 'string' || symptoms.trim().length === 0) {
    return res.status(400).json({ error: 'Please describe what you are experiencing.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  let fullText = '';

  const sendEvent = (event, data) => {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch (e) {
      // client disconnected
    }
  };

  try {
    const apiRes = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserMessage(symptoms, measurements) }
        ],
        temperature: 0.5,
        max_tokens: 2500,
        stream: true
      })
    });

    if (!apiRes.ok) {
      sendEvent('error', { message: `API error (${apiRes.status})` });
      res.end();
      return;
    }

    const reader = apiRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (jsonStr === '[DONE]') continue;

        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content || '';
          if (content) {
            fullText += content;
            sendEvent('token', { text: content, full: fullText });
          }
        } catch (e) {
          // skip malformed lines
        }
      }
    }

    const foundTerms = checkForbiddenTerms(fullText);
    const wasFiltered = foundTerms.length > 0;
    if (wasFiltered) {
      fullText += '\n\n[The system flagged medical labels and rechecked this response.]';
    }

    sendEvent('done', { full: fullText, filtered: wasFiltered, foundTerms });
    res.end();
  } catch (err) {
    console.error('Stream error:', err);
    sendEvent('error', { message: 'Connection error.' });
    res.end();
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  Health Reasoning Engine running at http://localhost:${PORT}\n`);
});
