// ========================================
// RAMBHAU - MAIN WEBSITE SCRIPT
// ========================================

document.addEventListener("DOMContentLoaded", () => {
  setupMobileMenu();
  setupLanguageSelector();
  setupSearch();
  loadLatestJobs();
});

// ========================================
// MOBILE MENU
// ========================================

function setupMobileMenu() {
  const menuToggle = document.querySelector(".menu-toggle");
  const navLinks = document.querySelector(".nav-links");

  if (!menuToggle || !navLinks) return;

  menuToggle.addEventListener("click", () => {
    navLinks.classList.toggle("active");
  });

  const links = navLinks.querySelectorAll("a");

  links.forEach((link) => {
    link.addEventListener("click", () => {
      navLinks.classList.remove("active");
    });
  });
}

// ========================================
// LANGUAGE SELECTOR
// ========================================

function setupLanguageSelector() {
  const languageSelect = document.querySelector(".language-select");

  if (!languageSelect) return;

  const savedLanguage = localStorage.getItem("rambhau_language");

  if (savedLanguage) {
    languageSelect.value = savedLanguage;
  }

  languageSelect.addEventListener("change", () => {
    const language = languageSelect.value;

    localStorage.setItem("rambhau_language", language);

    if (language === "mr") {
      alert("मराठी भाषा लवकरच पूर्णपणे उपलब्ध होईल.");
    } else if (language === "hi") {
      alert("हिंदी भाषा जल्द ही पूरी तरह उपलब्ध होगी.");
    } else {
      alert("English language selected.");
    }
  });
}

// ========================================
// JOB SEARCH
// ========================================

function setupSearch() {
  const searchForm = document.querySelector("#jobSearchForm");

  if (!searchForm) return;

  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const keyword = document.querySelector("#keyword")?.value.trim() || "";
    const district = document.querySelector("#district")?.value || "";
    const category = document.querySelector("#category")?.value || "";

    const params = new URLSearchParams();

    if (keyword) {
      params.set("keyword", keyword);
    }

    if (district) {
      params.set("district", district);
    }

    if (category) {
      params.set("category", category);
    }

    window.location.href = `jobs.html?${params.toString()}`;
  });
}

// ========================================
// LOAD LATEST JOBS
// ========================================

async function loadLatestJobs() {
  const container = document.querySelector("#latestJobs");

  if (!container) return;

  try {
    const response = await fetch("/api/jobs?limit=6");

    if (!response.ok) {
      throw new Error("Unable to load jobs");
    }

    const jobs = await response.json();

    if (!Array.isArray(jobs) || jobs.length === 0) {
      container.innerHTML = `
        <div class="empty-message">
          <h3>No jobs available right now</h3>
          <p>New verified jobs will be added soon.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = jobs
      .map((job) => createJobCard(job))
      .join("");

  } catch (error) {
    console.log("Job API not available yet.");

    container.innerHTML = `
      <div class="empty-message">
        <h3>Latest Jobs</h3>
        <p>Jobs will appear here when RAMBHAU backend is connected.</p>
      </div>
    `;
  }
}

// ========================================
// JOB CARD
// ========================================

function createJobCard(job) {
  const title = escapeHTML(job.title || "Job Opportunity");
  const company = escapeHTML(job.company || "Company");
  const district = escapeHTML(job.district || "");
  const city = escapeHTML(job.city || "");
  const salary = escapeHTML(job.salary || "Salary not disclosed");
  const jobType = escapeHTML(job.job_type || "Full Time");
  const slug = encodeURIComponent(job.slug || job.id || "");

  return `
    <div class="job-card">
      <h3>${title}</h3>

      <div class="job-company">
        ${company}
      </div>

      <div class="job-info">
        ${district ? `<span class="job-tag">${district}</span>` : ""}
        ${city ? `<span class="job-tag">${city}</span>` : ""}
        <span class="job-tag">${jobType}</span>
      </div>

      <div class="salary">
        ₹ ${salary}
      </div>

      <a
        href="job.html?slug=${slug}"
        class="btn btn-blue"
      >
        View Job
      </a>
    </div>
  `;
}

// ========================================
// HTML SECURITY
// ========================================

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}