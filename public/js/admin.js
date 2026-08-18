import { auth, db } from "./firebase-init.js";
import {
  collection, getDocs, query, where, doc, updateDoc, getDoc, setDoc,
  deleteDoc, serverTimestamp, limit, startAfter, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import { signOut, sendPasswordResetEmail, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-functions.js";
import { initMap, addMarker } from "./map.js";
import { exportToExcel } from "./export.js";
import { importFromExcel } from "./import.js";

const functions = getFunctions(undefined, "asia-southeast2");
const adminUserAction = httpsCallable(functions, "adminUserAction");

function getTodayLocal() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
}

const PAGE_SIZE = 20;
let lastVisible = null;
let currentPage = 1;
let currentUsers = [];
let allUsers = [];
let allLocations = [];
let map = null;
let tempMap = null;
let tempMarker = null;
let currentFilter = { kelurahan: "", tanggal: getTodayLocal() };

const dataCache = {
  stats: null, statsTimestamp: 0,
  kelurahan: null, kelurahanTimestamp: 0
};

function invalidateCaches() {
  dataCache.stats = null;
  dataCache.statsTimestamp = 0;
  dataCache.kelurahan = null;
  dataCache.kelurahanTimestamp = 0;
}

function showLoading(show) {
  const el = document.getElementById("loading");
  if (el) el.style.display = show ? "flex" : "none";
}

async function logout() {
  if (!confirm("Yakin ingin keluar?")) return;
  await signOut(auth);
  localStorage.clear();
  window.location.replace("index.html");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

async function callAdmin(data) {
  const result = await adminUserAction(data);
  return result.data;
}

function fillUserForm(user) {
  document.getElementById("userUid").value = user.uid || "";
  document.getElementById("userNama").value = user.nama || "";
  document.getElementById("userEmail").value = user.email || "";
  document.getElementById("userPassword").value = "";
  document.getElementById("userRole").value = user.role || "user";
  document.getElementById("userKecamatan").value = user.kecamatan || "";
  document.getElementById("userKelurahan").value = user.kelurahan || "";
  document.getElementById("userKota").value = user.kota || "";
  document.getElementById("userActive").checked = user.active !== false;
  document.getElementById("userDeviceCheck").checked = user.deviceCheckEnabled !== false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

window.clearUserForm = function() {
  ["userUid","userNama","userEmail","userPassword","userKecamatan","userKelurahan","userKota"]
    .forEach(id => document.getElementById(id).value = "");
  document.getElementById("userRole").value = "user";
  document.getElementById("userActive").checked = true;
  document.getElementById("userDeviceCheck").checked = true;
};

window.saveUser = async function() {
  const uid = document.getElementById("userUid").value.trim();
  const nama = document.getElementById("userNama").value.trim();
  const email = document.getElementById("userEmail").value.trim();
  const password = document.getElementById("userPassword").value;
  const role = document.getElementById("userRole").value;
  const kecamatan = document.getElementById("userKecamatan").value.trim();
  const kelurahan = document.getElementById("userKelurahan").value.trim();
  const kota = document.getElementById("userKota").value.trim();
  const active = document.getElementById("userActive").checked;
  const deviceCheckEnabled = document.getElementById("userDeviceCheck").checked;

  if (!nama || !email) {
    alert("Nama dan email wajib diisi.");
    return;
  }

  showLoading(true);
  try {
    const payload = {
      action: uid ? "update" : "create",
      uid: uid || undefined,
      nama, email, role, kecamatan, kelurahan, kota,
      active, deviceCheckEnabled
    };
    if (password) payload.password = password;

    const result = await callAdmin(payload);
    alert("✅ " + result.message);
    clearUserForm();
    await loadAllUsers();
    await loadStats(true);
  } catch (error) {
    console.error(error);
    alert("❌ Gagal: " + (error.message || error));
  } finally {
    showLoading(false);
  }
};

window.editUser = function(uid) {
  const user = allUsers.find(u => u.uid === uid);
  if (user) fillUserForm(user);
};

window.toggleUser = async function(uid, disabled) {
  if (!confirm(disabled ? "Nonaktifkan akun ini?" : "Aktifkan akun ini?")) return;
  showLoading(true);
  try {
    const result = await callAdmin({ action: "setDisabled", uid, disabled });
    alert("✅ " + result.message);
    await loadAllUsers();
  } catch (error) {
    alert("❌ " + error.message);
  } finally {
    showLoading(false);
  }
};

window.deleteUserAccount = async function(uid, nama) {
  if (!confirm(`Hapus akun "${nama}"?\n\nAuthentication dan dokumen users/{uid} akan dihapus.`)) return;
  showLoading(true);
  try {
    const result = await callAdmin({ action: "delete", uid });
    alert("✅ " + result.message);
    await loadAllUsers();
    await loadStats(true);
  } catch (error) {
    alert("❌ " + error.message);
  } finally {
    showLoading(false);
  }
};

window.resetDevice = async function(uid) {
  if (!confirm("Reset device user ini?")) return;
  showLoading(true);
  try {
    const result = await callAdmin({ action: "resetDevice", uid });
    alert("✅ " + result.message);
    await loadAllUsers();
    await loadPresensi(currentPage);
  } catch (error) {
    alert("❌ " + error.message);
  } finally {
    showLoading(false);
  }
};

window.resetAllDevices = async function() {
  if (!confirm("RESET SEMUA DEVICE USER?")) return;
  showLoading(true);
  try {
    const result = await callAdmin({ action: "resetAllDevices" });
    alert("✅ " + result.message);
    await loadAllUsers();
  } catch (error) {
    alert("❌ " + error.message);
  } finally {
    showLoading(false);
  }
};

window.sendResetEmailFromForm = async function() {
  const email = document.getElementById("userEmail").value.trim();
  if (!email) {
    alert("Isi email terlebih dahulu.");
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    alert(`✅ Link reset password dikirim ke ${email}.`);
  } catch (error) {
    alert("❌ Gagal mengirim reset password: " + error.message);
  }
};

function renderUsers() {
  const body = document.getElementById("usersBody");
  if (!body) return;

  if (!allUsers.length) {
    body.innerHTML = '<tr><td colspan="8">Belum ada data user.</td></tr>';
    return;
  }

  body.innerHTML = allUsers.map(user => {
    const active = user.active !== false;
    const role = escapeHtml(user.role || "user");
    return `
      <tr>
        <td>${escapeHtml(user.nama || "-")}</td>
        <td>${escapeHtml(user.email || "-")}</td>
        <td>${role}</td>
        <td>${escapeHtml(user.kecamatan || "-")}</td>
        <td>${escapeHtml(user.kelurahan || "-")}</td>
        <td>${active ? "🟢 Aktif" : "🔴 Nonaktif"}</td>
        <td>${user.deviceId ? "📱 Terikat" : "📱 Kosong"}</td>
        <td>
          <div class="admin-actions">
            <button class="btn-primary" onclick="editUser('${user.uid}')">Edit</button>
            <button class="btn-orange" onclick="toggleUser('${user.uid}', ${active})">${active ? "Nonaktifkan" : "Aktifkan"}</button>
            <button class="btn-green" onclick="resetDevice('${user.uid}')">Reset Device</button>
            <button class="btn-red" onclick="deleteUserAccount('${user.uid}', '${escapeHtml(user.nama || user.email || "user")}')">Hapus</button>
          </div>
        </td>
      </tr>`;
  }).join("");
}

async function loadAllUsers() {
  const snap = await getDocs(collection(db, "users"));
  allUsers = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
  allUsers.sort((a,b) => String(a.nama || "").localeCompare(String(b.nama || ""), "id"));
  renderUsers();
}

window.saveLocation = async function() {
  const id = document.getElementById("locationId").value.trim();
  const nama = document.getElementById("locationName").value.trim();
  const tipe = document.getElementById("locationType").value;
  const lat = Number(document.getElementById("locationLat").value);
  const lng = Number(document.getElementById("locationLng").value);
  const radius = Number(document.getElementById("locationRadius").value || 100);

  if (!nama || !Number.isFinite(lat) || !Number.isFinite(lng) || radius <= 0) {
    alert("Nama, latitude, longitude dan radius harus valid.");
    return;
  }

  showLoading(true);
  try {
    const ref = id ? doc(db, "lokasi", id) : doc(collection(db, "lokasi"));
    await setDoc(ref, {
      nama, tipe, lat, lng, radius,
      updatedAt: serverTimestamp(),
      ...(id ? {} : { createdAt: serverTimestamp() })
    }, { merge: true });

    alert("✅ Lokasi berhasil disimpan.");
    clearLocationForm();
    await loadLocations();
    invalidateCaches();
    await loadFilterOptions();
    await loadStats(true);
  } catch (error) {
    alert("❌ Gagal menyimpan lokasi: " + error.message);
  } finally {
    showLoading(false);
  }
};

window.editLocation = function(id) {
  const loc = allLocations.find(x => x.id === id);
  if (!loc) return;
  document.getElementById("locationId").value = loc.id;
  document.getElementById("locationName").value = loc.nama || "";
  document.getElementById("locationType").value = loc.tipe || "kelurahan";
  document.getElementById("locationLat").value = loc.lat ?? "";
  document.getElementById("locationLng").value = loc.lng ?? "";
  document.getElementById("locationRadius").value = loc.radius || 100;
  window.scrollTo({ top: document.getElementById("locationId").closest(".card").offsetTop, behavior: "smooth" });
};

window.deleteLocation = async function(id, nama) {
  if (!confirm(`Hapus lokasi "${nama}"?`)) return;
  showLoading(true);
  try {
    await deleteDoc(doc(db, "lokasi", id));
    alert("✅ Lokasi dihapus.");
    await loadLocations();
    invalidateCaches();
    await loadFilterOptions();
    await loadStats(true);
  } catch (error) {
    alert("❌ Gagal menghapus lokasi: " + error.message);
  } finally {
    showLoading(false);
  }
};

window.clearLocationForm = function() {
  document.getElementById("locationId").value = "";
  document.getElementById("locationName").value = "";
  document.getElementById("locationType").value = "kelurahan";
  document.getElementById("locationLat").value = "";
  document.getElementById("locationLng").value = "";
  document.getElementById("locationRadius").value = "100";
};

function renderLocations() {
  const body = document.getElementById("locationsBody");
  if (!body) return;
  if (!allLocations.length) {
    body.innerHTML = '<tr><td colspan="6">Belum ada lokasi.</td></tr>';
    return;
  }
  body.innerHTML = allLocations.map(loc => `
    <tr>
      <td>${escapeHtml(loc.nama || "-")}</td>
      <td>${escapeHtml(loc.tipe || "-")}</td>
      <td>${loc.lat ?? "-"}</td>
      <td>${loc.lng ?? "-"}</td>
      <td>${loc.radius || 100} m</td>
      <td>
        <div class="admin-actions">
          <button class="btn-primary" onclick="editLocation('${loc.id}')">Edit</button>
          <button class="btn-red" onclick="deleteLocation('${loc.id}','${escapeHtml(loc.nama || "")}')">Hapus</button>
        </div>
      </td>
    </tr>`).join("");
}

async function loadLocations() {
  const snap = await getDocs(collection(db, "lokasi"));
  allLocations = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  allLocations.sort((a,b) => String(a.nama || "").localeCompare(String(b.nama || ""), "id"));
  renderLocations();
}

window.useCurrentAdminLocationForLocation = function() {
  if (!navigator.geolocation) return alert("Browser tidak mendukung GPS.");
  navigator.geolocation.getCurrentPosition(pos => {
    document.getElementById("locationLat").value = pos.coords.latitude;
    document.getElementById("locationLng").value = pos.coords.longitude;
  }, () => alert("Gagal mengambil lokasi."));
};

async function loadStats(force = false) {
  if (!force && dataCache.stats && Date.now() - dataCache.statsTimestamp < 300000) {
    renderStats(dataCache.stats);
    return;
  }

  const [usersSnap, kelSnap, presensiSnap] = await Promise.all([
    getDocs(collection(db, "users")),
    getDocs(query(collection(db, "lokasi"), where("tipe", "==", "kelurahan"))),
    getDocs(query(collection(db, "presensi"), where("tanggal", "==", currentFilter.tanggal)))
  ]);

  const stats = {
    totalUser: usersSnap.size,
    totalKelurahan: kelSnap.size,
    hadirHariIni: presensiSnap.size,
    belumHadir: Math.max(0, usersSnap.size - presensiSnap.size)
  };
  dataCache.stats = stats;
  dataCache.statsTimestamp = Date.now();
  renderStats(stats);
}

function renderStats(stats) {
  document.getElementById("totalUser").textContent = stats.totalUser;
  document.getElementById("totalKelurahan").textContent = stats.totalKelurahan;
  document.getElementById("hadirHariIni").textContent = stats.hadirHariIni;
  document.getElementById("belumHadir").textContent = stats.belumHadir;
}

async function loadFilterOptions() {
  let list = dataCache.kelurahan;
  if (!list || Date.now() - dataCache.kelurahanTimestamp >= 300000) {
    const snap = await getDocs(query(collection(db, "lokasi"), where("tipe", "==", "kelurahan")));
    list = snap.docs.map(d => d.data().nama).filter(Boolean).sort((a,b) => a.localeCompare(b, "id"));
    dataCache.kelurahan = list;
    dataCache.kelurahanTimestamp = Date.now();
  }

  const select = document.getElementById("filterKelurahan");
  select.innerHTML = '<option value="">Semua Kelurahan</option>';
  list.forEach(nama => {
    const option = document.createElement("option");
    option.value = nama;
    option.textContent = nama;
    select.appendChild(option);
  });
}

async function loadPresensi(page = 1) {
  currentPage = page;
  showLoading(true);
  try {
    let q = query(collection(db, "users"), limit(PAGE_SIZE));
    if (currentFilter.kelurahan) {
      q = query(collection(db, "users"), where("kelurahan", "==", currentFilter.kelurahan), limit(PAGE_SIZE));
    }
    if (lastVisible && page > 1) q = query(q, startAfter(lastVisible));

    const usersSnap = await getDocs(q);
    lastVisible = usersSnap.docs[usersSnap.docs.length - 1] || null;

    currentUsers = usersSnap.docs.map(d => ({ id: d.id, uid: d.id, ...d.data() }));

    const presensiSnap = await getDocs(query(
      collection(db, "presensi"),
      where("tanggal", "==", currentFilter.tanggal)
    ));
    const presensiMap = new Map();
    presensiSnap.forEach(d => presensiMap.set(d.data().uid, { id: d.id, ...d.data() }));

    renderTabel(currentUsers, presensiMap, page);
    updatePaginationButtons();
  } catch (error) {
    console.error("loadPresensi:", error);
  } finally {
    showLoading(false);
  }
}

function renderTabel(users, presensiMap, page) {
  const tbody = document.getElementById("tableBody");
  let html = "";
  const startNo = (page - 1) * PAGE_SIZE + 1;

  users.forEach((user, index) => {
    const p = presensiMap.get(user.uid);
    const status = p ? "Hadir" : "Belum";
    const waktu = p?.waktu?.seconds ? new Date(p.waktu.seconds * 1000).toLocaleTimeString() : "-";
    const lokasi = p ? (p.lokasi === "kantor" ? "Kantor" : (p.lokasi || "-")) : "-";

    html += `
      <tr>
        <td>${startNo + index}</td>
        <td>${escapeHtml(user.nama || "-")} <small>${escapeHtml(user.role || "user")}</small></td>
        <td>${escapeHtml(user.kelurahan || "-")}</td>
        <td><span style="background:${p ? "#E8F5E9" : "#FFEBEE"};color:${p ? "#27AE60" : "#E74C3C"};padding:3px 8px;border-radius:12px">${status}</span></td>
        <td>${waktu}</td>
        <td>${escapeHtml(lokasi)}</td>
        <td>${user.deviceId ? "📱" : "📱-"}</td>
        <td><button onclick="resetDevice('${user.uid}')" style="background:none;border:none;color:#EE2737;cursor:pointer">⟲ Reset</button></td>
      </tr>`;
  });

  tbody.innerHTML = users.length ? html : '<tr><td colspan="8" class="text-center">Tidak ada data</td></tr>';
}

function createPaginationButtons() {
  const tableContainer = document.querySelector(".table-responsive");
  const tabelCard = tableContainer?.parentElement;
  if (!tabelCard || document.getElementById("paginationNav")) return;

  const nav = document.createElement("div");
  nav.id = "paginationNav";
  nav.style.cssText = "display:flex;justify-content:center;gap:10px;margin:15px 0";
  nav.innerHTML = `
    <button onclick="prevPage()" id="prevBtn">◀ Sebelumnya</button>
    <span id="pageInfo">Halaman 1</span>
    <button onclick="nextPage()" id="nextBtn">Berikutnya ▶</button>`;
  tabelCard.appendChild(nav);
}

window.prevPage = () => {
  if (currentPage > 1) loadPresensi(currentPage - 1);
};
window.nextPage = () => loadPresensi(currentPage + 1);

function updatePaginationButtons() {
  const prev = document.getElementById("prevBtn");
  const next = document.getElementById("nextBtn");
  const info = document.getElementById("pageInfo");
  if (!prev || !next || !info) return;
  prev.disabled = currentPage === 1;
  next.disabled = currentUsers.length < PAGE_SIZE;
  info.textContent = `Halaman ${currentPage}`;
}

window.applyFilter = () => {
  currentFilter.kelurahan = document.getElementById("filterKelurahan").value;
  currentFilter.tanggal = document.getElementById("filterTanggal").value || getTodayLocal();
  lastVisible = null;
  loadPresensi(1);
  loadStats(true);
};

window.resetFilter = () => {
  currentFilter = { kelurahan: "", tanggal: getTodayLocal() };
  document.getElementById("filterKelurahan").value = "";
  document.getElementById("filterTanggal").value = currentFilter.tanggal;
  lastVisible = null;
  loadPresensi(1);
  loadStats(true);
};

function initTemporaryMap() {
  const div = document.getElementById("tempMap");
  if (!div || typeof L === "undefined") return;
  if (tempMap) tempMap.remove();

  tempMap = L.map("tempMap").setView([-7.4706, 110.2177], 13);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap"
  }).addTo(tempMap);

  tempMap.on("click", e => setTemporaryMarker(e.latlng.lat, e.latlng.lng));
}

function setTemporaryMarker(lat, lng) {
  document.getElementById("tempLat").value = lat;
  document.getElementById("tempLng").value = lng;
  if (tempMarker) tempMap.removeLayer(tempMarker);
  tempMarker = L.marker([lat, lng]).addTo(tempMap);
  tempMap.setView([lat, lng], 16);
}

window.useCurrentAdminLocation = function() {
  if (!navigator.geolocation) return alert("Browser tidak mendukung GPS.");
  navigator.geolocation.getCurrentPosition(pos => {
    setTemporaryMarker(pos.coords.latitude, pos.coords.longitude);
  }, () => alert("Gagal mengambil lokasi."));
};

window.saveTemporaryLocation = async function() {
  const name = document.getElementById("tempLocationName").value.trim();
  const lat = Number(document.getElementById("tempLat").value);
  const lng = Number(document.getElementById("tempLng").value);
  const radius = Number(document.getElementById("tempRadius").value || 100);
  const start = document.getElementById("tempStart").value;
  const end = document.getElementById("tempEnd").value;

  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng) || !start || !end || radius <= 0) {
    alert("Lengkapi nama, lokasi, radius, waktu mulai dan selesai.");
    return;
  }

  showLoading(true);
  try {
    await setDoc(doc(db, "system_settings", "global"), {
      temporaryLocationEnabled: true,
      statusLokasi: "custom",
      temporaryLocationName: name,
      temporaryLatitude: lat,
      temporaryLongitude: lng,
      temporaryRadius: radius,
      temporaryStart: start,
      temporaryEnd: end,
      updatedAt: serverTimestamp()
    }, { merge: true });
    alert("✅ Lokasi sementara berhasil diaktifkan.");
    await loadLocationModeStatus();
  } catch (error) {
    alert("❌ " + error.message);
  } finally {
    showLoading(false);
  }
};

window.disableTemporaryLocation = async function() {
  if (!confirm("Kembalikan ke lokasi normal?")) return;
  showLoading(true);
  try {
    await setDoc(doc(db, "system_settings", "global"), {
      temporaryLocationEnabled: false,
      statusLokasi: "default",
      updatedAt: serverTimestamp()
    }, { merge: true });
    alert("✅ Lokasi normal dipulihkan.");
    await loadLocationModeStatus();
  } catch (error) {
    alert("❌ " + error.message);
  } finally {
    showLoading(false);
  }
};

async function loadTemporaryLocation() {
  const snap = await getDoc(doc(db, "system_settings", "global"));
  if (!snap.exists()) return;
  const data = snap.data();

  document.getElementById("tempLocationName").value = data.temporaryLocationName || "";
  document.getElementById("tempRadius").value = data.temporaryRadius || 100;
  document.getElementById("tempStart").value = data.temporaryStart || "";
  document.getElementById("tempEnd").value = data.temporaryEnd || "";

  if (data.temporaryLatitude != null && data.temporaryLongitude != null) {
    setTemporaryMarker(data.temporaryLatitude, data.temporaryLongitude);
  }
}

async function loadLocationModeStatus() {
  try {
    const snap = await getDoc(doc(db, "system_settings", "global"));
    const el = document.getElementById("locationModeStatus");
    if (!el) return;

    if (!snap.exists()) {
      el.innerHTML = "🟢 Menggunakan lokasi default";
      return;
    }

    const data = snap.data();
    const now = new Date();
    const start = data.temporaryStart ? new Date(data.temporaryStart) : null;
    const end = data.temporaryEnd ? new Date(data.temporaryEnd) : null;
    const active = data.temporaryLocationEnabled && start && end && now >= start && now <= end;

    el.innerHTML = active
      ? `🟣 <b>Lokasi sementara aktif</b><br>Nama: ${escapeHtml(data.temporaryLocationName || "-")}<br>Radius: ${data.temporaryRadius || 100} m`
      : "🟢 Menggunakan lokasi default (kantor/kelurahan)";
  } catch (error) {
    console.error(error);
  }
}

async function initMapMonitoring() {
  map = initMap("map", -7.4706, 110.2177, 12);
  if (!map) return;

  const lokasiSnap = await getDocs(collection(db, "lokasi"));
  lokasiSnap.forEach(d => {
    const data = d.data();
    addMarker(map, data.lat, data.lng, data.nama, data.tipe === "kantor" ? "kantor" : "kelurahan");
  });

  const presensiSnap = await getDocs(query(
    collection(db, "presensi"),
    where("tanggal", "==", currentFilter.tanggal)
  ));
  presensiSnap.forEach(d => {
    const data = d.data();
    if (data.lat != null && data.lng != null) addMarker(map, data.lat, data.lng, data.nama || "User", "user");
  });
}

function startRealtimeListeners() {
  onSnapshot(collection(db, "users"), snapshot => {
    allUsers = snapshot.docs.map(d => ({ uid: d.id, ...d.data() }));
    allUsers.sort((a,b) => String(a.nama || "").localeCompare(String(b.nama || ""), "id"));
    renderUsers();
    invalidateCaches();
    loadStats(true);
  }, console.error);

  onSnapshot(collection(db, "lokasi"), snapshot => {
    allLocations = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    allLocations.sort((a,b) => String(a.nama || "").localeCompare(String(b.nama || ""), "id"));
    renderLocations();
    invalidateCaches();
    loadFilterOptions();
    loadStats(true);
  }, console.error);

  onSnapshot(query(collection(db, "presensi"), where("tanggal", "==", currentFilter.tanggal)), snapshot => {
    invalidateCaches();
    loadStats(true);
    loadPresensi(currentPage);
  }, console.error);
}

window.handleFileSelect = async function(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!/\.(xlsx|xls)$/i.test(file.name)) return alert("Format file harus .xlsx atau .xls");
  if (!confirm(`Import data dari "${file.name}"?`)) return;

  const progressDiv = document.getElementById("importProgress");
  const progressBar = document.getElementById("importProgressBar");
  const status = document.getElementById("importStatus");
  progressDiv.style.display = "block";
  progressBar.style.width = "10%";
  status.textContent = "Membaca file...";
  showLoading(true);

  try {
    const result = await importFromExcel(file, pct => {
      progressBar.style.width = `${pct}%`;
      status.textContent = `Memproses ${pct}%...`;
    });
    progressBar.style.width = "100%";
    status.textContent = "Selesai!";
    alert(`✅ IMPORT SELESAI\n\nUser: ${result.users}\nLokasi: ${result.lokasi}\nDilewati: ${result.skipped}\nError: ${result.errors?.length || 0}`);
    invalidateCaches();
    await loadAllUsers();
    await loadLocations();
    await loadFilterOptions();
    await loadStats(true);
    await loadPresensi(1);
  } catch (error) {
    console.error(error);
    alert("❌ Gagal import: " + error.message);
    status.textContent = "Gagal.";
  } finally {
    showLoading(false);
    event.target.value = "";
    setTimeout(() => progressDiv.style.display = "none", 3000);
  }
};

window.exportData = async function() {
  showLoading(true);
  try { await exportToExcel(currentFilter.tanggal); }
  catch (e) { alert("Gagal export: " + e.message); }
  finally { showLoading(false); }
};

window.downloadTemplate = function() {
  const template = [
    ["USER"],
    ["nama","email","password","role","kecamatan","kelurahan","kota","active","deviceCheckEnabled"],
    ["Budi","budi@mail.com","123456","user","","Magelang Tengah","Magelang",true,true],
    [""],
    ["LOKASI"],
    ["nama","tipe","lat","lng","radius"],
    ["Kantor Pusat","kantor","-7.4706","110.2177",100]
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(template);
  XLSX.utils.book_append_sheet(wb, ws, "USER");
  XLSX.writeFile(wb, "template_import.xlsx");
};

window.addEventListener("load", async () => {
  showLoading(true);
  try {
    document.getElementById("logoutBtn")?.addEventListener("click", logout);
    document.getElementById("filterTanggal").value = currentFilter.tanggal;

    onAuthStateChanged(auth, async user => {
      if (!user) {
        window.location.replace("index.html");
        return;
      }

      const callerDoc = await getDoc(doc(db, "users", user.uid));
      if (!callerDoc.exists() || callerDoc.data().role !== "admin") {
        alert("Akses hanya untuk admin.");
        await signOut(auth);
        window.location.replace("index.html");
        return;
      }

      document.getElementById("adminName").textContent = callerDoc.data().nama || user.email || "Admin";
      startRealtimeListeners();
      await Promise.all([
        loadAllUsers(),
        loadLocations(),
        loadStats(true),
        loadFilterOptions(),
        loadPresensi(1),
        loadTemporaryLocation(),
        loadLocationModeStatus()
      ]);
      initTemporaryMap();
      await initMapMonitoring();
      setTimeout(createPaginationButtons, 300);
    });
  } catch (error) {
    console.error("Admin init:", error);
    alert("Gagal memuat Admin Panel: " + error.message);
  } finally {
    showLoading(false);
  }
});
