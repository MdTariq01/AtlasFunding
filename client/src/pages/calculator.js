import { api, isLoggedIn } from "../api.js";
import { navigate, showToast } from "../main.js";

let questions = [];
let currentQ = 1;
let answers = {};

export async function renderCalculator(el) {
  if (!isLoggedIn()) { navigate("/auth?next=calculator"); return; }

  el.innerHTML = `
    <div class="page">
      <div class="container section" style="max-width: 800px;">
        <div class="mb-32">
          <span style="font-size: 0.75rem; font-weight: 700; color: var(--primary); letter-spacing: 0.05em; text-transform: uppercase;">Eligibility Calculator</span>
          <h1 class="heading-editorial" style="font-size: 3rem; margin-top: 8px;">Fifteen questions. Every opportunity you qualify for.</h1>
          <p style="font-size: 1.1rem; color: var(--text-secondary); margin-top: 16px;">Atlas evaluates machine-readable eligibility rules against your answers, then scores each opportunity for eligibility, funding fit and acceptance probability.</p>
        </div>

        <div class="card" id="calc-card" style="box-shadow: 0 12px 32px rgba(0,0,0,0.06); padding: 0;">
          <div class="flex-between" style="padding: 16px 32px; border-bottom: 1px solid var(--border-light); font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;">
            <span id="q-label">QUESTION 1 OF 15</span>
            <span style="color: var(--primary);">Eligibility calculator</span>
          </div>
          
          <div style="padding: 32px;" id="question-area">
             <!-- Rendered dynamically -->
          </div>

          <div class="flex-between" id="nav-btns" style="padding: 24px 32px; background: #faf8f5; border-top: 1px solid var(--border-light); border-bottom-left-radius: 8px; border-bottom-right-radius: 8px; display:none!important;">
            <button class="btn btn-ghost" style="border: none;" id="btn-back">← Back</button>
            <button class="btn btn-primary" id="btn-next" disabled>Continue →</button>
          </div>
        </div>
      </div>
    </div>
  `;

  try {
    const data = await api.eligibility.questions();
    questions = data.questions;
    currentQ = 1;
    answers = {};
    await showQuestion(currentQ);
  } catch (err) {
    showToast("Failed to load questions: " + err.message, "error");
  }
}

async function showQuestion(num) {
  const q = questions.find((x) => x.q === num);
  if (!q) return;

  document.getElementById("q-label").textContent = `QUESTION ${num} OF 15`;

  const area = document.getElementById("question-area");
  area.innerHTML = `
    <h3 style="font-size: 1.75rem; font-weight: 800; color: var(--text-main); margin-bottom: 8px;">${q.text}</h3>
    <p style="font-size: 0.95rem; color: var(--text-muted); margin-bottom: 32px;">${q.description || ""}</p>
    <div id="options-area"></div>
  `;

  const optArea = document.getElementById("options-area");
  const navBtns = document.getElementById("nav-btns");
  const btnNext = document.getElementById("btn-next");
  const btnBack = document.getElementById("btn-back");
  navBtns.style.removeProperty("display");

  btnBack.style.visibility = num === 1 ? "hidden" : "visible";
  btnBack.onclick = () => { if (num > 1) showQuestion(num - 1); };
  btnNext.disabled = answers[num] === undefined;

  const styleOptionBtn = (btn, isSelected) => {
    btn.style.padding = "16px";
    btn.style.textAlign = "left";
    btn.style.background = isSelected ? "var(--bg-main)" : "white";
    btn.style.border = `1px solid ${isSelected ? "var(--primary)" : "var(--border-strong)"}`;
    btn.style.borderRadius = "6px";
    btn.style.cursor = "pointer";
    btn.style.fontSize = "0.95rem";
    btn.style.color = "var(--text-main)";
    btn.style.transition = "0.2s";
  };

  if (q.type === "single_select" || q.type === "multi_select") {
    optArea.innerHTML = `<div class="grid-2">
      ${q.options.map((opt, i) => `
        <button class="option-btn" data-value='${JSON.stringify(opt.value)}' data-index="${i}">
          ${opt.label}
        </button>
      `).join("")}
    </div>`;

    optArea.querySelectorAll(".option-btn").forEach((btn) => {
      const val = JSON.parse(btn.dataset.value);
      
      if (q.type === "single_select") {
        const isSelected = answers[num] === val;
        styleOptionBtn(btn, isSelected);
        
        btn.addEventListener("click", () => {
          answers[num] = val;
          if (q.q === 7) answers["disability_type"] = btn.innerText.trim();
          optArea.querySelectorAll(".option-btn").forEach((b) => styleOptionBtn(b, false));
          styleOptionBtn(btn, true);
          btnNext.disabled = false;
        });
      } else {
        answers[num] = answers[num] || [];
        const isSelected = answers[num].includes(val);
        styleOptionBtn(btn, isSelected);

        btn.addEventListener("click", () => {
          const idx = answers[num].indexOf(val);
          if (idx > -1) { 
            answers[num].splice(idx, 1); 
            styleOptionBtn(btn, false);
          } else { 
            answers[num].push(val); 
            styleOptionBtn(btn, true);
          }
          btnNext.disabled = answers[num].length === 0;
        });
      }
    });
  } else if (q.type === "number") {
    optArea.innerHTML = `
      <div class="input-group">
        <input class="input" id="num-input" type="number"
               min="${q.min ?? 0}" max="${q.max ?? 999}" step="0.5"
               placeholder="${q.unit}"
               value="${answers[num] !== undefined ? answers[num] : ""}"
               style="font-size: 1.5rem; padding: 24px;" />
      </div>
    `;
    if (answers[num] !== undefined) btnNext.disabled = false;
    const numInput = document.getElementById("num-input");
    numInput.addEventListener("input", () => {
      const v = parseFloat(numInput.value);
      if (!isNaN(v)) { answers[num] = v; btnNext.disabled = false; }
      else { btnNext.disabled = true; }
    });
    numInput.addEventListener("keypress", (e) => { if (e.key === "Enter" && !btnNext.disabled) btnNext.click(); });
    numInput.focus();
  }

  btnNext.onclick = async () => {
    if (answers[num] === undefined) return;
    btnNext.disabled = true;
    btnNext.textContent = "Saving...";

    try {
      await api.eligibility.answer(num, answers[num], answers["disability_type"]);
      if (num < 15) {
        btnNext.textContent = "Continue →";
        await showQuestion(num + 1);
      } else {
        btnNext.textContent = "Calculating...";
        await runCalculation();
      }
    } catch (err) {
      showToast(err.message, "error");
      btnNext.disabled = false;
      btnNext.textContent = num < 15 ? "Continue →" : "See Results →";
    }
  };
}

async function runCalculation() {
  const card = document.getElementById("calc-card");
  card.innerHTML = `
    <div class="text-center" style="padding: 60px 32px;">
      <h3 style="font-size: 2rem; margin-bottom: 8px;">Calculating your matches...</h3>
      <p style="color: var(--text-muted);">Checking eligibility across the entire repository</p>
    </div>
  `;
  try {
    await api.eligibility.calculate();
    showToast("Matches calculated! 🎉", "success");
    navigate("/results");
  } catch (err) {
    showToast("Calculation failed: " + err.message, "error");
  }
}
