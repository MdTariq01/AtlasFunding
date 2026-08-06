import { api, isLoggedIn } from "../api.js";
import { navigate, showToast } from "../main.js";

let chatHistory = [];

export async function renderAdvisor(el) {
  if (!isLoggedIn()) { navigate("/auth?next=advisor"); return; }

  chatHistory = [];

  el.innerHTML = `
    <div class="page" style="display: flex; flex-direction: column; height: 100vh; padding-top: 72px;">
      
      <!-- Header -->
      <div style="flex-shrink: 0; border-bottom: 1px solid var(--border-light); background: var(--bg-card); padding: 20px 0;">
        <div class="container" style="max-width: 800px;">
          <div class="flex-between">
            <div>
              <h1 style="font-size: 1.75rem; font-weight: 800; color: var(--text-main); margin-bottom: 4px;">Funding Advisor</h1>
              <p style="font-size: 0.9rem; color: var(--text-secondary);">Strategic scholarship counsel, on demand.</p>
            </div>
            <div class="badge" style="cursor: default;">
              <div class="badge-dot"></div>
              Maester Atlas, Keeper of Scholarships
            </div>
          </div>
        </div>
      </div>

      <!-- Messages -->
      <div id="chat-window" style="flex: 1; overflow-y: auto; padding: 28px 24px; background: var(--bg-main);">
        <div class="container" style="max-width: 800px; display: flex; flex-direction: column; gap: 18px;" id="chat-messages">

          <!-- Suggestion chips -->
          <div id="prompt-chips" style="display: flex; flex-wrap: wrap; gap: 8px; padding-bottom: 4px;">
            ${[
              "Which scholarships should I apply to first?",
              "What are my urgent deadlines?",
              "What documents do I need?",
              "Give me a month-by-month plan",
              "Are there fully funded options for me?",
            ].map(p => `<button class="filter-chip prompt-chip" style="font-size: 0.8rem; cursor:pointer;">${p}</button>`).join("")}
          </div>

          <!-- Atlas greeting -->
          <div class="chat-bubble-wrap agent-wrap">
            <div class="chat-avatar agent-avatar">M</div>
            <div class="chat-bubble agent-bubble">
              I am <strong>Maester Atlas</strong>, keeper of scholarships and purveyor of funding wisdom. 📜<br><br>
              I have full context of your eligibility profile, your matched scholarships, and upcoming deadlines. Ask me anything — or pick a suggestion above.
            </div>
          </div>

        </div>
      </div>

      <!-- Input -->
      <div style="flex-shrink: 0; background: white; border-top: 1px solid var(--border-light); padding: 16px 24px;">
        <div class="container" style="max-width: 800px;">
          <form id="chat-form" style="display: flex; gap: 12px; align-items: center;">
            <input type="text" id="chat-input" class="input"
              placeholder="Ask the Maester anything..."
              style="flex: 1; margin-bottom: 0;"
              autocomplete="off" />
            <button type="submit" class="btn btn-primary" id="chat-btn" style="white-space: nowrap; height: 44px; padding: 0 24px;">
              Send →
            </button>
          </form>
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 8px; display: flex; gap: 16px;">
            <span>Groq Llama 3.1 · multi-turn conversation</span>
            <button id="clear-chat" style="background:none;border:none;color:var(--text-muted);font-size:0.75rem;cursor:pointer;padding:0;text-decoration:underline;">Clear chat</button>
          </div>
        </div>
      </div>
    </div>

    <style>
      .chat-bubble-wrap { display: flex; gap: 12px; align-items: flex-start; }
      .agent-wrap { }
      .user-wrap { flex-direction: row-reverse; }
      .chat-avatar {
        width: 34px; height: 34px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-weight: 800; font-size: 0.85rem; flex-shrink: 0; margin-top: 2px;
      }
      .agent-avatar { background: var(--primary); color: white; }
      .user-avatar  { background: var(--bg-section); border: 1px solid var(--border-strong); color: var(--text-main); font-weight: 700; }
      .chat-bubble {
        padding: 14px 18px; border-radius: 10px; font-size: 0.93rem;
        line-height: 1.75; max-width: 86%;
      }
      .agent-bubble {
        background: white; border: 1px solid var(--border-light);
        border-top-left-radius: 2px; color: var(--text-main);
      }
      .user-bubble {
        background: var(--primary); color: white;
        border-top-right-radius: 2px;
      }
      .error-bubble { border-color: var(--danger) !important; color: var(--danger) !important; }
      .chat-bubble p { margin: 0; }
      .chat-bubble p + p { margin-top: 10px; }
      .chat-bubble ul, .chat-bubble ol { padding-left: 20px; margin: 6px 0; }
      .chat-bubble li { margin-bottom: 4px; }
      .thinking-dots::after {
        content: '...';
        animation: dots 1.2s steps(3, end) infinite;
      }
      @keyframes dots {
        0%   { content: '.'; }
        33%  { content: '..'; }
        66%  { content: '...'; }
        100% { content: ''; }
      }
    </style>
  `;

  document.getElementById("prompt-chips")?.addEventListener("click", (e) => {
    const chip = e.target.closest(".prompt-chip");
    if (!chip) return;
    document.getElementById("chat-input").value = chip.textContent.trim();
    document.getElementById("chat-form").dispatchEvent(new Event("submit"));
  });

  document.getElementById("clear-chat")?.addEventListener("click", () => {
    chatHistory = [];
    const msgs = document.getElementById("chat-messages");
    msgs.querySelectorAll(".chat-bubble-wrap").forEach(b => b.remove());
    showToast("Conversation cleared", "success");
  });

  document.getElementById("chat-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("chat-input");
    const query = input.value.trim();
    if (!query) return;

    document.getElementById("prompt-chips")?.remove();

    input.value = "";
    input.disabled = true;

    addBubble(query, "user");

    const btn = document.getElementById("chat-btn");
    btn.disabled = true;
    btn.textContent = "...";
    const thinking = addThinking();

    try {
      const data = await api.advisor.ask(query, chatHistory);
      thinking.remove();

      let replyText = "";
      if (typeof data.reply === "string") {
        replyText = data.reply;
      } else if (typeof data.reply === "object" && data.reply !== null) {
        replyText = JSON.stringify(data.reply);
      } else if (data.advice) {
        replyText = typeof data.advice === "string" ? data.advice : JSON.stringify(data.advice);
      } else {
        replyText = "Here are your scholarship details. Complete the eligibility calculator for personalised recommendations!";
      }

      chatHistory.push({ role: "user", content: query });
      chatHistory.push({ role: "assistant", content: replyText });
      if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);

      addBubble(replyText, "agent");
    } catch (err) {
      thinking.remove();
      addBubble(`Sorry, something went wrong: ${err.message}`, "agent", true);
    } finally {
      btn.disabled = false;
      btn.textContent = "Send →";
      input.disabled = false;
      input.focus();
    }
  });
}

function addBubble(text, role, isError = false) {
  const container = document.getElementById("chat-messages");
  const wrap = document.createElement("div");
  wrap.className = `chat-bubble-wrap ${role === "user" ? "user-wrap" : "agent-wrap"}`;

  const avatar = document.createElement("div");
  avatar.className = `chat-avatar ${role === "user" ? "user-avatar" : "agent-avatar"}`;
  avatar.textContent = role === "user" ? "U" : "M";

  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${role === "user" ? "user-bubble" : "agent-bubble"} ${isError ? "error-bubble" : ""}`;
  bubble.innerHTML = role === "user" ? escapeHTML(text) : renderMarkdown(text);

  wrap.appendChild(avatar);
  wrap.appendChild(bubble);
  container.appendChild(wrap);
  scrollToBottom();
  return wrap;
}

function addThinking() {
  const container = document.getElementById("chat-messages");
  const wrap = document.createElement("div");
  wrap.className = "chat-bubble-wrap agent-wrap";
  wrap.innerHTML = `
    <div class="chat-avatar agent-avatar">M</div>
    <div class="chat-bubble agent-bubble" style="color: var(--text-muted); font-style: italic;">
      Consulting the scrolls<span class="thinking-dots"></span>
    </div>
  `;
  container.appendChild(wrap);
  scrollToBottom();
  return wrap;
}

function scrollToBottom() {
  const w = document.getElementById("chat-window");
  if (w) w.scrollTo({ top: w.scrollHeight, behavior: "smooth" });
}

function escapeHTML(str) {
  return String(str || "").replace(/[&<>'"]/g, t =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[t])
  );
}

function renderMarkdown(raw) {
  let s = String(raw || "");

  const paras = s.split(/\n{2,}/);
  return paras.map(para => {
    if (/^[-*] /m.test(para)) {
      const items = para.split("\n")
        .filter(l => l.trim())
        .map(l => {
          const content = l.replace(/^[-*] /, "");
          return `<li>${inlineMarkdown(content)}</li>`;
        }).join("");
      return `<ul>${items}</ul>`;
    }
    if (/^\d+\. /m.test(para)) {
      const items = para.split("\n")
        .filter(l => l.trim())
        .map(l => {
          const content = l.replace(/^\d+\. /, "");
          return `<li>${inlineMarkdown(content)}</li>`;
        }).join("");
      return `<ol>${items}</ol>`;
    }
    return `<p>${para.split("\n").map(inlineMarkdown).join("<br>")}</p>`;
  }).join("");
}

function inlineMarkdown(text) {
  let s = escapeHTML(text);
  s = s.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*(.*?)\*/g, "<em>$1</em>");
  s = s.replace(/`([^`]+)`/g, '<code style="background:var(--bg-section);padding:1px 5px;border-radius:3px;font-size:0.9em;">$1</code>');
  return s;
}
