// ─── State ───────────────────────────────────────────────
const state = {
  measurements: loadMeasurements(),
  streaming: false,
  analysisId: 0,
  conversation: []
};

// ─── DOM refs ────────────────────────────────────────────
const $ = id => document.getElementById(id);
const chatMessages = $('chatMessages');
const chatScroll = $('chatScroll');
const chatInput = $('chatInput');
const sendBtn = $('sendBtn');
const statusLabel = $('statusLabel');
const graphEmpty = $('graphEmpty');
const svg = d3.select('#graphSvg');

// ─── Utils ───────────────────────────────────────────────
function ts() {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' +
    String(d.getMinutes()).padStart(2, '0');
}

function nowISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Status ──────────────────────────────────────────────
function setStatus(mode, label) {
  statusLabel.className = 'status-label';
  if (mode === 'busy') statusLabel.classList.add('busy');
  if (mode === 'error') statusLabel.classList.add('error');
  const dot = statusLabel.querySelector('.status-dot');
  const lbl = statusLabel.querySelector('span:last-child');
  if (label && lbl) lbl.textContent = label;
}

// ─── Chat ────────────────────────────────────────────────
function addMessage(type, content, extra) {
  const div = document.createElement('div');
  div.className = `msg msg-${type}`;

  const sender = document.createElement('div');
  sender.className = 'msg-sender';
  sender.textContent = type === 'user' ? 'You' : type === 'system' ? 'BodySpeak' : 'BodySpeak';
  div.appendChild(sender);

  const body = document.createElement('div');
  body.className = 'msg-body';

  if (type === 'analysis') {
    const card = buildCard(content, extra);
    body.appendChild(card);
  } else {
    const text = document.createElement('p');
    text.className = 'msg-text';
    text.textContent = content;
    body.appendChild(text);
  }
  div.appendChild(body);

  if (extra?.filtered) {
    const notice = document.createElement('div');
    notice.className = 'filtered-notice';
    notice.textContent = 'Medical labels were removed from this analysis.';
    body.appendChild(notice);
  }

  const time = document.createElement('div');
  time.className = 'msg-time';
  time.textContent = ts();
  div.appendChild(time);

  chatMessages.appendChild(div);
  chatScroll.scrollTop = chatScroll.scrollHeight;
  return div;
}

function addStreamingMessage() {
  const div = document.createElement('div');
  div.className = 'msg msg-analysis msg-streaming';
  div.id = 'streamingMsg';
  const sender = document.createElement('div');
  sender.className = 'msg-sender';
  sender.textContent = 'BodySpeak';
  div.appendChild(sender);
  const body = document.createElement('div');
  body.className = 'msg-body';
  const card = document.createElement('div');
  card.className = 'diag-card';
  card.id = 'streamingCard';
  body.appendChild(card);
  div.appendChild(body);
  const time = document.createElement('div');
  time.className = 'msg-time';
  time.textContent = ts() + ' (streaming...)';
  div.appendChild(time);
  chatMessages.appendChild(div);
  chatScroll.scrollTop = chatScroll.scrollHeight;
  return div;
}

// ─── Card Builder ────────────────────────────────────────
function buildCard(analysis, extra) {
  const sections = parseSections(analysis);
  const card = document.createElement('div');
  card.className = 'diag-card';

  const config = [
    { key: 'SYMPTOM TRANSLATION', cls: 'section-translation', label: 'Translation to Physics' },
    { key: 'CAUSAL MAP', cls: 'section-map', label: 'Causal Chain' },
    { key: 'HIDDEN CULPRIT', cls: 'section-culprit', label: 'Hidden Culprit' },
    { key: 'WHAT SOLVING IT LOOKS LIKE RIGHT NOW', cls: 'section-action', label: 'Immediate Action' },
    { key: 'INSTANT FEEDBACK LOOP', cls: 'section-feedback', label: 'Feedback Loop' }
  ];

  for (const cfg of config) {
    const body = sections[cfg.key];
    if (!body) continue;

    const details = document.createElement('details');
    details.className = `diag-section ${cfg.cls}`;
    details.open = cfg.key === 'HIDDEN CULPRIT';

    const summary = document.createElement('summary');
    summary.textContent = cfg.label;
    details.appendChild(summary);

    const bodyDiv = document.createElement('div');
    bodyDiv.className = 'section-body';
    bodyDiv.id = 'sec-' + (state.analysisId++);
    bodyDiv.textContent = body;
    details.appendChild(bodyDiv);
    card.appendChild(details);
  }

  if (extra?.filtered) {
    const note = document.createElement('div');
    note.style.cssText = 'padding:6px 14px;font-size:10px;color:var(--orange);border-top:1px solid var(--border);';
    note.textContent = 'Medical labels were removed from this analysis.';
    card.appendChild(note);
  }

  return card;
}

function parseSections(text) {
  const result = {};
  const labels = [
    'SYMPTOM TRANSLATION',
    'CAUSAL MAP',
    'HIDDEN CULPRIT',
    'WHAT SOLVING IT LOOKS LIKE RIGHT NOW',
    'INSTANT FEEDBACK LOOP'
  ];

  let remaining = text;
  for (let i = 0; i < labels.length; i++) {
    const idx = remaining.indexOf(labels[i]);
    if (idx === -1) continue;
    const start = idx + labels[i].length;
    const next = labels.slice(i + 1).find(l => remaining.indexOf(l, start) !== -1);
    const end = next ? remaining.indexOf(next, start) : remaining.length;
    let body = remaining.slice(start, end).replace(/^:\s*\n?/, '').trim();
    result[labels[i]] = body;
  }

  return result;
}

// ─── Streaming ──────────────────────────────────────────
function getLatestMeasurements() {
  return state.measurements.slice(-3);
}

async function submitQuery() {
  const text = chatInput.value.trim();
  if (!text || state.streaming) return;

  addMessage('user', text);
  state.conversation.push({ role: 'user', content: text });
  chatInput.value = '';
  chatInput.style.height = 'auto';
  sendBtn.disabled = true;
  sendBtn.classList.remove('active');
  setStatus('busy', 'Reasoning...');
  state.streaming = true;

  const msgEl = addStreamingMessage();
  const card = $('streamingCard');

  let accumulated = '';

  try {
    const meas = getLatestMeasurements();
    const res = await fetch('/api/diagnose/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symptoms: text,
        measurements: meas.length > 0 ? meas : undefined,
        conversation: state.conversation.length > 1 ? state.conversation.slice(-10) : undefined
      })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Error ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';

      for (const event of events) {
        const lines = event.split('\n');
        let eventType = 'message';
        let dataStr = '';

        for (const line of lines) {
          if (line.startsWith('event: ')) eventType = line.slice(7).trim();
          if (line.startsWith('data: ')) dataStr = line.slice(6).trim();
        }

        if (!dataStr) continue;

        try {
          const data = JSON.parse(dataStr);

          if (eventType === 'token') {
            accumulated = data.full;
            updateStreamingCard(card, accumulated);
          } else if (eventType === 'done') {
            accumulated = data.full;
            updateStreamingCard(card, accumulated);
            finalizeStreaming(msgEl, accumulated, data.filtered);
            state.conversation.push({ role: 'assistant', content: accumulated });

            if (data.full) {
              const parsed = parseCausalMap(data.full);
              if (parsed.nodes.length > 0) buildGraph(parsed.nodes, parsed.edges);
            }
          } else if (eventType === 'error') {
            throw new Error(data.message);
          }
        } catch (e) {
          if (e.message.includes('stream')) throw e;
        }
      }
    }

    setStatus('', 'Ready');
  } catch (err) {
    console.error('Stream error:', err);
    msgEl.remove();
    addMessage('system', 'Connection error: ' + (err.message || 'Could not reach the reasoning engine.'));
    setStatus('error', 'Error');
  } finally {
    state.streaming = false;
    sendBtn.disabled = false;
    chatInput.focus();
  }
}

function updateStreamingCard(card, text) {
  const sections = parseSections(text);
  const config = [
    { key: 'SYMPTOM TRANSLATION', cls: 'section-translation', label: 'Translation to Physics' },
    { key: 'CAUSAL MAP', cls: 'section-map', label: 'Causal Chain' },
    { key: 'HIDDEN CULPRIT', cls: 'section-culprit', label: 'Hidden Culprit' },
    { key: 'WHAT SOLVING IT LOOKS LIKE RIGHT NOW', cls: 'section-action', label: 'Immediate Action' },
    { key: 'INSTANT FEEDBACK LOOP', cls: 'section-feedback', label: 'Feedback Loop' }
  ];

  const existing = new Set();
  card.querySelectorAll('details').forEach(d => {
    const s = d.querySelector('.section-body');
    if (s) existing.add(s.id);
  });

  for (const cfg of config) {
    const body = sections[cfg.key];
    if (!body) continue;

    const existingDetail = card.querySelector(`.${cfg.cls}`);
    if (existingDetail) {
      const bodyDiv = existingDetail.querySelector('.section-body');
      if (bodyDiv && !bodyDiv.dataset.final) {
        bodyDiv.textContent = body;
      }
      continue;
    }

    const details = document.createElement('details');
    details.className = `diag-section ${cfg.cls}`;
    details.open = cfg.key === 'HIDDEN CULPRIT';

    const summary = document.createElement('summary');
    summary.textContent = cfg.label;
    details.appendChild(summary);

    const bodyDiv = document.createElement('div');
    bodyDiv.className = 'section-body';
    bodyDiv.id = 'sec-' + (state.analysisId++);
    bodyDiv.textContent = body;
    details.appendChild(bodyDiv);
    card.appendChild(details);
  }
}

function finalizeStreaming(msgEl, text, filtered) {
  const card = $('streamingCard');
  if (!card) return;

  const sections = parseSections(text);
  const config = [
    { key: 'SYMPTOM TRANSLATION', cls: 'section-translation', label: 'Translation' },
    { key: 'CAUSAL MAP', cls: 'section-map', label: 'Causal Chain' },
    { key: 'HIDDEN CULPRIT', cls: 'section-culprit', label: 'Hidden Culprit' },
    { key: 'WHAT SOLVING IT LOOKS LIKE RIGHT NOW', cls: 'section-action', label: 'What To Do Now' },
    { key: 'INSTANT FEEDBACK LOOP', cls: 'section-feedback', label: 'How To Track Progress' }
  ];

  card.innerHTML = '';

  for (const cfg of config) {
    const body = sections[cfg.key];
    if (!body) continue;

    const details = document.createElement('details');
    details.className = `diag-section ${cfg.cls}`;
    details.open = cfg.key === 'HIDDEN CULPRIT';

    const summary = document.createElement('summary');
    summary.textContent = cfg.label;
    details.appendChild(summary);

    const bodyDiv = document.createElement('div');
    bodyDiv.className = 'section-body';
    bodyDiv.dataset.final = 'true';
    bodyDiv.textContent = body;
    details.appendChild(bodyDiv);
    card.appendChild(details);
  }

  if (filtered) {
    const note = document.createElement('div');
    note.style.cssText = 'padding:6px 14px;font-size:10px;color:var(--orange);border-top:1px solid var(--border);';
    note.textContent = 'Medical labels were removed from this analysis.';
    card.appendChild(note);
  }

  msgEl.classList.remove('msg-streaming');
  const time = msgEl.querySelector('.msg-time');
  if (time) time.textContent = ts();
}

// ─── Causal Map Parser ──────────────────────────────────
function parseCausalMap(text) {
  const sections = parseSections(text);
  const mapText = sections['CAUSAL MAP'];
  if (!mapText) return { nodes: [], edges: [] };

  const nodes = [];
  const edges = [];
  const nodeMap = {};
  const sympText = sections['SYMPTOM TRANSLATION'] || '';
  const culpText = sections['HIDDEN CULPRIT'] || '';

  const symptomLines = sympText.split('\n').filter(l => l.trim().startsWith('-'));
  const culpritLower = culpText.toLowerCase();

  function addNode(label, isUserFeel, isCulprit) {
    const key = label.toLowerCase().trim();
    if (nodeMap[key]) return nodeMap[key];

    let color = '#4a9eff';
    let radius = 22;
    if (isCulprit) { color = '#9b59ff'; radius = 26; }
    else if (isUserFeel) { color = '#00d4aa'; radius = 22; }

    const node = {
      id: uid(),
      label: label.trim(),
      color,
      radius,
      x: Math.random() * 500 - 250,
      y: Math.random() * 300 - 150
    };
    nodes.push(node);
    nodeMap[key] = node;
    return node;
  }

  const lines = mapText.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 5) continue;

    const parts = trimmed.split(/[→➡]|\s*->\s*/);
    if (parts.length < 2) continue;

    let prev = null;
    for (let i = 0; i < parts.length; i++) {
      let part = parts[i].trim();
      const parenIdx = part.indexOf('(');
      let label = parenIdx > 0 ? part.slice(0, parenIdx).trim() : part;
      let law = parenIdx > 0 ? part.slice(parenIdx).replace(/[()]/g, '').trim() : '';
      label = label.replace(/^[-–\s]+/, '').replace(/[:;,!]+$/, '').trim();
      if (!label) continue;

      const isUserFeel = symptomLines.some(sl => sl.toLowerCase().includes(label.toLowerCase()));
      const isCulprit = culpritLower.includes(label.toLowerCase()) || label.toLowerCase().includes('pressure') || label.toLowerCase().includes('filter');

      const node = addNode(label, isUserFeel, isCulprit);
      if (prev && prev !== node) {
        if (!edges.some(e => e.source === prev.id && e.target === node.id)) {
          edges.push({ source: prev.id, target: node.id, label: law });
        }
      }
      prev = node;
    }
  }

  if (nodes.length === 0 && mapText.length > 10) {
    const words = mapText.split(/[→➡,;\n]/)
      .map(w => w.replace(/\(.*?\)/g, '').trim())
      .filter(w => w.length > 3);
    for (const word of words.slice(0, 8)) addNode(word, false, false);
    for (let i = 0; i < nodes.length - 1; i++) {
      edges.push({ source: nodes[i].id, target: nodes[i + 1].id, label: '' });
    }
  }

  return { nodes, edges };
}

// ─── D3 Force Graph ─────────────────────────────────────
let graphSim = null;
let graphNodes = [];
let graphEdges = [];
const graphContainer = $('graphContainer');

function buildGraph(nodesData, edgesData) {
  graphNodes = nodesData;
  graphEdges = edgesData;
  graphEmpty.style.display = 'none';

  const width = graphContainer.clientWidth || 600;
  const height = graphContainer.clientHeight || 400;

  svg.selectAll('*').remove();
  svg.attr('viewBox', [0, 0, width, height]);

  // Zoom behavior
  const g = svg.append('g');
  const zoom = d3.zoom()
    .scaleExtent([0.2, 4])
    .on('zoom', (event) => g.attr('transform', event.transform));
  svg.call(zoom);

  // Arrow marker
  svg.append('defs').selectAll('marker')
    .data(['arrow'])
    .join('marker')
    .attr('id', d => d)
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', 24)
    .attr('refY', 0)
    .attr('markerWidth', 7)
    .attr('markerHeight', 7)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M0,-4L8,0L0,4')
    .attr('fill', '#999');

  // Edge line
  const link = linkGroup.selectAll('line')
    .data(graphEdges)
    .join('line')
    .attr('stroke', '#999')
    .attr('stroke-width', 1.5)
    .attr('opacity', 0.5)
    .attr('marker-end', 'url(#arrow)');

  const linkLabel = linkGroup.selectAll('text')
    .data(graphEdges)
    .join('text')
    .text(d => d.label)
    .attr('fill', '#888')
    .attr('font-size', 9)
    .attr('font-family', '-apple-system, sans-serif')
    .attr('text-anchor', 'middle');

  // Nodes
  const nodeGroup = g.append('g').attr('class', 'nodes');
  const node = nodeGroup.selectAll('g')
    .data(graphNodes)
    .join('g')
    .attr('class', 'graph-node')
    .call(d3.drag()
      .on('start', (event, d) => {
        if (!event.active) graphSim.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) graphSim.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      })
    );

  node.append('circle')
    .attr('r', d => d.radius)
    .attr('fill', d => d.color + '44')
    .attr('stroke', d => d.color)
    .attr('stroke-width', 2.5);

  node.append('text')
    .text(d => d.label.length > 20 ? d.label.slice(0, 18) + '...' : d.label)
    .attr('fill', d => d.color)
    .attr('font-size', d => Math.min(d.radius * 0.55, 11))
    .attr('font-family', '-apple-system, sans-serif')
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'central');

  // Node tooltip on hover
  node.append('title')
    .text(d => d.label);

  // Simulation
  if (graphSim) graphSim.stop();

  graphSim = d3.forceSimulation(graphNodes)
    .force('link', d3.forceLink(graphEdges).id(d => d.id).distance(160))
    .force('charge', d3.forceManyBody().strength(-400))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(d => d.radius + 15))
    .on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      linkLabel
        .attr('x', d => (d.source.x + d.target.x) / 2)
        .attr('y', d => (d.source.y + d.target.y) / 2);

      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

  // Fit initial view
  setTimeout(() => {
    const bounds = g.node()?.getBBox();
    if (bounds && bounds.width > 0) {
      const scale = Math.min(width / (bounds.width + 80), height / (bounds.height + 80), 1.2);
      const tx = width / 2 - (bounds.x + bounds.width / 2) * scale;
      const ty = height / 2 - (bounds.y + bounds.height / 2) * scale;
      svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
    }
  }, 100);
}

// ─── Zoom Controls ──────────────────────────────────────
function zoomGraph(factor) {
  const width = graphContainer.clientWidth || 600;
  const height = graphContainer.clientHeight || 400;
  const zoom = d3.zoom().scaleExtent([0.2, 4]);
  svg.transition().duration(200).call(
    zoom.transform,
    d3.zoomIdentity.translate(width / 2, height / 2).scale(factor).translate(-width / 2, -height / 2)
  );
}

$('zoomInBtn').addEventListener('click', () => {
  const current = d3.zoomTransform(svg.node());
  zoomGraph(current.k * 1.3);
});

$('zoomOutBtn').addEventListener('click', () => {
  const current = d3.zoomTransform(svg.node());
  zoomGraph(current.k * 0.7);
});

$('resetViewBtn').addEventListener('click', () => {
  const width = graphContainer.clientWidth || 600;
  const height = graphContainer.clientHeight || 400;
  svg.transition().duration(300).call(
    d3.zoom().scaleExtent([0.2, 4]).transform,
    d3.zoomIdentity.translate(width / 2, height / 2).scale(1).translate(-width / 2, -height / 2)
  );
});

// ─── Input Handling ──────────────────────────────────────
chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 100) + 'px';
  const hasText = chatInput.value.trim().length > 0;
  sendBtn.disabled = !hasText;
  sendBtn.classList.toggle('active', hasText);
});

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (chatInput.value.trim().length > 0 && !state.streaming) submitQuery();
  }
});

sendBtn.addEventListener('click', submitQuery);

// ─── Clear Chat ─────────────────────────────────────────
$('clearBtn').addEventListener('click', () => {
  const msgs = chatMessages.querySelectorAll('.msg');
  for (const msg of msgs) {
    if (msg.id === 'welcomeMsg') continue;
    msg.remove();
  }
  state.conversation = [];
  graphEmpty.style.display = 'flex';
  svg.selectAll('*').remove();
  if (graphSim) graphSim.stop();
  graphNodes = [];
  graphEdges = [];
});

// ─── Export ──────────────────────────────────────────────
$('exportBtn').addEventListener('click', () => {
  const msgs = chatMessages.querySelectorAll('.msg');
  if (msgs.length <= 1) { addMessage('system', 'Nothing to export yet.'); return; }
  let text = 'BodySpeak Conversation\n';
  text += '======================\n';
  text += `Date: ${new Date().toLocaleString()}\n\n`;
  for (const msg of msgs) {
    if (msg.id === 'welcomeMsg') continue;
    const isUser = msg.classList.contains('msg-user');
    const isAnalysis = msg.classList.contains('msg-analysis');
    const sender = msg.querySelector('.msg-sender');
    const timeEl = msg.querySelector('.msg-time');
    const prefix = sender ? sender.textContent : 'Message';
    const time = timeEl ? timeEl.textContent : '';
    let content = '';
    if (isUser) {
      const t = msg.querySelector('.msg-text');
      if (t) content = t.textContent;
    }
    if (isAnalysis) {
      const sections = msg.querySelectorAll('.diag-section');
      for (const sec of sections) {
        const label = sec.querySelector('summary')?.textContent || '';
        const body = sec.querySelector('.section-body')?.textContent || '';
        content += `[${label}]\n${body}\n\n`;
      }
    }
    text += `[${time}] ${prefix}:\n${content.trim()}\n\n`;
  }
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'bodyspeak-conversation.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// ─── Tracker ────────────────────────────────────────────
function loadMeasurements() {
  try { return JSON.parse(localStorage.getItem('hre_meas') || '[]'); } catch { return []; }
}

function saveMeasurements() {
  localStorage.setItem('hre_meas', JSON.stringify(state.measurements));
}

function measTypeLabel(type) {
  const m = { bp: 'Blood Pressure', hr: 'Heart Rate', weight: 'Weight', temp: 'Temperature', glucose: 'Glucose' };
  return m[type] || type;
}

function measValue(m) {
  if (m.type === 'bp') return `${m.sys}/${m.dia}`;
  if (m.type === 'hr') return `${m.val} bpm`;
  if (m.type === 'temp') return `${m.val}°C`;
  if (m.type === 'weight') return `${m.val} kg`;
  if (m.type === 'glucose') return `${m.val} mg/dL`;
  return m.val + (m.unit ? ' ' + m.unit : '');
}

function openTracker() {
  $('trackerModal').style.display = 'flex';
  $('measDt').value = nowISO();
  updateMeasFields();
}

function closeTracker() {
  $('trackerModal').style.display = 'none';
}

function updateMeasFields() {
  const type = $('measType').value;
  $('bpFields').style.display = type === 'bp' ? '' : 'none';
  $('singleField').style.display = type === 'bp' ? 'none' : '';
  $('unitField').style.display = type === 'custom' ? '' : 'none';
  const labels = { hr: 'Heart Rate (bpm)', weight: 'Weight (kg)', temp: 'Temperature (°C)', glucose: 'Glucose (mg/dL)', custom: 'Value' };
  $('singleLabel').textContent = labels[type] || 'Value';
}

function saveMeasurement() {
  const type = $('measType').value;
  const dt = $('measDt').value || new Date().toISOString();
  const note = $('measNote').value.trim();

  if (type === 'bp') {
    const sys = parseInt($('bpSys').value);
    const dia = parseInt($('bpDia').value);
    if (!sys || !dia || sys < 40 || sys > 280 || dia < 20 || dia > 200) {
      addMessage('system', 'Invalid blood pressure numbers. Check your values.');
      return;
    }
    state.measurements.push({ id: uid(), type, sys, dia, dt, note });
  } else {
    const val = parseFloat($('singleVal').value);
    if (isNaN(val)) { addMessage('system', 'Enter a valid number.'); return; }
    const unit = type === 'custom' ? $('customUnit').value.trim() : '';
    state.measurements.push({ id: uid(), type, val, unit, dt, note });
  }

  saveMeasurements();
  closeTracker();
  renderStats();
  $('measNote').value = '';
  $('singleVal').value = '';
  $('bpSys').value = '';
  $('bpDia').value = '';
  addMessage('system', `Saved: ${measTypeLabel(type)} = ${measValue(state.measurements[state.measurements.length - 1])}`);
}

// ─── History ────────────────────────────────────────────
function openHistory() {
  $('historyModal').style.display = 'flex';
  renderHistory($('historyFilter').value);
}

function closeHistory() {
  $('historyModal').style.display = 'none';
}

function renderHistory(filter) {
  const list = $('historyList');
  let items = state.measurements;
  if (filter !== 'all') items = items.filter(m => m.type === filter);

  if (items.length === 0) {
    list.innerHTML = '<div class="history-empty">No measurements recorded yet.</div>';
    $('trendSection').style.display = 'none';
    return;
  }

  list.innerHTML = '';
  for (const m of items.slice().reverse()) {
    const div = document.createElement('div');
    div.className = 'history-item';
    const d = new Date(m.dt);
    div.innerHTML = `
      <div class="history-item-main">
        <div class="history-item-type">${measTypeLabel(m.type)}</div>
        <div class="history-item-value">${measValue(m)}</div>
        <div class="history-item-date">${d.toLocaleString()}</div>
        ${m.note ? `<div class="history-item-note">${m.note}</div>` : ''}
      </div>
      <button data-id="${m.id}">&times;</button>
    `;
    list.appendChild(div);
    div.querySelector('button').addEventListener('click', () => {
      state.measurements = state.measurements.filter(x => x.id !== m.id);
      saveMeasurements();
      renderHistory($('historyFilter').value);
    });
  }

  renderTrendChart(filter);
}

function renderTrendChart(filter) {
  const section = $('trendSection');
  const svgEl = $('trendChart');
  const items = state.measurements
    .filter(m => m.type === filter)
    .sort((a, b) => new Date(a.dt) - new Date(b.dt));

  if (items.length < 2) { section.style.display = 'none'; return; }
  section.style.display = '';

  const w = svgEl.clientWidth || 500;
  const h = 140;
  const pad = { top: 10, right: 10, bottom: 20, left: 40 };

  const chartSvg = d3.select(svgEl);
  chartSvg.selectAll('*').remove();
  chartSvg.attr('viewBox', [0, 0, w, h]);

  let values;
  if (filter === 'bp') {
    values = items.flatMap(d => [
      { date: new Date(d.dt), val: d.sys, label: 'Systolic' },
      { date: new Date(d.dt), val: d.dia, label: 'Diastolic' }
    ]);
  } else {
    values = items.map(d => ({ date: new Date(d.dt), val: d.val }));
  }

  if (values.length < 2) { section.style.display = 'none'; return; }

  const xScale = d3.scaleTime()
    .domain(d3.extent(values, d => d.date))
    .range([pad.left, w - pad.right]);

  const yScale = d3.scaleLinear()
    .domain([d3.min(values, d => d.val) - 5, d3.max(values, d => d.val) + 5])
    .range([h - pad.bottom, pad.top]);

  const line = d3.line()
    .x(d => xScale(d.date))
    .y(d => yScale(d.val));

  const g = chartSvg.append('g');

  if (filter === 'bp') {
    const sysVals = values.filter(d => d.label === 'Systolic');
    const diaVals = values.filter(d => d.label === 'Diastolic');
    if (sysVals.length > 1) {
      g.append('path').datum(sysVals).attr('d', line).attr('fill', 'none').attr('stroke', 'var(--red)').attr('stroke-width', 1.5).attr('opacity', 0.8);
      g.selectAll('circle-sys').data(sysVals).join('circle').attr('cx', d => xScale(d.date)).attr('cy', d => yScale(d.val)).attr('r', 3).attr('fill', 'var(--red)');
    }
    if (diaVals.length > 1) {
      g.append('path').datum(diaVals).attr('d', line).attr('fill', 'none').attr('stroke', 'var(--accent)').attr('stroke-width', 1.5).attr('opacity', 0.8);
      g.selectAll('circle-dia').data(diaVals).join('circle').attr('cx', d => xScale(d.date)).attr('cy', d => yScale(d.val)).attr('r', 3).attr('fill', 'var(--accent)');
    }
  } else {
    g.append('path').datum(values).attr('d', line).attr('fill', 'none').attr('stroke', 'var(--accent)').attr('stroke-width', 1.5).attr('opacity', 0.8);
    g.selectAll('circle').data(values).join('circle').attr('cx', d => xScale(d.date)).attr('cy', d => yScale(d.val)).attr('r', 3).attr('fill', 'var(--accent)');
  }

  g.append('g').attr('transform', `translate(0,${h - pad.bottom})`).call(d3.axisBottom(xScale).ticks(3).tickFormat(d3.timeFormat('%m/%d')));
  g.append('g').attr('transform', `translate(${pad.left},0)`).call(d3.axisLeft(yScale).ticks(4));
}

// ─── Stats Dashboard ────────────────────────────────────
function renderStats() {
  const bar = $('statsBar');
  const meas = state.measurements;

  if (meas.length === 0) {
    bar.innerHTML = '<div class="stats-empty">Track your numbers to see them here</div>';
    return;
  }

  const latest = {};
  for (const m of meas) {
    if (!latest[m.type] || new Date(m.dt) > new Date(latest[m.type].dt)) {
      latest[m.type] = m;
    }
  }

  const types = ['bp', 'hr', 'weight', 'temp', 'glucose'];
  let html = '';

  for (const type of types) {
    const m = latest[type];
    if (!m) continue;

    let label, value, unit, color = '#34c759';

    if (type === 'bp') {
      label = 'Blood Pressure';
      value = `${m.sys}/${m.dia}`;
      unit = 'mmHg';
      if (m.sys >= 140 || m.dia >= 90) color = '#ff3b30';
      else if (m.sys >= 130 || m.dia >= 85) color = '#ff9500';
    } else if (type === 'hr') {
      label = 'Heart Rate';
      value = m.val;
      unit = 'bpm';
      if (m.val > 100 || m.val < 50) color = '#ff3b30';
      else if (m.val > 90 || m.val < 60) color = '#ff9500';
    } else if (type === 'weight') {
      label = 'Weight';
      value = m.val;
      unit = 'kg';
    } else if (type === 'temp') {
      label = 'Temperature';
      value = m.val;
      unit = '°C';
      if (m.val >= 38) color = '#ff3b30';
    } else if (type === 'glucose') {
      label = 'Blood Sugar';
      value = m.val;
      unit = 'mg/dL';
      if (m.val > 180 || m.val < 70) color = '#ff3b30';
      else if (m.val > 140) color = '#ff9500';
    }

    let barVal = type === 'bp' ? m.sys : m.val;
    html += `
      <div class="stat-card" style="--stat-color:${color}">
        <div class="stat-label">${label}</div>
        <div class="stat-value">${value}</div>
        <div class="stat-unit">${unit}</div>
        <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${Math.min(100, (barVal / 200) * 100)}%;background:${color}"></div></div>
      </div>
    `;
  }

  if (!html) {
    bar.innerHTML = '<div class="stats-empty">Track your numbers to see them here</div>';
    return;
  }

  bar.innerHTML = html;
}

// ─── Init ────────────────────────────────────────────────
function init() {
  // Tracker events
  $('measBtn').addEventListener('click', openTracker);
  $('historyShowBtn').addEventListener('click', openHistory);
  $('trackerClose').addEventListener('click', closeTracker);
  $('trackerCancel').addEventListener('click', closeTracker);
  $('historyClose').addEventListener('click', closeHistory);
  $('historyClose2').addEventListener('click', closeHistory);
  $('saveMeas').addEventListener('click', saveMeasurement);
  $('measType').addEventListener('change', updateMeasFields);
  $('historyFilter').addEventListener('change', () => renderHistory($('historyFilter').value));
  $('clearAllMeas').addEventListener('click', () => {
    if (confirm('Delete all measurements?')) {
      state.measurements = [];
      saveMeasurements();
      renderHistory($('historyFilter').value);
    }
  });

  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target === el) el.style.display = 'none';
    });
  });

  // Resize handler for D3
  window.addEventListener('resize', () => {
    const w = graphContainer.clientWidth;
    const h = graphContainer.clientHeight;
    svg.attr('viewBox', [0, 0, w, h]);
  });

  // Unregister stale service workers
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(regs => {
      for (const reg of regs) reg.unregister();
    });
  }


  // ─── Suggestion Chips ──────────────────────────────────
  document.querySelectorAll('.chip, .example-chip').forEach(el => {
    el.addEventListener('click', () => {
      const text = el.dataset.text || el.textContent;
      chatInput.value = text;
      chatInput.style.height = 'auto';
      chatInput.style.height = Math.min(chatInput.scrollHeight, 100) + 'px';
      sendBtn.disabled = false;
      sendBtn.classList.add('active');
      chatInput.focus();
    });
  });

  renderStats();

  chatInput.focus();
}

document.addEventListener('DOMContentLoaded', init);
