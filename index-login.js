// Wait for Supabase to be available
let client = null;

function initSupabase() {
  if (!window.supabase) {
    console.error('❌ Supabase library not loaded');
    return false;
  }
  client = window.supabase.createClient(
    "https://mkrnksthkovbolgvggvh.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rcm5rc3Roa292Ym9sZ3ZnZ3ZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1MzE5MDYsImV4cCI6MjA5ODEwNzkwNn0.oSz-xPYOV0Fwzottm62pnqBgySAH6ozFavZLyUua_Is",
    {
      auth: {
        storage: window.localStorage,
        persistSession: true,
        detectSessionInUrl: true,
        autoRefreshToken: true
      }
    }
  );
  console.log('✅ Supabase initialized');
  return true;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSupabase);
} else {
  initSupabase();
}

function showForgot() {
  document.getElementById("login_form").style.display = "none";
  document.getElementById("forgot_form").style.display = "block";
}

function showLogin() {
  document.getElementById("forgot_form").style.display = "none";
  document.getElementById("login_form").style.display = "block";
}

window.login = async function() {
  if (!client) {
    alert("❌ System initializing. Please wait a moment and try again.");
    return;
  }

  const msg = document.getElementById("msg");
  msg.innerText = "Signing in...";
  msg.className = "msg info";

  const email    = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  if (!email || !password) {
    msg.innerText = "Please enter your email and password.";
    msg.className = "msg error";
    return;
  }

  const { error } = await client.auth.signInWithPassword({ email, password });

  if (error) {
    msg.innerText = error.message;
    msg.className = "msg error";
    return;
  }

  // Check if there's a redirect parameter (from customer page login redirect)
  const urlParams = new URLSearchParams(window.location.search);
  const redirectUrl = urlParams.get('redirect') || "https://portal.membership.rundispatcher.com/portal-dashboard";
  
  console.log('Login successful, redirecting to:', redirectUrl);
  window.location.href = redirectUrl;
}

window.sendReset = async function() {
  if (!client) {
    alert("❌ System initializing. Please wait a moment and try again.");
    return;
  }

  const msg = document.getElementById("reset_msg");
  const email = document.getElementById("reset_email").value.trim();

  if (!email) {
    msg.innerText = "Please enter your email.";
    msg.className = "msg error";
    return;
  }

  msg.innerText = "Sending reset link...";
  msg.className = "msg info";

  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: "https://portal.membership.rundispatcher.com/reset-password"
  });

  if (error) {
    msg.innerText = error.message;
    msg.className = "msg error";
    return;
  }

  msg.innerText = "Reset link sent! Check your email.";
  msg.className = "msg success";
}