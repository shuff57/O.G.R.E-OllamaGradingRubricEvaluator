import { PROVIDERS, getActiveProvider, setActiveProvider, proxyFetch } from './providers.js';
import BatchGrader from './batch-grader.js';
import {
  startGitHubDeviceFlow,
  startChatGPTDeviceFlow,
  startClaudeCodePasteFlow,
  saveDeviceFlowToken,
  getDeviceFlowToken,
  deleteDeviceFlowToken
} from './device-flow.js';

// --- 1. Initialization & Storage ---
let currentProviderId = 'ollama';
let providerConfigs = {};
let availableModels = []; // Cache models
let currentMode = 'grader';
let batchAbortController = null; // For cancelling batch

// --- Device Flow State ---
// Per-provider state: { flowType, userCode, verificationUrl, polling, cancel }
let deviceFlowStates = {};
// OAuth tokens loaded from chrome.storage.local
let oauthTokens = {};

// Maps provider IDs → device flow starters and token storage keys
const DEVICE_FLOW_PROVIDERS = {
  'github-models': { startFlow: startGitHubDeviceFlow, tokenKey: 'github', flowType: 'device' },
  'openai':        { startFlow: startChatGPTDeviceFlow, tokenKey: 'openai', flowType: 'device' },
  'anthropic':     { startFlow: startClaudeCodePasteFlow, tokenKey: 'anthropic', flowType: 'code-paste' },
};

// Provider setup URLs for "Get API Key" links
const PROVIDER_KEY_URLS = {
  'ollama': null, // User provides their own endpoint
  'openai': 'https://platform.openai.com/api-keys',
  'anthropic': 'https://console.anthropic.com/settings/keys',
  'google-gemini': 'https://aistudio.google.com/app/apikey',
  'github-models': 'https://github.com/settings/tokens/new?description=O.G.R.E%20Extension&scopes=repo,user',
};



document.addEventListener('DOMContentLoaded', async () => {
  // Configure MathLive fonts
  if (window.MathfieldElement) {
    MathfieldElement.fontsDirectory = 'lib/fonts';
  }

  // Load OAuth tokens from storage before provider config (so they're available)
  await loadOAuthTokens();

  // Load provider config (desktop first, fallback to chrome.storage.local)
  await loadProviderConfig();

  // --- Theme Handling ---
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    const themeIcon = themeToggle.querySelector('i');
    
    function applyTheme(theme) {
      document.documentElement.setAttribute('data-theme', theme);
      if (theme === 'light') {
        themeIcon.className = 'bi bi-sun-fill text-warning';
        themeIcon.style.color = ''; 
      } else {
        themeIcon.className = 'bi bi-moon-stars-fill text-muted';
        themeIcon.style.color = ''; 
      }
    }

    const savedThemeData = await chrome.storage.local.get('ogreTheme');
    const currentTheme = savedThemeData.ogreTheme || 'dark';
    applyTheme(currentTheme);

    themeToggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      const next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      chrome.storage.local.set({ ogreTheme: next });
    });
  }

  // Initialize LaTeX Toolbars
  createLatexToolbar('rubricText', 'rubricControls');
  createLatexToolbar('studentText', 'studentControls');

  // Trigger initial UI state
  document.querySelectorAll('input[name="appMode"]').forEach(radio => {
    radio.addEventListener('change', (e) => switchMode(e.target.value));
  });
  
  // Setup UI Listeners
  setupListeners();
  
  // Restore mode from storage if available, else default
  const savedMode = await chrome.storage.local.get('appMode');
  const initialMode = savedMode.appMode || 'grader';
  const modeRadio = document.querySelector(`input[name="appMode"][value="${initialMode}"]`);
  if (modeRadio) {
      modeRadio.checked = true;
      switchMode(initialMode);
  } else {
      switchMode('grader');
  }
});

const presets = {
  nonZero: "Only provide feedback for students with non-zero scores. If the score is 0, leave the feedback blank.",
  lenient: "Grade very leniently. Give partial credit for any attempt that is vaguely correct.",
  strict: "Grade strictly according to the rubric. Deduct points for minor errors."
};

function setupListeners() {
  // Collapsible Config Section
  const configHeader = document.getElementById('configHeader');
  const configContent = document.getElementById('configContent');
  const configCollapseIcon = document.getElementById('configCollapseIcon');
  
  if (configHeader && configContent && configCollapseIcon) {
    // Set initial max-height for smooth transitions
    configContent.style.maxHeight = configContent.scrollHeight + 'px';
    
    configHeader.addEventListener('click', () => {
      const isCollapsed = configContent.classList.contains('collapsed');
      
      if (isCollapsed) {
        // Expand
        configContent.classList.remove('collapsed');
        configCollapseIcon.classList.remove('collapsed');
        configContent.style.maxHeight = configContent.scrollHeight + 'px';
      } else {
        // Collapse
        configContent.classList.add('collapsed');
        configCollapseIcon.classList.add('collapsed');
        configContent.style.maxHeight = '0';
      }
      
      // Save state
      chrome.storage.local.set({ configCollapsed: !isCollapsed });
    });
    
    // Restore collapsed state
    chrome.storage.local.get('configCollapsed').then(result => {
      if (result.configCollapsed) {
        configContent.classList.add('collapsed');
        configCollapseIcon.classList.add('collapsed');
        configContent.style.maxHeight = '0';
      }
    });
  }
  
  // Rubric Card Collapsible
  const rubricHeader = document.getElementById('rubricHeader');
  const rubricContent = document.getElementById('rubricContent');
  const rubricCollapseIcon = document.getElementById('rubricCollapseIcon');
  
  if (rubricHeader && rubricContent && rubricCollapseIcon) {
    rubricContent.style.maxHeight = rubricContent.scrollHeight + 'px';
    
    rubricHeader.addEventListener('click', () => {
      const isCollapsed = rubricContent.classList.contains('collapsed');
      
      if (isCollapsed) {
        rubricContent.classList.remove('collapsed');
        rubricCollapseIcon.classList.remove('collapsed');
        rubricContent.style.maxHeight = rubricContent.scrollHeight + 'px';
      } else {
        rubricContent.classList.add('collapsed');
        rubricCollapseIcon.classList.add('collapsed');
        rubricContent.style.maxHeight = '0';
      }
      
      chrome.storage.local.set({ rubricCollapsed: !isCollapsed });
    });
    
    chrome.storage.local.get('rubricCollapsed').then(result => {
      if (result.rubricCollapsed) {
        rubricContent.classList.add('collapsed');
        rubricCollapseIcon.classList.add('collapsed');
        rubricContent.style.maxHeight = '0';
      }
    });
  }
  
  // Student Work Card Collapsible
  const studentWorkHeader = document.getElementById('studentWorkHeader');
  const studentWorkContent = document.getElementById('studentWorkContent');
  const studentWorkCollapseIcon = document.getElementById('studentWorkCollapseIcon');
  
  if (studentWorkHeader && studentWorkContent && studentWorkCollapseIcon) {
    studentWorkContent.style.maxHeight = studentWorkContent.scrollHeight + 'px';
    
    studentWorkHeader.addEventListener('click', () => {
      const isCollapsed = studentWorkContent.classList.contains('collapsed');
      
      if (isCollapsed) {
        studentWorkContent.classList.remove('collapsed');
        studentWorkCollapseIcon.classList.remove('collapsed');
        studentWorkContent.style.maxHeight = studentWorkContent.scrollHeight + 'px';
      } else {
        studentWorkContent.classList.add('collapsed');
        studentWorkCollapseIcon.classList.add('collapsed');
        studentWorkContent.style.maxHeight = '0';
      }
      
      chrome.storage.local.set({ studentWorkCollapsed: !isCollapsed });
    });
    
    chrome.storage.local.get('studentWorkCollapsed').then(result => {
      if (result.studentWorkCollapsed) {
        studentWorkContent.classList.add('collapsed');
        studentWorkCollapseIcon.classList.add('collapsed');
        studentWorkContent.style.maxHeight = '0';
      }
    });
  }
  
  // Batch Card Collapsible
  const batchHeader = document.getElementById('batchHeader');
  const batchContent = document.getElementById('batchContent');
  const batchCollapseIcon = document.getElementById('batchCollapseIcon');
  
  if (batchHeader && batchContent && batchCollapseIcon) {
    batchContent.style.maxHeight = batchContent.scrollHeight + 'px';
    
    batchHeader.addEventListener('click', () => {
      const isCollapsed = batchContent.classList.contains('collapsed');
      
      if (isCollapsed) {
        batchContent.classList.remove('collapsed');
        batchCollapseIcon.classList.remove('collapsed');
        batchContent.style.maxHeight = batchContent.scrollHeight + 'px';
      } else {
        batchContent.classList.add('collapsed');
        batchCollapseIcon.classList.add('collapsed');
        batchContent.style.maxHeight = '0';
      }
      
      chrome.storage.local.set({ batchCollapsed: !isCollapsed });
    });
    
    chrome.storage.local.get('batchCollapsed').then(result => {
      if (result.batchCollapsed) {
        batchContent.classList.add('collapsed');
        batchCollapseIcon.classList.add('collapsed');
        batchContent.style.maxHeight = '0';
      }
    });
  }
  
  document.getElementById('btnRefreshModels').addEventListener('click', refreshModels);
  
  // Provider Switching
  const providerSelect = document.getElementById('providerSelect');
  if (providerSelect) {
    providerSelect.addEventListener('change', (e) => {
      switchProvider(e.target.value);
    });
  }

  // Desktop Mode Listeners
  setupDesktopListeners();

  // Device Flow (OAuth) Listeners
  setupDeviceFlowListeners();

  // Preset Buttons for Grading Instructions
  document.getElementById('btnPresetNonZero')?.addEventListener('click', () => {
    document.getElementById('customInstructions').value = presets.nonZero;
    saveState();
  });
  
  document.getElementById('btnPresetLenient')?.addEventListener('click', () => {
    document.getElementById('customInstructions').value = presets.lenient;
    saveState();
  });
  
  document.getElementById('btnPresetStrict')?.addEventListener('click', () => {
    document.getElementById('customInstructions').value = presets.strict;
    saveState();
  });

  // Auto-save on manual input
  document.getElementById('customInstructions')?.addEventListener('input', saveState);
}


let conversationHistory = [];

// Helper to get content from rich editor (text + latex)
function getRichEditorContent(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return "";
  
  let content = "";
  el.childNodes.forEach(node => {
    if (node.nodeType === Node.TEXT_NODE) {
      content += node.textContent;
    } else if (node.tagName && node.tagName.toLowerCase() === 'math-field') {
      content += `$$${node.value}$$`;
    } else if (node.tagName === 'BR') {
      content += '\n';
    } else {
      content += node.innerText || "";
    }
  });
  return content;
}

// Helper to set content to rich editor (simple text)
function setRichEditorContent(elementId, text) {
  const el = document.getElementById(elementId);
  if (el) el.innerText = text;
}

function createLatexToolbar(textareaId, containerId) {
  const textarea = document.getElementById(textareaId);
  if (!textarea) return;

  // Add Math Editor Button directly (no toolbar wrapper)
  const mathBtn = document.createElement('button');
  mathBtn.className = 'secondary';
  
  if (containerId) {
      // Icon-only style for inline controls
      mathBtn.innerHTML = '<i class="bi bi-calculator"></i>';
      // Styles are now handled by CSS class .integrated-controls button
      mathBtn.removeAttribute('style'); // Clear inline styles to let CSS take over
  } else {
      // Full button style for rubric
      mathBtn.innerHTML = '<i class="bi bi-calculator"></i> Insert Math';
      mathBtn.style.width = '100%'; 
      mathBtn.style.marginBottom = '5px';
      mathBtn.style.fontSize = '12px';
  }
  
  mathBtn.title = 'Insert Math Equation';
  mathBtn.type = 'button';
  mathBtn.addEventListener('click', () => {
    insertMathField(textarea);
  });

  if (containerId) {
    const container = document.getElementById(containerId);
    if (container) {
      // Insert at the top of the container
      container.insertBefore(mathBtn, container.firstChild);
    }
  } else {
    // Insert button before the textarea
    textarea.parentNode.insertBefore(mathBtn, textarea);
  }

  // Handle backspace to delete math-field
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace') {
      const selection = window.getSelection();
      if (selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);

      if (range.collapsed) {
        // Check if the cursor is immediately after a math-field
        let previousNode = null;
        
        if (range.startContainer === textarea) {
          // Cursor is directly in the editor div
          if (range.startOffset > 0) {
            previousNode = textarea.childNodes[range.startOffset - 1];
          }
        } else if (range.startContainer.nodeType === Node.TEXT_NODE && range.startOffset === 0) {
          // Cursor is at the start of a text node
          previousNode = range.startContainer.previousSibling;
        }

        if (previousNode && previousNode.tagName === 'MATH-FIELD') {
          e.preventDefault();
          // Select the node and execute delete to preserve undo history
          const range = document.createRange();
          range.selectNode(previousNode);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          document.execCommand('delete');
        }
      }
    }
  });
}

function insertMathField(editor) {
  editor.focus();
  
  const mf = new MathfieldElement();
  mf.mathVirtualKeyboardPolicy = "manual"; // Ensure keyboard toggle is visible
  mf.style.display = 'inline-block';
  mf.style.width = 'auto';
  // Min-width handled by CSS class .rich-editor math-field
  
  // Allow deleting the box if empty and backspace is pressed
  mf.addEventListener('keydown', (ev) => {
    if ((ev.key === 'Backspace' || ev.key === 'Delete') && !mf.value) {
      ev.preventDefault();
      // Select the node and execute delete to preserve undo history
      const range = document.createRange();
      range.selectNode(mf);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('delete');
      editor.focus();
    }
  });

  // Ensure focus when clicked
  mf.addEventListener('click', (e) => {
    // Stop the click from bubbling to the contenteditable parent
    // which might try to move the caret elsewhere
    e.stopPropagation(); 
    mf.focus();
  });
  
  // Insert at cursor
  const selection = window.getSelection();
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    // Ensure we are inserting into the correct editor
    if (editor.contains(range.commonAncestorContainer)) {
      range.deleteContents();
      range.insertNode(mf);
      
      // Insert a zero-width space after the math field to allow typing
      const spacer = document.createTextNode('\u00A0');
      if (mf.nextSibling) {
        mf.parentNode.insertBefore(spacer, mf.nextSibling);
      } else {
        mf.parentNode.appendChild(spacer);
      }

      // Move cursor after the spacer
      range.setStartAfter(spacer);
      range.setEndAfter(spacer);
      selection.removeAllRanges();
      selection.addRange(range);
      
      // Focus the new math field
      setTimeout(() => mf.focus(), 10);
    } else {
      // Fallback: append to end
      editor.appendChild(mf);
      const spacer = document.createTextNode('\u00A0');
      editor.appendChild(spacer);
      setTimeout(() => mf.focus(), 10);
    }
  } else {
    editor.appendChild(mf);
    const spacer = document.createTextNode('\u00A0');
    editor.appendChild(spacer);
    setTimeout(() => mf.focus(), 10);
  }
}

// --- MathLive Modal Logic --- REMOVED (Inline editing used instead)
/*
let currentTargetTextarea = null;
function openMathModal(textarea) { ... }
*/

document.getElementById('saveConfig').addEventListener('click', () => {
  saveState();
  showConfigStatus('Settings saved!', 'green');
});

// Handle Model Change for Thinking Controls
const modelSelect = document.getElementById('modelName');
modelSelect.addEventListener('change', () => {
  updateThinkingControls();
  // Write-back model selection to desktop (fire-and-forget)
  if (desktopConnected && handshakeToken) {
    const model = document.getElementById('modelName').value || '';
    fetch('http://localhost:3456/api/providers/active', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${handshakeToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        provider_id: currentProviderId,
        model: model
      })
    }).catch(err => {
      console.warn('[Desktop] Write-back failed:', err);
    });
  }
});
// Call on init
updateThinkingControls();

function updateThinkingControls() {
  const model = document.getElementById('modelName').value;
  const thinkingControls = document.getElementById('thinkingControls');
  const gptThinking = document.getElementById('gptThinking');
  const otherThinking = document.getElementById('otherThinking');

  thinkingControls.style.display = 'none';
  gptThinking.style.display = 'none';
  otherThinking.style.display = 'none';

  if (model.includes('gpt-oss')) {
    thinkingControls.style.display = 'block';
    gptThinking.style.display = 'block';
  } else if (
    model.includes('qwen3') || 
    model.includes('deepseek-v3.1') || 
    model.includes('deepseek-r1') ||
    model.includes('kimi-k2-thinking') ||
    model.includes('kimi-k2.5') ||
    model.includes('glm-4.6') ||
    model.includes('glm-4.7')
  ) {
    thinkingControls.style.display = 'block';
    otherThinking.style.display = 'block';
  }
}

document.getElementById('testConnection').addEventListener('click', async () => {
  const provider = PROVIDERS[currentProviderId];
  if (!provider) return;

    let config = getProviderConfigFromUI(currentProviderId);
  
  showConfigStatus('Testing connection...', 'blue');
  
  const result = await provider.testConnection(config);
  
  if (result.ok) {
    showConfigStatus('Connection successful!', 'green');
  } else {
    showConfigStatus(`Connection failed: ${result.error}`, 'red');
  }
});

// --- 2. Handling Rubric (File Upload) ---
// Toggle between Text and Table mode
let rubricImages = [];
let studentImages = [];

function addImage(target, base64) {
  const container = document.getElementById(target === 'rubric' ? 'rubricImagesContainer' : 'studentImagesContainer');
  const list = target === 'rubric' ? rubricImages : studentImages;
  
  list.push(base64);
  renderImages(target);
  if (target === 'rubric') saveState();
}

function removeImage(target, index) {
  const list = target === 'rubric' ? rubricImages : studentImages;
  list.splice(index, 1);
  renderImages(target);
  if (target === 'rubric') saveState();
}

function renderImages(target) {
  const container = document.getElementById(target === 'rubric' ? 'rubricImagesContainer' : 'studentImagesContainer');
  const list = target === 'rubric' ? rubricImages : studentImages;
  
  container.innerHTML = '';
  list.forEach((base64, index) => {
    const div = document.createElement('div');
    div.style.position = 'relative';
    div.style.width = '100px';
    div.style.height = 'auto';
    
    const img = document.createElement('img');
    img.src = base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`;
    img.style.width = '100%';
    img.classList.add('border-light', 'rounded-sm');
    
    const btn = document.createElement('button');
    btn.innerHTML = '&times;';
    btn.style.position = 'absolute';
    btn.style.top = '-5px';
    btn.style.right = '-5px';
    
    btn.classList.add('bg-error', 'text-white', 'border-none', 'rounded-circle');
    // Inline styles for layout only
    btn.style.width = '20px';
    btn.style.height = '20px';
    btn.style.cursor = 'pointer';
    btn.style.fontSize = '12px';
    btn.style.lineHeight = '1';
    btn.style.padding = '0';
    
    btn.addEventListener('click', () => removeImage(target, index));
    
    div.appendChild(img);
    div.appendChild(btn);
    container.appendChild(div);
  });
}

document.querySelectorAll('input[name="rubricMode"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    if (e.target.value === 'text') {
      document.getElementById('rubricTextContainer').style.display = 'block';
      document.getElementById('rubricTableContainer').style.display = 'none';
    } else {
      document.getElementById('rubricTextContainer').style.display = 'none';
      document.getElementById('rubricTableContainer').style.display = 'block';
      // Add a default row if empty
      const tbody = document.querySelector('#rubricTable tbody');
      if (tbody.children.length === 0) {
        addRubricRow();
      }
    }
  });
});

document.getElementById('btnAddRow').addEventListener('click', addRubricRow);

function addRubricRow(criteria = '', desc = '', pts = '') {
  const tbody = document.querySelector('#rubricTable tbody');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td class="rubric-td p-0"><input type="text" class="r-criteria input-reset" placeholder="Criteria" value="${criteria}"></td>
    <td class="rubric-td p-0"><input type="text" class="r-desc input-reset" placeholder="Description" value="${desc}"></td>
    <td class="rubric-td p-0"><input type="text" class="r-pts input-reset" placeholder="0" value="${pts}"></td>
    <td class="rubric-td p-0 text-center"><button class="btn-del btn-icon-danger"><i class="bi bi-trash"></i></button></td>
  `;
  tr.querySelector('.btn-del').addEventListener('click', () => {
    tr.remove();
    saveState();
  });
  tbody.appendChild(tr);
}

function getRubricFromTable() {
  const rows = document.querySelectorAll('#rubricTable tbody tr');
  let text = "Rubric:\n";
  rows.forEach(row => {
    const criteria = row.querySelector('.r-criteria').value;
    const desc = row.querySelector('.r-desc').value;
    const pts = row.querySelector('.r-pts').value;
    if (criteria || desc || pts) {
      text += `- Criteria: ${criteria}, Description: ${desc}, Points: ${pts}\n`;
    }
  });
  return text;
}

document.getElementById('rubricUpload').addEventListener('change', (e) => {
  const files = e.target.files;
  if (files && files.length > 0) {
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = function(event) {
        const base64Raw = event.target.result; 
        // Strip header for Ollama (data:image/png;base64,...)
        // But keep full string for display
        addImage('rubric', base64Raw);
      };
      reader.readAsDataURL(file);
    });
  }
});

document.getElementById('studentUpload').addEventListener('change', (e) => {
  const files = e.target.files;
  if (files && files.length > 0) {
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = function(event) {
        const base64Raw = event.target.result; 
        addImage('student', base64Raw);
      };
      reader.readAsDataURL(file);
    });
  }
});

// REMOVED btnRubricScreenshot listener

// --- Import Rubric from Highlight ---
function showRubricStatus(text, type = 'loading') {
  const el = document.getElementById('rubricStatus');
  const txt = document.getElementById('rubricStatusText');
  const spinner = el.querySelector('.spinner');
  
  el.style.display = 'flex';
  txt.innerText = text;
  
  if (type === 'loading') {
    el.classList.add('status-info');
    el.classList.remove('status-success', 'status-error');
    el.style.background = '';
    el.style.borderColor = '';
    el.style.color = '';
    spinner.style.display = 'block';
    spinner.style.borderColor = ''; // Inherit color
    spinner.style.borderTopColor = 'transparent';
  } else if (type === 'success') {
    el.classList.add('status-success');
    el.classList.remove('status-info', 'status-error');
    el.style.background = '';
    el.style.borderColor = '';
    el.style.color = '';
    spinner.style.display = 'none';
    setTimeout(() => { el.style.display = 'none'; }, 3000);
  } else if (type === 'error') {
    el.classList.add('status-error');
    el.classList.remove('status-info', 'status-success');
    el.style.background = '';
    el.style.borderColor = '';
    el.style.color = '';
    spinner.style.display = 'none';
  }
}

document.getElementById('btnGetRubricText').addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection().toString()
    }, (results) => {
      if (chrome.runtime.lastError) {
        showRubricStatus("Error: Please refresh the web page and try again.", "error");
        return;
      }
      
      if (results && results[0] && results[0].result) {
        // Switch to text mode
        document.querySelector('input[name="rubricMode"][value="text"]').click();
        
        const editor = document.getElementById('rubricText');
        const text = results[0].result;
        
        if (editor.innerText.trim()) {
          editor.innerText += "\n\n" + text;
        } else {
          editor.innerText = text;
        }
        saveState();
      } else {
        showRubricStatus("No text selected on page.", "error");
      }
    });
  } catch (e) {
    showRubricStatus("Error: " + e.message, "error");
  }
});

document.getElementById('btnImportRubric').addEventListener('click', async () => {
  // 1. Get Highlighted Text
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let selection = "";
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection().toString()
    });
    if (results && results[0] && results[0].result) {
      selection = results[0].result;
    }
  } catch (e) {
    showRubricStatus("Could not get selection: " + e.message, "error");
    return;
  }

  if (!selection || selection.trim() === "") {
    showRubricStatus("Please highlight rubric text on the page first.", "error");
    return;
  }

  showRubricStatus("Parsing rubric from text...", "loading");
   const btn = document.getElementById('btnImportRubric');
   btn.disabled = true;

   try {
     const provider = PROVIDERS[currentProviderId];
     if (!provider) throw new Error("No provider selected");
     
     let config = getProviderConfigFromUI(currentProviderId);
     config.model = document.getElementById('modelName').value;

    const prompt = Prompts.getRubricExtractionPrompt(selection);
    const messages = [{ role: "user", content: prompt }];
    
    // Use buildChatRequest but disable streaming
    const req = provider.buildChatRequest(config, messages, { stream: false });

    const response = await fetch(req.url, {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify(req.body)
    });

    if (!response.ok) {
      if (response.status === 401) throw new Error("401 Unauthorized. Check API Key.");
      throw new Error(`API Error: ${response.status}`);
    }

    const data = await response.json();
    let content = "";
    
    // Normalize Response
    if (data.message && data.message.content) content = data.message.content; // Ollama Chat
    else if (data.choices && data.choices[0] && data.choices[0].message) content = data.choices[0].message.content; // OpenAI/GitHub
    else if (data.response) content = data.response; // Legacy Ollama Generate
    
    // Clean JSON
    content = content.replace(/```json/g, "").replace(/```/g, "").trim();
    
    const parsed = JSON.parse(content);
    
    if (parsed && parsed.rubric && Array.isArray(parsed.rubric)) {
      // 3. Populate Table
      const tbody = document.querySelector('#rubricTable tbody');
      tbody.innerHTML = ""; 
      
      parsed.rubric.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="rubric-td"><input type="text" class="r-criteria input-reset" value="${item.criteria || ''}"></td>
          <td class="rubric-td"><input type="text" class="r-desc input-reset" value="${item.description || ''}"></td>
          <td class="rubric-td"><input type="text" class="r-pts input-reset" value="${item.points || 0}"></td>
          <td class="rubric-td" style="text-align:center;"><button class="btn-del btn-icon-danger"><i class="bi bi-trash"></i></button></td>
        `;
        tr.querySelector('.btn-del').addEventListener('click', () => tr.remove());
        tbody.appendChild(tr);
      });

      document.querySelector('input[name="rubricMode"][value="table"]').click();
      showRubricStatus("Rubric imported successfully!", "success");
      rubricImages = [];
      renderImages('rubric');
      saveState();
    } else {
      throw new Error("Invalid JSON structure returned");
    }

  } catch (err) {
    console.error(err);
    showRubricStatus("Failed to parse rubric: " + err.message, "error");
  } finally {
    btn.disabled = false;
  }
});

// --- Import Rubric from Image ---
document.getElementById('btnImportRubricImage').addEventListener('click', async () => {
  if (rubricImages.length === 0) {
    showRubricStatus("Please take a screenshot or upload an image of the rubric first.", "error");
    return;
  }

  showRubricStatus("Parsing rubric from image...", "loading");
  const btn = document.getElementById('btnImportRubricImage');
  btn.disabled = true;

  try {
     const provider = PROVIDERS[currentProviderId];
     if (!provider) throw new Error("No provider selected");
     
     let config = getProviderConfigFromUI(currentProviderId);
     config.model = document.getElementById('modelName').value;

     const prompt = Prompts.getRubricExtractionFromImagePrompt();
    const images = rubricImages.map(img => img.split(',')[1]);

    // Construct message with images (Ollama style - provider adapter will transform for OpenAI/GitHub)
    const messages = [{
      role: "user",
      content: prompt,
      images: images
    }];

    const req = provider.buildChatRequest(config, messages, { stream: false });

    const response = await fetch(req.url, {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify(req.body)
    });

    if (!response.ok) {
      if (response.status === 401) throw new Error("401 Unauthorized. Check API Key.");
      throw new Error(`API Error: ${response.status}`);
    }

    const data = await response.json();
    let content = "";
    
    if (data.message && data.message.content) content = data.message.content;
    else if (data.choices && data.choices[0] && data.choices[0].message) content = data.choices[0].message.content;
    else if (data.response) content = data.response;

    content = content.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(content);
    
    if (parsed && parsed.rubric && Array.isArray(parsed.rubric)) {
      const tbody = document.querySelector('#rubricTable tbody');
      tbody.innerHTML = "";
      
      parsed.rubric.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="rubric-td"><input type="text" class="r-criteria input-reset" value="${item.criteria || ''}"></td>
          <td class="rubric-td"><input type="text" class="r-desc input-reset" value="${item.description || ''}"></td>
          <td class="rubric-td"><input type="text" class="r-pts input-reset" value="${item.points || 0}"></td>
          <td class="rubric-td" style="text-align:center;"><button class="btn-del btn-icon-danger"><i class="bi bi-trash"></i></button></td>
        `;
        tr.querySelector('.btn-del').addEventListener('click', () => tr.remove());
        tbody.appendChild(tr);
      });

      document.querySelector('input[name="rubricMode"][value="table"]').click();
      showRubricStatus("Rubric imported successfully!", "success");
      rubricImages = [];
      renderImages('rubric');
      saveState();
    } else {
      throw new Error("Invalid JSON structure returned");
    }

  } catch (err) {
    console.error(err);
    showRubricStatus("Failed to parse rubric: " + err.message, "error");
  } finally {
    btn.disabled = false;
  }
});

// --- 3. Handling Student Work (Highlight & Screenshot) ---

let currentCaptureTarget = null; // 'rubric' or 'student'

// A. Get Highlighted Text
document.getElementById('btnGetStudentText').addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection().toString()
    }, (results) => {
      if (chrome.runtime.lastError) {
        showStatus("Error: Please refresh the web page and try again.", "red");
        return;
      }

      if (results && results[0] && results[0].result) {
        setRichEditorContent('studentText', results[0].result);
      } else {
        showStatus("No text selected on page.", "orange");
      }
    });
  } catch (e) {
    showStatus("Error: " + e.message, "red");
  }
});

// B. Import Student Work (Text)
document.getElementById('btnImportStudent').addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection().toString()
    }, async (results) => {
      if (chrome.runtime.lastError) {
        showStatus("Error: Please refresh the web page.", "red");
        return;
      }
      if (results && results[0] && results[0].result) {
        const text = results[0].result;
        showStatus("Processing student text...", "blue");
        // Just set it for now, or we could add an LLM call to 'clean' it
        setRichEditorContent('studentText', text);
        showStatus("Student text imported.", "green");
      } else {
        showStatus("No text selected.", "orange");
      }
    });
  } catch (e) {
    showStatus("Error: " + e.message, "red");
  }
});

// C. Import Student Work (Image)
document.getElementById('btnImportStudentImage').addEventListener('click', () => {
  // We reuse the area selection logic but set a flag to process it differently
  startAreaSelection('student-import');
});

// B. Screenshot Visible Tab - REMOVED

// C. Area Selection Logic
document.getElementById('btnRubricArea').addEventListener('click', () => startAreaSelection('rubric'));
document.getElementById('btnStudentArea').addEventListener('click', () => startAreaSelection('student'));

async function startAreaSelection(target) {
  currentCaptureTarget = target;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  // Inject the capture script
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['capture_area.js']
  });
}

// Listen for area selection from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "areaSelected" && currentCaptureTarget) {
    processAreaCapture(request.area);
  }
});

function processAreaCapture(area) {
  // 1. Capture full visible tab
  chrome.runtime.sendMessage({ action: "captureVisibleTab" }, (response) => {
    if (response && response.dataUrl) {
      // 2. Crop image
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Handle device pixel ratio
        const dpr = area.devicePixelRatio || 1;
        
        canvas.width = area.width * dpr;
        canvas.height = area.height * dpr;
        
        ctx.drawImage(
          img,
          area.x * dpr, area.y * dpr, area.width * dpr, area.height * dpr,
          0, 0, canvas.width, canvas.height
        );
        
        const croppedDataUrl = canvas.toDataURL('image/png');
        
        // 3. Update UI
        if (currentCaptureTarget === 'rubric-import') {
          extractRubricFromImage(croppedDataUrl);
        } else if (currentCaptureTarget === 'student-import') {
          // For now, just add the image, but we could add OCR logic here later
          // Or we can try to extract text using a vision model if the user wants
          // For now, let's treat it as adding an image to the student section
          addImage('student', croppedDataUrl);
          showStatus("Student work image added.", "green");
        } else {
          addImage(currentCaptureTarget, croppedDataUrl);
        }
        
        currentCaptureTarget = null;
      };
      img.src = response.dataUrl;
    }
  });
}

// --- 4. The Main Logic: Call Ollama ---
let solverTurn = 0;

async function switchMode(mode) {
  currentMode = mode;
  document.body.className = ''; // Reset classes
  
  const studentText = document.getElementById('studentText');
  const rubricCard = document.getElementById('rubricCard');
  // Find the student card by looking for the title's parent card
  const studentWorkCard = document.getElementById('studentWorkTitle').closest('.card');
  const batchGradeCard = document.getElementById('batchGradeCard');
  // runAssessmentCard might be null if not strictly defined with ID in previous steps, 
  // but I added ID="runAssessmentCard" in the HTML edit.
  const runAssessmentCard = document.getElementById('runAssessmentCard');
  
  const rubricTitle = document.getElementById('rubricTitle');
  const studentWorkTitle = document.getElementById('studentWorkTitle');
  
  const btnImportStudent = document.getElementById('btnImportStudent');
  const btnImportStudentImage = document.getElementById('btnImportStudentImage');
  const btnImportRubric = document.getElementById('btnImportRubric');
  const btnImportRubricImage = document.getElementById('btnImportRubricImage');
  const rubricText = document.getElementById('rubricText');
  const chatHistoryDisplay = document.getElementById('chatHistoryDisplay');
  
  // Reset History and State
  chatHistoryDisplay.innerHTML = '';
  conversationHistory = [];
  solverTurn = 0;
  
  // Default Visibility (Grader/Solver)
  rubricCard.style.display = 'block';
  studentWorkCard.style.display = 'block';
  runAssessmentCard.style.display = 'block';
  batchGradeCard.style.display = 'none';

  if (mode === 'solver') {
    document.body.classList.add('solver-mode');
    rubricTitle.innerHTML = '<i class="bi bi-list-check"></i> Question Setup';
    studentWorkTitle.innerHTML = '<i class="bi bi-chat-dots"></i> Solver Chat';
    
    btnImportRubric.innerHTML = '<i class="bi bi-stars"></i> Import Question for Highlighted Text (AI)';
    btnImportRubricImage.innerHTML = '<i class="bi bi-file-image"></i> Import Question from Screenshot (AI)';

    btnImportStudent.innerHTML = '<i class="bi bi-stars"></i> Import from Highlighted Text (AI)';
    btnImportStudentImage.innerHTML = '<i class="bi bi-file-image"></i> Import from Screenshot (AI)';

    studentText.setAttribute('placeholder', "Ask a question...");
    rubricText.setAttribute('placeholder', "Paste question text here or upload image...");

  } else if (mode === 'batch') {
    document.body.classList.add('batch-mode');
    
    rubricCard.style.display = 'none';
    studentWorkCard.style.display = 'none';
    runAssessmentCard.style.display = 'none';
    batchGradeCard.style.display = 'block';
    
    checkBatchPageStatus();

  } else {
    // Grader (Default)
    rubricTitle.innerHTML = '<i class="bi bi-list-check"></i> Define Role / Rubric';
    studentWorkTitle.innerHTML = '<i class="bi bi-person-workspace"></i> Student Work';
    
    btnImportRubric.innerHTML = '<i class="bi bi-stars"></i> Import Rubric from Highlighted Text (AI)';
    btnImportRubricImage.innerHTML = '<i class="bi bi-file-image"></i> Import Rubric from Screenshot (AI)';

    btnImportStudent.innerHTML = '<i class="bi bi-stars"></i> Import Student Work from Text (AI)';
    btnImportStudentImage.innerHTML = '<i class="bi bi-file-image"></i> Import Student Work from Screenshot (AI)';

    studentText.setAttribute('placeholder', "Student text will appear here...");
    rubricText.setAttribute('placeholder', "Paste rubric text here or upload image...");
  }
  saveState();
}

// Check if current page is supported for batch grading
async function checkBatchPageStatus() {
  const statusEl = document.getElementById('batchPageStatus');
  const statusText = document.getElementById('batchPageStatusText');
  const btnStart = document.getElementById('btnStartBatch');
  const resumePrompt = document.getElementById('resumePrompt');
  
  statusText.innerText = "Checking page compatibility...";
  statusEl.classList.add('status-info');
  statusEl.classList.remove('status-success', 'status-error');
  statusEl.style.background = '';
  statusEl.style.color = '';
  btnStart.disabled = true;
  resumePrompt.style.display = 'none';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) return;

    // Simple URL check first
    if (tab.url.includes('gradeallq2.php')) { // MyOpenMath specific
       statusText.innerText = "Supported grading page detected!";
       statusEl.classList.add('status-success');
       statusEl.classList.remove('status-info', 'status-error');
       statusEl.style.background = '';
       statusEl.style.color = '';
       btnStart.disabled = false;
       
       // Check for saved state
       await checkResumeState(tab.url);
    } else {
       statusText.innerText = "";
       statusEl.style.display = 'none';
       statusEl.classList.remove('status-error', 'status-info', 'status-success');
       statusEl.style.background = '';
       statusEl.style.color = '';
    }
  } catch (e) {
    statusText.innerText = "Error checking page.";
  }
}

async function checkResumeState(pageUrl) {
  const resumePrompt = document.getElementById('resumePrompt');
  const resumePromptText = document.getElementById('resumePromptText');
  const resumeInput = document.getElementById('resumeStudent');
  
  try {
    const state = await BatchGrader.getBatchGradeState(pageUrl);
    
    if (state && state.lastStudent) {
      // Format timestamp
      const date = new Date(state.timestamp);
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      
      resumePromptText.innerHTML = `Last graded: <strong>${state.lastStudent}</strong> (${state.count} students, ${dateStr})`;
      resumePrompt.style.display = 'block';
      
      // Store state for resume button
      resumePrompt.dataset.lastStudent = state.lastStudent;
    } else {
      resumePrompt.style.display = 'none';
      resumeInput.value = '';
    }
  } catch (err) {
    console.error('Failed to check resume state:', err);
  }
}

// Toggle UI based on mode - REMOVED (Replaced by switchMode)
/*
document.getElementById('modeSwitch').addEventListener('change', (e) => {
   // ...
});
*/

document.getElementById('btnSolverSend').addEventListener('click', async () => {
  let modelName = document.getElementById('modelName').value;
  const isSolver = currentMode === 'solver';
  
  // Auto-switch model if images are present
  if (studentImages.length > 0 || rubricImages.length > 0) {
    const visionModel = "qwen3-vl:235b-instruct-cloud"; // Or just "qwen3-vl" depending on your preference
    if (modelName !== visionModel) {
      modelName = visionModel;
      document.getElementById('modelName').value = visionModel;
      updateThinkingControls(); // Update UI controls for the new model
      showStatus(`Auto-switched to ${visionModel} for image analysis.`, "blue");
    }
  }
  
  let rubricText = "";
  const rubricMode = document.querySelector('input[name="rubricMode"]:checked').value;
  
  if (rubricMode === 'table') {
    rubricText = getRubricFromTable();
  } else {
    rubricText = getRichEditorContent('rubricText');
  }

  const studentText = getRichEditorContent('studentText');

  if (!isSolver && !rubricText && rubricImages.length === 0) {
    showStatus("Please provide a rubric or role.", "red");
    return;
  }
  
  if (!studentText && studentImages.length === 0) {
    showStatus("Please provide text or images.", "red");
    return;
  }

  showStatus("Thinking...", "blue");

  // Gather Images
  const images = [];
  // Add rubric images (Keep full Data URL for provider adapter to handle)
  rubricImages.forEach(img => images.push(img));
  // Add student images (Keep full Data URL for provider adapter to handle)
  studentImages.forEach(img => images.push(img));

  // Add User Bubble to Chat History
  const chatHistoryDisplay = document.getElementById('chatHistoryDisplay');
  
  // Clear placeholder if first message in Grader mode
  if (!isSolver && conversationHistory.length === 0) {
      chatHistoryDisplay.innerHTML = '';
  }

  const userBubble = document.createElement('div');
  userBubble.className = 'chat-message user-message';
  userBubble.innerText = studentText; // Show raw text to user
  chatHistoryDisplay.appendChild(userBubble);
  chatHistoryDisplay.scrollTop = chatHistoryDisplay.scrollHeight;

  // Clear Input
  setRichEditorContent('studentText', '');
  studentImages = []; // Clear images after sending
  renderImages('student');

  let systemInstruction;
  let userPrompt;
  let mode = 'chat';

  if (isSolver) {
    // If it's the first turn or a reset
    if (solverTurn === 0 || solverTurn >= 4) {
        solverTurn = 1;
        // chatHistoryDisplay.innerHTML = ''; // Don't clear history here, let user see previous
        systemInstruction = Prompts.getSolverSystemPrompt(rubricText);
        userPrompt = `Student Question (Interaction 1/4): ${studentText}`;
        
        // Initialize History
        conversationHistory = [
            { role: "system", content: systemInstruction },
            { role: "user", content: userPrompt, images: images.length > 0 ? images : undefined }
        ];
        mode = 'solver';
    } else {
        // Continuation
        solverTurn++;
        userPrompt = `Student Follow-up (Interaction ${solverTurn}/4): ${studentText}`;
        conversationHistory.push({ role: "user", content: userPrompt, images: images.length > 0 ? images : undefined });
        mode = 'solver';
    }
  } else {
    // Grader Mode
    // Always treat as a new grading task to ensure consistent formatting
    systemInstruction = Prompts.getGradingSystemPrompt(rubricText);
    userPrompt = `Student Submission: ${studentText}`;
    
    // Reset history for each grading run to prevent context pollution and ensure JSON output
    conversationHistory = [
        { role: "system", content: systemInstruction },
        { role: "user", content: userPrompt, images: images.length > 0 ? images : undefined }
    ];
    mode = 'grading';
  }

  await streamChat(conversationHistory, mode);
});

// --- Chat Logic ---
// Chat/Grade/Solver all use btnSolverSend click handler (line ~983)

async function streamChat(messages, mode) {
  const provider = PROVIDERS[currentProviderId];
  if (!provider) {
    showStatus("Error: No provider selected", "red");
    return;
  }

     let config = getProviderConfigFromUI(currentProviderId);
     config.model = modelName;

    // Prepare Chat Bubble for Assistant
  const chatHistoryDisplay = document.getElementById('chatHistoryDisplay');
  const assistantBubble = document.createElement('div');
  assistantBubble.className = 'chat-message assistant-message';
  chatHistoryDisplay.appendChild(assistantBubble);
  chatHistoryDisplay.scrollTop = chatHistoryDisplay.scrollHeight;

  // Thinking Container inside Bubble
  const thinkingDetails = document.createElement('details');
  thinkingDetails.style.display = 'none';
  thinkingDetails.style.marginBottom = '10px';
  thinkingDetails.style.fontSize = '12px';
  thinkingDetails.classList.add('text-muted', 'border-left-thick');
  thinkingDetails.style.color = '';
  thinkingDetails.style.borderLeft = '';
  thinkingDetails.style.paddingLeft = '8px';
  
  const thinkingSummary = document.createElement('summary');
  thinkingSummary.innerText = 'Thinking Process';
  thinkingSummary.style.cursor = 'pointer';
  thinkingSummary.style.fontWeight = 'bold';
  
  const thinkingContent = document.createElement('div');
  thinkingContent.style.whiteSpace = 'pre-wrap';
  thinkingContent.style.marginTop = '5px';
  
  thinkingDetails.appendChild(thinkingSummary);
  thinkingDetails.appendChild(thinkingContent);
  assistantBubble.appendChild(thinkingDetails);

  // Content Container
  const contentContainer = document.createElement('div');
  assistantBubble.appendChild(contentContainer);

  if (mode === 'grading') {
      contentContainer.innerHTML = '<em>Generating Assessment...</em>';
  }

  try {
    // Add Thinking Options if supported (Ollama legacy specific, but might apply elsewhere)
    const options = { stream: true, modelOptions: {} };
    
    // Legacy Thinking Parameters support for Ollama
    if (modelName.includes('gpt-oss')) {
      const level = document.getElementById('thinkLevel').value;
      options.modelOptions.think_level = level;
    } else if (
      modelName.includes('qwen3') || 
      modelName.includes('deepseek-v3.1') || 
      modelName.includes('deepseek-r1') ||
      modelName.includes('kimi-k2-thinking')
    ) {
      const thinkingEnabled = document.getElementById('thinkingMode').checked;
      if (thinkingEnabled) {
        options.modelOptions.thinking_mode = true; 
      }
    }

    const req = provider.buildChatRequest(config, messages, options);

    const response = await fetch(req.url, {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify(req.body)
    });

    if (!response.ok) {
      let errorMessage = `API Error: ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData && errorData.error) errorMessage = `${provider.name} Error: ${errorData.error.message || errorData.error}`;
      } catch (e) {
        try {
          const errorText = await response.text();
          if (errorText) errorMessage = `API Error: ${errorText}`;
        } catch (e2) {}
      }
      if (response.status === 401) throw new Error("401 Unauthorized. Please check your API Key.");
      throw new Error(errorMessage);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let done = false;
    let thinkingText = '';
    let responseText = '';
    let buffer = ''; // Buffer for incomplete lines

    while (!done) {
      const { value, done: doneReading } = await reader.read();
      done = doneReading;
      const chunkValue = decoder.decode(value, { stream: true });

      const fullChunk = buffer + chunkValue;
      const lines = fullChunk.split('\n');

      if (!done && lines.length > 0) {
        buffer = lines.pop();
      } else {
        buffer = '';
      }

      for (const line of lines) {
        let cleanLine = line.trim();
        if (!cleanLine) continue;
        
        // Handle SSE data prefix
        if (cleanLine.startsWith('data: ')) {
            cleanLine = cleanLine.slice(6);
        }
        if (cleanLine === '[DONE]') continue;

        try {
          const json = JSON.parse(cleanLine);
          let chunkContent = '';
          let chunkThinking = '';

          // Normalize Response Formats
          if (json.message && json.message.content) {
             // Ollama format
             chunkContent = json.message.content;
             chunkThinking = json.thinking; 
          } else if (json.choices && json.choices[0] && json.choices[0].delta) {
             // OpenAI/GitHub format
             chunkContent = json.choices[0].delta.content || '';
             // Check for DeepSeek-R1 style reasoning_content in delta
             if (json.choices[0].delta.reasoning_content) {
                 chunkThinking = json.choices[0].delta.reasoning_content;
             }
          }

          // Handle Thinking
          if (chunkThinking) {
             thinkingDetails.style.display = 'block';
             thinkingText += chunkThinking;
             thinkingContent.innerText = thinkingText;
          }

          // Handle Content
          if (chunkContent) {
            responseText += chunkContent;

            if (mode === 'chat' || mode === 'solver') {
              contentContainer.innerHTML = marked.parse(responseText);
              chatHistoryDisplay.scrollTop = chatHistoryDisplay.scrollHeight;
            }
          }
        } catch (e) {
          // Ignore parse errors for keepalives/empty lines
        }
      }
    }

    // Process final buffer if any
    if (buffer.trim()) {
        try {
            // Try one last parse (unlikely for SSE but possible for NDJSON)
            const json = JSON.parse(buffer);
             if (json.message && json.message.content) {
                responseText += json.message.content;
             }
        } catch(e) {}
    }

    // Finalize
    if (mode === 'grading') {
      showStatus("Done.", "green");
      renderGradingResponse(responseText, contentContainer);
    } else if (mode === 'solver') {
       showStatus(`Interaction ${solverTurn}/4 Complete.`, "green");
       document.getElementById('studentText').focus();
    }
    
    // Add to history
    conversationHistory.push({ role: "assistant", content: responseText });

  } catch (err) {
    console.error(err);
    showStatus(`Error connecting to AI: ${err.message}`, "red");
    contentContainer.innerText += `\n[Error: ${err.message}]`;
    contentContainer.classList.add('text-error');
    contentContainer.style.color = '';
  }
}

function renderGradingResponse(jsonString, container) {
  try {
    // Attempt to find JSON if wrapped in markdown code blocks
    let cleanJson = jsonString;
    const jsonMatch = jsonString.match(/```json\s*([\s\S]*?)\s*```/) || jsonString.match(/```\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      cleanJson = jsonMatch[1];
    }

    const data = JSON.parse(cleanJson);
    
    let html = '';
    
    // Summary
    if (data.summary) {
      html += `<div class="grading-summary">${marked.parse(data.summary)}</div>`;
    }

    // Table
    if (data.grading && Array.isArray(data.grading)) {
      html += `<table class="grading-table">`;
      html += `<thead>
        <tr class="bg-header">
          <th class="border-light grading-th">Criteria</th>
          <th class="border-light grading-th-center">Status</th>
          <th class="border-light grading-th">Evidence & Feedback</th>
        </tr>
      </thead><tbody>`;

      data.grading.forEach(item => {
        const statusText = item.status ? item.status.toLowerCase() : '';
        let statusIcon = item.status || '';
        
        if (statusText.includes('pass')) {
          statusIcon = '<i class="bi bi-check-circle-fill text-success"></i> Pass';
        } else if (statusText.includes('fail')) {
          statusIcon = '<i class="bi bi-x-circle-fill text-error"></i> Fail';
        }

        html += `<tr>
          <td class="border-light grading-td"><strong>${item.criteria}</strong></td>
          <td class="border-light grading-td-center">${statusIcon}</td>
          <td class="border-light grading-td">
            <div class="text-muted border-bottom-dashed grading-excerpt">"${item.excerpt || ''}"</div>
            <div>${marked.parse(item.feedback || '')}</div>
          </td>
        </tr>`;
      });
      html += `</tbody></table>`;
    }
    
    // Total Score
    if (data.totalScore) {
      html += `<div class="grading-total">Total Score: ${data.totalScore}</div>`;
    }

    // Table
    if (data.grading && Array.isArray(data.grading)) {
      html += `<table style="width:100%; border-collapse: collapse; font-size: 13px; margin-bottom: 15px;">`;
      html += `<thead>
        <tr class="bg-header">
          <th class="border-light" style="padding: 8px; text-align: left;">Criteria</th>
          <th class="border-light" style="padding: 8px; text-align: center; width: 80px;">Status</th>
          <th class="border-light" style="padding: 8px; text-align: left;">Evidence & Feedback</th>
        </tr>
      </thead><tbody>`;

      data.grading.forEach(item => {
        const statusText = item.status ? item.status.toLowerCase() : '';
        let statusIcon = item.status || '';
        
        if (statusText.includes('pass')) {
          statusIcon = '<i class="bi bi-check-circle-fill text-success"></i> Pass';
        } else if (statusText.includes('fail')) {
          statusIcon = '<i class="bi bi-x-circle-fill text-error"></i> Fail';
        }

        html += `<tr>
          <td class="border-light grading-td"><strong>${item.criteria}</strong></td>
          <td class="border-light grading-td-center">${statusIcon}</td>
          <td class="border-light grading-td">
            <div class="text-muted border-bottom-dashed grading-excerpt">"${item.excerpt || ''}"</div>
            <div>${marked.parse(item.comment || '')}</div>
          </td>
        </tr>`;
      });
      html += `</tbody></table>`;
    }

    // Total Score
    if (data.totalScore !== undefined) {
      html += `<div class="grading-total">Total Score: ${data.totalScore}</div>`;
    }

    container.innerHTML = html;

  } catch (e) {
    console.error("Error parsing grading JSON", e);
    container.innerHTML = `<div class="text-error">Error parsing grading response. Raw output below:</div><hr/>` + marked.parse(jsonString);
  }
}

function showStatus(text, color) {
  const el = document.getElementById('status');
  el.innerText = text;
  
  el.classList.remove('text-error', 'text-success', 'text-warning');
  el.style.color = '';

  if (color === 'red') el.classList.add('text-error');
  else if (color === 'green') el.classList.add('text-success');
  else if (color === 'orange') el.classList.add('text-warning');
  else if (color && color !== 'black') el.style.color = color;
}

let configStatusTimeout;
function showConfigStatus(text, color) {
  const el = document.getElementById('configStatus');
  if (el) {
    el.innerText = text;
    
    el.classList.remove('text-error', 'text-success', 'text-warning');
    el.style.color = '';

    if (color === 'red') el.classList.add('text-error');
    else if (color === 'green') el.classList.add('text-success');
    else if (color === 'orange') el.classList.add('text-warning');
    else if (color && color !== 'black') el.style.color = color;

    el.style.display = 'block';
    el.style.marginTop = '5px';
    
    if (configStatusTimeout) clearTimeout(configStatusTimeout);
    configStatusTimeout = setTimeout(() => {
      el.innerText = '';
      el.style.display = 'none';
      el.style.marginTop = '0';
    }, 3000);
  }
}

// --- Persistence Logic ---

function renderProviderConfig(providerId) {
  const container = document.getElementById('providerConfigContainer');
  container.innerHTML = '';
  
  const provider = PROVIDERS[providerId];
  if (!provider) return;

  const configDef = provider.getConfig();
  const currentConfig = providerConfigs[providerId] || {};

  configDef.fields.forEach(field => {
    // Skip hidden fields (e.g., OAuth tokens stored internally)
    if (field.type === 'hidden') return;
    
    // Skip API key fields if OAuth token exists for this provider
    if (field.key === 'apiKey' && oauthTokens[providerId]) return;
    
    const div = document.createElement('div');
    div.className = 'provider-field-group';
    
    // Label with optional helper link
    const labelRow = document.createElement('div');
    labelRow.style.display = 'flex';
    labelRow.style.justifyContent = 'space-between';
    labelRow.style.alignItems = 'center';
    labelRow.style.marginBottom = '5px';
    
    const label = document.createElement('label');
    label.innerText = field.label;
    labelRow.appendChild(label);
    
    // Add "Get API Key" link for API key fields
    if (field.key === 'apiKey' && PROVIDER_KEY_URLS[providerId]) {
      const helperLink = document.createElement('a');
      helperLink.href = PROVIDER_KEY_URLS[providerId];
      helperLink.target = '_blank';
      helperLink.innerHTML = '🔗 Get API Key';
      helperLink.classList.add('helper-link');
      helperLink.title = 'Opens in new tab';
      helperLink.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: PROVIDER_KEY_URLS[providerId] });
      });
      labelRow.appendChild(helperLink);
    }
    
    div.appendChild(labelRow);
    
    // Input field with masking for passwords
    const inputWrapper = document.createElement('div');
    inputWrapper.style.position = 'relative';
    
    const input = document.createElement('input');
    input.type = field.type;
    input.id = `cfg_${providerId}_${field.key}`;
    input.value = currentConfig[field.key] || field.default || '';
    input.placeholder = field.placeholder || '';
    if (field.required) input.required = true;
    
    // Mask API keys for security (show only prefix and suffix)
    if (field.type === 'password' && input.value && input.value.length > 10) {
      const maskedValue = maskApiKey(input.value);
      input.setAttribute('data-real-value', input.value);
      input.value = maskedValue;
      input.setAttribute('data-masked', 'true');
      
      // Reveal on focus, re-mask on blur
      input.addEventListener('focus', function() {
        if (this.getAttribute('data-masked') === 'true') {
          this.value = this.getAttribute('data-real-value') || '';
          this.removeAttribute('data-masked');
        }
      });
      
      input.addEventListener('blur', function() {
        if (this.value && this.value.length > 10) {
          this.setAttribute('data-real-value', this.value);
          this.value = maskApiKey(this.value);
          this.setAttribute('data-masked', 'true');
        }
      });
    }
    
    // Auto-save on change
    input.addEventListener('change', saveState);
    
    // Auto-test connection when API key is pasted/changed
    if (field.key === 'apiKey') {
      let testTimeout;
      input.addEventListener('input', function() {
        clearTimeout(testTimeout);
        if (this.value && this.value.length > 10 && this.getAttribute('data-masked') !== 'true') {
          testTimeout = setTimeout(() => testConnection(providerId), 1500);
        }
      });
    }
    
    inputWrapper.appendChild(input);
    div.appendChild(inputWrapper);
    container.appendChild(div);
  });
  
  // Add connection status indicator
  const statusDiv = document.createElement('div');
  statusDiv.id = `provider-status-${providerId}`;
  statusDiv.className = 'provider-status provider-status-message';
  container.appendChild(statusDiv);
}

// Helper function to mask API keys
function maskApiKey(key) {
  if (!key || key.length < 8) return '●●●●●●●●';
  const prefix = key.substring(0, Math.min(7, key.length - 3));
  const suffix = key.slice(-3);
  return `${prefix}${'●'.repeat(Math.max(8, key.length - 10))}${suffix}`;
}

// Test connection to provider
async function testConnection(providerId) {
  const statusDiv = document.getElementById(`provider-status-${providerId}`);
  if (!statusDiv) return;
  
  // Update tab status
  updateProviderTabStatus(providerId, 'testing');
  
  statusDiv.style.display = 'block';
  statusDiv.classList.add('status-warning');
  statusDiv.classList.remove('status-success', 'status-error');
  statusDiv.style.backgroundColor = '';
  statusDiv.style.color = '';
  statusDiv.innerHTML = '🔄 Testing connection...';
  
   try {
     const provider = PROVIDERS[providerId];
     let config = getProviderConfigFromUI(providerId);
     
     const result = await provider.testConnection(config);
    
    if (result.ok) {
      updateProviderTabStatus(providerId, 'connected');
      statusDiv.classList.add('status-success');
      statusDiv.classList.remove('status-warning', 'status-error');
      statusDiv.style.backgroundColor = '';
      statusDiv.style.color = '';
      statusDiv.innerHTML = '✅ Connected successfully';
      setTimeout(() => { statusDiv.style.display = 'none'; }, 3000);
    } else {
      updateProviderTabStatus(providerId, 'error');
      statusDiv.classList.add('status-error');
      statusDiv.classList.remove('status-warning', 'status-success');
      statusDiv.style.backgroundColor = '';
      statusDiv.style.color = '';
      statusDiv.innerHTML = `❌ ${result.error || 'Connection failed'}`;
    }
  } catch (err) {
    updateProviderTabStatus(providerId, 'error');
    statusDiv.classList.add('status-error');
    statusDiv.classList.remove('status-warning', 'status-success');
    statusDiv.style.backgroundColor = '';
    statusDiv.style.color = '';
    statusDiv.innerHTML = `❌ ${err.message}`;
  }
}

async function switchProvider(providerId) {
  currentProviderId = providerId;
  await setActiveProvider(providerId);
  
  // Update Selector
  const select = document.getElementById('providerSelect');
  if (select) select.value = providerId;
  
  // Render Config
  renderProviderConfig(providerId);
  
  // Show correct auth container for this provider
  showAuthContainerForProvider(providerId);
  
  // Update status indicator for current provider
  updateProviderTabStatus(providerId);
  
  // Refresh Models for this provider
  refreshModels();
  
  saveState();
  
  // Write-back active provider selection to desktop (fire-and-forget)
  if (desktopConnected && handshakeToken) {
    const model = document.getElementById('modelName').value || '';
    fetch('http://localhost:3456/api/providers/active', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${handshakeToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        provider_id: providerId,
        model: model
      })
    }).catch(err => {
      console.warn('[Desktop] Write-back failed:', err);
    });
  }
}

// Update provider tab status indicator
function updateProviderTabStatus(providerId, status = null) {
  // Only update if it's the current provider
  if (providerId !== currentProviderId) return;

  const indicator = document.getElementById('providerStatus');
  if (!indicator) return;
  
  // Remove existing status classes
  indicator.className = 'provider-status-indicator';
  
  // If status provided, use it; otherwise check if configured
  if (status) {
    indicator.classList.add(`status-${status}`);
  } else {
     const config = providerConfigs[providerId];
     const hasConfig = config && (config.apiKey || config.apiUrl);
     if (hasConfig) {
      indicator.classList.add('status-connected');
    }
  }
}

async function refreshModels() {
  const modelSelect = document.getElementById('modelName');
  modelSelect.innerHTML = '<option>Loading...</option>';
  modelSelect.disabled = true;
  
  const btn = document.getElementById('btnRefreshModels');
  btn.classList.add('spin-animation'); 

  try {
     const provider = PROVIDERS[currentProviderId];
     let config = getProviderConfigFromUI(currentProviderId);
     
     const models = await provider.listModels(config);
    availableModels = models;
    
    populateModelDropdown(models);
    showConfigStatus(`Found ${models.length} models`, 'green');
  } catch (err) {
    console.error(err);
    modelSelect.innerHTML = '<option value="">Error loading models</option>';
    showConfigStatus('Error loading models', 'red');
  } finally {
    modelSelect.disabled = false;
    btn.classList.remove('spin-animation');
  }
}

function getProviderConfigFromUI(providerId) {
  if (providerId === currentProviderId) {
    const config = {};
    const provider = PROVIDERS[providerId];
    if (provider) {
        provider.getConfig().fields.forEach(field => {
            const el = document.getElementById(`cfg_${providerId}_${field.key}`);
            if (el) config[field.key] = el.value;
        });
    }
    
    // Inject OAuth token if available (providers.js getAuthToken prefers oauthToken over apiKey)
    if (oauthTokens[providerId]) {
      config.oauthToken = oauthTokens[providerId];
    }
    
     // Update cache
    providerConfigs[providerId] = config;
    return config;
  }
  // For non-current providers, also inject OAuth tokens
  const cached = providerConfigs[providerId] || {};
  if (oauthTokens[providerId]) {
    cached.oauthToken = oauthTokens[providerId];
  }
  return cached;
}

function populateModelDropdown(models) {
  const select = document.getElementById('modelName');
  select.innerHTML = '';
  
  if (!models || models.length === 0) {
     const opt = document.createElement('option');
     opt.text = "No models found";
     select.add(opt);
     return;
  }
  
  let lastSelected = select.dataset.lastSelected;
  let found = false;
  
  models.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.text = m.name;
    if (m.id === lastSelected) {
        opt.selected = true;
        found = true;
    }
    select.add(opt);
  });
  
  if (!found && models.length > 0) {
      select.value = models[0].id;
  }
  
  updateThinkingControls();
}

// --- Desktop Connection (Provider Config Sync) ---

/**
 * Module-level state for desktop connection.
 * desktopConnected: whether we successfully connected to desktop on last attempt
 * handshakeToken: Bearer token for /api/* endpoints
 */
let desktopConnected = false;
let handshakeToken = null;

/**
 * Attempt handshake with the grading-server desktop endpoint.
 * Returns { connected: true, token } or { connected: false, reason, statusCode }.
 *
 * Status codes for callers:
 *   0   — network error (server not running)
 *   503 — server running but no config pushed yet
 *   403 — origin rejected
 *   4xx — other client error
 */
async function connectToDesktop() {
  try {
    const response = await fetch('http://localhost:3456/api/handshake', {
      headers: {
        'Origin': chrome.runtime.getURL('') // chrome-extension://...
      }
    });
    
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return { 
        connected: false,
        statusCode: response.status,
        reason: response.status === 503 
          ? 'Desktop app not ready yet'
          : response.status === 403
          ? 'Origin not allowed by desktop app'
          : `Handshake failed (${response.status}): ${text}` 
      };
    }
    
    const data = await response.json();
    if (!data.token) {
      return { connected: false, statusCode: 0, reason: 'No token in handshake response' };
    }
    
    return { connected: true, token: data.token };
  } catch (error) {
    // Network errors (ECONNREFUSED, TypeError from fetch, etc.)
    return { 
      connected: false,
      statusCode: 0,
      reason: 'Desktop app not running'
    };
  }
}

/**
 * Fetch provider config from desktop using handshake token.
 * Returns { providers: [...] } on success, or { providers: null, statusCode } on failure.
 */
async function fetchProvidersFromDesktop(token) {
  try {
    const response = await fetch('http://localhost:3456/api/providers', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      console.warn(`[Desktop] Provider fetch failed: ${response.status}`);
      return { providers: null, statusCode: response.status };
    }
    
    const data = await response.json();
    return { providers: data.providers || [], statusCode: 200 };
  } catch (error) {
    console.warn('[Desktop] Provider fetch error:', error);
    return { providers: null, statusCode: 0 };
  }
}

/**
 * Updates the provider configuration UI based on desktop connection state.
 * Toggles between Simplified Desktop Mode and Manual Mode.
 */
function updateProviderUI(connected) {
  console.log('[Desktop] updateProviderUI called, connected:', connected);
  
  const desktopContent = document.getElementById('desktopModeContent');
  const manualContent = document.getElementById('manualModeContent');
  const disconnectedBanner = document.getElementById('manualModeBanner');
  const desktopStatusBanner = document.getElementById('desktopStatusBanner');
  const body = document.body;

  console.log('[Desktop] Elements found:', {
    desktopContent,
    manualContent,
    disconnectedBanner,
    desktopStatusBanner,
    body
  });

  if (!desktopContent || !manualContent) return;

  if (connected) {
    // Cancel any active device flows silently — desktop manages auth now
    cancelAllDeviceFlows();

    // Show Simplified UI
    desktopContent.style.display = 'block';
    manualContent.style.display = 'none';
    body.classList.add('desktop-connected');
    body.classList.remove('desktop-disconnected');
    
    if (desktopStatusBanner) {
        desktopStatusBanner.className = 'status-banner status-success';
        desktopStatusBanner.innerHTML = '<i class="bi bi-check-circle-fill"></i> Connected to Desktop App';
    }
    
    // Update info display
    updateDesktopProviderInfo();
  } else {
    console.log('[Desktop] Activating manual mode UI');
    
    // Show Manual UI
    desktopContent.style.display = 'none';
    manualContent.style.display = 'block';
    body.classList.add('desktop-disconnected');
    body.classList.remove('desktop-connected');
    
    console.log('[Desktop] Body classes:', body.className);
    
    // Show warning banner in manual mode if we tried to connect but failed
    if (disconnectedBanner) {
      console.log('[Desktop] Showing disconnected banner');
      disconnectedBanner.style.display = 'flex'; // Use flex to match layout
    }
    
    // Ensure provider dropdown shows current selection
    const providerSelect = document.getElementById('providerSelect');
    if (providerSelect && currentProviderId) {
      providerSelect.value = currentProviderId;
    }
  }
  
  console.log('[Desktop] Final state - manualContent.style.display:', manualContent.style.display);
  console.log('[Desktop] Final state - body.classList:', body.classList.toString());
}

/**
 * Updates the read-only desktop provider info display.
 */
function updateDesktopProviderInfo() {
  const providerNameEl = document.getElementById('desktopProviderName');
  const modelNameEl = document.getElementById('desktopModelName');
  
  if (window.desktopProviderInfo) {
    if (providerNameEl) providerNameEl.textContent = window.desktopProviderInfo.provider || '—';
    if (modelNameEl) modelNameEl.textContent = window.desktopProviderInfo.model || '—';
  }
}

/**
 * Populates the provider dropdown in Desktop Mode.
 */
function populateDesktopProviderDropdown(providers) {
  const select = document.getElementById('desktopProviderSelect');
  if (!select) return;

  select.innerHTML = '';
  
  if (!providers || providers.length === 0) {
    const opt = document.createElement('option');
    opt.text = "No providers available";
    select.add(opt);
    return;
  }

  let foundActive = false;
  providers.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.text = getProviderDisplayName(p.id) + (p.model ? ` (${p.model})` : '');
    
    // Check if this provider is effectively the active one
    if (p.id === currentProviderId) {
        opt.selected = true;
        foundActive = true;
    }
    
    select.add(opt);
  });
  
  // If currentProviderId matches none, select the first one
  if (!foundActive && providers.length > 0) {
      select.value = providers[0].id;
      // Triggers change event to update state if needed, but we do it manually below
      switchProvider(providers[0].id);
  }
}

/**
 * Sets up listeners for the Desktop Mode UI elements.
 */
function setupDesktopListeners() {
  // Dropdown Change
  const select = document.getElementById('desktopProviderSelect');
  if (select) {
    select.addEventListener('change', (e) => {
      const providerId = e.target.value;
      if (providerId) {
        switchProvider(providerId);
      }
    });
  }

  // Disconnect Button (Switch to Manual)
  const btnDisconnect = document.getElementById('btnDisconnectDesktop');
  if (btnDisconnect) {
    btnDisconnect.addEventListener('click', () => {
       // Force manual mode
       updateProviderUI(false);
       // Hide the "Disconnected" banner since user voluntarily disconnected
       const banner = document.getElementById('desktopDisconnectedBanner');
       if (banner) banner.style.display = 'none';
    });
  }

  // Refresh Button
  const btnRefresh = document.getElementById('btnRefreshDesktop');
  if (btnRefresh) {
      btnRefresh.addEventListener('click', async () => {
          btnRefresh.classList.add('spin-animation');
          await loadProviderConfig();
          btnRefresh.classList.remove('spin-animation');
      });
  }

  // Retry Button (in Manual Mode banner)
  const btnRetry = document.getElementById('btnRetryDesktop');
  if (btnRetry) {
      btnRetry.addEventListener('click', async () => {
          btnRetry.disabled = true;
          btnRetry.classList.add('spin-animation');
          await loadProviderConfig();
          btnRetry.classList.remove('spin-animation');
          btnRetry.disabled = false;
      });
  }

  // Open Desktop Config Button
  const btnOpenConfig = document.getElementById('btnOpenDesktopConfig');
  if (btnOpenConfig) {
      btnOpenConfig.addEventListener('click', () => {
          // Open the desktop app URL (assuming localhost:3456)
          chrome.tabs.create({ url: 'http://localhost:3456' });
      });
  }
}


/**
 * Helper: activate fallback (manual) mode.
 * Sets module state and loads config from chrome.storage.local.
 */
async function activateFallbackMode() {
  console.log('[Desktop] activateFallbackMode called');
  desktopConnected = false;
  handshakeToken = null;
  updateProviderUI(false);
  await loadState(); // chrome.storage.local — the fallback path
  console.log('[Desktop] activateFallbackMode complete');
}

/**
 * Helper: apply desktop provider data to the UI after a successful fetch.
 */
// Map provider IDs to friendly display names
const PROVIDER_DISPLAY_NAMES = {
  'ollama': 'Ollama',
  'openai': 'OpenAI',
  'anthropic': 'Anthropic',
  'google-gemini': 'Google Gemini',
  'github-models': 'GitHub',
};

function getProviderDisplayName(id) {
  return PROVIDER_DISPLAY_NAMES[id] || id;
}

function applyDesktopProviders(providers) {
  desktopConnected = true;

  // Populate desktop info for UI
  const activeProvider = providers.find(p => p.is_active) || (providers.length > 0 ? providers[0] : null);
  if (activeProvider) {
    window.desktopProviderInfo = {
      provider: getProviderDisplayName(activeProvider.id),
      model: activeProvider.model
    };
  }

  updateProviderUI(true);
  populateDesktopProviderDropdown(providers);

  // Populate providerConfigs from desktop data
  providerConfigs = {};
  let activeProviderId = currentProviderId;

  providers.forEach(p => {
    providerConfigs[p.id] = {
      apiUrl: p.api_url || '',
      apiKey: p.credentials?.api_key || '',
      // No OAuth token reading in this path — API key only from desktop
    };

    if (p.is_active) {
      activeProviderId = p.id;
      if (p.model) {
        const modelSelect = document.getElementById('modelName');
        if (modelSelect) {
          modelSelect.dataset.lastSelected = p.model;
        }
      }
    }
  });

  currentProviderId = activeProviderId;
}

/**
 * Orchestrator: Try to load provider config from desktop.
 * Handles all failure modes gracefully before falling back to manual mode.
 *
 * Failure modes:
 *   Network error (server not running) → immediate fallback
 *   503 (no config pushed)            → wait 3s, then fallback
 *   403 (origin rejected)             → console warn + fallback
 *   401 on /api/providers             → re-handshake once, then fallback
 *   Empty providers                   → fallback
 */
async function loadProviderConfig() {
  console.log('[Desktop] Attempting desktop connection...');

  // --- Step 1: Handshake ---
  const handshake = await connectToDesktop();

  if (!handshake.connected) {
    // Handle specific handshake failures
    if (handshake.statusCode === 503) {
      // Server running but not ready — wait briefly then fall back
      console.log('[Desktop] Server starting (503). Waiting 3 seconds...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      // Retry once
      const retry = await connectToDesktop();
      if (retry.connected) {
        handshake.connected = true;
        handshake.token = retry.token;
      } else {
        console.log('[Desktop] Still not ready after wait. Using manual mode.');
        await activateFallbackMode();
        return;
      }
    } else if (handshake.statusCode === 403) {
      console.warn('[Desktop] Origin rejected (403). Extension origin not allowed. Using manual mode.');
      await activateFallbackMode();
      return;
    } else {
      // Network error or other — desktop not running (expected, not an error)
      console.log('[Desktop] Desktop not running. Using manual mode.');
      await activateFallbackMode();
      return;
    }
  }

  console.log('[Desktop] Handshake successful');
  handshakeToken = handshake.token;

  // --- Step 2: Fetch providers ---
  const result = await fetchProvidersFromDesktop(handshakeToken);

  if (result.statusCode === 401) {
    // Token invalid (server may have restarted) — re-handshake once
    console.log('[Desktop] Token rejected (401). Attempting re-handshake...');
    const reHandshake = await connectToDesktop();
    if (!reHandshake.connected) {
      console.log('[Desktop] Re-handshake failed. Using manual mode.');
      await activateFallbackMode();
      return;
    }
    handshakeToken = reHandshake.token;
    const retryResult = await fetchProvidersFromDesktop(handshakeToken);
    if (!retryResult.providers || retryResult.providers.length === 0) {
      console.log('[Desktop] Re-handshake succeeded but no providers. Using manual mode.');
      await activateFallbackMode();
      return;
    }
    // Success on retry
    console.log(`[Desktop] Re-handshake recovered. Fetched ${retryResult.providers.length} provider(s)`);
    applyDesktopProviders(retryResult.providers);
  } else if (!result.providers || result.providers.length === 0) {
    console.log('[Desktop] No providers from desktop. Using manual mode.');
    await activateFallbackMode();
    return;
  } else {
    // Happy path
    console.log(`[Desktop] Fetched ${result.providers.length} provider(s) from desktop`);
    applyDesktopProviders(result.providers);
  }

  // --- Step 3: Load non-provider state (rubric, etc.) ---
  await loadNonProviderState();

  // --- Step 4: Populate hidden manual UI for config reading ---
  renderProviderConfig(currentProviderId);
  updateProviderTabStatus(currentProviderId);

  const desktopSelect = document.getElementById('desktopProviderSelect');
  if (desktopSelect && currentProviderId) {
    desktopSelect.value = currentProviderId;
  }
}

/**
 * Load non-provider state (rubric, custom instructions, etc.) from chrome.storage.local.
 * Used after desktop fetch to restore UI state that isn't managed by desktop.
 */
async function loadNonProviderState() {
  const result = await chrome.storage.local.get([
    'modelName', 'rubricMode', 'rubricText', 'rubricTable', 'rubricImages', 'customInstructions'
  ]);
  
  // Restore rubric
  if (result.rubricMode) {
    const modeRadio = document.querySelector(`input[name="rubricMode"][value="${result.rubricMode}"]`);
    if (modeRadio) modeRadio.checked = true;
  }
  if (result.rubricText) {
    document.getElementById('rubricText').innerHTML = result.rubricText;
  }
  if (result.rubricTable) {
    restoreRubricTableData(result.rubricTable);
  }
  if (result.rubricImages) {
    rubricImages = result.rubricImages;
  }
  
  // Restore custom instructions
  if (result.customInstructions) {
    document.getElementById('customInstructions').value = result.customInstructions;
  }
}

function restoreRubricTableData(data) {
  const tbody = document.querySelector('#rubricTable tbody');
  if (!tbody) return;
  tbody.innerHTML = "";
  if (Array.isArray(data)) {
    data.forEach(item => addRubricRow(item.criteria, item.description, item.points));
  }
}

function saveState() {
  // Capture current visible config
  getProviderConfigFromUI(currentProviderId);

  const state = {
    activeProvider: currentProviderId,
    providerConfigs: providerConfigs,
    modelName: document.getElementById('modelName').value,
    rubricMode: document.querySelector('input[name="rubricMode"]:checked').value,
    rubricText: document.getElementById('rubricText').innerHTML,
    rubricTable: getRubricTableData(),
    rubricImages: rubricImages,
    customInstructions: document.getElementById('customInstructions').value,
    appMode: document.querySelector('input[name="appMode"]:checked')?.value || 'grader'
  };
  chrome.storage.local.set(state, () => {
    console.log('State saved');
  });
}

async function loadState() {
  console.log('[State] loadState called');
  
  const result = await chrome.storage.local.get([
    'activeProvider', 'providerConfigs', 'modelName', 
    'rubricMode', 'rubricText', 'rubricTable', 'rubricImages', 'customInstructions',
    'apiUrl', 'apiKey' // Legacy
  ]);

  console.log('[State] Loaded from storage:', result);

  // Load Provider Configs
  if (result.providerConfigs) {
    providerConfigs = result.providerConfigs;
  } else {
    // Migration from very old format (pre-provider configs)
    providerConfigs = {
      'ollama': {
        apiUrl: result.apiUrl || 'http://localhost:11434',
        apiKey: result.apiKey || ''
      },
      'openai': { apiKey: '' },
      'github-models': { apiKey: '' }
    };
  }

  // --- Migration: map old provider IDs to canonical IDs ---
  // ollama-cloud + ollama-local → ollama
  if (providerConfigs['ollama-cloud'] || providerConfigs['ollama-local']) {
    const cloudCfg = providerConfigs['ollama-cloud'] || {};
    const localCfg = providerConfigs['ollama-local'] || {};
    // Merge: prefer cloud config if it has a custom URL, otherwise use local
    if (!providerConfigs['ollama']) {
      providerConfigs['ollama'] = cloudCfg.apiUrl && cloudCfg.apiUrl !== 'http://localhost:11434'
        ? cloudCfg
        : { apiUrl: localCfg.apiUrl || 'http://localhost:11434', apiKey: cloudCfg.apiKey || '' };
    }
    delete providerConfigs['ollama-cloud'];
    delete providerConfigs['ollama-local'];
  }
  // gemini → google-gemini (if any old data)
  if (providerConfigs['gemini'] && !providerConfigs['google-gemini']) {
    providerConfigs['google-gemini'] = providerConfigs['gemini'];
    delete providerConfigs['gemini'];
  }



  // Set Active Provider — migrate old IDs
  let activeProvider = result.activeProvider || 'ollama';
  // Map old IDs to canonical
  const PROVIDER_ID_MIGRATION = {
    'ollama-cloud': 'ollama',
    'ollama-local': 'ollama',
    'gemini': 'google-gemini',
  };
  if (PROVIDER_ID_MIGRATION[activeProvider]) {
    activeProvider = PROVIDER_ID_MIGRATION[activeProvider];
  }
  currentProviderId = activeProvider;
  
  console.log('[State] Current provider ID:', currentProviderId);
  
  await setActiveProvider(currentProviderId);
  
  // Update Selector UI
  const providerSelect = document.getElementById('providerSelect');
  if (providerSelect) {
    providerSelect.value = currentProviderId;
  }
  
  // Update status indicators for all providers
  Object.keys(providerConfigs).forEach(providerId => {
    updateProviderTabStatus(providerId);
  });

  // Render Config
  console.log('[State] Calling renderProviderConfig');
  renderProviderConfig(currentProviderId);
  
  // Show correct auth UI for current provider
  console.log('[State] Calling showAuthContainerForProvider');
  showAuthContainerForProvider(currentProviderId);
  
  // Load Rubric State
  if (result.rubricMode) {
    const radio = document.querySelector(`input[name="rubricMode"][value="${result.rubricMode}"]`);
    if (radio) {
      radio.checked = true;
      radio.dispatchEvent(new Event('change'));
    }
  }
  if (result.rubricText) document.getElementById('rubricText').innerHTML = result.rubricText;
  if (result.rubricTable) {
      const tbody = document.querySelector('#rubricTable tbody');
      tbody.innerHTML = "";
      result.rubricTable.forEach(item => addRubricRow(item.criteria, item.description, item.points));
  }
  if (result.rubricImages) {
      rubricImages = result.rubricImages;
      renderImages('rubric');
  }
  
  if (result.customInstructions) {
      document.getElementById('customInstructions').value = result.customInstructions;
  }
  
  // Model
  if (result.modelName) {
      document.getElementById('modelName').dataset.lastSelected = result.modelName;
  }
  
  // Initial Refresh
  await refreshModels();
}

function getRubricTableData() {
  const rows = document.querySelectorAll('#rubricTable tbody tr');
  const data = [];
  rows.forEach(row => {
    data.push({
      criteria: row.querySelector('.r-criteria').value,
      description: row.querySelector('.r-desc').value,
      points: row.querySelector('.r-pts').value
    });
  });
  return data;
}

// Auto-save on changes
document.getElementById('modelName').addEventListener('change', saveState);
document.querySelectorAll('input[name="rubricMode"]').forEach(r => r.addEventListener('change', saveState));
document.getElementById('rubricText').addEventListener('input', saveState);
// For table inputs, we need to delegate since rows are dynamic
document.querySelector('#rubricTable').addEventListener('input', saveState);
// For images, we'll call saveState() inside addImage/removeImage


document.getElementById('saveConfig').addEventListener('click', () => {
  saveState();
  showStatus('Settings and Rubric saved!', 'green');
});

// Add Enter key listener for studentText in Solver mode
document.getElementById('studentText').addEventListener('keydown', (e) => {
  const isSolver = document.getElementById('modeSwitch').checked;
  if (isSolver && e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    document.getElementById('btnGrade').click();
  }
});

// Add listener for the new inline send button
document.getElementById('btnSolverSend').addEventListener('click', () => {
  document.getElementById('btnGrade').click();
});

// --- Model Info Popover Logic ---
const modelDefinitions = [
  { 
    name: "Gemini-3-Pro-preview", 
    desc: "The smartest \"all-rounder\" that can read 1,000+ pages or hour-long videos at once.", 
    speed: "Medium", 
    cost: "High (8/10)", 
    scores: { math: 10, science: 10, coding: 10, writing: 8 } 
  },
  { 
    name: "DeepSeek-v3.2", 
    desc: "High-end genius-level logic for almost zero cost; great for heavy math/coding.", 
    speed: "Slow", 
    cost: "Very Low (1/10)", 
    scores: { math: 10, science: 9, coding: 10, writing: 7 } 
  },
  { 
    name: "GLM-4.7", 
    desc: "Upgraded agentic coding with stronger reasoning and tool use.", 
    speed: "Medium", 
    cost: "Medium (5/10)", 
    scores: { math: 9, science: 9, coding: 10, writing: 7 } 
  },
  { 
    name: "GLM-4.6", 
    desc: "Agentic, reasoning, and coding focused with strong tool use.", 
    speed: "Medium", 
    cost: "Medium (5/10)", 
    scores: { math: 8, science: 8, coding: 9, writing: 7 } 
  },
  { 
    name: "Kimi-K2-Thinking", 
    desc: "An \"independent worker\" that pauses to think and double-check facts before answering.", 
    speed: "Medium", 
    cost: "Medium (6/10)", 
    scores: { math: 9, science: 9, coding: 8, writing: 10 } 
  },
  { 
    name: "Kimi-K2.5", 
    desc: "Multimodal agentic model with vision plus instant or thinking modes.", 
    speed: "Medium", 
    cost: "Medium (6/10)", 
    scores: { math: 9, science: 9, coding: 9, writing: 9 } 
  },
  { 
    name: "Mistral-Large-3", 
    desc: "A powerful, reliable choice for businesses who want to keep their data private.", 
    speed: "Slow", 
    cost: "High (7/10)", 
    scores: { math: 8, science: 9, coding: 9, writing: 9 } 
  },
  { 
    name: "DeepSeek-v3.1", 
    desc: "A very fast, very cheap version of DeepSeek for standard daily questions.", 
    speed: "Medium", 
    cost: "Very Low (1/10)", 
    scores: { math: 9, science: 8, coding: 9, writing: 7 } 
  },
  { 
    name: "Kimi-K2", 
    desc: "The best \"creative partner\" for writing emails, stories, or blogs that sound human.", 
    speed: "Medium", 
    cost: "Medium (5/10)", 
    scores: { math: 8, science: 8, coding: 8, writing: 10 } 
  },
  { 
    name: "Qwen3-Vision", 
    desc: "The best \"pair of eyes\"; it can read messy charts, diagrams, and maps perfectly.", 
    speed: "Slow", 
    cost: "Low (3/10)", 
    scores: { math: 8, science: 10, coding: 7, writing: 6 } 
  },
  { 
    name: "Cogito-2.1", 
    desc: "Great for students; it explains how it got an answer step-by-step to help you learn.", 
    speed: "Medium", 
    cost: "Low (4/10)", 
    scores: { math: 8, science: 9, coding: 8, writing: 8 } 
  },
  { 
    name: "Qwen3-Next", 
    desc: "A super-fast \"speed reader\" that gives high-quality answers in a split second.", 
    speed: "Medium", 
    cost: "Very Low (2/10)", 
    scores: { math: 9, science: 8, coding: 8, writing: 7 } 
  },
  { 
    name: "Minimax-M2", 
    desc: "A \"pro planner\" that is excellent at organizing schedules and complex multi-step tasks.", 
    speed: "Medium", 
    cost: "Low (3/10)", 
    scores: { math: 8, science: 8, coding: 7, writing: 8 } 
  },
  { 
    name: "Minimax-M2.1", 
    desc: "Upgraded M2 with better multilingual coding and cleaner responses.", 
    speed: "Medium", 
    cost: "Low (3/10)", 
    scores: { math: 9, science: 8, coding: 9, writing: 8 } 
  },
  { 
    name: "Gemini-3-Flash-preview", 
    desc: "The fastest model on the list; gives you high-quality help almost instantly.", 
    speed: "Very Fast", 
    cost: "Very Low (1/10)", 
    scores: { math: 8, science: 7, coding: 8, writing: 7 } 
  },
  { 
    name: "ChatGPT-120b", 
    desc: "A friendly, reliable digital assistant that is easy to talk to and very versatile.", 
    speed: "Slow", 
    cost: "Very Low (2/10)", 
    scores: { math: 7, science: 7, coding: 8, writing: 8 } 
  },
  { 
    name: "ChatGPT-20b", 
    desc: "Standard reliable assistant.", 
    speed: "Fast", 
    cost: "Very Low (1/10)", 
    scores: { math: 6, science: 6, coding: 7, writing: 7 } 
  },
  { 
    name: "Gemma3-27b", 
    desc: "A strong, safe choice you can run on your own computer without an internet connection.", 
    speed: "Medium", 
    cost: "Very Low (1/10)", 
    scores: { math: 7, science: 7, coding: 7, writing: 7 } 
  },
  { 
    name: "Ministral-3-14b", 
    desc: "A compact \"math tutor\" that fits on a laptop but thinks like a much larger model.", 
    speed: "Medium", 
    cost: "Very Low (2/10)", 
    scores: { math: 8, science: 7, coding: 7, writing: 6 } 
  },
  { 
    name: "Gemma3-12b", 
    desc: "A lightweight helper for quick summaries and fixing grammar on your phone.", 
    speed: "Medium", 
    cost: "Very Low (1/10)", 
    scores: { math: 6, science: 6, coding: 6, writing: 7 } 
  },
  { 
    name: "Rnj-1", 
    desc: "A tiny \"coding specialist\" that is surprisingly good at fixing computer bugs.", 
    speed: "Fast", 
    cost: "Very Low (1/10)", 
    scores: { math: 7, science: 6, coding: 8, writing: 6 } 
  },
  { 
    name: "Devstral-2", 
    desc: "Agentic coding model for deep codebase exploration and tooling.", 
    speed: "Slow", 
    cost: "High (7/10)", 
    scores: { math: 8, science: 7, coding: 10, writing: 6 } 
  },
  { 
    name: "Devstral-Small-2", 
    desc: "Smaller agentic coding model with vision support.", 
    speed: "Medium", 
    cost: "Medium (4/10)", 
    scores: { math: 7, science: 7, coding: 9, writing: 6 } 
  },
  { 
    name: "Ministral-3-8b", 
    desc: "A basic, speedy tool for sorting emails or simple \"yes/no\" tasks.", 
    speed: "Fast", 
    cost: "Very Low (1/10)", 
    scores: { math: 6, science: 5, coding: 5, writing: 6 } 
  },
  { 
    name: "Nemotron-3-Nano", 
    desc: "Designed by NVIDIA to be extremely fast at following simple, repetitive rules.", 
    speed: "Very Fast", 
    cost: "Very Low (1/10)", 
    scores: { math: 6, science: 6, coding: 5, writing: 6 } 
  },
  { 
    name: "Ministral-3-3b", 
    desc: "A very small model meant for the simplest tasks, like reformatting a list.", 
    speed: "Very Fast", 
    cost: "Very Low (1/10)", 
    scores: { math: 4, science: 3, coding: 3, writing: 5 } 
  },
  { 
    name: "Gemma3-4b", 
    desc: "Google’s smallest model, built to run smoothly even on older smartphones.", 
    speed: "Fast", 
    cost: "Very Low (1/10)", 
    scores: { math: 5, science: 4, coding: 4, writing: 6 } 
  }
];

function getCostValue(costStr) {
    const match = costStr.match(/\((\d+)\/10\)/);
    return match ? parseInt(match[1]) : 0;
}

function getSpeedValue(speedStr) {
    const s = speedStr.toLowerCase();
    if (s.includes('very fast')) return 4;
    if (s.includes('fast')) return 3;
    if (s.includes('medium')) return 2;
    return 1; // Slow
}

function renderModelList() {
    const list = document.getElementById('modelInfoList');
    const sortBy = document.getElementById('modelSortBy').value;
    const sortOrder = document.getElementById('modelSortOrder').value;
    const sortBySecondary = document.getElementById('modelSortBySecondary').value;
    const sortOrderSecondary = document.getElementById('modelSortOrderSecondary').value;
    
    list.innerHTML = '';
    
    let models = [...modelDefinitions];
    
    const compare = (a, b, criteria, order) => {
        let valA, valB;
        if (criteria === 'cost') {
            valA = getCostValue(a.cost);
            valB = getCostValue(b.cost);
        } else if (criteria === 'speed') {
            valA = getSpeedValue(a.speed);
            valB = getSpeedValue(b.speed);
        } else {
            valA = a.scores[criteria];
            valB = b.scores[criteria];
        }
        
        if (order === 'asc') {
            return valA - valB;
        } else {
            return valB - valA;
        }
    };

    if (sortBy !== 'default') {
        models.sort((a, b) => {
            const primaryDiff = compare(a, b, sortBy, sortOrder);
            if (primaryDiff !== 0) return primaryDiff;
            
            if (sortBySecondary !== 'none') {
                return compare(a, b, sortBySecondary, sortOrderSecondary);
            }
            
            return 0;
        });
    }
    
    models.forEach(m => {
        const item = document.createElement('div');
        item.classList.add('model-list-item', 'border-bottom-light');
        
        let costClass = 'text-success';
        
        if(m.cost.toLowerCase().includes('high')) { costClass = 'text-error'; }
        else if(m.cost.toLowerCase().includes('medium')) { costClass = 'text-warning'; }
        else { costClass = 'text-success'; }

        item.innerHTML = `
            <div class="text-primary model-card-header">
                <span class="model-name">${m.name}</span>
                <span class="${costClass} cost-badge">${m.cost} Cost</span>
            </div>
            <div class="text-muted model-desc">
                "${m.desc}"
            </div>
            <div class="text-muted model-meta">
                <span>⏱️ Speed: <b>${m.speed}</b></span>
            </div>
            <div class="bg-white border-light model-scores-grid">
                <div class="text-center"><div class="text-muted model-score-label">MATH</div><div class="text-primary model-score-val">${m.scores.math}</div></div>
                <div class="text-center"><div class="text-muted model-score-label">SCI</div><div class="text-primary model-score-val">${m.scores.science}</div></div>
                <div class="text-center"><div class="text-muted model-score-label">CODE</div><div class="text-primary model-score-val">${m.scores.coding}</div></div>
                <div class="text-center"><div class="text-muted model-score-label">WRITE</div><div class="text-primary model-score-val">${m.scores.writing}</div></div>
            </div>
        `;
        list.appendChild(item);
    });
}

document.getElementById('modelSortBy').addEventListener('change', renderModelList);
document.getElementById('modelSortOrder').addEventListener('change', renderModelList);
document.getElementById('modelSortBySecondary').addEventListener('change', renderModelList);
document.getElementById('modelSortOrderSecondary').addEventListener('change', renderModelList);

document.getElementById('btnModelInfo').addEventListener('click', () => {
    renderModelList();
    document.getElementById('modelInfoModal').style.display = 'block';
});

document.querySelector('.close-model-info').addEventListener('click', () => {
    document.getElementById('modelInfoModal').style.display = 'none';
});

// GitHub Info Modal Handlers
document.getElementById('btnGitHubInfo').addEventListener('click', () => {
  document.getElementById('githubInfoModal').style.display = 'block';
});

document.querySelectorAll('.close-github-info').forEach(element => {
  element.addEventListener('click', () => {
    document.getElementById('githubInfoModal').style.display = 'none';
  });
});

// Close on click outside (merging with existing window click logic if any, but safe to add listener)
window.addEventListener('click', (event) => {
    if (event.target == document.getElementById('modelInfoModal')) {
        document.getElementById('modelInfoModal').style.display = 'none';
    }
    if (event.target == document.getElementById('githubInfoModal')) {
        document.getElementById('githubInfoModal').style.display = 'none';
    }
});



// --- 5. Device Flow Orchestration ---

/**
 * Load OAuth tokens from chrome.storage.local on init.
 * Sets oauthTokens dict and injects into providerConfigs so providers.js getAuthToken() works.
 */
async function loadOAuthTokens() {
  for (const [providerId, meta] of Object.entries(DEVICE_FLOW_PROVIDERS)) {
    const tokenData = await getDeviceFlowToken(meta.tokenKey);
    if (tokenData && tokenData.access_token) {
      oauthTokens[providerId] = tokenData.access_token;
    }
  }
  console.log('[DeviceFlow] Loaded OAuth tokens for:', Object.keys(oauthTokens));
}

/**
 * Update the device flow auth UI for a given provider.
 * States: signed-out | device-flow-active | code-paste-active | signed-in
 */
function updateDeviceFlowUI(providerId) {
  const dfConfig = DEVICE_FLOW_PROVIDERS[providerId];
  if (!dfConfig) return; // not a device-flow provider

  const container = document.getElementById(`${providerId}-auth-container`);
  if (!container) return;

  const signedOut = document.getElementById(`${providerId}-signed-out`);
  const signedIn = document.getElementById(`${providerId}-signed-in`);
  // device flow active (GitHub/OpenAI)
  const deviceFlowEl = document.getElementById(`${providerId}-device-flow`);
  // code paste active (Claude)
  const codePasteEl = document.getElementById(`${providerId}-code-paste`);

  // Determine state
  const hasToken = !!oauthTokens[providerId];
  const activeFlow = deviceFlowStates[providerId];

  // Hide everything first
  if (signedOut) signedOut.style.display = 'none';
  if (signedIn) signedIn.style.display = 'none';
  if (deviceFlowEl) deviceFlowEl.style.display = 'none';
  if (codePasteEl) codePasteEl.style.display = 'none';

  // Show container
  container.style.display = 'block';

  if (hasToken) {
    if (signedIn) signedIn.style.display = 'flex';
    // Re-render config fields to hide API key input
    renderProviderConfig(providerId);
  } else if (activeFlow) {
    if (activeFlow.flowType === 'device' && deviceFlowEl) {
      deviceFlowEl.style.display = 'block';
    } else if (activeFlow.flowType === 'code-paste' && codePasteEl) {
      codePasteEl.style.display = 'block';
    }
  } else {
    if (signedOut) signedOut.style.display = 'block';
    // Re-render config fields to show API key input
    renderProviderConfig(providerId);
  }
}

/**
 * Show the correct auth container for the current provider, hide others.
 */
function showAuthContainerForProvider(providerId) {
  // Hide all auth containers
  for (const pid of Object.keys(DEVICE_FLOW_PROVIDERS)) {
    const container = document.getElementById(`${pid}-auth-container`);
    if (container) container.style.display = 'none';
  }
  // Show + update the one for current provider
  if (DEVICE_FLOW_PROVIDERS[providerId]) {
    const container = document.getElementById(`${providerId}-auth-container`);
    
    if (container) {
      container.style.display = 'block';
    }
    updateDeviceFlowUI(providerId);
  }
}

/**
 * Start a device flow / code-paste flow for the given provider.
 * Prevents multiple simultaneous flows for the same provider.
 */
async function startDeviceFlowForProvider(providerId) {
  const meta = DEVICE_FLOW_PROVIDERS[providerId];
  if (!meta) return;

  // Prevent duplicate
  if (deviceFlowStates[providerId]) {
    console.warn(`[DeviceFlow] Flow already active for ${providerId}`);
    return;
  }

  try {
    showConfigStatus(`Starting sign-in for ${providerId}...`, 'blue');
    const flow = await meta.startFlow();

    if (meta.flowType === 'device') {
      // GitHub / OpenAI device flow
      deviceFlowStates[providerId] = {
        flowType: 'device',
        userCode: flow.userCode,
        verificationUrl: flow.verificationUrl,
        cancel: flow.cancel
      };

      // Update UI to show code
      const codeEl = document.getElementById(`${providerId}-user-code`);
      if (codeEl) codeEl.textContent = flow.userCode;
      const urlEl = document.getElementById(`${providerId}-verification-url`);
      if (urlEl) {
        urlEl.href = flow.verificationUrl;
        urlEl.textContent = flow.verificationUrl;
      }
      updateDeviceFlowUI(providerId);

      // Open verification URL in new tab
      chrome.tabs.create({ url: flow.verificationUrl });

      // Start polling
      const result = await flow.poll();
      // Flow completed (success, cancel, or timeout)
      if (result.success) {
        oauthTokens[providerId] = result.accessToken;
        showConfigStatus('Signed in successfully!', 'green');
        // Refresh models for this provider
        if (providerId === currentProviderId) {
          refreshModels();
        }
      } else if (result.error !== 'Cancelled') {
        showConfigStatus(`Auth failed: ${result.error}`, 'red');
      }
    } else if (meta.flowType === 'code-paste') {
      // Claude PKCE code-paste flow
      deviceFlowStates[providerId] = {
        flowType: 'code-paste',
        authUrl: flow.authUrl,
        exchangeCode: flow.exchangeCode,
        cancel: flow.cancel
      };

      updateDeviceFlowUI(providerId);

      // Open auth URL in new tab
      chrome.tabs.create({ url: flow.authUrl });
    }
  } catch (err) {
    console.error(`[DeviceFlow] Error starting flow for ${providerId}:`, err);
    showConfigStatus(`Auth error: ${err.message}`, 'red');
  } finally {
    // Clean up flow state (unless code-paste is waiting for user input)
    if (meta.flowType === 'device') {
      delete deviceFlowStates[providerId];
      updateDeviceFlowUI(providerId);
    }
  }
}

/**
 * Submit the pasted code for Claude PKCE flow.
 */
async function submitClaudeCode(providerId) {
  const flow = deviceFlowStates[providerId];
  if (!flow || flow.flowType !== 'code-paste') return;

  const codeInput = document.getElementById(`${providerId}-code-input`);
  const code = codeInput ? codeInput.value.trim() : '';
  if (!code) {
    showConfigStatus('Please paste the authorization code.', 'orange');
    return;
  }

  try {
    showConfigStatus('Exchanging code...', 'blue');
    const result = await flow.exchangeCode(code);
    if (result.success) {
      oauthTokens[providerId] = result.accessToken;
      showConfigStatus('Signed in with Claude!', 'green');
      // Refresh models
      if (providerId === currentProviderId) {
        refreshModels();
      }
    } else {
      showConfigStatus(`Code exchange failed: ${result.error}`, 'red');
    }
  } catch (err) {
    showConfigStatus(`Code exchange error: ${err.message}`, 'red');
  } finally {
    delete deviceFlowStates[providerId];
    updateDeviceFlowUI(providerId);
  }
}

/**
 * Cancel an active device flow for a provider.
 */
function cancelDeviceFlow(providerId) {
  const flow = deviceFlowStates[providerId];
  if (flow && flow.cancel) {
    flow.cancel();
  }
  delete deviceFlowStates[providerId];
  updateDeviceFlowUI(providerId);
  showConfigStatus('Sign-in cancelled.', 'blue');
}

/**
 * Cancel all active device flows (e.g. when desktop connects).
 */
function cancelAllDeviceFlows() {
  for (const [pid, flow] of Object.entries(deviceFlowStates)) {
    if (flow && flow.cancel) {
      flow.cancel();
    }
  }
  deviceFlowStates = {};
}

/**
 * Sign out from a provider: remove token from storage and reset UI.
 */
async function signOutProvider(providerId) {
  const meta = DEVICE_FLOW_PROVIDERS[providerId];
  if (!meta) return;

  await deleteDeviceFlowToken(meta.tokenKey);
  delete oauthTokens[providerId];
  updateDeviceFlowUI(providerId);
  showConfigStatus('Signed out.', 'blue');

  // Refresh models (will fail without token, showing empty list or prompting for key)
  if (providerId === currentProviderId) {
    refreshModels();
  }
}

/**
 * Sets up event listeners for device flow UI elements.
 */
function setupDeviceFlowListeners() {
  // --- GitHub Models ---
  const btnSigninGithub = document.getElementById('btn-signin-github-models');
  if (btnSigninGithub) {
    btnSigninGithub.addEventListener('click', () => startDeviceFlowForProvider('github-models'));
  }

  const btnCancelGithub = document.getElementById('btn-cancel-github-models');
  if (btnCancelGithub) {
    btnCancelGithub.addEventListener('click', () => cancelDeviceFlow('github-models'));
  }

  const btnSignoutGithub = document.getElementById('btn-signout-github-models');
  if (btnSignoutGithub) {
    btnSignoutGithub.addEventListener('click', () => signOutProvider('github-models'));
  }

  const btnCopyGithub = document.getElementById('btn-copy-github-models-code');
  if (btnCopyGithub) {
    btnCopyGithub.addEventListener('click', () => {
      const code = document.getElementById('github-models-user-code')?.textContent;
      if (code) navigator.clipboard.writeText(code);
    });
  }

  // --- OpenAI ---
  const btnSigninOpenai = document.getElementById('btn-signin-openai');
  if (btnSigninOpenai) {
    btnSigninOpenai.addEventListener('click', () => startDeviceFlowForProvider('openai'));
  }

  const btnCancelOpenai = document.getElementById('btn-cancel-openai');
  if (btnCancelOpenai) {
    btnCancelOpenai.addEventListener('click', () => cancelDeviceFlow('openai'));
  }

  const btnSignoutOpenai = document.getElementById('btn-signout-openai');
  if (btnSignoutOpenai) {
    btnSignoutOpenai.addEventListener('click', () => signOutProvider('openai'));
  }

  const btnCopyOpenai = document.getElementById('btn-copy-openai-code');
  if (btnCopyOpenai) {
    btnCopyOpenai.addEventListener('click', () => {
      const code = document.getElementById('openai-user-code')?.textContent;
      if (code) navigator.clipboard.writeText(code);
    });
  }

  // --- Claude (Anthropic) ---
  const btnSigninAnthropic = document.getElementById('btn-signin-anthropic');
  if (btnSigninAnthropic) {
    btnSigninAnthropic.addEventListener('click', () => startDeviceFlowForProvider('anthropic'));
  }

  const btnCancelAnthropic = document.getElementById('btn-cancel-anthropic');
  if (btnCancelAnthropic) {
    btnCancelAnthropic.addEventListener('click', () => cancelDeviceFlow('anthropic'));
  }

  const btnSignoutAnthropic = document.getElementById('btn-signout-anthropic');
  if (btnSignoutAnthropic) {
    btnSignoutAnthropic.addEventListener('click', () => signOutProvider('anthropic'));
  }

  const btnSubmitClaudeCode = document.getElementById('btn-submit-anthropic-code');
  if (btnSubmitClaudeCode) {
    btnSubmitClaudeCode.addEventListener('click', () => submitClaudeCode('anthropic'));
  }
}

let isBatchRunning = false;

document.getElementById('btnStartBatch').addEventListener('click', startBatchGrading);
document.getElementById('btnStopBatch').addEventListener('click', stopBatchGrading);

// Resume prompt handlers
document.getElementById('btnResumeSession').addEventListener('click', () => {
  const resumePrompt = document.getElementById('resumePrompt');
  const lastStudent = resumePrompt.dataset.lastStudent;
  
  if (lastStudent) {
    document.getElementById('resumeStudent').value = lastStudent;
    resumePrompt.style.display = 'none';
  }
});

document.getElementById('btnStartFresh').addEventListener('click', async () => {
  const resumePrompt = document.getElementById('resumePrompt');
  const resumeInput = document.getElementById('resumeStudent');
  
  // Clear resume input and hide prompt
  resumeInput.value = '';
  resumePrompt.style.display = 'none';
  
  // Clear state
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      await BatchGrader.clearBatchGradeState(tab.url);
    }
  } catch (err) {
    console.error('Failed to clear state:', err);
  }
});

async function startBatchGrading() {
  if (isBatchRunning) return;
  
  const provider = PROVIDERS[currentProviderId];
  if (!provider) {
    showStatus("No provider selected.", "red");
    return;
  }
  
  const model = document.getElementById('modelName').value;
  const customInstructions = document.getElementById('customInstructions').value; 
  const resumeAfter = document.getElementById('resumeStudent').value;
  
  // UI State
  isBatchRunning = true;
  document.getElementById('btnStartBatch').style.display = 'none';
  document.getElementById('btnStopBatch').style.display = 'block';
  document.getElementById('batchProgress').style.display = 'block';
  document.getElementById('batchResults').style.display = 'block';
  document.getElementById('batchResults').innerHTML = '';
  
  const progressBar = document.getElementById('batchProgressBar');
  const progressText = document.getElementById('batchProgressText');
  const progressPercent = document.getElementById('batchProgressPercent');
  
  progressBar.style.width = '0%';
  progressText.innerText = 'Initializing...';
  
  let gradedStudents = [];
  
  try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const pageUrl = tab.url;
      
      // 1. Extract Rubric
      logBatch("Extracting rubric...");
      const rubric = await BatchGrader.extractRubric(tab.id);
      logBatch("Rubric extracted.");
      
      // 2. Extract Students
      logBatch("Extracting students...");
      const allStudents = await BatchGrader.extractStudents(tab.id);
      
      // 3. Filter & Resume Logic
      let startIndex = 0;
      if (resumeAfter) {
          const resumeLower = resumeAfter.toLowerCase();
          const resumeLastName = resumeLower.split(',')[0].trim();
          const foundIndex = allStudents.findIndex(s => {
             const nameLower = s.name.toLowerCase();
             return nameLower === resumeLower || nameLower.startsWith(resumeLastName);
          });
          if (foundIndex >= 0) {
              startIndex = foundIndex + 1;
              logBatch(`Resuming after ${allStudents[foundIndex].name}`);
          } else if (resumeAfter) {
              logBatch(`Warning: Could not find student "${resumeAfter}" - starting from beginning`, "orange");
          }
      }
      
      const toGrade = allStudents.slice(startIndex).filter(s => !s.hasFeedback);
      const total = toGrade.length;
      
      if (total === 0) {
          logBatch("No ungraded students found.", "green");
          // Clear state if all done
          await BatchGrader.clearBatchGradeState(pageUrl);
          stopBatchGrading();
          return;
      }
      
      logBatch(`Found ${total} students to grade.`);
      
      // 4. Grading Loop
      for (let i = 0; i < total; i++) {
          if (!isBatchRunning) {
              logBatch("Batch grading cancelled.", "orange");
              break;
          }
          
          const student = toGrade[i];
          progressText.innerText = `${i + 1}/${total}`;
          const pct = Math.round(((i + 1) / total) * 100);
          progressBar.style.width = `${pct}%`;
          progressPercent.innerText = `${pct}%`;
          
          logBatch(`Grading ${student.name}...`);
          
          try {
              // Prepare config with OAuth token
               let config = getProviderConfigFromUI(currentProviderId);

               // Grade
              const result = await BatchGrader.gradeStudent(
                  provider, 
                  model, 
                  rubric, 
                  student.name, 
                  student.response, 
                  customInstructions,
                  config // Pass explicit config
              );
              
              // Fill
              if (isBatchRunning) {
                   await BatchGrader.fillGrade(tab.id, student.index, result.score, result.feedback);
                   logBatch(`✓ ${student.name}: ${result.score}/${rubric.maxScore}`, "green");
                   
                   gradedStudents.push({ name: student.name, score: result.score });
                   
                   // Save every 5
                   if ((i + 1) % 5 === 0) {
                       logBatch("Auto-saving...");
                       await BatchGrader.clickQuickSave(tab.id);
                       
                       // Save state after Quick Save
                       const lastGraded = gradedStudents[gradedStudents.length - 1];
                       await BatchGrader.saveBatchGradeState(pageUrl, lastGraded.name, gradedStudents.length);
                       
                       // Wait a bit
                       await new Promise(r => setTimeout(r, 1500));
                   }
              }
          } catch (err) {
              console.error(err);
              logBatch(`Error grading ${student.name}: ${err.message}`, "red");
          }
          
          // Delay
          await new Promise(r => setTimeout(r, 1000));
      }
      
      // Final Save
      if (isBatchRunning && gradedStudents.length > 0) {
          logBatch("Final save...");
          await BatchGrader.clickQuickSave(tab.id);
          
          // Save final state
          const lastGraded = gradedStudents[gradedStudents.length - 1];
          await BatchGrader.saveBatchGradeState(pageUrl, lastGraded.name, gradedStudents.length);
          
          logBatch("Batch grading complete!", "green");
          
          // Clear state if all students were graded
          if (gradedStudents.length === total) {
              await BatchGrader.clearBatchGradeState(pageUrl);
          }
      }
      
  } catch (e) {
      logBatch(`Fatal Error: ${e.message}`, "red");
  } finally {
      stopBatchGrading();
  }
}

function stopBatchGrading() {
  isBatchRunning = false;
  document.getElementById('btnStartBatch').style.display = 'block';
  document.getElementById('btnStopBatch').style.display = 'none';
  // Check page status again to re-enable/disable correctly
  checkBatchPageStatus();
}

function logBatch(msg, color = 'black') {
    const div = document.getElementById('batchResults');
    const line = document.createElement('div');
    line.innerText = msg;
    
    if (color === 'red') line.classList.add('text-error');
    else if (color === 'green') line.classList.add('text-success');
    else if (color === 'orange') line.classList.add('text-warning');
    else if (color !== 'black') line.style.color = color;

    line.classList.add('border-bottom-light');
    line.style.padding = '2px 0';
    div.appendChild(line);
    div.scrollTop = div.scrollHeight;
}


