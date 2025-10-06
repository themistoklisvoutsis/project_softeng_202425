/* ---- Helpers ---- */
const qs = (s) => document.querySelector(s);
const connDot = qs("#connDot"),
  connText = qs("#connText");

function setStatus(kind, text) {
  if (!connDot || !connText) return;
  connDot.classList.remove("ok", "err");
  if (kind === "ok") connDot.classList.add("ok");
  if (kind === "err") connDot.classList.add("err");
  if (text) connText.textContent = text;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c])
  );
}

function toast(msg, kind = "ok", timeout = 2500) {
  const box = document.createElement("div");
  box.className = `toast ${kind}`;
  box.innerHTML = escapeHtml(msg);
  (qs("#toasts") || document.body).appendChild(box);
  setTimeout(() => box.remove(), timeout);
}

const pad2 = (n) => String(n).padStart(2, "0");
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

/* ---- API proxy προς api.js ---- */
const api = (...args) => window.api(...args);

/* ---- Ping ---- */
(async () => {
  try {
    await api("ping");
    setStatus("ok", "Συνδεδεμένο");
  } catch {
    setStatus("err", "Μη συνδεδεμένο");
  }
})();

/* ---- Members ---- */
const addMemberForm = qs("#addMemberForm"),
  addMemberMsg = qs("#addMemberMsg"),
  membersList = qs("#membersList"),
  searchInput = qs("#searchQ");
let editingMember = null;

async function loadMembers() {
  membersList.textContent = "Φόρτωση…";
  try {
    const q = searchInput.value.trim();
    const data = await api("search_members", { params: { q } });
    if (!data?.length) {
      membersList.textContent = "— Καμία εγγραφή —";
      return;
    }
    const year = new Date().getFullYear();
    const rows = data
      .map(
        (m) => `
      <tr data-id="${m.id}">
        <td><span class="badge copy" data-copy="${m.id}">#${m.id}</span></td>
        <td>${escapeHtml(m.first_name || "")}</td>
        <td>${escapeHtml(m.last_name || "")}</td>
        <td>
          <span class="count-since">${Number(m.total_since_reset || 0)}</span> |
          <span class="count-year" data-id="${m.id}">…</span>
        </td>
        <td style="text-align:right;white-space:nowrap">
          <button class="btn small ghost quick-mark" type="button">✔️ Σήμερα</button>
          <button class="btn small ghost reset-one" type="button" title="Μηδενισμός">0️⃣</button>
          <button class="btn small ghost edit-member" type="button" title="Επεξεργασία">✎</button>
        </td>
      </tr>`
      )
      .join("");
    membersList.innerHTML = `<table>
      <thead><tr><th>ID</th><th>Όνομα</th><th>Επώνυμο</th><th>Μετρητής | Έτος ${year}</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table>`;

    // αντιγραφή id
    membersList.querySelectorAll(".badge.copy").forEach((b) =>
      b.addEventListener("click", (ev) => {
        const id = ev.currentTarget.getAttribute("data-copy");
        navigator.clipboard?.writeText(id);
        toast(`Αντιγράφηκε #${id}`);
      })
    );

    // καταχώριση παρουσίας
    membersList.querySelectorAll(".quick-mark").forEach((btn) =>
      btn.addEventListener("click", async (ev) => {
        const id = Number(
          ev.currentTarget.closest("tr").getAttribute("data-id")
        );
        try {
          await api("upsert_attendance", {
            method: "POST",
            body: { member_id: id, attended_on: todayISO() },
          });
          toast("✅ Καταχωρήθηκε");
        } catch (e) {
          toast(e.message, "err", 3000);
        }
      })
    );

    // μηδενισμός
    membersList.querySelectorAll(".reset-one").forEach((btn) =>
      btn.addEventListener("click", async (ev) => {
        const id = Number(
          ev.currentTarget.closest("tr").getAttribute("data-id")
        );
        if (!confirm(`Μηδενισμός μετρητή για #${id};`)) return;
        try {
          await api("reset_counter", { method: "POST", body: { id } });
          toast("🔄 Έγινε");
          loadMembers();
        } catch (e) {
          toast(e.message, "err", 3000);
        }
      })
    );

    // edit modal
    membersList.querySelectorAll(".edit-member").forEach((btn) =>
      btn.addEventListener("click", (ev) => {
        const id = Number(
          ev.currentTarget.closest("tr").getAttribute("data-id")
        );
        openMemberEditor(id);
      })
    );

    // σύνολα έτους
    const totals = await api("year_totals", {
      params: { from: `${year}-01-01`, to: `${year}-12-31` },
    });
    membersList.querySelectorAll(".count-year").forEach((el) => {
      const id = Number(el.getAttribute("data-id"));
      el.textContent = totals[id] || 0;
    });

    _staggerRows();
  } catch (e) {
    membersList.innerHTML = `❌ ${escapeHtml(e.message)}`;
  }
}

async function addMember(first, last) {
  const r = await api("add_member", {
    method: "POST",
    body: { first_name: first, last_name: last },
  });
  return r.id;
}

addMemberForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  addMemberMsg.textContent = "Αποθήκευση…";
  try {
    const id = await addMember(
      qs("#firstName").value.trim(),
      qs("#lastName").value.trim()
    );
    addMemberMsg.textContent = `✅ #${id}`;
    addMemberForm.reset();
    loadMembers();
  } catch (err) {
    addMemberMsg.innerHTML = `❌ ${escapeHtml(err.message)}`;
  }
});

document.getElementById("btnSearch")?.addEventListener("click", loadMembers);
searchInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    loadMembers();
  }
});

/* Modal Editor */
const memberModal = qs("#memberModal"),
  editFirst = qs("#editFirst"),
  editLast = qs("#editLast"),
  editEpoch = qs("#editEpoch"),
  statSince = qs("#statSince"),
  statYear = qs("#statYear");

function open(el) {
  el.hidden = false;
}
function close(el) {
  el.hidden = true;
}
qs("#btnCloseMember")?.addEventListener("click", () => close(memberModal));

async function countAttendanceFor(memberId, from, to) {
  const r = await api("count_attendance", {
    params: { member_id: String(memberId), from, to },
  });
  return r.count || 0;
}

async function openMemberEditor(id) {
  try {
    // ΜΟΝΗ αλλαγή: υποστήριξη είτε array είτε {data:{...}} από get_member (που πρέπει να διαβάζει από v_member_stats)
    const recs = await api("get_member", { params: { id: String(id) } });
    const m = Array.isArray(recs) ? recs[0] : (recs?.data || recs) || null;
    if (!m) throw new Error("Δεν βρέθηκε το μέλος.");
    editingMember = m;
    editFirst.value = m.first_name || "";
    editLast.value = m.last_name || "";
    editEpoch.value = (m.counter_epoch || todayISO()).slice(0, 10);
    statSince.textContent = Number(m.total_since_reset) || 0;
    statYear.textContent = "…";
    open(memberModal);
    const y = new Date().getFullYear();
    statYear.textContent = await countAttendanceFor(
      m.id,
      `${y}-01-01`,
      `${y}-12-31`
    );
  } catch (e) {
    toast(e.message, "err", 3000);
  }
}

qs("#btnSaveMember")?.addEventListener("click", async () => {
  if (!editingMember) return;
  try {
    await api("update_member", {
      method: "POST",
      body: {
        id: editingMember.id,
        first_name: editFirst.value.trim(),
        last_name: editLast.value.trim(),
        counter_epoch: editEpoch.value || null,
      },
    });
    toast("✅ Αποθηκεύτηκε");
    close(memberModal);
    loadMembers();
  } catch (e) {
    toast(e.message, "err", 3000);
  }
});

/* init */
loadMembers();

/* ---- Animations ---- */
(function () {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) return;
  const cards = Array.from(document.querySelectorAll(".page-wrap .card"));
  if (!cards.length) return;

  cards.forEach((c) => c.classList.add("_hidden"));
  const wrap = document.querySelector(".page-wrap");
  const reveal = () => {
    cards.forEach((c, i) => {
      setTimeout(() => {
        c.classList.add("_show");
        c.classList.remove("_hidden");
      }, i * 160);
    });
    io.disconnect();
  };
  const io = new IntersectionObserver(
    (es) => {
      if (es.some((e) => e.isIntersecting)) reveal();
    },
    { threshold: 0.2 }
  );
  io.observe(wrap);
})();

const _staggerRows = () => {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) return;
  const rows = document.querySelectorAll("#membersList tbody tr");
  rows.forEach((r) => r.classList.add("_hidden"));
  rows.forEach((r, i) => {
    setTimeout(() => {
      r.classList.add("_show");
      r.classList.remove("_hidden");
    }, i * 60);
  });
};
