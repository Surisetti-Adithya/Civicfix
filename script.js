// Demo data (replaced by a real backend later)
const sampleReports = [
  { id: "CF-2318", category: "Pothole", title: "Deep pothole near Ward 12 market gate", location: "Main Road, opposite the bus stop", status: "In progress", confirms: 14, when: "2 days ago", reporter: "Anita R.", department: "Roads Department", updated: "Repair crew scheduled for this week", details: "A pothole about 40 cm wide and 10 cm deep has formed in the left lane. Two-wheelers swerve into oncoming traffic to avoid it, especially at peak hours." },
  { id: "CF-2305", category: "Garbage", title: "Garbage piled up behind the community hall", location: "Behind Community Hall, Lake View Colony", status: "Open", confirms: 9, when: "3 days ago", reporter: "Suresh K.", department: "Sanitation Department", updated: "Waiting for verification by neighbours", details: "Waste has not been collected for over a week. There is a strong smell and stray animals are scattering the rubbish onto the footpath." },
  { id: "CF-2291", category: "Streetlight", title: "Streetlight out at park entrance", location: "Gandhi Park, North Gate", status: "Open", confirms: 21, when: "5 days ago", reporter: "Meera D.", department: "Electrical Department", updated: "Verified, waiting to be assigned", details: "Three lights in a row are dark. The path is unsafe after 7 pm and several evening walkers have asked for it to be fixed." },
  { id: "CF-2277", category: "Drainage", title: "Blocked drain flooding Gandhi Lane", location: "Gandhi Lane, near house no. 14", status: "In progress", confirms: 17, when: "6 days ago", reporter: "Imran S.", department: "Drainage Board", updated: "Drainage crew assigned", details: "Water stays on the road for hours after even light rain, and it is entering the ground floor of two houses." },
  { id: "CF-2250", category: "Pothole", title: "Cracked road edge outside primary school", location: "School Road, outside St. Mary's Primary", status: "Resolved", confirms: 11, when: "1 week ago", reporter: "Priya N.", department: "Roads Department", updated: "Repair completed and checked", details: "The edge of the road had broken away and was a risk for children cycling to school. It has now been patched and levelled." },
  { id: "CF-2236", category: "Streetlight", title: "Flickering light on Station Road", location: "Station Road, junction with 2nd Cross", status: "Resolved", confirms: 6, when: "2 weeks ago", reporter: "David M.", department: "Electrical Department", updated: "Light replaced", details: "The light flickered all night. A bulb replaced last month did not help, so the whole fitting was changed this time." }
];

const demoStats = { total: 1284, progress: 312, resolved: 846 };

const trackData = {
  "CF-2318": "In progress: sent to the Roads Department.",
  "CF-2305": "Open: waiting for verification by neighbours.",
  "CF-2291": "Open: verified, waiting to be assigned.",
  "CF-2277": "In progress: drainage crew assigned.",
  "CF-2250": "Resolved: repair completed.",
  "CF-2236": "Resolved: light replaced."
};

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

$("#year").textContent = new Date().getFullYear();

// Mobile menu
const menuBtn = $("#menuBtn");
const navLinks = $("#navLinks");
menuBtn.addEventListener("click", () => {
  const open = !navLinks.classList.contains("open");
  navLinks.classList.toggle("open", open);
  menuBtn.setAttribute("aria-expanded", String(open));
  menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
});

// Back to top
const toTop = $("#toTop");
window.addEventListener("scroll", () => { toTop.hidden = window.scrollY < 600; });
toTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

// Report cards (shared by Home and Browse)
const confirmed = new Set();
const statusClass = s => s === "Open" ? "open" : s === "Resolved" ? "resolved" : "progress-s";
const pinIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>';

function reportCard(r) {
  const done = confirmed.has(r.id);
  return `
    <article class="report">
      <button class="report-toggle" aria-expanded="false" aria-controls="more-${r.id}">
        <span class="report-top">
          <span class="tag">${r.category}</span>
          <span class="status ${statusClass(r.status)}">${r.status}</span>
        </span>
        <span class="report-title">${r.title}</span>
        <span class="report-loc">${pinIcon} ${r.location}</span>
        <span class="more-hint">View details</span>
      </button>
      <div class="report-more" id="more-${r.id}" hidden>
        <p>${r.details}</p>
        <dl>
          <div><dt>Reference</dt><dd>${r.id}</dd></div>
          <div><dt>Reported by</dt><dd>${r.reporter}, ${r.when}</dd></div>
          <div><dt>Assigned to</dt><dd>${r.department}</dd></div>
          <div><dt>Latest update</dt><dd>${r.updated}</dd></div>
        </dl>
        <button class="confirm" data-id="${r.id}" data-base="${r.confirms}" ${done ? "disabled" : ""}>
          ${done ? "Confirmed" : "Confirm this issue"} (${r.confirms + (done ? 1 : 0)})
        </button>
      </div>
    </article>`;
}

function mountReports(container, list) {
  container.innerHTML = list.map(reportCard).join("");
}

function bindReportEvents(container) {
  container.addEventListener("click", e => {
    const toggle = e.target.closest(".report-toggle");
    if (toggle) {
      const open = toggle.getAttribute("aria-expanded") !== "true";
      toggle.setAttribute("aria-expanded", String(open));
      toggle.nextElementSibling.hidden = !open;
      $(".more-hint", toggle).textContent = open ? "Hide details" : "View details";
      toggle.closest(".report").classList.toggle("expanded", open);
      return;
    }
    const btn = e.target.closest(".confirm");
    if (btn && !btn.disabled) {
      confirmed.add(btn.dataset.id);
      btn.disabled = true;
      btn.textContent = "Confirmed (" + (Number(btn.dataset.base) + 1) + ")";
    }
  });
}

// Home page: recent issues
const recentEl = $("#recentReports");
if (recentEl) {
  mountReports(recentEl, ["CF-2318", "CF-2305", "CF-2250"].map(id => sampleReports.find(r => r.id === id)));
  bindReportEvents(recentEl);
}

// Browse page
const reportsEl = $("#reports");
if (reportsEl) {
  mountReports(reportsEl, sampleReports);
  bindReportEvents(reportsEl);
  $$(".filter").forEach(btn => btn.addEventListener("click", () => {
    $$(".filter").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const f = btn.dataset.filter;
    mountReports(reportsEl, sampleReports.filter(r => f === "all" || r.category === f));
  }));

  $("#statTotal").textContent = demoStats.total.toLocaleString();
  $("#statProgress").textContent = demoStats.progress.toLocaleString();
  $("#statResolved").textContent = demoStats.resolved.toLocaleString();

  $("#trackForm").addEventListener("submit", e => {
    e.preventDefault();
    const ref = $("#refInput").value.trim().toUpperCase();
    $("#trackResult").textContent = !ref
      ? "Enter a reference number such as CF-2318."
      : trackData[ref] || "No report found for " + ref + ". Check the number and try again.";
  });
}

// Report page
const reportForm = $("#reportForm");
if (reportForm) {
  reportForm.addEventListener("submit", e => {
    e.preventDefault();
    const category = $("#category").value;
    const location = $("#location").value.trim();
    const details = $("#details").value.trim();
    const err = $("#formError");
    if (!category || !location || details.length < 10) {
      err.textContent = "Choose a category, enter a location and describe the problem in at least 10 characters.";
      err.hidden = false;
      return;
    }
    $("#refNo").textContent = "CF-" + (2400 + Math.floor(Math.random() * 600));
    reportForm.hidden = true;
    $("#reportDone").hidden = false;
    reportForm.reset();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}
