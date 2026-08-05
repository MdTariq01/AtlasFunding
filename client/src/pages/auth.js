import { api, setAuth } from "../api.js";
import { navigate, showToast, getParams } from "../main.js";

export async function renderAuth(el) {
  const params = getParams();
  const nextRoute = params.next ? `/${params.next}` : "/calculator";

  el.innerHTML = `
    <div class="page flex" style="align-items: center; justify-content: center; min-height: 100vh;">
      <div style="width: 100%; max-width: 440px; padding: 24px;">

        <div class="text-center mb-48">
          <div style="font-size: 2.5rem; margin-bottom: 16px;">🎓</div>
          <h2 class="heading-editorial" style="font-size: 2.5rem; margin-bottom: 12px;">Welcome to AtlasFunding</h2>
          <p style="font-size: 1.1rem; max-width: 300px; margin: 0 auto;">Create a free account to find and track your scholarships.</p>
        </div>

        <div class="card" style="border-radius: 12px;">
          <div class="flex mb-24" style="border-bottom: 1px solid var(--border-light);">
            <div class="nav-link tab-btn" style="flex: 1; text-align: center; border-radius: 0; padding: 12px; cursor: pointer;" data-tab="login" id="tab-login">Login</div>
            <div class="nav-link tab-btn active" style="flex: 1; text-align: center; border-radius: 0; padding: 12px; cursor: pointer; border-bottom: 2px solid var(--primary); color: var(--primary);" data-tab="register" id="tab-register">Create Account</div>
          </div>

          <!-- Login Form -->
          <form id="login-form" class="hidden">
            <div class="input-group">
              <label class="input-label">Email</label>
              <input class="input" type="email" id="login-email" placeholder="you@example.com" required />
            </div>
            <div class="input-group mb-24">
              <label class="input-label">Password</label>
              <input class="input" type="password" id="login-password" placeholder="Min. 6 characters" required />
            </div>
            <button class="btn btn-primary" style="width: 100%; padding: 14px;" type="submit" id="login-btn">
              Login &rarr;
            </button>
          </form>

          <!-- Register Form -->
          <form id="register-form">
            <div class="input-group">
              <label class="input-label">Email</label>
              <input class="input" type="email" id="reg-email" placeholder="you@example.com" required />
            </div>
            <div class="input-group mb-24">
              <label class="input-label">Password</label>
              <input class="input" type="password" id="reg-password" placeholder="Min. 6 characters" required />
            </div>
            <button class="btn btn-primary" style="width: 100%; padding: 14px;" type="submit" id="reg-btn">
              Create Account &rarr;
            </button>
          </form>

          <p class="text-center mt-16" style="font-size: 0.85rem; color: var(--text-muted);">
            100% free. No credit card required.
          </p>
        </div>

        <div class="text-center mt-24">
          <button class="btn btn-ghost btn-sm" onclick="history.back()">← Back</button>
        </div>
      </div>
    </div>
  `;

  const loginForm = document.getElementById("login-form");
  const regForm = document.getElementById("register-form");
  const tabLogin = document.getElementById("tab-login");
  const tabReg = document.getElementById("tab-register");

  tabLogin.addEventListener("click", () => {
    tabLogin.classList.add("active");
    tabLogin.style.borderBottom = "2px solid var(--primary)";
    tabLogin.style.color = "var(--primary)";
    
    tabReg.classList.remove("active");
    tabReg.style.borderBottom = "none";
    tabReg.style.color = "inherit";
    
    loginForm.classList.remove("hidden");
    regForm.classList.add("hidden");
  });

  tabReg.addEventListener("click", () => {
    tabReg.classList.add("active");
    tabReg.style.borderBottom = "2px solid var(--primary)";
    tabReg.style.color = "var(--primary)";
    
    tabLogin.classList.remove("active");
    tabLogin.style.borderBottom = "none";
    tabLogin.style.color = "inherit";
    
    regForm.classList.remove("hidden");
    loginForm.classList.add("hidden");
  });

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("login-btn");
    btn.disabled = true;
    btn.textContent = "Logging in...";
    try {
      const data = await api.auth.login(
        document.getElementById("login-email").value,
        document.getElementById("login-password").value
      );
      setAuth(data.token, data.user);
      showToast("Welcome back!", "success");
      navigate(nextRoute);
    } catch (err) {
      showToast(err.message, "error");
      btn.disabled = false;
      btn.textContent = "Login \u2192";
    }
  });

  regForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("reg-btn");
    btn.disabled = true;
    btn.textContent = "Creating account...";
    try {
      const data = await api.auth.register(
        document.getElementById("reg-email").value,
        document.getElementById("reg-password").value
      );
      setAuth(data.token, data.user);
      showToast("Account created!", "success");
      navigate(nextRoute);
    } catch (err) {
      showToast(err.message, "error");
      btn.disabled = false;
      btn.textContent = "Create Account \u2192";
    }
  });
}
