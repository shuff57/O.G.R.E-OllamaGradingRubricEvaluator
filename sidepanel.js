import { PROVIDERS, getActiveProvider, setActiveProvider, proxyFetch, callProviderAI } from './providers.js';
import BatchGrader from './batch-grader.js';
import SiteProfiles from './site-profiles.js';
import Discover from './discover.js';
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
  nonZero: "IMPORTANT: Only provide feedback for students who earn a non-zero score. If a student's score is 0, set feedback to an empty string \"\". Do NOT write feedback for zero-score students.",
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
    // Don't set initial maxHeight here - will be set when switching to batch mode
    // because the card is hidden on load (scrollHeight would be 0)

    batchHeader.addEventListener('click', () => {
      const isCollapsed = batchContent.classList.contains('collapsed');

      if (isCollapsed) {
        batchContent.classList.remove('collapsed');
        batchCollapseIcon.classList.remove('collapsed');
        // Animate to scrollHeight, then switch to none so content can grow freely
        batchContent.style.maxHeight = batchContent.scrollHeight + 'px';
        batchContent.addEventListener('transitionend', function handler() {
          if (!batchContent.classList.contains('collapsed')) {
            batchContent.style.maxHeight = 'none';
          }
          batchContent.removeEventListener('transitionend', handler);
        });
      } else {
        // Set explicit height first so transition can animate from it
        batchContent.style.maxHeight = batchContent.scrollHeight + 'px';
        requestAnimationFrame(() => {
          batchContent.classList.add('collapsed');
          batchCollapseIcon.classList.add('collapsed');
          batchContent.style.maxHeight = '0';
        });
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
  if (serverConnected && handshakeToken) {
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

// Listen for area selection and element picks from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "areaSelected" && currentCaptureTarget) {
    processAreaCapture(request.area);
  }
  // Element picker response (from element-picker.js)
  if (request.action === "elementPicked" && _discoveryPickerTarget) {
    handleElementPicked(request);
  }
  if (request.action === "elementPickCancelled") {
    _discoveryPickerTarget = null;
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
  // Reset mode classes but preserve desktop-connected
  const wasDesktop = document.body.classList.contains('desktop-connected');
  document.body.className = '';
  if (wasDesktop) document.body.classList.add('desktop-connected');
  
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

    // Fix collapsible height after showing batch card
    const batchContent = document.getElementById('batchContent');
    if (batchContent && !batchContent.classList.contains('collapsed')) {
      // Set to none so content can grow freely as logs/panels appear
      setTimeout(() => {
        batchContent.style.maxHeight = 'none';
      }, 0);
    }

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

// Check if current page is supported for batch grading (uses site profiles)
async function checkBatchPageStatus() {
  const statusEl = document.getElementById('batchPageStatus');
  const statusText = document.getElementById('batchPageStatusText');
  const btnStart = document.getElementById('btnStartBatch');
  const resumePrompt = document.getElementById('resumePrompt');
  const profileSelect = document.getElementById('profileSelect');

  console.log('[Batch] checkBatchPageStatus called');
  statusText.innerText = "Checking page compatibility...";
  statusEl.style.display = '';
  statusEl.classList.add('status-info');
  statusEl.classList.remove('status-success', 'status-error');
  statusEl.style.background = '';
  statusEl.style.color = '';
  btnStart.disabled = true;
  resumePrompt.style.display = 'none';

  // Populate profile dropdown
  await populateProfileDropdown();

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) return;

    console.log('[Batch] Tab URL:', tab.url);

    // Check for manual profile override from dropdown
    const selectedProfileId = profileSelect?.value;
    let profile = null;

    if (selectedProfileId && selectedProfileId !== 'auto') {
      profile = await SiteProfiles.getProfile(selectedProfileId);
    } else {
      // Auto-detect: match URL against all profiles
      profile = await SiteProfiles.matchProfile(tab.url);
    }

    if (profile) {
       // Store active profile for use in startBatchGrading
       window._activeBatchProfile = profile;
       const navMode = profile.navigation?.mode || 'batch';
       const modeLabel = navMode === 'sequential' ? ' (Sequential)' : '';
       statusText.innerText = `Profile: ${profile.name}${modeLabel}`;
       statusEl.classList.add('status-success');
       statusEl.classList.remove('status-info', 'status-error');
       statusEl.style.background = '';
       statusEl.style.color = '';
       btnStart.disabled = false;
       console.log(`[Batch] Profile matched: ${profile.name} (${profile.id}), mode: ${navMode}`);

       // Show the rubric review section and auto-extract rubric
       const rubricReviewEl = document.getElementById('rubricReviewContainer');
       if (rubricReviewEl) {
         rubricReviewEl.style.display = '';
         // Hide Continue button until grading starts — only Generate Rubric is available standalone
         const continueBtn = document.getElementById('continueGradingBtn');
         if (continueBtn) continueBtn.style.display = 'none';
       }

       // Auto-extract rubric from page and populate the review section
       autoExtractRubric(tab.id, profile);

       // Select the matched profile in dropdown
       if (profileSelect) {
         profileSelect.value = profile.id;
         // Add option if not in dropdown yet
         if (!profileSelect.querySelector(`option[value="${profile.id}"]`)) {
           const opt = document.createElement('option');
           opt.value = profile.id;
           opt.textContent = profile.name;
           profileSelect.appendChild(opt);
           profileSelect.value = profile.id;
         }
       }

       // Check for saved state
       await checkResumeState(tab.url);
    } else {
       window._activeBatchProfile = null;
       console.log('[Batch] No profile matched. Showing discover option.');
       statusText.innerText = "Unknown page — use Discover to analyze";
       // Hide rubric review when no profile
       const rubricReviewEl = document.getElementById('rubricReviewContainer');
       if (rubricReviewEl) rubricReviewEl.style.display = 'none';
       statusEl.classList.remove('status-success', 'status-info');
       statusEl.classList.add('status-error');
       statusEl.style.background = '';
       statusEl.style.color = '';
    }
  } catch (e) {
    console.error('[Batch] checkBatchPageStatus error:', e);
    statusText.innerText = "Error checking page.";
  }
}

/**
 * Populate the profile dropdown with all available profiles.
 */
async function populateProfileDropdown() {
  const profileSelect = document.getElementById('profileSelect');
  if (!profileSelect) return;

  const profiles = await SiteProfiles.listProfiles();

  // Preserve current selection
  const currentVal = profileSelect.value;

  // Clear all except auto-detect
  while (profileSelect.options.length > 1) {
    profileSelect.remove(1);
  }

  // Add each profile
  for (const p of profiles) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name + (p.isBuiltIn ? ' (built-in)' : '');
    profileSelect.appendChild(opt);
  }

  // Restore selection
  if (currentVal && profileSelect.querySelector(`option[value="${currentVal}"]`)) {
    profileSelect.value = currentVal;
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
  if (serverConnected && handshakeToken) {
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

    // Update desktop dropdown text to show the selected model
    if (serverConnected) {
      const desktopOpt = document.querySelector(`#desktopProviderSelect option[value="${currentProviderId}"]`);
      const selectedModel = document.getElementById('modelName').value;
      if (desktopOpt && selectedModel) {
        desktopOpt.text = getProviderDisplayName(currentProviderId) + ` (${selectedModel})`;
      }
    }
  } catch (err) {
    console.error('[refreshModels] Error for', currentProviderId, ':', err);
    modelSelect.innerHTML = '<option value="">Error loading models</option>';
    showConfigStatus(`Error loading models: ${err.message}`, 'red');
  } finally {
    modelSelect.disabled = false;
    btn.classList.remove('spin-animation');
  }
}

function getProviderConfigFromUI(providerId) {
  // When server-connected, prefer cached providerConfigs (populated by applyDesktopProviders)
  // over DOM fields which may be hidden/empty in Batch mode
  if (serverConnected && providerConfigs[providerId]) {
    const cached = { ...providerConfigs[providerId] };
    if (oauthTokens[providerId]) {
      cached.oauthToken = oauthTokens[providerId];
    }
    return cached;
  }

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
 * Module-level state for server connection.
 * serverConnected: whether we successfully connected to the grading server on last attempt
 * handshakeToken: Bearer token for /api/* endpoints
 */
let serverConnected = false;
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
async function connectToServer() {
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
          ? 'Grading server not ready yet'
          : response.status === 403
          ? 'Origin not allowed by grading server'
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
      reason: 'Grading server not running'
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
 * Updates the provider configuration UI based on server connection state.
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
        desktopStatusBanner.innerHTML = '<i class="bi bi-check-circle-fill"></i> Connected to Grading Server';
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
  serverConnected = false;
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
  serverConnected = true;

  // Store full providers array for batch grading model lookups
  window.desktopProvidersList = providers;

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
    };
    // Inject desktop OAuth access_token into oauthTokens so getAuthToken() works
    if (p.credentials?.access_token) {
      oauthTokens[p.id] = p.credentials.access_token;
    }

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
  console.log('[Server] Attempting server connection...');

  // --- Step 1: Handshake ---
  const handshake = await connectToServer();

  if (!handshake.connected) {
    // Handle specific handshake failures
    if (handshake.statusCode === 503) {
      // Server running but not ready — wait briefly then fall back
      console.log('[Desktop] Server starting (503). Waiting 3 seconds...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      // Retry once
      const retry = await connectToServer();
      if (retry.connected) {
        handshake.connected = true;
        handshake.token = retry.token;
      } else {
        console.log('[Server] Still not ready after wait. Using manual mode.');
        await activateFallbackMode();
        return;
      }
    } else if (handshake.statusCode === 403) {
      console.warn('[Server] Origin rejected (403). Extension origin not allowed. Using manual mode.');
      await activateFallbackMode();
      return;
    } else {
      // Network error or other — server not running (expected, not an error)
      console.log('[Server] Server not running. Using manual mode.');
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
    const reHandshake = await connectToServer();
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

  // Refresh model list for active provider after a brief delay
  // (background.js service worker may not be ready immediately during init)
  setTimeout(() => refreshModels(), 500);
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
document.getElementById('btnGitHubInfo')?.addEventListener('click', () => {
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
let _batchActivityHandle = null;

document.getElementById('btnStartBatch').addEventListener('click', () => {
  console.log('🔵 [DEBUG] Start Batch button clicked!');
  startBatchGrading().catch(err => {
    console.error('🔴 [DEBUG] startBatchGrading threw error:', err);
    logBatch(`❌ Error: ${err.message}`, 'red');
  });
});
document.getElementById('btnStopBatch').addEventListener('click', stopBatchGrading);

// Review Mode Toggle
document.querySelectorAll('input[name="reviewMode"]')?.forEach(radio => {
  radio.addEventListener('change', (e) => {
    const enabled = e.target.value === 'on';
    const infoBox = document.getElementById('reviewModeInfo');

    if (enabled) {
      infoBox.style.display = 'block';
      logBatch("👁️ Review mode enabled - will pause before filling results", "blue");
    } else {
      infoBox.style.display = 'none';
      logBatch("Auto-fill mode - results will be filled automatically", "blue");
    }
  });
});

// Review Panel State
let pendingReviewBatch = null;
let reviewResolve = null;

// Review Panel Handlers
document.getElementById('btnApproveAndFill')?.addEventListener('click', () => {
  if (reviewResolve) {
    logBatch("✓ Batch approved - filling results into page", "green");
    reviewResolve({ action: 'approve' });
    document.getElementById('reviewPanel').style.display = 'none';
    pendingReviewBatch = null;
    reviewResolve = null;
  }
});

document.getElementById('btnSkipBatch')?.addEventListener('click', () => {
  if (reviewResolve) {
    logBatch("⏭️ Batch skipped - moving to next batch", "orange");
    reviewResolve({ action: 'skip' });
    document.getElementById('reviewPanel').style.display = 'none';
    pendingReviewBatch = null;
    reviewResolve = null;
  }
});

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

/**
 * Show review panel for a single student and wait for user decision.
 * Content is from the grading server's AI output (trusted internal source).
 * @param {Object} result - Single student result {name, score, maxScore, feedback}
 * @param {number} index - Current index in the batch (0-based)
 * @param {number} total - Total students in this batch
 * @returns {Promise<{action: 'approve'|'skip'}>}
 */
async function requestStudentReview(result, index, total) {
  return new Promise((resolve) => {
    pendingReviewBatch = result;
    reviewResolve = resolve;

    const counter = document.getElementById('reviewCounter');
    counter.textContent = `${index + 1} of ${total}`;

    const summary = document.getElementById('reviewSummary');
    summary.textContent = '';

    const nameRow = document.createElement('div');
    nameRow.style.cssText = 'margin-bottom: 6px;';
    const nameStrong = document.createElement('strong');
    nameStrong.textContent = result.name;
    const scoreSpan = document.createElement('span');
    scoreSpan.style.fontSize = '1.1em';
    scoreSpan.textContent = `: ${result.score}/${result.maxScore || 10}`;
    nameRow.appendChild(nameStrong);
    nameRow.appendChild(scoreSpan);

    const feedbackDiv = document.createElement('div');
    feedbackDiv.style.cssText = 'font-size: 0.85em; color: var(--color-text-secondary); max-height: 120px; overflow-y: auto; white-space: pre-wrap;';
    feedbackDiv.textContent = result.feedback;

    summary.appendChild(nameRow);
    summary.appendChild(feedbackDiv);

    document.getElementById('reviewPanel').style.display = 'block';
  });
}

// ---------------------------------------------------------------------------
// autoExtractRubric(tabId, profile) — auto-populate rubric review on profile detection
// ---------------------------------------------------------------------------
/**
 * Extracts rubric from the current page and populates the rubric review section.
 * Called fire-and-forget from checkBatchPageStatus when a profile is detected.
 * Does NOT block the UI — silently populates if successful.
 */
async function autoExtractRubric(tabId, profile) {
  const textarea = document.getElementById('rubricReviewText');
  const maxScoreInput = document.getElementById('rubricMaxScore');
  const statusEl = document.getElementById('rubricReviewStatus');
  if (!textarea || !maxScoreInput || !statusEl) return;

  // Don't overwrite if user already typed something
  if (textarea.value.trim().length > 20) return;

  const sel = profile?.selectors || {};
  const navMode = profile?.navigation?.mode || 'batch';
  const navConfig = profile?.navigation || { mode: 'batch' };

  try {
    statusEl.textContent = 'Extracting rubric from page...';

    // Phase 1: Extract rubric using appropriate method
    let rubric;
    if (navMode === 'sequential') {
      rubric = await BatchGrader.extractRubricSequential(tabId, sel, navConfig);
    } else {
      rubric = await BatchGrader.extractRubric(tabId, sel);
    }

    // Phase 2: Check quality — if insufficient, try page content
    let source = 'extracted';
    if (!BatchGrader.isRubricSufficient(rubric)) {
      const pageContent = await BatchGrader.extractPageContent(tabId, sel, navConfig);
      if (pageContent.content.length > 50) {
        rubric.essayPrompt = pageContent.content;
        source = 'page-content';
      } else {
        source = 'manual';
      }
    }

    // Populate the review section
    const formatted = BatchGrader.formatRubricForReview(rubric);
    if (formatted.trim().length > 0) {
      textarea.value = formatted;
    }
    if (rubric.maxScore) {
      maxScoreInput.value = rubric.maxScore;
    }

    // Update status based on what we found
    const messages = {
      'extracted': 'Rubric extracted from page. Review and edit if needed.',
      'page-content': 'Assignment content found (no formal rubric). Click Generate Rubric for AI criteria.',
      'manual': 'No rubric or content found. Enter criteria or click Generate Rubric.',
    };
    statusEl.textContent = messages[source] || messages.extracted;
  } catch (err) {
    console.warn('[Rubric] Auto-extract failed:', err.message);
    statusEl.textContent = 'Enter grading criteria or click Generate Rubric.';
  }
}

// ---------------------------------------------------------------------------
// generateRubricFromContent(content, maxScore) — AI rubric generation
// ---------------------------------------------------------------------------
/**
 * Send assignment content to the AI to generate proper grading criteria.
 * Uses the currently connected provider/model.
 * @param {string} content - Assignment text (question, description, etc.)
 * @param {string} maxScore - Maximum score for the assignment
 * @returns {Promise<string>} AI-generated rubric text
 */
async function generateRubricFromContent(content, maxScore) {
  const prompt = `You are a teacher creating a grading rubric for high school seniors. Given the following assignment question/prompt, create clear grading criteria.

Assignment (max ${maxScore} points):
${content}

Respond with ONLY the rubric in this format:
- List each grading criterion on its own line
- Include point values for each criterion (must total ${maxScore})
- Be specific about what earns full/partial/no credit for each criterion`;

  try {
    const config = getProviderConfigFromUI(currentProviderId);
    const result = await callProviderAI(currentProviderId, config, [
      { role: 'user', content: prompt }
    ]);
    return result || content;
  } catch (err) {
    console.warn('[Rubric] AI generation failed:', err.message);
    return content; // Fallback to raw content
  }
}

// ---------------------------------------------------------------------------
// showRubricReview(rubric, source) — pause for user review
// ---------------------------------------------------------------------------
/**
 * Show the rubric review section and wait for user to click Continue.
 * @param {object} rubric - Rubric data
 * @param {string} source - Where the rubric came from ('extracted', 'generated', 'manual')
 * @returns {Promise<{text: string, maxScore: string}|null>} User's reviewed rubric, or null if cancelled
 */
function showRubricReview(rubric, source) {
  return new Promise((resolve) => {
    const container = document.getElementById('rubricReviewContainer');
    const textarea = document.getElementById('rubricReviewText');
    const maxScoreInput = document.getElementById('rubricMaxScore');
    const statusEl = document.getElementById('rubricReviewStatus');
    const continueBtn = document.getElementById('continueGradingBtn');
    const generateBtn = document.getElementById('generateRubricBtn');

    // Status messages by tier
    const messages = {
      extracted: 'Rubric extracted from page. Review and edit if needed.',
      generated: 'AI-generated rubric from assignment content. Review and edit if needed.',
      manual: 'No rubric found. Please enter grading criteria or click Generate Rubric.',
    };
    statusEl.textContent = messages[source] || messages.extracted;

    // Pre-fill with formatted rubric
    textarea.value = BatchGrader.formatRubricForReview(rubric);
    maxScoreInput.value = rubric.maxScore || '10';

    // Show and expand (Continue button may have been hidden for standalone mode)
    container.style.display = '';
    container.open = true;
    continueBtn.style.display = '';
    if (source === 'manual') textarea.focus();

    const cleanup = () => {
      continueBtn.removeEventListener('click', onContinue);
      generateBtn.removeEventListener('click', onGenerate);
      window.removeEventListener('rubricReviewCancel', onCancel);
    };

    const onContinue = () => {
      const text = textarea.value.trim();
      if (!text) {
        textarea.style.border = '2px solid #e74c3c';
        setTimeout(() => { textarea.style.border = ''; }, 1500);
        return;
      }
      cleanup();
      container.style.display = 'none';
      resolve({ text, maxScore: maxScoreInput.value || '10' });
    };

    const onCancel = () => {
      cleanup();
      container.style.display = 'none';
      resolve(null);
    };

    const onGenerate = async () => {
      generateBtn.disabled = true;
      const origLabel = generateBtn.textContent;
      generateBtn.textContent = 'Generating...';
      try {
        const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
        const profile = window._activeBatchProfile;
        const sel = profile?.selectors || {};
        const nav = profile?.navigation || { mode: 'batch' };

        // Get content: use existing textarea text or scrape page
        let contentSource = textarea.value.trim();
        if (contentSource.length < 10) {
          const pageContent = await BatchGrader.extractPageContent(tab.id, sel, nav);
          contentSource = pageContent.content;
        }

        if (contentSource.length < 10) {
          statusEl.textContent = 'Not enough content to generate a rubric. Please enter text first.';
          return;
        }

        const generated = await generateRubricFromContent(contentSource, maxScoreInput.value || '10');
        textarea.value = generated;
        statusEl.textContent = 'AI-generated rubric ready. Review and edit if needed.';
      } catch (err) {
        statusEl.textContent = 'Failed to generate rubric: ' + err.message;
      } finally {
        generateBtn.disabled = false;
        generateBtn.textContent = origLabel;
      }
    };

    continueBtn.addEventListener('click', onContinue);
    generateBtn.addEventListener('click', onGenerate);
    window.addEventListener('rubricReviewCancel', onCancel);
  });
}

async function startBatchGrading() {
  console.log('[Batch] startBatchGrading called, isBatchRunning:', isBatchRunning);
  logBatch("Starting batch grading...", "blue");

  if (isBatchRunning) {
    logBatch("⚠️ Batch grading already in progress", "orange");
    return;
  }

  // Check if grading server is available
  logBatch("📡 Checking grading server connection...");
  console.log('[Batch] Checking server at http://localhost:3456/health');

  const serverOk = await fetch('http://localhost:3456/health')
    .then(r => {
      console.log('[Batch] Server health check response:', r.status, r.ok);
      return r.ok;
    })
    .catch(err => {
      console.error('[Batch] Server health check failed:', err);
      return false;
    });

  if (!serverOk) {
    logBatch("❌ Grading server not running on port 3456", "red");
    logBatch("💡 Please start the server with: cd grading-server && bun run dev", "orange");
    logBatch("Falling back to direct grading...", "orange");
    await fallbackDirectGrading();
    return;
  }

  logBatch("✓ Grading server connected", "green");

  // Get handshake token from server if we don't have one
  if (!handshakeToken) {
    logBatch("🔐 Authenticating with server...");
    try {
      const hsRes = await fetch('http://localhost:3456/api/handshake');
      console.log('[Batch] Handshake response:', hsRes.status);
      if (hsRes.ok) {
        const hsData = await hsRes.json();
        handshakeToken = hsData.token;
        console.log('[Batch] Got handshake token:', handshakeToken?.substring(0, 20) + '...');
      }
    } catch (err) {
      console.error('[Batch] Handshake error:', err);
    }
  }
  if (!handshakeToken) {
    logBatch("❌ Cannot authenticate with grading server", "red");
    logBatch("Falling back to direct grading...", "orange");
    await fallbackDirectGrading();
    return;
  }
  logBatch("✓ Authenticated with server", "green");

  // Resolve model: DOM select → desktopProvidersList → server query
  logBatch("🎯 Resolving model selection...");
  let model = '';

  // 1. Try the model dropdown (most up-to-date if user selected one)
  const modelEl = document.getElementById('modelName');
  if (modelEl) {
    const domVal = modelEl.value;
    console.log('[Batch] Model dropdown value:', domVal);
    if (domVal && domVal !== 'Loading...' && domVal !== 'No models found' && domVal !== 'Error loading models') {
      model = domVal;
      console.log('[Batch] Using model from dropdown:', model);
    }
  }

  // 2. Try desktopProvidersList (from initial push)
  if (!model && window.desktopProvidersList) {
    const desktopProvider = window.desktopProvidersList.find(p => p.id === currentProviderId);
    if (desktopProvider && desktopProvider.model) {
      model = desktopProvider.model;
    }
  }

  // 3. Try lastSelected dataset
  if (!model && modelEl && modelEl.dataset.lastSelected) {
    model = modelEl.dataset.lastSelected;
  }

  // 4. Last resort: query server for current provider config
  if (!model) {
    try {
      const provRes = await fetch('http://localhost:3456/api/providers', {
        headers: { 'Authorization': `Bearer ${handshakeToken}` },
      });
      if (provRes.ok) {
        const provData = await provRes.json();
        const active = provData.providers?.find(p => p.id === currentProviderId);
        if (active && active.model) model = active.model;
      }
    } catch { /* ignore */ }
  }

  if (!model) {
    const domVal = modelEl?.value || '(no element)';
    const desktopModel = window.desktopProvidersList?.find(p => p.id === currentProviderId)?.model || '(none)';
    logBatch(`❌ No model selected`, "red");
    logBatch(`   DOM value: "${domVal}"`, "red");
    logBatch(`   Desktop provider model: "${desktopModel}"`, "red");
    logBatch(`   Provider ID: ${currentProviderId}`, "red");
    logBatch("💡 Please select a model from the dropdown and try again", "orange");
    return;
  }

  logBatch(`✓ Using model: ${model}`, "green");
  console.log('[Batch] Resolved model:', model, 'from provider:', currentProviderId);

  const customInstructions = document.getElementById('customInstructions').value;
  const resumeAfter = document.getElementById('resumeStudent').value;

  // Detect "non-zero feedback only" instruction for programmatic enforcement
  const nonZeroFeedbackOnly = /non.?zero/i.test(customInstructions) && /feedback/i.test(customInstructions);

  // Extension-based grading — BatchGrader handles extraction, grading, and filling

  // UI State
  isBatchRunning = true;
  document.getElementById('btnStartBatch').style.display = 'none';
  document.getElementById('btnStopBatch').style.display = 'block';
  document.getElementById('batchProgress').style.display = 'block';
  document.getElementById('batchResults').style.display = 'block';
  document.getElementById('batchResults').textContent = '';

  const progressBar = document.getElementById('batchProgressBar');
  const progressText = document.getElementById('batchProgressText');
  const progressPercent = document.getElementById('batchProgressPercent');

  progressBar.style.width = '0%';
  progressText.innerText = 'Initializing...';

  try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const pageUrl = tab.url;
      console.log('[Batch] Active tab:', tab.id, 'URL:', pageUrl);
      logBatch(`📄 Page: ${pageUrl}`);

      // Resolve site profile for selectors
      const activeProfile = window._activeBatchProfile || await SiteProfiles.getActiveProfile(pageUrl) || SiteProfiles.DEFAULT_MYOPENMATH_PROFILE;
      const sel = activeProfile.selectors;
      const fbConfig = activeProfile.feedback || { type: 'tinymce-inline', requiresHiddenSync: true, htmlWrap: true };
      const saveConfig = activeProfile.save || { buttonText: 'Quick Save', fallbackText: 'Save Changes' };
      const navMode = activeProfile.navigation?.mode || 'batch';
      const navConfig = activeProfile.navigation || { mode: 'batch' };

      let rubric, allStudents;

      // Check if user already filled in rubric text (from standalone Generate Rubric)
      const existingRubricText = document.getElementById('rubricReviewText')?.value?.trim();
      const existingMaxScore = document.getElementById('rubricMaxScore')?.value;

      if (existingRubricText && existingRubricText.length > 20) {
        // User already reviewed/generated rubric — use it directly, no pause
        rubric = {
          essayPrompt: existingRubricText,
          checklistItems: [],
          rubricItems: [],
          modelText: null,
          maxScore: existingMaxScore || '10',
        };
        logBatch("Using rubric from review panel.");
      } else {
        // --- Phase 1: Extract rubric (both modes) ---
        logBatch("Extracting rubric...");
        if (navMode === 'sequential') {
          rubric = await BatchGrader.extractRubricSequential(tab.id, sel, navConfig);
        } else {
          rubric = await BatchGrader.extractRubric(tab.id, sel);
        }
        logBatch("Rubric extracted.");

        // --- Phase 2: Three-tier rubric quality check (universal) ---
        let rubricSource = 'extracted';
        if (!BatchGrader.isRubricSufficient(rubric)) {
          logBatch("Rubric insufficient. Scanning page for content...");
          const pageContent = await BatchGrader.extractPageContent(tab.id, sel, navConfig);
          if (pageContent.content.length > 50) {
            logBatch(`Found ${pageContent.source}. Generating rubric...`);
            try {
              const generatedRubric = await generateRubricFromContent(pageContent.content, rubric.maxScore || '10');
              rubric.essayPrompt = generatedRubric;
              rubricSource = 'generated';
              logBatch("AI-generated rubric ready for review.");
            } catch {
              rubric.essayPrompt = pageContent.content;
              rubricSource = 'generated';
              logBatch("Using page content as rubric (AI generation failed).");
            }
          } else {
            rubricSource = 'manual';
            logBatch("No rubric or content found. Please provide grading instructions.");
          }
        }

        // Check if extraction/generation produced content
        const rubricText = BatchGrader.formatRubricForReview(rubric).trim();
        if (rubricText.length > 20) {
          // Got content — populate review section but don't pause
          const textarea = document.getElementById('rubricReviewText');
          const maxScoreInput = document.getElementById('rubricMaxScore');
          if (textarea) textarea.value = rubricText;
          if (maxScoreInput) maxScoreInput.value = rubric.maxScore || '10';
          logBatch("Rubric ready.");
        } else {
          // Empty — pause and wait for user to provide rubric
          logBatch("No rubric found. Waiting for input...");
          const reviewResult = await showRubricReview(rubric, rubricSource);
          if (!reviewResult) {
            logBatch("Grading cancelled.");
            isBatchRunning = false;
            return;
          }
          rubric.essayPrompt = reviewResult.text;
          rubric.maxScore = reviewResult.maxScore;
        }
      }

      // --- Phase 4: Extract students ---
      if (navMode === 'sequential') {
        logBatch("Extracting students (navigating through pages)...");
        allStudents = await BatchGrader.extractStudentsSequential(tab.id, sel, navConfig, (current, total) => {
          progressText.innerText = `Extracting ${current}/${total}`;
          const pct = Math.round((current / total) * 50);
          progressBar.style.width = `${pct}%`;
          progressPercent.innerText = `${pct}%`;
        });
        logBatch(`Extracted ${allStudents.length} students.`);

        // Detect multi-question mode and branch to per-question grading
        const isMultiQuestion = allStudents[0]?.isMultiQuestion || false;
        if (isMultiQuestion && handshakeToken) {
          logBatch('Multi-question submission detected. Switching to per-question grading...');
          const customInstructions = document.getElementById('customInstructions')?.value?.trim() || '';
          const nonZeroFeedbackOnly = customInstructions && /non.?zero/i.test(customInstructions) && /feedback/i.test(customInstructions);
          return await startMultiQuestionGrading(tab, allStudents, rubric, {
            sel,
            fbConfig,
            navConfig,
            pageUrl,
            customInstructions,
            model,
            nonZeroFeedbackOnly,
          });
        }
      } else {
        logBatch("Extracting students...");
        allStudents = await BatchGrader.extractStudents(tab.id, sel);
      }

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

      const toGrade = allStudents.slice(startIndex).filter(s => {
        // Skip students who already have feedback
        if (s.hasFeedback) return false;
        // Skip students who already have a non-zero score (don't replace existing grades)
        const score = parseFloat(s.currentScore);
        if (!isNaN(score) && score > 0) return false;
        return true;
      });
      const total = toGrade.length;

      if (total === 0) {
          logBatch("No ungraded students found.", "green");
          await BatchGrader.clearBatchGradeState(pageUrl);
          stopBatchGrading();
          return;
      }

      const providerName = getProviderDisplayName(currentProviderId);
      logBatch(`Connected: ${providerName} / ${model}`);
      logBatch(`Sending ${total} students to grading server (SSE)...`);

      // Show activity indicator while server processes
      const activity = showBatchActivity('batch');
      _batchActivityHandle = activity;
      progressText.innerText = `0/${total}`;

      // Build rubric with custom instructions
      const serverRubric = { ...rubric };
      if (customInstructions) {
        serverRubric.essayPrompt = (serverRubric.essayPrompt || '') +
          '\n\nADDITIONAL GRADING INSTRUCTIONS:\n' + customInstructions;
      }

      // Single SSE POST to grading server
      const response = await fetch('http://localhost:3456/api/grade', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${handshakeToken}`,
          },
          body: JSON.stringify({
              provider: currentProviderId,
              model: model,
              rubric: serverRubric,
              students: toGrade.map(s => ({
                  index: s.index,
                  name: s.name,
                  response: s.response,
              })),
          }),
      });

      if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || `Server error: ${response.status}`);
      }

      // Read SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let gradedStudents = [];
      let filledCount = 0;
      let doneData = null;

      while (true) {
          if (!isBatchRunning) {
              reader.cancel();
              logBatch("Batch grading cancelled.", "orange");
              break;
          }

          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events from buffer
          const lines = buffer.split('\n');
          buffer = lines.pop(); // Keep incomplete line in buffer

          let currentEvent = '';
          let currentData = '';

          for (const line of lines) {
              if (line.startsWith('event: ')) {
                  currentEvent = line.slice(7).trim();
              } else if (line.startsWith('data: ')) {
                  currentData = line.slice(6);
              } else if (line === '' && currentEvent && currentData) {
                  // Complete SSE event
                  const parsed = JSON.parse(currentData);

                  if (currentEvent === 'progress') {
                      if (parsed.phase === 'grading') {
                          activity.updateText(`Grading chunk ${parsed.chunkIndex + 1}/${parsed.totalChunks} (${parsed.studentCount} students)...`);
                          logBatch(`Chunk ${parsed.chunkIndex + 1}/${parsed.totalChunks}: grading ${parsed.studentCount} students...`);
                      } else if (parsed.phase === 'outlier-review') {
                          activity.updateText(`Outlier review (${parsed.outlierCount} students)...`);
                          logBatch(`Reviewing ${parsed.outlierCount} outlier(s)...`);
                      }
                  } else if (currentEvent === 'chunk') {
                      const chunkResults = parsed.results || [];
                      logBatch(`Chunk ${parsed.chunkIndex + 1} complete — ${chunkResults.length} results`);

                      if (navMode === 'sequential') {
                          // Sequential: collect results, fill later in navigation pass
                          for (const result of chunkResults) {
                              const student = toGrade.find(s => s.index === result.studentIndex);
                              if (!student) {
                                  logBatch(`Warning: no student found for index ${result.studentIndex}`, "orange");
                                  continue;
                              }
                              // Enforce non-zero feedback rule: strip feedback from 0-score students
                              const feedback = (nonZeroFeedbackOnly && result.score === 0) ? '' : result.feedback;
                              gradedStudents.push({
                                  index: student.index,
                                  name: student.name,
                                  score: result.score,
                                  feedback,
                              });
                              logBatch(`Graded: ${student.name}: ${result.score}/${rubric.maxScore}`);
                          }
                          filledCount += chunkResults.length;
                          progressText.innerText = `Graded ${filledCount}/${total}`;
                          const pct = Math.round((filledCount / total) * 50) + 50; // 50-100% for grading
                          progressBar.style.width = `${pct}%`;
                          progressPercent.innerText = `${pct}%`;
                      } else {
                          // Batch: fill immediately as results arrive
                          const reviewOn = document.getElementById('fillReview')?.checked;
                          let chunkFilled = 0;

                          for (const result of chunkResults) {
                              if (!isBatchRunning) break;

                              const student = toGrade.find(s => s.index === result.studentIndex);
                              if (!student) {
                                  logBatch(`Warning: no student found for index ${result.studentIndex}`, "orange");
                                  continue;
                              }

                              // Per-student review: show score & feedback, wait for approve/skip
                              if (reviewOn) {
                                  const reviewData = { ...result, name: student.name, maxScore: rubric.maxScore };
                                  const decision = await requestStudentReview(reviewData, chunkResults.indexOf(result), chunkResults.length);
                                  if (decision.action === 'skip') {
                                      logBatch(`Skipped ${student.name}`, "orange");
                                      continue;
                                  }
                              }

                              filledCount++;
                              chunkFilled++;
                              progressText.innerText = `Filling ${filledCount}/${total}`;
                              const pct = Math.round((filledCount / total) * 100);
                              progressBar.style.width = `${pct}%`;
                              progressPercent.innerText = `${pct}%`;

                              try {
                                  // Enforce non-zero feedback rule: strip feedback from 0-score students
                                  const feedback = (nonZeroFeedbackOnly && result.score === 0) ? '' : result.feedback;
                                  await BatchGrader.fillGrade(tab.id, student.index, result.score, feedback, sel, fbConfig);
                                  logBatch(`\u2713 ${student.name}: ${result.score}/${rubric.maxScore}`, "green");
                                  gradedStudents.push({ index: student.index, name: student.name, score: result.score, feedback });
                              } catch (err) {
                                  console.error(err);
                                  logBatch(`Error filling ${student.name}: ${err.message}`, "red");
                              }
                          }

                          // Quick Save after filling this chunk
                          if (chunkFilled > 0 && gradedStudents.length > 0) {
                              logBatch("Saving...");
                              await BatchGrader.clickQuickSave(tab.id, saveConfig);
                              const lastGraded = gradedStudents[gradedStudents.length - 1];
                              await BatchGrader.saveBatchGradeState(pageUrl, lastGraded.name, gradedStudents.length);
                              await new Promise(r => setTimeout(r, 1500));
                          }
                      }
                  } else if (currentEvent === 'outlier') {
                      // Re-fill adjusted outlier scores
                      const adjustedResults = parsed.adjustedResults || [];
                      if (adjustedResults.length > 0) {
                          logBatch(`Adjusting ${adjustedResults.length} outlier score(s)...`);

                          if (navMode === 'sequential') {
                              // Sequential: update collected results with adjusted scores
                              for (const result of adjustedResults) {
                                  const student = toGrade.find(s => s.index === result.studentIndex);
                                  if (!student) continue;
                                  // Find and update in gradedStudents
                                  const existing = gradedStudents.find(g => g.index === result.studentIndex);
                                  if (existing) {
                                      existing.score = result.score;
                                      existing.feedback = result.feedback;
                                      logBatch(`Adjusted: ${student.name}: ${result.score}/${rubric.maxScore}`);
                                  }
                              }
                          } else {
                              // Batch: re-fill adjusted scores immediately
                              const reviewOutliers = document.getElementById('fillReview')?.checked;
                              let outliersFilled = 0;

                              for (const result of adjustedResults) {
                                  const student = toGrade.find(s => s.index === result.studentIndex);
                                  if (!student) continue;

                                  if (reviewOutliers) {
                                      const reviewData = { ...result, name: student.name, maxScore: rubric.maxScore };
                                      const decision = await requestStudentReview(reviewData, adjustedResults.indexOf(result), adjustedResults.length);
                                      if (decision.action === 'skip') {
                                          logBatch(`Skipped outlier ${student.name}`, "orange");
                                          continue;
                                      }
                                  }

                                  try {
                                      await BatchGrader.fillGrade(tab.id, student.index, result.score, result.feedback, sel, fbConfig);
                                      logBatch(`\u2713 ${student.name}: adjusted to ${result.score}/${rubric.maxScore}`, "green");
                                      outliersFilled++;
                                  } catch (err) {
                                      logBatch(`Error filling ${student.name}: ${err.message}`, "red");
                                  }
                              }
                              if (outliersFilled > 0) {
                                  await BatchGrader.clickQuickSave(tab.id, saveConfig);
                                  await new Promise(r => setTimeout(r, 1500));
                              }
                          }
                      }
                  } else if (currentEvent === 'done') {
                      doneData = parsed;
                  } else if (currentEvent === 'error') {
                      throw new Error(parsed.message || 'Server grading error');
                  }

                  currentEvent = '';
                  currentData = '';
              }
          }
      }

      activity.stop();
      _batchActivityHandle = null;

      // Show final stats
      if (doneData) {
          if (doneData.anchors) {
              logBatch(`Anchors: Excellent=${doneData.anchors.excellent}, Adequate=${doneData.anchors.adequate}, Minimal=${doneData.anchors.minimal}`);
          }
          if (doneData.stats) {
              logBatch(`Stats: mean=${doneData.stats.mean}, stdDev=${doneData.stats.stdDev}, outliers=${doneData.stats.outliers}, adjusted=${doneData.stats.adjusted}`);
          }
          if (doneData.metadata) {
              logBatch(`Graded in ${doneData.metadata.elapsedSeconds}s (${doneData.metadata.chunks} chunk(s))`);
          }
      }

      // Sequential fill pass: navigate back through students and fill scores
      if (navMode === 'sequential' && gradedStudents.length > 0 && isBatchRunning) {
          logBatch(`Filling ${gradedStudents.length} students sequentially...`);
          const reviewOn = document.getElementById('fillReview')?.checked;

          // Navigate to first student
          await BatchGrader.navigateToFirstStudent(tab.id, navConfig);
          let currentPos = 0;
          let sequentialFilled = 0;

          for (const result of gradedStudents) {
              if (!isBatchRunning) break;

              // Navigate to the correct student position
              while (currentPos < result.index) {
                  await BatchGrader.navigateToNextStudent(tab.id, navConfig);
                  currentPos++;
              }

              // Per-student review
              if (reviewOn) {
                  const reviewData = { ...result, maxScore: rubric.maxScore };
                  const decision = await requestStudentReview(reviewData, sequentialFilled, gradedStudents.length);
                  if (decision.action === 'skip') {
                      logBatch(`Skipped ${result.name}`, "orange");
                      // Still advance to next student
                      if (currentPos < allStudents.length - 1) {
                          await BatchGrader.navigateToNextStudent(tab.id, navConfig);
                          currentPos++;
                      }
                      continue;
                  }
              }

              // Fill this student's grade
              try {
                  await BatchGrader.fillGradeSequential(tab.id, result.score, result.feedback, sel, fbConfig, navConfig);
                  sequentialFilled++;
                  logBatch(`\u2713 ${result.name}: ${result.score}/${rubric.maxScore}`, "green");

                  progressText.innerText = `Filled ${sequentialFilled}/${gradedStudents.length}`;
                  const pct = Math.round((sequentialFilled / gradedStudents.length) * 100);
                  progressBar.style.width = `${pct}%`;
                  progressPercent.innerText = `${pct}%`;
              } catch (err) {
                  console.error(err);
                  logBatch(`Error filling ${result.name}: ${err.message}`, "red");
              }

              // Navigate to next if not last
              if (currentPos < allStudents.length - 1) {
                  await BatchGrader.navigateToNextStudent(tab.id, navConfig);
                  currentPos++;
              }
          }

          logBatch(`Sequential fill complete: ${sequentialFilled}/${gradedStudents.length} students filled.`, "green");
      }

      // Final state
      if (isBatchRunning && gradedStudents.length > 0) {
          logBatch("Batch grading complete!", "green");

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

// ---------------------------------------------------------------------------
// Multi-Question Grading — question-by-question batch grading for Canvas
// ---------------------------------------------------------------------------

/**
 * Show the question picker modal and wait for user selection.
 * @param {Array} questions - Array of {qId, qType, questionText, maxPts}
 * @returns {Promise<Array|null>} Selected questions array, or null if cancelled
 */
function showQuestionPicker(questions) {
  return new Promise(resolve => {
    const modal = document.getElementById('questionPickerModal');
    const list = document.getElementById('questionPickerList');
    const gradeAllCheckbox = document.getElementById('gradeAllQuestions');
    const startBtn = document.getElementById('questionPickerStart');
    const cancelBtn = document.getElementById('questionPickerCancel');
    const closeBtn = document.getElementById('questionPickerClose');

    // Populate question list with checkboxes using safe DOM methods
    list.textContent = '';
    questions.forEach((q, i) => {
      const truncatedText = q.questionText.length > 80
        ? q.questionText.substring(0, 80) + '...'
        : q.questionText;

      const div = document.createElement('div');
      div.style.cssText = 'padding: 6px 0; border-bottom: 1px solid var(--color-border);';

      const label = document.createElement('label');
      label.style.cssText = 'display: flex; align-items: flex-start; gap: 8px; cursor: pointer;';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'question-checkbox';
      checkbox.dataset.index = String(i);
      checkbox.style.marginTop = '3px';

      const span = document.createElement('span');
      const strong = document.createElement('strong');
      strong.textContent = `Q${i + 1}`;
      const ptsText = document.createTextNode(` (${q.maxPts} pts): ${truncatedText} `);
      const typeSpan = document.createElement('span');
      typeSpan.style.cssText = 'color: var(--color-text-muted); font-size: 11px;';
      typeSpan.textContent = `[${q.qType}]`;

      span.appendChild(strong);
      span.appendChild(ptsText);
      span.appendChild(typeSpan);
      label.appendChild(checkbox);
      label.appendChild(span);
      div.appendChild(label);
      list.appendChild(div);
    });

    // Grade All toggles all checkboxes
    gradeAllCheckbox.checked = false;
    gradeAllCheckbox.onchange = () => {
      list.querySelectorAll('.question-checkbox').forEach(cb => {
        cb.checked = gradeAllCheckbox.checked;
      });
    };

    function cleanup() {
      modal.style.display = 'none';
      startBtn.onclick = null;
      cancelBtn.onclick = null;
      closeBtn.onclick = null;
    }

    startBtn.onclick = () => {
      const selected = [];
      list.querySelectorAll('.question-checkbox:checked').forEach(cb => {
        const idx = parseInt(cb.dataset.index);
        selected.push(questions[idx]);
      });
      cleanup();
      resolve(selected.length > 0 ? selected : null);
    };

    cancelBtn.onclick = () => { cleanup(); resolve(null); };
    closeBtn.onclick = () => { cleanup(); resolve(null); };

    modal.style.display = 'block';
  });
}

/**
 * Generate a summary comment for a student based on per-question grading results.
 * Uses AI to synthesize all per-question comments into a concise overall assessment.
 *
 * @param {string} studentName
 * @param {Array} questionResults - [{qId, questionText, maxPts, score, comment}]
 * @param {number} totalScore
 * @param {number} totalMax
 * @returns {Promise<string>} Summary comment text
 */
async function generateStudentSummary(studentName, questionResults, totalScore, totalMax) {
  if (!currentProviderId) return formatFallbackSummary(questionResults, totalScore, totalMax);

  let prompt = `Summarize this student's performance across all questions in 2-3 sentences. Be encouraging but honest.\n\n`;
  prompt += `Student: ${studentName}\nTotal: ${totalScore}/${totalMax}\n\n`;
  for (const qr of questionResults) {
    prompt += `Q: ${qr.questionText.substring(0, 100)}\nScore: ${qr.score}/${qr.maxPts}\nFeedback: ${qr.comment}\n\n`;
  }

  try {
    const config = getProviderConfigFromUI(currentProviderId);
    const result = await callProviderAI(currentProviderId, config, [
      { role: 'system', content: 'You are a grading assistant. Write a brief, constructive overall comment for this student.' },
      { role: 'user', content: prompt },
    ]);
    return result || formatFallbackSummary(questionResults, totalScore, totalMax);
  } catch {
    return formatFallbackSummary(questionResults, totalScore, totalMax);
  }
}

/**
 * Fallback summary when AI is unavailable — simple template.
 */
function formatFallbackSummary(questionResults, totalScore, totalMax) {
  const pct = Math.round((totalScore / totalMax) * 100);
  let summary = `Overall Score: ${totalScore}/${totalMax} (${pct}%)\n\n`;
  for (const qr of questionResults) {
    const label = qr.questionText.substring(0, 60);
    summary += `${qr.score}/${qr.maxPts} — ${label}${qr.comment ? ': ' + qr.comment : ''}\n`;
  }
  return summary;
}

/**
 * Multi-question grading orchestrator.
 * Grades one question at a time across all students using the grading server,
 * then fills per-question scores, then does a final summary pass.
 *
 * @param {Object} tab - Chrome tab
 * @param {Array} allStudents - Students from extractStudentsSequential (with .questions)
 * @param {Object} rubric - Extracted rubric
 * @param {Object} params - {sel, fbConfig, saveConfig, navConfig, navMode, pageUrl, customInstructions, model, nonZeroFeedbackOnly}
 */
async function startMultiQuestionGrading(tab, allStudents, rubric, params) {
  const {
    sel, fbConfig, navConfig, pageUrl,
    customInstructions, model, nonZeroFeedbackOnly,
  } = params;

  // Restructure data: student-grouped → question-grouped
  const questionData = BatchGrader.restructureByQuestion(allStudents);
  if (questionData.length === 0) {
    logBatch('No gradable questions found in submissions.', 'red');
    return;
  }

  // Filter to free-response questions (skip auto-graded types)
  const autoGradedTypes = ['multiple_choice_question', 'true_false_question', 'matching_question',
    'fill_in_multiple_blanks_question', 'multiple_answers_question', 'multiple_dropdowns_question'];
  const freeResponseQuestions = questionData.filter(q => !autoGradedTypes.includes(q.qType));

  if (freeResponseQuestions.length === 0) {
    logBatch('No free-response questions found to grade.', 'orange');
    return;
  }

  logBatch(`Found ${freeResponseQuestions.length} free-response question(s).`);

  // Show question picker
  const selectedQuestions = await showQuestionPicker(freeResponseQuestions);
  if (!selectedQuestions || !isBatchRunning) {
    logBatch('Question selection cancelled.', 'orange');
    return;
  }

  logBatch(`Grading ${selectedQuestions.length} question(s) across ${allStudents.length} students...`);

  // Filter to ungraded students
  const toGrade = allStudents.filter(s => {
    if (s.hasFeedback) return false;
    const score = parseFloat(s.currentScore);
    if (!isNaN(score) && score > 0) return false;
    return true;
  });

  if (toGrade.length === 0) {
    logBatch('No ungraded students found.', 'green');
    return;
  }

  const progressBar = document.getElementById('batchProgressBar');
  const progressText = document.getElementById('batchProgressText');
  const progressPercent = document.getElementById('batchProgressPercent');

  // Store all per-question results for the final summary pass
  // allQuestionResults[qId] = [{ studentIndex, name, score, feedback }]
  const allQuestionResults = {};

  // ---- Per-question grading + fill loop ----
  for (let qi = 0; qi < selectedQuestions.length; qi++) {
    if (!isBatchRunning) break;

    const question = selectedQuestions[qi];
    const qLabel = `Q${qi + 1}`;
    logBatch(`--- ${qLabel}: ${question.questionText.substring(0, 60)}... (${question.maxPts} pts) ---`);

    // Build rubric for this question
    const questionRubric = BatchGrader.buildQuestionRubricForServer(question, customInstructions);

    // Map students to grading server format (only ungraded)
    const serverStudents = toGrade.map(s => {
      const studentQ = s.questions?.find(sq => sq.qId === question.qId);
      return {
        index: s.index,
        name: s.name,
        response: studentQ?.answer || '',
      };
    });

    // Send to grading server
    logBatch(`Sending ${serverStudents.length} students to grading server for ${qLabel}...`);
    const activity = showBatchActivity('batch');

    try {
      const response = await fetch('http://localhost:3456/api/grade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${handshakeToken}`,
        },
        body: JSON.stringify({
          provider: currentProviderId,
          model: model,
          rubric: questionRubric,
          students: serverStudents,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Server error: ${response.status}`);
      }

      // Process SSE stream for this question
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const questionGradedStudents = [];

      while (true) {
        if (!isBatchRunning) { reader.cancel(); break; }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        let currentEvent = '';
        let currentData = '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            currentData = line.slice(6);
          } else if (line === '' && currentEvent && currentData) {
            const parsed = JSON.parse(currentData);

            if (currentEvent === 'progress') {
              activity.updateText(`${qLabel}: Grading chunk ${parsed.chunkIndex + 1}/${parsed.totalChunks}...`);
            } else if (currentEvent === 'chunk') {
              const chunkResults = parsed.results || [];
              for (const result of chunkResults) {
                const student = toGrade.find(s => s.index === result.studentIndex);
                if (!student) continue;
                const feedback = (nonZeroFeedbackOnly && result.score === 0) ? '' : result.feedback;
                questionGradedStudents.push({
                  studentIndex: student.index,
                  name: student.name,
                  score: result.score,
                  feedback,
                });
                logBatch(`${qLabel} ${student.name}: ${result.score}/${question.maxPts}`);
              }
            } else if (currentEvent === 'outlier') {
              const adjusted = parsed.adjustedResults || [];
              for (const result of adjusted) {
                const existing = questionGradedStudents.find(g => g.studentIndex === result.studentIndex);
                if (existing) {
                  existing.score = result.score;
                  existing.feedback = result.feedback;
                  logBatch(`${qLabel} Adjusted: ${existing.name}: ${result.score}/${question.maxPts}`);
                }
              }
            } else if (currentEvent === 'done') {
              if (parsed.stats) {
                logBatch(`${qLabel} Stats: mean=${parsed.stats.mean}, stdDev=${parsed.stats.stdDev}`);
              }
            } else if (currentEvent === 'error') {
              throw new Error(parsed.message || `Server error grading ${qLabel}`);
            }

            currentEvent = '';
            currentData = '';
          }
        }
      }

      activity.stop();

      // Store results for final summary
      allQuestionResults[question.qId] = questionGradedStudents.map(g => ({
        ...g,
        qId: question.qId,
        questionText: question.questionText,
        maxPts: question.maxPts,
      }));

      // ---- Fill pass for this question ----
      if (questionGradedStudents.length > 0 && isBatchRunning) {
        logBatch(`Filling ${qLabel} scores for ${questionGradedStudents.length} students...`);
        await BatchGrader.navigateToFirstStudent(tab.id, navConfig);
        let currentPos = 0;

        for (let si = 0; si < questionGradedStudents.length; si++) {
          if (!isBatchRunning) break;

          const result = questionGradedStudents[si];

          // Navigate to correct student position
          while (currentPos < result.studentIndex) {
            await BatchGrader.navigateToNextStudent(tab.id, navConfig);
            currentPos++;
          }

          try {
            await BatchGrader.fillSingleQuestion(tab.id, question.qId, result.score, result.feedback);
            logBatch(`Filled ${qLabel} ${result.name}: ${result.score}/${question.maxPts}`, 'green');
          } catch (err) {
            logBatch(`Error filling ${qLabel} ${result.name}: ${err.message}`, 'red');
          }

          // Navigate to next student (unless last)
          if (si < questionGradedStudents.length - 1) {
            await BatchGrader.navigateToNextStudent(tab.id, navConfig);
            currentPos++;
          }
        }

        logBatch(`${qLabel} fill complete.`, 'green');
      }

    } catch (err) {
      activity.stop();
      logBatch(`Error grading ${qLabel}: ${err.message}`, 'red');
    }

    // Update overall progress
    const overallPct = Math.round(((qi + 1) / selectedQuestions.length) * 80);
    progressBar.style.width = `${overallPct}%`;
    progressPercent.innerText = `${overallPct}%`;
    progressText.innerText = `${qi + 1}/${selectedQuestions.length} questions`;
  }

  // ---- Final summary pass ----
  if (isBatchRunning && Object.keys(allQuestionResults).length > 0) {
    logBatch('--- Final summary pass ---');
    await BatchGrader.navigateToFirstStudent(tab.id, navConfig);
    let currentPos = 0;
    let summaryCount = 0;

    for (const student of toGrade) {
      if (!isBatchRunning) break;

      // Navigate to correct position
      while (currentPos < student.index) {
        await BatchGrader.navigateToNextStudent(tab.id, navConfig);
        currentPos++;
      }

      // Collect per-question results for this student
      const studentQResults = [];
      let totalScore = 0;
      let totalMax = 0;
      for (const question of selectedQuestions) {
        const qResults = allQuestionResults[question.qId] || [];
        const result = qResults.find(r => r.studentIndex === student.index);
        if (result) {
          studentQResults.push({
            qId: question.qId,
            questionText: question.questionText,
            maxPts: question.maxPts,
            score: result.score,
            comment: result.feedback,
          });
          totalScore += result.score;
          totalMax += question.maxPts;
        }
      }

      if (studentQResults.length === 0) {
        if (currentPos < allStudents.length - 1) {
          await BatchGrader.navigateToNextStudent(tab.id, navConfig);
          currentPos++;
        }
        continue;
      }

      // Generate summary
      try {
        const summary = await generateStudentSummary(student.name, studentQResults, totalScore, totalMax);

        // Fill TinyMCE comment and submit
        await BatchGrader.fillGradeSequential(tab.id, totalScore, summary, sel, fbConfig, navConfig);
        summaryCount++;
        logBatch(`Summary: ${student.name} (${totalScore}/${totalMax})`, 'green');
      } catch (err) {
        logBatch(`Summary error for ${student.name}: ${err.message}`, 'red');
      }

      // Navigate to next (unless last)
      if (currentPos < allStudents.length - 1) {
        await BatchGrader.navigateToNextStudent(tab.id, navConfig);
        currentPos++;
      }
    }

    logBatch(`Summary pass complete: ${summaryCount} students.`, 'green');
    progressBar.style.width = '100%';
    progressPercent.innerText = '100%';
  }

  logBatch('Multi-question grading complete!', 'green');
}

/**
 * Fallback: grade students 1:1 via BatchGrader when the server is not available.
 * Uses the original fast loop through proxyFetch (background.js CORS proxy).
 */
async function fallbackDirectGrading() {
  if (isBatchRunning) return;

  // Resolve model from UI
  let model = '';
  const modelEl = document.getElementById('modelName');
  if (modelEl) {
    const domVal = modelEl.value;
    if (domVal && domVal !== 'Loading...' && domVal !== 'No models found' && domVal !== 'Error loading models') {
      model = domVal;
    }
  }
  if (!model && modelEl && modelEl.dataset.lastSelected) {
    model = modelEl.dataset.lastSelected;
  }
  if (!model) {
    logBatch("No model selected. Please select a model from the dropdown, then retry.", "red");
    return;
  }

  // UI State
  isBatchRunning = true;
  document.getElementById('btnStartBatch').style.display = 'none';
  document.getElementById('btnStopBatch').style.display = 'block';
  document.getElementById('batchProgress').style.display = 'block';
  document.getElementById('batchResults').style.display = 'block';
  document.getElementById('batchResults').textContent = '';

  const progressBar = document.getElementById('batchProgressBar');
  const progressText = document.getElementById('batchProgressText');
  const progressPercent = document.getElementById('batchProgressPercent');

  progressBar.style.width = '0%';
  progressText.innerText = 'Initializing (fallback mode)...';

  try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const pageUrl = tab.url;
      const customInstructions = document.getElementById('customInstructions').value;
      const resumeAfter = document.getElementById('resumeStudent').value;

      logBatch(`Fallback mode: grading 1:1 with ${getProviderDisplayName(currentProviderId)} / ${model}...`);

      // BatchGrader.batchGrade handles extraction, grading, filling, and saving
      // onProgress signature: (completedCount, totalCount, studentName, score, feedback)
      await BatchGrader.batchGrade(tab.id, currentProviderId, model, {
          pageUrl,
          customInstructions,
          resumeAfter: resumeAfter || null,
          profile: window._activeBatchProfile || null,
          onProgress: (completed, total, name, score) => {
              const pct = Math.round((completed / total) * 100);
              progressBar.style.width = `${pct}%`;
              progressText.innerText = `${completed}/${total}`;
              progressPercent.innerText = `${pct}%`;
              logBatch(`\u2713 ${name}: ${score}`, "green");
          },
          onError: (name, err) => {
              logBatch(`Error grading ${name}: ${err.message || err}`, "red");
          },
          onSave: (count) => {
              logBatch(`Saved (${count} graded so far)`);
          },
      });

      logBatch("Batch grading complete! (fallback mode)", "green");

  } catch (e) {
      logBatch(`Fatal Error: ${e.message}`, "red");
  } finally {
      stopBatchGrading();
  }
}

function stopBatchGrading() {
  isBatchRunning = false;

  // Stop the activity timer if running
  if (_batchActivityHandle) {
    _batchActivityHandle.stop();
    _batchActivityHandle = null;
  }

  // Cancel rubric review if it's waiting for user input
  window.dispatchEvent(new Event('rubricReviewCancel'));

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

    // Forward to desktop server logs (fire-and-forget)
    forwardLogToServer(msg);
}

/** Forward a log message to the grading server so it appears in the Logs page */
function forwardLogToServer(message) {
    if (!serverConnected || !handshakeToken) return;
    fetch('http://localhost:3456/api/log', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${handshakeToken}`,
        },
        body: JSON.stringify({ message }),
    }).catch(() => {}); // silently ignore errors
}

/** Show a pulsing activity indicator with elapsed timer. Returns a handle to stop it. */
function showBatchActivity(studentName) {
    const div = document.getElementById('batchResults');
    // Remove any existing activity indicator
    const old = div.querySelector('.batch-activity');
    if (old) old.remove();

    const row = document.createElement('div');
    row.className = 'batch-activity';

    // Build dots using DOM
    const dots = document.createElement('span');
    dots.className = 'spinner-dots';
    for (let d = 0; d < 3; d++) dots.appendChild(document.createElement('span'));
    row.appendChild(dots);

    const textEl = document.createElement('span');
    textEl.className = 'activity-text';
    textEl.textContent = 'Grading ' + studentName + '...';
    row.appendChild(textEl);

    const elapsedEl = document.createElement('span');
    elapsedEl.className = 'elapsed';
    row.appendChild(elapsedEl);

    div.appendChild(row);
    div.scrollTop = div.scrollHeight;

    const start = Date.now();
    const timer = setInterval(() => {
        const secs = Math.floor((Date.now() - start) / 1000);
        elapsedEl.textContent = secs + 's';
    }, 1000);

    return {
        stop() {
            clearInterval(timer);
            row.remove();
        },
        updateText(text) {
            textEl.textContent = text;
        }
    };
}

// ===========================================================================
// Page Discovery Flow
// ===========================================================================

// State for the discovery wizard
let _discoveryDraft = null;      // Draft profile from AI
let _discoveryPickerTarget = null; // Which selector field is being picked
let _discoveryOriginalScore = '';  // Original score before test fill

// Labels for selector fields (displayed to user)
const SELECTOR_LABELS = {
  studentSection: 'Students',
  studentName: 'Name',
  scoreInput: 'Score',
  feedbackBox: 'Feedback',
  feedbackHidden: 'Hidden Input',
  questionRegion: 'Question',
  fullCreditLink: 'Full Credit',
};

// Required selectors (discovery fails without these)
const REQUIRED_SELECTORS = ['studentSection', 'studentName', 'scoreInput', 'feedbackBox'];

/**
 * Start the page discovery flow.
 * Captures screenshot + DOM snapshot, sends to AI, displays results.
 */
async function startDiscovery() {
  const wizard = document.getElementById('discoveryWizard');
  const statusEl = document.getElementById('discoveryStatus');
  const selectorsDiv = document.getElementById('discoveredSelectors');
  const testSection = document.getElementById('testFillSection');
  const saveSection = document.getElementById('saveProfileSection');

  // Show wizard, hide test/save sections
  wizard.style.display = '';
  selectorsDiv.style.display = 'none';
  testSection.style.display = 'none';
  saveSection.style.display = 'none';
  statusEl.textContent = 'Capturing page screenshot and DOM structure...';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) {
      statusEl.textContent = 'No active tab found.';
      return;
    }

    statusEl.textContent = 'Sending page to AI for analysis...';

    // AI call function — uses the currently selected provider
    const aiCallFn = async (systemPrompt, userPrompt, screenshotDataUrl) => {
      const providerId = getActiveProvider();
      const provider = PROVIDERS[providerId];
      if (!provider) throw new Error('No AI provider selected. Configure one in Settings.');

      const config = await getProviderConfigFromStorage(providerId);
      const model = document.getElementById('modelName')?.value;
      if (!model) throw new Error('No model selected. Choose a model in Settings.');
      config.model = model;

      // Build messages with vision support
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt, images: [screenshotDataUrl] },
      ];

      const request = provider.buildChatRequest(config, messages, { stream: false });

      const response = await proxyFetch(request.url, {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify(request.body),
      });

      if (!response.ok) {
        throw new Error(`AI API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // Parse response (handle Ollama + OpenAI formats)
      if (data.message?.content) return data.message.content;
      if (data.choices?.[0]?.message?.content) return data.choices[0].message.content;
      throw new Error('Unexpected AI response format');
    };

    // Run discovery
    const { draft, validation } = await Discover.discoverSelectors(tab.id, tab.url, aiCallFn);
    _discoveryDraft = draft;

    statusEl.textContent = draft.confidence === 'high'
      ? 'Analysis complete — high confidence'
      : draft.confidence === 'medium'
        ? 'Analysis complete — review selectors below'
        : 'Analysis complete — low confidence, manual correction likely needed';

    if (draft.notes) {
      statusEl.textContent += '. ' + draft.notes;
    }

    // Render selector rows
    renderDiscoveredSelectors(draft.selectors, validation);
    selectorsDiv.style.display = '';

    // Show test fill + save sections if required selectors are valid
    const allRequired = REQUIRED_SELECTORS.every(k =>
      validation[k] && validation[k].valid
    );
    if (allRequired) {
      testSection.style.display = '';
      saveSection.style.display = '';
      // Pre-fill profile name from hostname
      const hostname = new URL(tab.url).hostname.replace('www.', '');
      document.getElementById('profileName').value = hostname;
    } else {
      testSection.style.display = 'none';
      saveSection.style.display = 'none';
    }

  } catch (err) {
    console.error('[Discovery] Error:', err);
    statusEl.textContent = 'Discovery failed: ' + err.message;
  }
}

/**
 * Render the discovered selectors as rows in the wizard.
 */
function renderDiscoveredSelectors(selectors, validation) {
  const container = document.getElementById('discoveredSelectors');
  container.textContent = ''; // clear safely

  for (const [key, label] of Object.entries(SELECTOR_LABELS)) {
    const cssSelector = selectors[key];
    const v = validation[key] || {};
    const isRequired = REQUIRED_SELECTORS.includes(key);

    const row = document.createElement('div');
    row.className = 'selector-row';
    row.dataset.selectorKey = key;

    // Label
    const labelEl = document.createElement('span');
    labelEl.className = 'selector-label';
    labelEl.textContent = label + (isRequired ? '*' : '');
    row.appendChild(labelEl);

    // Selector value
    const valueEl = document.createElement('span');
    valueEl.className = 'selector-value';
    valueEl.textContent = cssSelector || '(not found)';
    valueEl.title = cssSelector || '';
    row.appendChild(valueEl);

    // Status (match count)
    const statusEl = document.createElement('span');
    statusEl.className = 'selector-status';
    if (!cssSelector || v.skipped) {
      statusEl.textContent = '—';
    } else if (v.valid) {
      statusEl.className += ' ok';
      statusEl.textContent = v.matchCount + (v.matchCount === 1 ? ' hit' : ' hits');
    } else {
      statusEl.className += ' fail';
      statusEl.textContent = v.error ? 'err' : '0 hits';
    }
    row.appendChild(statusEl);

    // Change button
    const changeBtn = document.createElement('button');
    changeBtn.className = 'btn-change';
    changeBtn.textContent = 'Pick';
    changeBtn.title = 'Click an element on the page to use its selector';
    changeBtn.addEventListener('click', () => startElementPicker(key));
    row.appendChild(changeBtn);

    container.appendChild(row);
  }
}

/**
 * Start element picker mode for a specific selector field.
 * Injects element-picker.js into the page.
 */
async function startElementPicker(targetField) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    _discoveryPickerTarget = targetField;

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['element-picker.js'],
    });

    // Update the status to let user know they should click on the page
    const statusEl = document.getElementById('discoveryStatus');
    statusEl.textContent = `Click the ${SELECTOR_LABELS[targetField] || targetField} element on the page...`;
  } catch (err) {
    console.error('[ElementPicker] Error injecting:', err);
    _discoveryPickerTarget = null;
  }
}

/**
 * Handle the element picked from the page.
 * Updates the draft profile and re-validates.
 */
async function handleElementPicked(request) {
  const targetField = _discoveryPickerTarget;
  _discoveryPickerTarget = null;

  if (!targetField || !_discoveryDraft) return;

  // Update the draft selectors
  _discoveryDraft.selectors[targetField] = request.selector;

  // Re-validate all selectors
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    const validation = await Discover.validateSelectors(tab.id, _discoveryDraft.selectors);
    renderDiscoveredSelectors(_discoveryDraft.selectors, validation);

    // Update status
    const statusEl = document.getElementById('discoveryStatus');
    statusEl.textContent = `Updated ${SELECTOR_LABELS[targetField]}: "${request.selector}" (${request.matchCount} matches)`;

    // Show test/save if required selectors are now valid
    const allRequired = REQUIRED_SELECTORS.every(k =>
      validation[k] && validation[k].valid
    );
    document.getElementById('testFillSection').style.display = allRequired ? '' : 'none';
    document.getElementById('saveProfileSection').style.display = allRequired ? '' : 'none';
  } catch (err) {
    console.error('[ElementPicker] Validation error:', err);
  }
}

/**
 * Test fill one student with the draft profile to verify selectors work.
 */
async function testFillStudent() {
  if (!_discoveryDraft) return;

  const resultEl = document.getElementById('testFillResult');
  resultEl.style.display = '';
  resultEl.textContent = 'Testing...';
  resultEl.className = 'mt-small';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    const fbConfig = _discoveryDraft.feedback || { type: 'textarea', requiresHiddenSync: false, htmlWrap: false };
    const result = await Discover.testFill(tab.id, _discoveryDraft.selectors, fbConfig);

    if (result.success) {
      resultEl.textContent = `Test fill successful on ${result.studentName}. Check the page — score should be "7" with test feedback.`;
      resultEl.classList.add('text-success');
    } else {
      resultEl.textContent = `Test fill failed: ${result.error}`;
      resultEl.classList.add('text-error');
    }
  } catch (err) {
    resultEl.textContent = `Error: ${err.message}`;
    resultEl.classList.add('text-error');
  }
}

/**
 * Save the discovered profile.
 */
async function saveDiscoveredProfile() {
  if (!_discoveryDraft) return;

  const nameInput = document.getElementById('profileName');
  const name = nameInput?.value.trim();
  if (!name) {
    nameInput?.focus();
    return;
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const pageUrl = tab?.url || '';

    const profile = SiteProfiles.createProfile(
      name,
      pageUrl,
      _discoveryDraft.selectors,
      _discoveryDraft.feedback,
      _discoveryDraft.save
    );

    await SiteProfiles.saveProfile(profile);

    // Clear discovery state
    _discoveryDraft = null;
    document.getElementById('discoveryWizard').style.display = 'none';

    // Refresh page status (should now detect the new profile)
    await checkBatchPageStatus();

    console.log(`[Discovery] Profile saved: ${name}`);
  } catch (err) {
    console.error('[Discovery] Save error:', err);
    const statusEl = document.getElementById('discoveryStatus');
    statusEl.textContent = 'Failed to save profile: ' + err.message;
  }
}

/**
 * Cancel discovery and hide the wizard.
 */
function cancelDiscovery() {
  _discoveryDraft = null;
  _discoveryPickerTarget = null;
  document.getElementById('discoveryWizard').style.display = 'none';
}

/**
 * Get provider config from chrome.storage.local for a given provider ID.
 */
async function getProviderConfigFromStorage(providerId) {
  const provider = PROVIDERS[providerId];
  if (!provider) return {};

  const providerMeta = provider.getConfig();
  const keys = providerMeta.fields.map(f => f.key);
  const defaults = {};
  for (const f of providerMeta.fields) {
    if (f.default) defaults[f.key] = f.default;
  }

  try {
    const stored = await chrome.storage.local.get(keys);
    return { ...defaults, ...stored };
  } catch {
    return defaults;
  }
}

// --- Wire up discovery buttons ---
document.getElementById('btnDiscoverPage')?.addEventListener('click', startDiscovery);
document.getElementById('btnTestFill')?.addEventListener('click', testFillStudent);
document.getElementById('btnSaveProfile')?.addEventListener('click', saveDiscoveredProfile);
document.getElementById('btnCancelDiscovery')?.addEventListener('click', cancelDiscovery);

// Profile dropdown change → re-check page status
document.getElementById('profileSelect')?.addEventListener('change', () => {
  checkBatchPageStatus();
});

