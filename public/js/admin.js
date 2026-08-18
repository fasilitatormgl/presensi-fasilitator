import { auth, db } from "./firebase-init.js";

import {
    collection,
    getDocs,
    query,
    where,
    doc,
    updateDoc,
    getDoc,
    setDoc,
    addDoc,
    deleteDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

import {
    signOut
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

import {
    initMap,
    addMarker
} from "./map.js";

import {
    resetUserDevice
} from "./device.js";

import {
    exportToExcel
} from "./export.js";

import {
    importFromExcel
} from "./import.js";


// =====================================================
// KONFIGURASI
// =====================================================

const CACHE_DURATION = 300000;

const dataCache = {
    users: null,
    usersTimestamp: null,

    stats: null,
    statsTimestamp: null,

    kelurahan: null,
    kelurahanTimestamp: null,

    lokasi: null,
    lokasiTimestamp: null
};

let allUsers = [];
let allLocations = [];

let map = null;
let tempMap = null;
let tempMarker = null;
let locationEditMap = null;
let locationEditMarker = null;

let currentFilter = {
    kelurahan: "",
    tanggal: getTodayLocal()
};


// =====================================================
// UTILITAS
// =====================================================

function getTodayLocal() {

    const now = new Date();

    const year = now.getFullYear();

    const month = String(
        now.getMonth() + 1
    ).padStart(2, "0");

    const day = String(
        now.getDate()
    ).padStart(2, "0");

    return `${year}-${month}-${day}`;
}


function getCache(key) {

    const cache = dataCache[key];

    const timestamp =
        dataCache[`${key}Timestamp`];

    if (
        cache &&
        timestamp &&
        Date.now() - timestamp < CACHE_DURATION
    ) {
        return cache;
    }

    return null;
}


function setCache(key, data) {

    dataCache[key] = data;

    dataCache[`${key}Timestamp`] =
        Date.now();
}


function clearCache() {

    Object.keys(dataCache).forEach(key => {
        dataCache[key] = null;
    });

}


function escapeHtml(value) {

    if (
        value === null ||
        value === undefined
    ) {
        return "";
    }

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


// =====================================================
// LOADING
// =====================================================

function showLoading(show) {

    const el =
        document.getElementById("loading");

    if (!el) return;

    el.style.display =
        show ? "flex" : "none";
}


// =====================================================
// LOGOUT
// =====================================================

async function logout() {

    if (!confirm("Yakin ingin keluar?")) {
        return;
    }

    try {

        await signOut(auth);

        localStorage.clear();

        window.location.href =
            "index.html";

    } catch (error) {

        alert(
            "Gagal keluar: " +
            error.message
        );

    }
}


// =====================================================
// INIT
// =====================================================

window.addEventListener(
    "load",
    async () => {

        showLoading(true);

        try {

            const logoutBtn =
                document.getElementById(
                    "logoutBtn"
                );

            if (logoutBtn) {

                logoutBtn.addEventListener(
                    "click",
                    logout
                );

            }


            const filterTanggal =
                document.getElementById(
                    "filterTanggal"
                );

            if (filterTanggal) {

                filterTanggal.value =
                    currentFilter.tanggal;

            }


            await loadAdminInfo();

            await loadUsers();

            await loadStats();

            await loadFilterOptions();

            await loadPresensi();

            initTemporaryMap();

            await loadTemporaryLocation();

            await loadLocationModeStatus();

            await initMapMonitoring();


        } catch (error) {

            console.error(
                "Error init:",
                error
            );

            alert(
                "Gagal memuat data: " +
                error.message
            );

        } finally {

            showLoading(false);

        }

    }
);


// =====================================================
// ADMIN INFO
// =====================================================

async function loadAdminInfo() {

    try {

        if (!auth.currentUser) {
            return;
        }

        const snap =
            await getDoc(
                doc(
                    db,
                    "users",
                    auth.currentUser.uid
                )
            );

        if (!snap.exists()) {
            return;
        }

        const data =
            snap.data();

        const name =
            document.getElementById(
                "adminName"
            );

        if (name) {

            name.textContent =
                data.nama ||
                auth.currentUser.displayName ||
                "Admin";

        }

    } catch (error) {

        console.log(
            "Admin info gagal:",
            error
        );

    }
}


// =====================================================
// LOAD USERS
// =====================================================

async function loadUsers(force = false) {

    try {

        if (!force) {

            const cached =
                getCache("users");

            if (cached) {

                allUsers =
                    cached;

                return;

            }

        }


        const snapshot =
            await getDocs(
                collection(
                    db,
                    "users"
                )
            );


        allUsers = [];

        snapshot.forEach(
            userDoc => {

                const data =
                    userDoc.data();

                allUsers.push({

                    id: userDoc.id,

                    uid:
                        data.uid ||
                        userDoc.id,

                    ...data

                });

            }
        );


        allUsers.sort(
            (a, b) =>
                String(
                    a.nama || ""
                ).localeCompare(
                    String(
                        b.nama || ""
                    )
                )
        );


        setCache(
            "users",
            allUsers
        );


        updateUserCount();


    } catch (error) {

        console.error(
            "Error load users:",
            error
        );

        throw error;

    }
}


function updateUserCount() {

    const el =
        document.getElementById(
            "adminMenuInfo"
        );

    if (!el) return;

    el.textContent =
        `${allUsers.length} user tersimpan di Firestore.`;

}


// =====================================================
// STATISTIK
// =====================================================

async function loadStats(force = false) {

    try {

        if (!force) {

            const cached =
                getCache("stats");

            if (cached) {

                updateStatsUI(
                    cached
                );

                return;

            }

        }


        const [
            usersSnap,
            kelurahanSnap,
            presensiSnap
        ] = await Promise.all([

            getDocs(
                collection(
                    db,
                    "users"
                )
            ),

            getDocs(
                query(
                    collection(
                        db,
                        "lokasi"
                    ),
                    where(
                        "tipe",
                        "==",
                        "kelurahan"
                    )
                )
            ),

            getDocs(
                query(
                    collection(
                        db,
                        "presensi"
                    ),
                    where(
                        "tanggal",
                        "==",
                        currentFilter.tanggal
                    )
                )
            )

        ]);


        const stats = {

            totalUser:
                usersSnap.size,

            totalKelurahan:
                kelurahanSnap.size,

            hadirHariIni:
                presensiSnap.size,

            belumHadir:
                Math.max(
                    0,
                    usersSnap.size -
                    presensiSnap.size
                )

        };


        setCache(
            "stats",
            stats
        );


        updateStatsUI(
            stats
        );


    } catch (error) {

        console.error(
            "Error load stats:",
            error
        );

    }
}


function updateStatsUI(stats) {

    const totalUser =
        document.getElementById(
            "totalUser"
        );

    const totalKelurahan =
        document.getElementById(
            "totalKelurahan"
        );

    const hadir =
        document.getElementById(
            "hadirHariIni"
        );

    const belum =
        document.getElementById(
            "belumHadir"
        );


    if (totalUser) {
        totalUser.textContent =
            stats.totalUser;
    }

    if (totalKelurahan) {
        totalKelurahan.textContent =
            stats.totalKelurahan;
    }

    if (hadir) {
        hadir.textContent =
            stats.hadirHariIni;
    }

    if (belum) {
        belum.textContent =
            stats.belumHadir;
    }

}


// =====================================================
// FILTER KELURAHAN
// =====================================================

async function loadFilterOptions() {

    try {

        let list =
            getCache(
                "kelurahan"
            );


        if (!list) {

            const snapshot =
                await getDocs(
                    query(
                        collection(
                            db,
                            "lokasi"
                        ),
                        where(
                            "tipe",
                            "==",
                            "kelurahan"
                        )
                    )
                );


            list = [];

            snapshot.forEach(
                locationDoc => {

                    const data =
                        locationDoc.data();

                    if (data.nama) {

                        list.push(
                            data.nama
                        );

                    }

                }
            );


            list =
                [...new Set(list)]
                .sort();


            setCache(
                "kelurahan",
                list
            );

        }


        const select =
            document.getElementById(
                "filterKelurahan"
            );

        if (!select) return;


        select.innerHTML =
            `<option value="">
                Semua Kelurahan
            </option>`;


        list.forEach(
            nama => {

                const option =
                    document.createElement(
                        "option"
                    );

                option.value =
                    nama;

                option.textContent =
                    nama;

                select.appendChild(
                    option
                );

            }
        );


    } catch (error) {

        console.error(
            "Error filter:",
            error
        );

    }
}


// =====================================================
// LOAD PRESENSI
// =====================================================

async function loadPresensi() {

    try {

        showLoading(true);


        let users =
            allUsers;


        if (
            currentFilter.kelurahan
        ) {

            users =
                users.filter(
                    user =>
                        user.kelurahan ===
                        currentFilter.kelurahan
                );

        }


        const presensiSnap =
            await getDocs(
                query(
                    collection(
                        db,
                        "presensi"
                    ),
                    where(
                        "tanggal",
                        "==",
                        currentFilter.tanggal
                    )
                )
            );


        const presensiMap =
            new Map();


        presensiSnap.forEach(
            presensiDoc => {

                const data =
                    presensiDoc.data();

                if (data.uid) {

                    presensiMap.set(
                        data.uid,
                        {
                            id:
                                presensiDoc.id,
                            ...data
                        }
                    );

                }

            }
        );


        renderTabel(
            users,
            presensiMap
        );


    } catch (error) {

        console.error(
            "Error load presensi:",
            error
        );

    } finally {

        showLoading(false);

    }
}


// =====================================================
// RENDER TABEL
// =====================================================

function renderTabel(
    users,
    presensiMap
) {

    const tbody =
        document.getElementById(
            "tableBody"
        );

    if (!tbody) return;


    if (users.length === 0) {

        tbody.innerHTML = `
            <tr>
                <td
                    colspan="8"
                    class="text-center">
                    Tidak ada data user
                </td>
            </tr>
        `;

        return;

    }


    let html = "";


    users.forEach(
        (user, index) => {

            const p =
                presensiMap.get(
                    user.uid
                );


            const status =
                p
                    ? "Hadir"
                    : "Belum";


            let waktu = "-";


            if (
                p &&
                p.waktu
            ) {

                if (
                    p.waktu.seconds
                ) {

                    waktu =
                        new Date(
                            p.waktu.seconds *
                            1000
                        ).toLocaleTimeString(
                            "id-ID"
                        );

                }

            }


            const lokasi =
                p
                    ? (
                        p.lokasi ===
                        "kantor"
                            ? "Kantor"
                            : (
                                p.lokasi ||
                                "-"
                            )
                    )
                    : "-";


            let roleBadge = "";


            if (
                user.role ===
                "admin"
            ) {

                roleBadge =
                    `<span style="
                        background:#3498DB;
                        color:white;
                        padding:2px 6px;
                        border-radius:10px;
                        font-size:10px;
                    ">
                        👑 Admin
                    </span>`;

            } else if (
                user.role ===
                "koordinator"
            ) {

                roleBadge =
                    `<span style="
                        background:#F39C12;
                        color:white;
                        padding:2px 6px;
                        border-radius:10px;
                        font-size:10px;
                    ">
                        📋 Koord
                    </span>`;

            } else {

                roleBadge =
                    `<span style="
                        background:#95A5A6;
                        color:white;
                        padding:2px 6px;
                        border-radius:10px;
                        font-size:10px;
                    ">
                        👤 User
                    </span>`;

            }


            html += `
                <tr>

                    <td>
                        ${index + 1}
                    </td>

                    <td>
                        ${escapeHtml(
                            user.nama || "-"
                        )}
                        ${roleBadge}
                    </td>

                    <td>
                        ${escapeHtml(
                            user.kelurahan || "-"
                        )}
                    </td>

                    <td>

                        <span style="
                            background:
                                ${p
                                    ? "#E8F5E9"
                                    : "#FFEBEE"};
                            color:
                                ${p
                                    ? "#27AE60"
                                    : "#E74C3C"};
                            padding:3px 8px;
                            border-radius:12px;
                        ">

                            ${status}

                        </span>

                    </td>

                    <td>
                        ${waktu}
                    </td>

                    <td>
                        ${escapeHtml(
                            lokasi
                        )}
                    </td>

                    <td>
                        ${user.deviceId
                            ? "📱"
                            : "📱-"}
                    </td>

                    <td>

                        <button
                            class="btn-edit"
                            onclick="editUser('${user.id}')">
                            ✏️
                        </button>

                        <button
                            onclick="resetDevice('${user.uid}')"
                            style="
                                background:none;
                                border:none;
                                color:#EE2737;
                                cursor:pointer;
                            ">
                            ⟲
                        </button>

                    </td>

                </tr>
            `;

        }
    );


    tbody.innerHTML =
        html;

}


// =====================================================
// TAMBAH / EDIT USER
// =====================================================

window.openAddUserModal =
    function() {

        document.getElementById(
            "userModalTitle"
        ).textContent =
            "👤 Tambah User";


        document.getElementById(
            "userDocId"
        ).value = "";


        document.getElementById(
            "userUid"
        ).value = "";


        document.getElementById(
            "userNama"
        ).value = "";


        document.getElementById(
            "userEmail"
        ).value = "";


        document.getElementById(
            "userPassword"
        ).value = "";


        document.getElementById(
            "userRole"
        ).value = "user";


        document.getElementById(
            "userKecamatan"
        ).value = "";


        document.getElementById(
            "userKelurahan"
        ).value = "";


        document.getElementById(
            "userKota"
        ).value = "";


        document.getElementById(
            "userActive"
        ).value = "true";


        document.getElementById(
            "userDeviceCheck"
        ).value = "true";


        document.getElementById(
            "userModal"
        ).classList.add(
            "show"
        );

    };


window.editUser =
    function(id) {

        const user =
            allUsers.find(
                item =>
                    item.id === id
            );


        if (!user) {

            alert(
                "Data user tidak ditemukan."
            );

            return;

        }


        document.getElementById(
            "userModalTitle"
        ).textContent =
            "✏️ Edit User";


        document.getElementById(
            "userDocId"
        ).value =
            user.id;


        document.getElementById(
            "userUid"
        ).value =
            user.uid ||
            user.id;


        document.getElementById(
            "userNama"
        ).value =
            user.nama || "";


        document.getElementById(
            "userEmail"
        ).value =
            user.email || "";


        document.getElementById(
            "userPassword"
        ).value =
            user.password || "";


        document.getElementById(
            "userRole"
        ).value =
            user.role || "user";


        document.getElementById(
            "userKecamatan"
        ).value =
            user.kecamatan || "";


        document.getElementById(
            "userKelurahan"
        ).value =
            user.kelurahan || "";


        document.getElementById(
            "userKota"
        ).value =
            user.kota || "";


        document.getElementById(
            "userActive"
        ).value =
            user.active === false
                ? "false"
                : "true";


        document.getElementById(
            "userDeviceCheck"
        ).value =
            user.deviceCheckEnabled === false
                ? "false"
                : "true";


        document.getElementById(
            "userModal"
        ).classList.add(
            "show"
        );

    };


window.closeUserModal =
    function() {

        document.getElementById(
            "userModal"
        ).classList.remove(
            "show"
        );

    };


// =====================================================
// SIMPAN USER
// =====================================================

window.saveUser =
    async function() {

        const docId =
            document.getElementById(
                "userDocId"
            ).value.trim();


        const uid =
            document.getElementById(
                "userUid"
            ).value.trim();


        const nama =
            document.getElementById(
                "userNama"
            ).value.trim();


        const email =
            document.getElementById(
                "userEmail"
            ).value.trim();


        const password =
            document.getElementById(
                "userPassword"
            ).value;


        const role =
            document.getElementById(
                "userRole"
            ).value;


        const kecamatan =
            document.getElementById(
                "userKecamatan"
            ).value.trim();


        const kelurahan =
            document.getElementById(
                "userKelurahan"
            ).value.trim();


        const kota =
            document.getElementById(
                "userKota"
            ).value.trim();


        const active =
            document.getElementById(
                "userActive"
            ).value === "true";


        const deviceCheckEnabled =
            document.getElementById(
                "userDeviceCheck"
            ).value === "true";


        if (!nama) {

            alert(
                "Nama wajib diisi."
            );

            return;

        }


        if (!email) {

            alert(
                "Email wajib diisi."
            );

            return;

        }


        try {

            showLoading(true);


            const userData = {

                uid:
                    uid || docId,

                nama,

                email,

                role,

                kecamatan,

                kelurahan,

                kota,

                active,

                deviceCheckEnabled,

                updatedAt:
                    serverTimestamp()

            };


            /*
             * Password hanya disimpan jika memang
             * aplikasi lama kamu membutuhkannya.
             *
             * Firebase Authentication tidak diubah
             * oleh script ini.
             */

            if (password) {

                userData.password =
                    password;

            }


            if (docId) {

                await updateDoc(
                    doc(
                        db,
                        "users",
                        docId
                    ),
                    userData
                );


                alert(
                    "✅ User berhasil diperbarui."
                );

            } else {

                userData.createdAt =
                    serverTimestamp();


                const newDoc =
                    await addDoc(
                        collection(
                            db,
                            "users"
                        ),
                        userData
                    );


                /*
                 * Kalau UID kosong, gunakan ID dokumen
                 * sebagai uid Firestore.
                 */

                if (!uid) {

                    await updateDoc(
                        newDoc,
                        {
                            uid:
                                newDoc.id
                        }
                    );

                }


                alert(
                    "✅ Data user berhasil ditambahkan ke Firestore."
                );

            }


            clearCache();

            await loadUsers(true);

            await loadStats(true);

            await loadFilterOptions();

            await loadPresensi();


            closeUserModal();


        } catch (error) {

            console.error(
                "Gagal save user:",
                error
            );

            alert(
                "❌ Gagal: " +
                error.message
            );

        } finally {

            showLoading(false);

        }

    };


// =====================================================
// USER MANAGER
// =====================================================

window.openUserManager =
    async function() {

        document.getElementById(
            "userManagerModal"
        ).classList.add(
            "show"
        );


        await loadUserManager();

    };


window.closeUserManager =
    function() {

        document.getElementById(
            "userManagerModal"
        ).classList.remove(
            "show"
        );

    };


async function loadUserManager() {

    const list =
        document.getElementById(
            "userManagerList"
        );


    if (!list) return;


    if (allUsers.length === 0) {

        list.innerHTML =
            "Tidak ada user.";

        return;

    }


    renderUserManager(
        allUsers
    );

}


function renderUserManager(
    users
) {

    const list =
        document.getElementById(
            "userManagerList"
        );


    if (!list) return;


    if (users.length === 0) {

        list.innerHTML =
            "Tidak ada user.";

        return;

    }


    let html = "";


    users.forEach(
        user => {

            html += `
                <div style="
                    border:1px solid #eee;
                    border-radius:10px;
                    padding:12px;
                    margin-bottom:10px;
                ">

                    <div style="
                        font-weight:bold;
                    ">
                        ${escapeHtml(
                            user.nama || "-"
                        )}
                    </div>

                    <div style="
                        font-size:12px;
                        color:#777;
                        margin-top:4px;
                    ">

                        ${escapeHtml(
                            user.email || "-"
                        )}

                        <br>

                        Role:
                        ${escapeHtml(
                            user.role || "user"
                        )}

                        <br>

                        Kelurahan:
                        ${escapeHtml(
                            user.kelurahan || "-"
                        )}

                        <br>

                        Status:
                        ${
                            user.active === false
                                ? "🔴 Nonaktif"
                                : "🟢 Aktif"
                        }

                    </div>

                    <div style="
                        margin-top:8px;
                    ">

                        <button
                            class="btn-edit"
                            onclick="editUserFromManager('${user.id}')">
                            ✏️ Edit
                        </button>

                        <button
                            class="btn-location"
                            onclick="resetDevice('${user.uid}')">
                            📱 Reset Device
                        </button>

                    </div>

                </div>
            `;

        }
    );


    list.innerHTML =
        html;

}


window.editUserFromManager =
    function(id) {

        closeUserManager();

        setTimeout(
            () => {

                editUser(id);

            },
            100
        );

    };


window.filterUserManager =
    function() {

        const input =
            document.getElementById(
                "userSearch"
            );


        const keyword =
            input
                ? input.value
                    .trim()
                    .toLowerCase()
                : "";


        const filtered =
            allUsers.filter(
                user => {

                    const text =
                        [
                            user.nama,
                            user.email,
                            user.kelurahan,
                            user.kecamatan,
                            user.role,
                            user.uid
                        ]
                        .join(" ")
                        .toLowerCase();


                    return text.includes(
                        keyword
                    );

                }
            );


        renderUserManager(
            filtered
        );

    };


// =====================================================
// LOCATION MANAGER
// =====================================================

window.openLocationManager =
    async function() {

        document.getElementById(
            "locationModal"
        ).classList.add(
            "show"
        );


        resetLocationForm();

        await loadLocations();

        initLocationEditMap();

    };


window.closeLocationManager =
    function() {

        document.getElementById(
            "locationModal"
        ).classList.remove(
            "show"
        );

    };


function resetLocationForm() {

    document.getElementById(
        "locationDocId"
    ).value = "";


    document.getElementById(
        "locationName"
    ).value = "";


    document.getElementById(
        "locationType"
    ).value = "kelurahan";


    document.getElementById(
        "locationLat"
    ).value = "";


    document.getElementById(
        "locationLng"
    ).value = "";


    document.getElementById(
        "locationRadius"
    ).value = "100";

}


async function loadLocations() {

    try {

        const snapshot =
            await getDocs(
                collection(
                    db,
                    "lokasi"
                )
            );


        allLocations = [];


        snapshot.forEach(
            locationDoc => {

                allLocations.push({

                    id:
                        locationDoc.id,

                    ...locationDoc.data()

                });

            }
        );


        allLocations.sort(
            (a, b) =>
                String(
                    a.nama || ""
                ).localeCompare(
                    String(
                        b.nama || ""
                    )
                )
        );


        renderLocationList();


    } catch (error) {

        console.error(
            "Load lokasi error:",
            error
        );


        const list =
            document.getElementById(
                "locationList"
            );


        if (list) {

            list.innerHTML =
                "❌ Gagal memuat lokasi.";

        }

    }

}


function renderLocationList() {

    const list =
        document.getElementById(
            "locationList"
        );


    if (!list) return;


    if (allLocations.length === 0) {

        list.innerHTML =
            "Belum ada lokasi.";

        return;

    }


    let html = "";


    allLocations.forEach(
        location => {

            html += `
                <div class="location-item">

                    <div class="location-item-title">
                        📍
                        ${escapeHtml(
                            location.nama ||
                            "-"
                        )}
                    </div>

                    <div class="location-item-info">

                        Tipe:
                        ${escapeHtml(
                            location.tipe ||
                            "-"
                        )}

                        <br>

                        Koordinat:
                        ${location.lat ?? "-"},
                        ${location.lng ?? "-"}

                        <br>

                        Radius:
                        ${location.radius || 100}
                        meter

                    </div>

                    <div style="
                        margin-top:8px;
                    ">

                        <button
                            class="btn-edit"
                            onclick="editLocation('${location.id}')">

                            ✏️ Edit

                        </button>

                        <button
                            class="btn-delete-small"
                            onclick="deleteLocation('${location.id}')">

                            🗑️ Hapus

                        </button>

                    </div>

                </div>
            `;

        }
    );


    list.innerHTML =
        html;

}


// =====================================================
// EDIT LOCATION
// =====================================================

window.editLocation =
    function(id) {

        const location =
            allLocations.find(
                item =>
                    item.id === id
            );


        if (!location) {

            alert(
                "Lokasi tidak ditemukan."
            );

            return;

        }


        document.getElementById(
            "locationDocId"
        ).value =
            location.id;


        document.getElementById(
            "locationName"
        ).value =
            location.nama || "";


        document.getElementById(
            "locationType"
        ).value =
            location.tipe ||
            "kelurahan";


        document.getElementById(
            "locationLat"
        ).value =
            location.lat ?? "";


        document.getElementById(
            "locationLng"
        ).value =
            location.lng ?? "";


        document.getElementById(
            "locationRadius"
        ).value =
            location.radius ||
            100;


        setLocationEditMarker(
            location.lat,
            location.lng
        );

    };


// =====================================================
// MAP EDIT LOCATION
// =====================================================

function initLocationEditMap() {

    const el =
        document.getElementById(
            "locationEditMap"
        );


    if (!el) return;


    if (
        typeof L ===
        "undefined"
    ) {
        return;
    }


    if (locationEditMap) {

        locationEditMap.remove();

    }


    locationEditMap =
        L.map(
            "locationEditMap"
        ).setView(
            [-7.4706, 110.2177],
            13
        );


    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            attribution:
                "&copy; OpenStreetMap"
        }
    ).addTo(
        locationEditMap
    );


    locationEditMap.on(
        "click",
        event => {

            setLocationEditMarker(
                event.latlng.lat,
                event.latlng.lng
            );

        }
    );

}


function setLocationEditMarker(
    lat,
    lng
) {

    lat =
        parseFloat(lat);

    lng =
        parseFloat(lng);


    if (
        isNaN(lat) ||
        isNaN(lng) ||
        !locationEditMap
    ) {
        return;
    }


    if (locationEditMarker) {

        locationEditMap.removeLayer(
            locationEditMarker
        );

    }


    locationEditMarker =
        L.marker(
            [lat, lng]
        ).addTo(
            locationEditMap
        );


    locationEditMap.setView(
        [lat, lng],
        16
    );


    const latEl =
        document.getElementById(
            "locationLat"
        );


    const lngEl =
        document.getElementById(
            "locationLng"
        );


    if (latEl) {
        latEl.value =
            lat;
    }


    if (lngEl) {
        lngEl.value =
            lng;
    }

}


window.useLocationGPS =
    function() {

        if (
            !navigator.geolocation
        ) {

            alert(
                "Browser tidak mendukung GPS."
            );

            return;

        }


        navigator.geolocation.getCurrentPosition(

            position => {

                setLocationEditMarker(

                    position.coords.latitude,

                    position.coords.longitude

                );

            },

            error => {

                alert(
                    "Gagal mengambil lokasi: " +
                    error.message
                );

            },

            {
                enableHighAccuracy: true,
                timeout: 10000
            }

        );

    };


// =====================================================
// SAVE LOCATION
// =====================================================

window.saveLocation =
    async function() {

        const id =
            document.getElementById(
                "locationDocId"
            ).value.trim();


        const nama =
            document.getElementById(
                "locationName"
            ).value.trim();


        const tipe =
            document.getElementById(
                "locationType"
            ).value;


        const lat =
            parseFloat(
                document.getElementById(
                    "locationLat"
                ).value
            );


        const lng =
            parseFloat(
                document.getElementById(
                    "locationLng"
                ).value
            );


        const radius =
            parseInt(
                document.getElementById(
                    "locationRadius"
                ).value
            ) || 100;


        if (!nama) {

            alert(
                "Nama lokasi wajib diisi."
            );

            return;

        }


        if (
            isNaN(lat) ||
            isNaN(lng)
        ) {

            alert(
                "Latitude dan longitude wajib diisi."
            );

            return;

        }


        try {

            showLoading(true);


            const locationData = {

                nama,

                tipe,

                lat,

                lng,

                radius,

                updatedAt:
                    serverTimestamp()

            };


            if (id) {

                await updateDoc(
                    doc(
                        db,
                        "lokasi",
                        id
                    ),
                    locationData
                );


                alert(
                    "✅ Lokasi berhasil diperbarui."
                );

            } else {

                locationData.createdAt =
                    serverTimestamp();


                await addDoc(
                    collection(
                        db,
                        "lokasi"
                    ),
                    locationData
                );


                alert(
                    "✅ Lokasi berhasil ditambahkan."
                );

            }


            clearCache();

            await loadLocations();

            await loadFilterOptions();

            await loadStats(true);

            resetLocationForm();

            await initMapMonitoring();


        } catch (error) {

            console.error(
                "Save lokasi:",
                error
            );


            alert(
                "❌ Gagal: " +
                error.message
            );

        } finally {

            showLoading(false);

        }

    };


// =====================================================
// DELETE LOCATION
// =====================================================

window.deleteLocation =
    async function(id) {

        const location =
            allLocations.find(
                item =>
                    item.id === id
            );


        if (!location) {
            return;
        }


        if (
            !confirm(
                `Hapus lokasi "${location.nama}"?`
            )
        ) {
            return;
        }


        try {

            showLoading(true);


            await deleteDoc(
                doc(
                    db,
                    "lokasi",
                    id
                )
            );


            alert(
                "✅ Lokasi berhasil dihapus."
            );


            clearCache();

            await loadLocations();

            await loadFilterOptions();

            await loadStats(true);

            await initMapMonitoring();


        } catch (error) {

            console.error(
                "Delete lokasi:",
                error
            );


            alert(
                "❌ Gagal menghapus: " +
                error.message
            );

        } finally {

            showLoading(false);

        }

    };


// =====================================================
// REFRESH
// =====================================================

window.refreshAdminData =
    async function() {

        try {

            showLoading(true);

            clearCache();

            await loadUsers(true);

            await loadStats(true);

            await loadFilterOptions();

            await loadPresensi();

            await loadLocations();

            await loadLocationModeStatus();

            await initMapMonitoring();

            alert(
                "✅ Data berhasil diperbarui."
            );

        } catch (error) {

            alert(
                "❌ Refresh gagal: " +
                error.message
            );

        } finally {

            showLoading(false);

        }

    };


// =====================================================
// RESET DEVICE
// =====================================================

window.resetDevice =
    async function(uid) {

        if (
            !uid ||
            uid === "undefined"
        ) {

            alert(
                "❌ UID user tidak valid."
            );

            return;

        }


        if (
            !confirm(
                "⚠️ Yakin ingin reset device user ini?"
            )
        ) {

            return;

        }


        try {

            showLoading(true);


            const result =
                await resetUserDevice(
                    uid
                );


            if (
                result &&
                result.success
            ) {

                alert(
                    "✅ Device berhasil direset."
                );

            } else {

                throw new Error(
                    result?.message ||
                    "Reset device gagal."
                );

            }


            clearCache();

            await loadUsers(true);

            await loadPresensi();


        } catch (error) {

            console.error(
                error
            );


            alert(
                "❌ Gagal: " +
                error.message
            );

        } finally {

            showLoading(false);

        }

    };


// =====================================================
// RESET SEMUA DEVICE
// =====================================================

window.resetAllDevices =
    async function() {

        if (
            !confirm(
                "⚠️ RESET SEMUA DEVICE USER?"
            )
        ) {

            return;

        }


        try {

            showLoading(true);


            const snapshot =
                await getDocs(
                    collection(
                        db,
                        "users"
                    )
                );


            let success = 0;


            for (
                const userDoc
                of snapshot.docs
            ) {

                await updateDoc(
                    doc(
                        db,
                        "users",
                        userDoc.id
                    ),
                    {

                        deviceId:
                            null,

                        deviceResetAt:
                            serverTimestamp()

                    }
                );


                success++;

            }


            alert(
                `✅ ${success} user berhasil direset device.`
            );


            clearCache();

            await loadUsers(true);

            await loadPresensi();


        } catch (error) {

            console.error(
                error
            );


            alert(
                "❌ Gagal: " +
                error.message
            );

        } finally {

            showLoading(false);

        }

    };


// =====================================================
// LOKASI SEMENTARA
// =====================================================

function initTemporaryMap() {

    const tempMapDiv =
        document.getElementById(
            "tempMap"
        );


    if (!tempMapDiv) return;


    if (
        typeof L ===
        "undefined"
    ) {

        return;

    }


    if (tempMap) {

        tempMap.remove();

    }


    tempMap =
        L.map(
            "tempMap"
        ).setView(
            [-7.4706, 110.2177],
            13
        );


    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            attribution:
                "&copy; OpenStreetMap"
        }
    ).addTo(
        tempMap
    );


    tempMap.on(
        "click",
        event => {

            setTemporaryMarker(
                event.latlng.lat,
                event.latlng.lng
            );

        }
    );

}


function setTemporaryMarker(
    lat,
    lng
) {

    const latInput =
        document.getElementById(
            "tempLat"
        );


    const lngInput =
        document.getElementById(
            "tempLng"
        );


    if (latInput) {
        latInput.value =
            lat;
    }


    if (lngInput) {
        lngInput.value =
            lng;
    }


    if (tempMarker) {

        tempMap.removeLayer(
            tempMarker
        );

    }


    tempMarker =
        L.marker(
            [lat, lng]
        ).addTo(
            tempMap
        );


    tempMap.setView(
        [lat, lng],
        16
    );

}


window.useCurrentAdminLocation =
    function() {

        if (
            !navigator.geolocation
        ) {

            alert(
                "Browser tidak mendukung GPS."
            );

            return;

        }


        navigator.geolocation.getCurrentPosition(

            position => {

                setTemporaryMarker(

                    position.coords.latitude,

                    position.coords.longitude

                );

            },

            () => {

                alert(
                    "Gagal mengambil lokasi."
                );

            }

        );

    };


window.saveTemporaryLocation =
    async function() {

        try {

            const name =
                document.getElementById(
                    "tempLocationName"
                ).value.trim();


            const lat =
                parseFloat(
                    document.getElementById(
                        "tempLat"
                    ).value
                );


            const lng =
                parseFloat(
                    document.getElementById(
                        "tempLng"
                    ).value
                );


            const radius =
                parseInt(
                    document.getElementById(
                        "tempRadius"
                    ).value
                ) || 100;


            const start =
                document.getElementById(
                    "tempStart"
                ).value;


            const end =
                document.getElementById(
                    "tempEnd"
                ).value;


            if (
                isNaN(lat) ||
                isNaN(lng)
            ) {

                alert(
                    "Pilih titik lokasi terlebih dahulu."
                );

                return;

            }


            if (!start || !end) {

                alert(
                    "Isi waktu mulai dan selesai."
                );

                return;

            }


            if (
                new Date(end) <=
                new Date(start)
            ) {

                alert(
                    "Waktu selesai harus lebih besar dari waktu mulai."
                );

                return;

            }


            showLoading(true);


            await setDoc(

                doc(
                    db,
                    "system_settings",
                    "global"
                ),

                {

                    temporaryLocationEnabled:
                        true,

                    statusLokasi:
                        "custom",

                    temporaryLocationName:
                        name,

                    temporaryLatitude:
                        lat,

                    temporaryLongitude:
                        lng,

                    temporaryRadius:
                        radius,

                    temporaryStart:
                        start,

                    temporaryEnd:
                        end,

                    updatedAt:
                        serverTimestamp()

                },

                {
                    merge: true
                }

            );


            alert(
                "✅ Lokasi sementara berhasil diaktifkan."
            );


            await loadLocationModeStatus();


        } catch (error) {

            alert(
                "❌ Gagal menyimpan: " +
                error.message
            );

        } finally {

            showLoading(false);

        }

    };


window.disableTemporaryLocation =
    async function() {

        if (
            !confirm(
                "Kembalikan ke lokasi normal?"
            )
        ) {

            return;

        }


        try {

            showLoading(true);


            await updateDoc(

                doc(
                    db,
                    "system_settings",
                    "global"
                ),

                {

                    temporaryLocationEnabled:
                        false,

                    statusLokasi:
                        "default",

                    updatedAt:
                        serverTimestamp()

                }

            );


            alert(
                "✅ Lokasi normal dipulihkan."
            );


            await loadLocationModeStatus();


        } catch (error) {

            alert(
                "❌ Gagal: " +
                error.message
            );

        } finally {

            showLoading(false);

        }

    };


async function loadTemporaryLocation() {

    try {

        const snap =
            await getDoc(
                doc(
                    db,
                    "system_settings",
                    "global"
                )
            );


        if (
            !snap.exists()
        ) {

            return;

        }


        const data =
            snap.data();


        if (
            data.temporaryLocationEnabled
        ) {

            document.getElementById(
                "tempLocationName"
            ).value =
                data.temporaryLocationName ||
                "";


            document.getElementById(
                "tempRadius"
            ).value =
                data.temporaryRadius ||
                100;


            document.getElementById(
                "tempStart"
            ).value =
                data.temporaryStart ||
                "";


            document.getElementById(
                "tempEnd"
            ).value =
                data.temporaryEnd ||
                "";


            if (
                data.temporaryLatitude !==
                    undefined &&
                data.temporaryLongitude !==
                    undefined
            ) {

                setTemporaryMarker(
                    data.temporaryLatitude,
                    data.temporaryLongitude
                );

            }

        }

    } catch (error) {

        console.log(
            "Lokasi sementara tidak ditemukan."
        );

    }

}


// =====================================================
// STATUS LOKASI
// =====================================================

async function loadLocationModeStatus() {

    try {

        const snap =
            await getDoc(
                doc(
                    db,
                    "system_settings",
                    "global"
                )
            );


        const el =
            document.getElementById(
                "locationModeStatus"
            );


        if (!el) return;


        if (
            !snap.exists()
        ) {

            el.innerHTML =
                "⚪ Menggunakan lokasi default.";

            return;

        }


        const data =
            snap.data();


        const now =
            new Date();


        const start =
            data.temporaryStart
                ? new Date(
                    data.temporaryStart
                )
                : null;


        const end =
            data.temporaryEnd
                ? new Date(
                    data.temporaryEnd
                )
                : null;


        const active =
            data.temporaryLocationEnabled &&
            start &&
            end &&
            now >= start &&
            now <= end;


        if (active) {

            el.innerHTML = `

                🟣
                <b>
                    Lokasi sementara aktif
                </b>

                <br>

                Nama:
                ${escapeHtml(
                    data.temporaryLocationName ||
                    "-"
                )}

                <br>

                Radius:
                ${data.temporaryRadius || 100}
                meter

            `;

        } else {

            el.innerHTML =
                "🟢 Menggunakan lokasi default (kantor/kelurahan).";

        }

    } catch (error) {

        console.error(
            error
        );

    }

}


// =====================================================
// FILTER PRESENSI
// =====================================================

window.applyFilter =
    function() {

        const kelurahan =
            document.getElementById(
                "filterKelurahan"
            );


        const tanggal =
            document.getElementById(
                "filterTanggal"
            );


        if (kelurahan) {

            currentFilter.kelurahan =
                kelurahan.value;

        }


        if (tanggal) {

            currentFilter.tanggal =
                tanggal.value;

        }


        clearCache();

        loadStats(true);

        loadPresensi();

    };


window.resetFilter =
    function() {

        currentFilter.kelurahan =
            "";


        currentFilter.tanggal =
            getTodayLocal();


        const kelurahan =
            document.getElementById(
                "filterKelurahan"
            );


        const tanggal =
            document.getElementById(
                "filterTanggal"
            );


        if (kelurahan) {

            kelurahan.value =
                "";

        }


        if (tanggal) {

            tanggal.value =
                currentFilter.tanggal;

        }


        clearCache();

        loadStats(true);

        loadPresensi();

    };


// =====================================================
// MAP MONITORING
// =====================================================

async function initMapMonitoring() {

    try {

        const mapEl =
            document.getElementById(
                "map"
            );


        if (!mapEl) return;


        if (map) {

            map.remove();

        }


        map =
            initMap(
                "map",
                -7.4706,
                110.2177,
                12
            );


        if (!map) return;


        const lokasiSnap =
            await getDocs(
                collection(
                    db,
                    "lokasi"
                )
            );


        lokasiSnap.forEach(
            locationDoc => {

                const data =
                    locationDoc.data();


                if (
                    data.lat !== undefined &&
                    data.lng !== undefined
                ) {

                    addMarker(

                        map,

                        data.lat,

                        data.lng,

                        data.nama ||
                            "Lokasi",

                        data.tipe ===
                            "kantor"
                            ? "kantor"
                            : "kelurahan"

                    );

                }

            }
        );


        const presensiSnap =
            await getDocs(
                query(
                    collection(
                        db,
                        "presensi"
                    ),
                    where(
                        "tanggal",
                        "==",
                        currentFilter.tanggal
                    )
                )
            );


        presensiSnap.forEach(
            presensiDoc => {

                const data =
                    presensiDoc.data();


                if (
                    data.lat &&
                    data.lng
                ) {

                    addMarker(

                        map,

                        data.lat,

                        data.lng,

                        data.nama ||
                            "User",

                        "user"

                    );

                }

            }
        );


    } catch (error) {

        console.error(
            "Map monitoring:",
            error
        );

    }

}


// =====================================================
// IMPORT EXCEL
// =====================================================

window.handleFileSelect =
    async function(event) {

        const file =
            event.target.files[0];


        if (!file) return;


        if (
            !file.name.match(
                /\.(xlsx|xls)$/
            )
        ) {

            alert(
                "❌ Format file harus .xlsx atau .xls."
            );

            return;

        }


        if (
            !confirm(
                `Import data dari "${file.name}"?`
            )
        ) {

            return;

        }


        const progressDiv =
            document.getElementById(
                "importProgress"
            );


        const progressBar =
            document.getElementById(
                "importProgressBar"
            );


        const progressStatus =
            document.getElementById(
                "importStatus"
            );


        if (progressDiv) {
            progressDiv.style.display =
                "block";
        }


        if (progressBar) {
            progressBar.style.width =
                "10%";
        }


        if (progressStatus) {
            progressStatus.textContent =
                "Membaca file...";
        }


        try {

            showLoading(true);


            const result =
                await importFromExcel(
                    file
                );


            if (progressBar) {
                progressBar.style.width =
                    "100%";
            }


            let message =
                "✅ IMPORT SELESAI\n\n";


            message +=
                `User berhasil: ${result.users}\n`;


            message +=
                `Lokasi berhasil: ${result.lokasi}\n`;


            message +=
                `Dilewati: ${result.skipped}\n`;


            if (
                result.errors &&
                result.errors.length
            ) {

                message +=
                    `\nError: ${result.errors.length}`;

            }


            alert(
                message
            );


            clearCache();


            await loadUsers(true);

            await loadStats(true);

            await loadFilterOptions();

            await loadPresensi();

            await loadLocations();

            await initMapMonitoring();


        } catch (error) {

            console.error(
                "Import error:",
                error
            );


            alert(
                "❌ Gagal import: " +
                error.message
            );

        } finally {

            showLoading(false);


            setTimeout(
                () => {

                    if (progressDiv) {

                        progressDiv.style.display =
                            "none";

                    }

                },
                3000
            );


            event.target.value = "";

        }

    };


// =====================================================
// EXPORT
// =====================================================

window.exportData =
    async function() {

        try {

            showLoading(true);

            await exportToExcel(
                currentFilter.tanggal
            );

        } catch (error) {

            alert(
                "❌ Gagal export: " +
                error.message
            );

        } finally {

            showLoading(false);

        }

    };


// =====================================================
// TEMPLATE
// =====================================================

window.downloadTemplate =
    function() {

        const template = [

            ["USER"],

            [
                "nama",
                "email",
                "password",
                "role",
                "kecamatan",
                "kelurahan",
                "kota"
            ],

            [
                "Budi",
                "budi@mail.com",
                "123456",
                "user",
                "Magelang Tengah",
                "Magelang",
                "Magelang"
            ],

            [""],

            ["LOKASI"],

            [
                "nama",
                "tipe",
                "lat",
                "lng",
                "radius"
            ],

            [
                "Kantor Pusat",
                "kantor",
                "-7.4706",
                "110.2177",
                "100"
            ]

        ];


        const wb =
            XLSX.utils.book_new();


        const ws =
            XLSX.utils.aoa_to_sheet(
                template
            );


        XLSX.utils.book_append_sheet(
            wb,
            ws,
            "Template"
        );


        XLSX.writeFile(
            wb,
            "template_import.xlsx"
        );

    };
