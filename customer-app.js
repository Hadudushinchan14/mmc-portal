// Initialize Supabase client only when library is ready
let client = null;

function initializeSupabase() {
  if (window.supabase) {
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
    console.log('✅ Supabase initialized on customer page');
    return true;
  } else {
    console.error('❌ Supabase library not loaded yet');
    return false;
  }
}

// Try to init immediately in case script loads after Supabase
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeSupabase);
} else {
  // Page already loaded
  if (!initializeSupabase()) {
    // If still not available, wait a bit
    setTimeout(initializeSupabase, 500);
  }
}

// allCustomers = the CURRENT PAGE only (max 30 rows). Search filters this.
// Counts are fetched separately from the full table and never depend on pagination.
let allCustomers = [];
let currentPage = 0;
const pageSize = 30;
let currentFilter = "all"; // "all" | "bronze" | "gold" | "steel"

// ---------- rendering ----------
// Single render function used everywhere (filters, pagination, search).
function renderCustomerList(list) {
  const container = document.getElementById("customer_list");

  if (!list.length) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>No Customers Found</h3>
        <p>There are no members in this category.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = list
    .map((customer) => {
      const status = (customer.status || "UNKNOWN").trim();
      const membershipId = customer.member_id || customer.id;
      return `
        <div class="customer-card">
          <div class="customer-card-top">
            <h3>${customer.full_name}</h3>
            <span class="status status-${status.toLowerCase()}">
              ${status}
            </span>
          </div>

          <p>${customer.email || ""}</p>
          <p>${customer.phone || ""}</p>

          <div class="membership-id" title="${membershipId}">
            <span class="membership-id-label">Member ID</span>
            <span class="membership-id-value">${membershipId}</span>
          </div>

          <div class="card-actions">
            <button class="text-btn"
              onclick="openTextModal('${customer.id}')">
              💬 Text Membership Card
            </button>
            <button class="review-btn"
              onclick="openReviewModal('${customer.id}')">
              ⭐ Request Review
            </button>
            <button class="view-btn"
              onclick="window.location.href='/customer-profile?id=${customer.id}'">
              👤 View Profile
            </button>
          </div>
        </div>
      `;
    })
    .join("");
}

// ---------- data fetching ----------

// Full-table counts. Independent of pagination and of the currently
// displayed page, so these always reflect the true totals in the DB.
async function fetchCounts(userId) {
  const { count: totalCount } = await client
    .from("customers")
    .select("*", { count: "exact", head: true })
    .eq("partner_id", userId);

  const { count: bronzeCount, error: bronzeErr } = await client
    .from("customers")
    .select("*", { count: "exact", head: true })
    .eq("partner_id", userId)
    .ilike("status", "BRONZE");

  const { count: goldCount, error: goldErr } = await client
    .from("customers")
    .select("*", { count: "exact", head: true })
    .eq("partner_id", userId)
    .ilike("status", "GOLD");

  const { count: steelCount, error: steelErr } = await client
    .from("customers")
    .select("*", { count: "exact", head: true })
    .eq("partner_id", userId)
    .ilike("status", "STEEL");

  if (bronzeErr) console.error("Bronze count error:", bronzeErr);
  if (goldErr) console.error("Gold count error:", goldErr);
  if (steelErr) console.error("Steel count error:", steelErr);

  document.getElementById("total_customers").textContent = totalCount || 0;
  document.getElementById("active_customers").textContent = bronzeCount || 0;
  document.getElementById("pending_customers").textContent = goldCount || 0;
  document.getElementById("steel_customers").textContent = steelCount || 0;
}

// Fetches ONE page (30 rows) of the currently selected filter, straight
// from the DB. This is what fixes "Gold/Steel show empty" — the filter
// is applied server-side across the whole table, not against whatever
// happened to already be loaded in memory.
async function fetchPage(userId) {
  let query = client
    .from("customers")
    .select("*")
    .eq("partner_id", userId)
    .order("created_at", { ascending: false })
    .range(currentPage * pageSize, (currentPage + 1) * pageSize - 1);

  if (currentFilter !== "all") {
    query = query.ilike("status", currentFilter);
  }

  const { data: customers, error } = await query;

  if (error) {
    console.error("List error:", error);
    return;
  }

  allCustomers = customers || [];
  renderCustomerList(allCustomers);
}

async function loadCustomers({ refreshCounts = false } = {}) {
  // Ensure client is initialized
  if (!client) {
    console.error('Client not initialized, retrying...');
    await new Promise(resolve => setTimeout(resolve, 500));
    if (!client) {
      console.error('Failed to initialize database connection');
      // Use absolute URL to prevent loop
      window.location.href = "https://mmc.rundispatcher.com/?redirect=/customer";
      return;
    }
  }

  // Give localStorage time to be ready and allow session to restore
  await new Promise(resolve => setTimeout(resolve, 200));

  try {
    // Try to restore session from localStorage
    const { data: { session }, error: sessionError } = await client.auth.getSession();
    
    console.log('Session check:', { session: !!session, sessionError });
    console.log('LocalStorage auth key:', localStorage.getItem('sb-mkrnksthkovbolgvggvh-auth-token') ? 'exists' : 'missing');

    const { data: { user } } = await client.auth.getUser();

    console.log('User check:', { user: user?.id || 'not found' });

    if (!user) {
      console.warn('No user found, redirecting to login with redirect param');
      // Use absolute URL and prevent redirect loop
      window.location.href = "https://mmc.rundispatcher.com/?redirect=/customer";
      return;
    }

    if (refreshCounts) {
      await fetchCounts(user.id);
    }

    await fetchPage(user.id);
  } catch (err) {
    console.error('Error in loadCustomers:', err);
    window.location.href = "https://mmc.rundispatcher.com/?redirect=/customer";
  }
}

// ---------- filters ----------
function setFilter(filter) {
  currentFilter = filter;
  currentPage = 0; // new filter = start from page 1 again

  document.querySelectorAll(".stat-card").forEach((card) =>
    card.classList.remove("active")
  );
  document.getElementById(`filter-${filter}`)?.classList.add("active");

  loadCustomers();
}

// ---------- Text Customer feature ----------

// Fallback template used only when the company hasn't saved one yet.
const DEFAULT_SMS_TEMPLATE = `Hi {{customer_name}}!

Thank you for being a valued customer of {{business_name}}.

Here's your membership card:

{{membership_url}}

- {{business_name}}
`;

// Fallback template for the Request Review message. Saved/loaded
// independently of the membership-card SMS template so each business
// can customize the two separately.
const DEFAULT_REVIEW_TEMPLATE = `Hi {{customer_name}}!

Thank you for choosing {{business_name}}.

Would you mind taking 30 seconds to leave us a Google review?

{{review_link}}

We truly appreciate your support!

- {{business_name}}
`;

// Config for each message type the shared modal/editor workflow supports.
// Adding a new "send a text" feature in future = add an entry here,
// no new modal/editor/send code required.
const MESSAGE_TYPES = {
  membership: {
    templateField: "sms_template",
    defaultTemplate: DEFAULT_SMS_TEMPLATE,
    modalTitle: "Send Text",
    editorTitle: "Edit SMS Template",
    requiresGoogleReviewUrl: false,
  },
  review: {
    templateField: "review_template",
    defaultTemplate: DEFAULT_REVIEW_TEMPLATE,
    modalTitle: "Request Review",
    editorTitle: "Edit Review Template",
    requiresGoogleReviewUrl: true,
  },
};

// Builds the "profiles" select string for a given message type — always
// business_name + that type's template column, plus google_maps_link
// only when the type actually needs it (review).
function selectFieldsFor(type) {
  const config = MESSAGE_TYPES[type];
  const fields = ["business_name", config.templateField];
  if (config.requiresGoogleReviewUrl) fields.push("google_maps_link");
  return fields.join(", ");
}

// Currently selected customer + message type for the open modal
// (used by Send/Open/Edit actions, and by Save to know which
// template column to write back to).
let activeTextCustomer = null;
let activeMessageType = "membership";

// Builds a membership URL from the customer's member id if one
// isn't already stored on the customer record.
function buildMembershipUrl(customer) {
  if (customer.membership_url) return customer.membership_url;
  const memberId = customer.member_id || customer.id;
  return `https://portal.membership.rundispatcher.com/membership?member_id=${memberId}`;
}

// Replaces all supported placeholders in a template string.
//
// FIX: previously used `template.replaceAll("{{customer_name}}", ...)`,
// which requires an exact literal match. If the template saved in
// Supabase had any deviation from that exact string — a stray space
// ("{{ customer_name }}"), different casing, or a non-breaking space
// introduced by pasting into a form field — replaceAll() would silently
// no-op and return the template unchanged, with no error thrown.
// That's what produced the bug: placeholders staying literally as
// "{{customer_name}}" in the modal even though the function "ran fine".
//
// Now uses a single regex pass that:
//   - tolerates any amount of whitespace inside the braces
//   - is case-insensitive on the key name
//   - leaves any unrecognized {{...}} token untouched instead of
//     silently dropping or mismatching it
function fillSmsTemplate(template, customer, businessName, extraValues = {}) {
  const values = {
    customer_name: customer.full_name || "",
    business_name: businessName || "",
    membership_url: buildMembershipUrl(customer),
    ...extraValues,
  };

  return template.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (match, key) => {
    const normalizedKey = key.toLowerCase();
    return Object.prototype.hasOwnProperty.call(values, normalizedKey)
      ? values[normalizedKey]
      : match; // leave unrecognized placeholders as-is
  });
}

// Opens the shared Send-message modal for a given customer + message type
// ("membership" or "review"), loading that type's saved template (or its
// default) and pre-filling it. This is the single workflow both
// "Text Membership Card" and "Request Review" run through.
async function openMessageModal(customerId, type) {
  const customer = allCustomers.find((c) => String(c.id) === String(customerId));
  if (!customer) return;

  const config = MESSAGE_TYPES[type];
  if (!config) return;

  const { data: { user } } = await client.auth.getUser();
  if (!user) {
    window.location = "/portal-login";
    return;
  }

  const { data: profile, error } = await client
    .from("profiles")
    .select(selectFieldsFor(type))
    .eq("user_id", user.id)
    .single();

  if (error) {
    console.error("Profile load error:", error);
  }

  // Google Review URL is a business-level setting (profiles.google_maps_link),
  // never stored per-customer. If it hasn't been set yet, don't crash —
  // let the business know where to add it and stop before opening the modal.
  if (
    config.requiresGoogleReviewUrl &&
    (!profile?.google_maps_link || profile.google_maps_link.trim() === "")
  ) {
    alert("Google Review Link Required. Before sending a review request, please add your Google Review link in Account Settings.");
    return;
  }

  activeTextCustomer = customer;
  activeMessageType = type;

  const businessName = profile?.business_name || "";
  const savedTemplate = profile?.[config.templateField];
  const template = (savedTemplate && savedTemplate.trim())
    ? savedTemplate
    : config.defaultTemplate;

  const extraValues = config.requiresGoogleReviewUrl
    ? { review_link: profile.google_maps_link }
    : {};

  // --- temporary debugging (safe to remove once confirmed fixed) ---
  console.log("CUSTOMER", customer);
  console.log("PROFILE", profile);
  console.log("TEMPLATE", template);

  const message = fillSmsTemplate(template, customer, businessName, extraValues);

  console.log("MESSAGE", message);
  // --- end temporary debugging ---

  ensureTextModal();
  document.getElementById("textModalTitle").textContent = config.modalTitle;
  document.getElementById("textModalCustomerName").textContent = customer.full_name || "";
  document.getElementById("textModalTextarea").value = message;
  document.getElementById("textModalOverlay").style.display = "flex";
}

// Opens the Send Text modal (membership card) for a given customer.
// Kept as its own named function — unchanged call signature/behavior —
// it just delegates to the shared modal workflow now.
async function openTextModal(customerId) {
  await openMessageModal(customerId, "membership");
}

// Opens the same modal/editor/send workflow, pre-filled with the
// Request Review template instead of the membership-card template.
async function openReviewModal(customerId) {
  await openMessageModal(customerId, "review");
}

function closeTextModal() {
  const overlay = document.getElementById("textModalOverlay");
  if (overlay) overlay.style.display = "none";
  activeTextCustomer = null;
}

// Opens the template editor modal for editing whichever template is
// active (membership SMS template or review template) — same editor,
// same save flow, just pointed at a different Supabase column.
async function openTemplateEditor() {
  const config = MESSAGE_TYPES[activeMessageType];

  const { data: { user } } = await client.auth.getUser();
  if (!user) {
    window.location = "/portal-login";
    return;
  }

  const { data: profile, error } = await client
    .from("profiles")
    .select(selectFieldsFor(activeMessageType))
    .eq("user_id", user.id)
    .single();

  if (error) {
    console.error("Profile load error:", error);
  }

  const savedTemplate = profile?.[config.templateField];
  const template = (savedTemplate && savedTemplate.trim())
    ? savedTemplate
    : config.defaultTemplate;

  document.getElementById("templateEditorTitle").textContent = config.editorTitle;
  document.getElementById("templateEditorTextarea").value = template;
  document.getElementById("textModalOverlay").style.display = "none";
  document.getElementById("templateEditorOverlay").style.display = "flex";
}

function closeTemplateEditor() {
  const overlay = document.getElementById("templateEditorOverlay");
  if (overlay) overlay.style.display = "none";
}

// Saves the active template (membership or review — whichever the
// editor was opened for) and returns to the Send modal with the
// updated message.
async function saveAndReturnToSendText() {
  const config = MESSAGE_TYPES[activeMessageType];

  const { data: { user } } = await client.auth.getUser();
  if (!user) return;

  const newTemplate = document.getElementById("templateEditorTextarea").value;

  const { error } = await client
    .from("profiles")
    .update({ [config.templateField]: newTemplate })
    .eq("user_id", user.id);

  if (error) {
    console.error("Save template error:", error);
    alert("Could not save template. Please try again.");
    return;
  }

  // Close template editor
  closeTemplateEditor();

  // Re-fetch profile with updated template
  const { data: profile, error: fetchError } = await client
    .from("profiles")
    .select(selectFieldsFor(activeMessageType))
    .eq("user_id", user.id)
    .single();

  if (fetchError) {
    console.error("Profile fetch error:", fetchError);
    return;
  }

  // Same business-level check as when the modal was first opened —
  // if the Google Review URL still isn't set, don't crash or reopen
  // the Send modal with a broken message; just let them know.
  if (config.requiresGoogleReviewUrl && !profile?.google_maps_link) {
    alert("Please add your Google Review URL in Account Settings before sending a review request.");
    return;
  }

  const businessName = profile?.business_name || "";
  const savedTemplate = profile?.[config.templateField];
  const template = (savedTemplate && savedTemplate.trim())
    ? savedTemplate
    : config.defaultTemplate;

  const extraValues = config.requiresGoogleReviewUrl
    ? { review_link: profile.google_maps_link }
    : {};

  const message = fillSmsTemplate(template, activeTextCustomer, businessName, extraValues);

  // Update textarea and show Send modal
  document.getElementById("textModalTitle").textContent = config.modalTitle;
  document.getElementById("textModalTextarea").value = message;
  document.getElementById("textModalOverlay").style.display = "flex";
}

// Launches the device's SMS app pre-filled with the edited message.
function openMessagesApp() {
  if (!activeTextCustomer) return;

  const message = document.getElementById("textModalTextarea").value;
  const encoded = encodeURIComponent(message);
  const phone = activeTextCustomer.phone || "";

  window.location.href = `sms:${phone}?body=${encoded}`;
}

// Creates both modals (Send Text and Template Editor) once and appends them
// to the page. Done in JS so no existing HTML structure needs to be touched.
function ensureTextModal() {
  if (document.getElementById("textModalOverlay")) return;

  // Send Text modal
  const overlay = document.createElement("div");
  overlay.id = "textModalOverlay";
  overlay.className = "text-modal-overlay";
  overlay.innerHTML = `
    <div class="text-modal">
      <h2 id="textModalTitle">Send Text</h2>
      <p id="textModalCustomerName" class="text-modal-customer-name"></p>
      <textarea id="textModalTextarea" class="text-modal-textarea"></textarea>
      <div class="text-modal-actions">
        <button id="textModalCancel" class="text-modal-cancel-btn">Cancel</button>
        <button id="textModalEdit" class="text-modal-edit-btn">Edit Template</button>
        <button id="textModalOpen" class="text-modal-open-btn">Open Messages</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById("textModalCancel").addEventListener("click", closeTextModal);
  document.getElementById("textModalEdit").addEventListener("click", openTemplateEditor);
  document.getElementById("textModalOpen").addEventListener("click", openMessagesApp);

  // Template Editor modal
  const editorOverlay = document.createElement("div");
  editorOverlay.id = "templateEditorOverlay";
  editorOverlay.className = "text-modal-overlay";
  editorOverlay.innerHTML = `
    <div class="text-modal">
      <h2 id="templateEditorTitle">Edit SMS Template</h2>
      <textarea id="templateEditorTextarea" class="text-modal-textarea"></textarea>
      <div class="text-modal-actions">
        <button id="templateEditorCancel" class="text-modal-cancel-btn">Cancel</button>
        <button id="templateEditorSave" class="text-modal-save-btn">Save Template</button>
      </div>
    </div>
  `;
  document.body.appendChild(editorOverlay);

  document.getElementById("templateEditorCancel").addEventListener("click", closeTemplateEditor);
  document.getElementById("templateEditorSave").addEventListener("click", saveAndReturnToSendText);
}

// ---------- init ----------
window.addEventListener("load", async () => {
  console.log('🚀 Customer page loaded, initializing...');
  
  // Wait for client to be initialized
  let clientRetries = 0;
  while (!client && clientRetries < 20) {
    await new Promise(resolve => setTimeout(resolve, 100));
    clientRetries++;
  }

  if (!client) {
    console.error('❌ Failed to initialize Supabase client after 2 seconds');
    alert('Failed to connect to database. Please refresh the page.');
    return;
  }

  console.log('✅ Supabase client ready');

  // Use auth state listener to wait for session to be restored
  let authStateReady = false;
  
  const { data: { subscription } } = client.auth.onAuthStateChange(async (event, session) => {
    console.log('🔐 Auth state changed:', { event, sessionExists: !!session });
    
    if (!authStateReady) {
      authStateReady = true;
      
      if (session) {
        console.log('✅ Session restored from localStorage, loading customers...');
        try {
          await loadCustomers({ refreshCounts: true });
        } catch (err) {
          console.error('Error loading customers:', err);
        }
      } else {
        console.warn('❌ No session found, redirecting to login');
        window.location.href = "https://mmc.rundispatcher.com/?redirect=/customer";
      }

      // Pre-create modals after auth is confirmed
      ensureTextModal();

      document.getElementById("filter-all")?.addEventListener("click", () => setFilter("all"));
      document.getElementById("filter-bronze")?.addEventListener("click", () => setFilter("bronze"));
      document.getElementById("filter-gold")?.addEventListener("click", () => setFilter("gold"));
      document.getElementById("filter-steel")?.addEventListener("click", () => setFilter("steel"));

      // Unsubscribe after first check
      subscription?.unsubscribe();
    }
  });

  // Fallback timeout in case auth state never changes
  setTimeout(() => {
    if (!authStateReady) {
      console.warn('⏱️ Auth state check timeout, forcing load attempt');
      loadCustomers({ refreshCounts: true })
        .catch(err => console.error('Error in fallback load:', err));
    }
  }, 1500);
});

document.addEventListener("DOMContentLoaded", () => {
  // pagination (stays within the current filter)
  document.getElementById("nextPage")?.addEventListener("click", () => {
    currentPage++;
    loadCustomers();
  });

  document.getElementById("prevPage")?.addEventListener("click", () => {
    if (currentPage > 0) {
      currentPage--;
      loadCustomers();
    }
  });

   // search — operates on the currently loaded page only, per spec.
  // Does not touch currentFilter, pagination, or the DB.
  const search = document.getElementById("searchInput");

  if (search) {
    search.addEventListener("input", (e) => {
      const value = e.target.value.toLowerCase();

      if (!value) {
        renderCustomerList(allCustomers);
        return;
      }

      const filtered = allCustomers.filter((c) =>
        (c.full_name || "").toLowerCase().includes(value) ||
        (c.email || "").toLowerCase().includes(value) ||
        (c.phone || "").toLowerCase().includes(value)
      );

      renderCustomerList(filtered);
    });
  }
});