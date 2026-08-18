import { auth, db } from "./firebase-init.js"

import {
    collection,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js"

import {
    signOut
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js"

import {
    getRekapHarian,
    getRekapBulanan,
    getRekapKoordinator,
    getExportHarian,
    getExportBulanan
} from "./rekap.js"


// =====================================================
// VARIABEL GLOBAL
// =====================================================

let userData = {}

let allUsers = []
let allPresensi = []

let currentFilter = {
    bulan: new Date().getMonth() + 1,
    tahun: new Date().getFullYear(),
    kelurahan: "",
    tanggal: ""
}


// =====================================================
// LOGOUT
// =====================================================

async function logout() {

    if (!confirm("Apakah Anda yakin ingin keluar?")) {
        return
    }

    try {

        await signOut(auth)

        localStorage.removeItem("userData")

        window.location.href = "index.html"

    } catch (error) {

        console.error("Logout error:", error)

        alert("Gagal logout: " + error.message)

    }

}


// =====================================================
// LOADING
// =====================================================

function showLoading(show) {

    const el = document.getElementById("loading")

    if (el) {
        el.style.display = show ? "flex" : "none"
    }

}


// =====================================================
// ERROR MODAL
// =====================================================

function showError(message) {

    const modal =
        document.getElementById("errorModal")

    const messageEl =
        document.getElementById("errorMessage")


    if (modal && messageEl) {

        messageEl.textContent = message

        modal.style.display = "flex"

    } else {

        alert(message)

    }

}


window.closeErrorModal = function () {

    const modal =
        document.getElementById("errorModal")

    if (modal) {
        modal.style.display = "none"
    }

}


// =====================================================
// FORMAT BULAN
// =====================================================

function formatBulan(bulan, tahun) {

    const namaBulan = [
        "Januari",
        "Februari",
        "Maret",
        "April",
        "Mei",
        "Juni",
        "Juli",
        "Agustus",
        "September",
        "Oktober",
        "November",
        "Desember"
    ]

    return `${namaBulan[bulan - 1]} ${tahun}`

}


// =====================================================
// FORMAT WAKTU
// =====================================================

function getJamPresensi(p) {

    try {

        if (
            p.waktu &&
            typeof p.waktu.toDate === "function"
        ) {

            const d = p.waktu.toDate()

            return d.toLocaleTimeString(
                "id-ID",
                {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                    timeZone: "Asia/Jakarta"
                }
            ).replace(/\./g, ":")

        }


        if (
            p.waktu &&
            p.waktu.seconds !== undefined
        ) {

            const d =
                new Date(
                    p.waktu.seconds * 1000
                )

            return d.toLocaleTimeString(
                "id-ID",
                {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                    timeZone: "Asia/Jakarta"
                }
            ).replace(/\./g, ":")

        }


        if (typeof p.waktu === "string") {

            return p.waktu.substring(0, 5)

        }

    } catch (error) {

        console.warn(
            "Gagal membaca waktu:",
            error
        )

    }

    return "-"

}


// =====================================================
// CARI ID KOORDINATOR
// =====================================================

function getKoordinatorId(user) {

    return (
        user.koordinatorId ||
        user.idKoordinator ||
        user.coordinatorId ||
        user.koordinatorUid ||
        user.coordinatorUid ||
        ""
    )

}


// =====================================================
// LOAD DASHBOARD
// =====================================================

window.addEventListener(
    "load",
    async () => {

        showLoading(true)

        try {

            const stored =
                localStorage.getItem("userData")


            if (stored) {

                userData =
                    JSON.parse(stored)

            }


            if (
                !userData ||
                userData.role !== "koordinator"
            ) {

                window.location.href =
                    "index.html"

                return

            }


            const userName =
                document.getElementById(
                    "userName"
                )

            const avatar =
                document.getElementById(
                    "avatar"
                )

            const userRole =
                document.getElementById(
                    "userRole"
                )


            if (userName) {

                userName.textContent =
                    userData.nama ||
                    "Koordinator"

            }


            if (avatar) {

                avatar.textContent =
                    (
                        userData.nama ||
                        "K"
                    )
                    .charAt(0)
                    .toUpperCase()

            }


            if (userRole) {

                userRole.textContent =
                    "Koordinator - Monitoring"

            }


            const logoutBtn =
                document.getElementById(
                    "logoutBtn"
                )

            if (logoutBtn) {

                logoutBtn.addEventListener(
                    "click",
                    logout
                )

            }


            // FILTER DEFAULT

            const bulanEl =
                document.getElementById(
                    "filterBulan"
                )

            const tahunEl =
                document.getElementById(
                    "filterTahun"
                )


            if (bulanEl) {

                bulanEl.value =
                    new Date().getMonth() + 1

            }


            if (tahunEl) {

                tahunEl.value =
                    new Date().getFullYear()

            }


            await loadData()

            await loadFilterOptions()

            await loadRekapBulanan()

            await loadRekapHarian()

            console.log(
                "Dashboard koordinator siap"
            )

        } catch (error) {

            console.error(
                "Dashboard error:",
                error
            )

            showError(
                "Gagal memuat dashboard: " +
                error.message
            )

        } finally {

            showLoading(false)

        }

    }
)


// =====================================================
// LOAD USERS & PRESENSI
// =====================================================

async function loadData() {

    const usersSnap =
        await getDocs(
            collection(db, "users")
        )


    allUsers = []


    usersSnap.forEach(docSnap => {

        const data =
            docSnap.data()


        // Admin dan pemantau tidak masuk anggota

        if (
            data.role === "admin" ||
            data.role === "pemantau"
        ) {
            return
        }


        allUsers.push({

            id: docSnap.id,

            uid:
                data.uid ||
                docSnap.id,

            ...data

        })

    })


    const presensiSnap =
        await getDocs(
            collection(db, "presensi")
        )


    allPresensi = []


    presensiSnap.forEach(docSnap => {

        allPresensi.push({

            id: docSnap.id,

            ...docSnap.data()

        })

    })


    console.log(
        "Users:",
        allUsers.length
    )

    console.log(
        "Presensi:",
        allPresensi.length
    )

}


// =====================================================
// FILTER KELURAHAN
// =====================================================

async function loadFilterOptions() {

    const set =
        new Set()


    allUsers.forEach(user => {

        if (
            user.kelurahan &&
            user.kelurahan !== "-"
        ) {

            set.add(
                user.kelurahan
            )

        }

    })


    const select =
        document.getElementById(
            "filterKelurahan"
        )


    if (!select) {
        return
    }


    select.innerHTML =
        '<option value="">Semua Kelurahan</option>'


    Array.from(set)
        .sort()
        .forEach(kelurahan => {

            const option =
                document.createElement(
                    "option"
                )

            option.value =
                kelurahan

            option.textContent =
                kelurahan

            select.appendChild(
                option
            )

        })

}


// =====================================================
// FILTER ANGGOTA KOORDINATOR
// =====================================================

function getAnggotaKoordinator() {

    const currentId =
        userData.uid ||
        userData.id ||
        ""


    const currentName =
        String(
            userData.nama || ""
        )
        .trim()
        .toLowerCase()


    /*
     * Pertama coba berdasarkan ID.
     */

    let anggota =
        allUsers.filter(user => {

            const koordinatorId =
                getKoordinatorId(user)

            return (
                koordinatorId &&
                String(
                    koordinatorId
                ) === String(currentId)
            )

        })


    /*
     * Jika belum ada field koordinatorId
     * pada data lama, jangan langsung
     * mengosongkan seluruh dashboard.
     *
     * Koordinator sendiri tetap dapat
     * ditampilkan jika role-nya koordinator.
     */

    if (anggota.length === 0) {

        anggota =
            allUsers.filter(user => {

                return (
                    user.role ===
                    "koordinator"
                )

            })

    }


    /*
     * Tambahkan koordinator sendiri
     * jika belum masuk.
     */

    const sudahAda =
        anggota.some(
            user =>
                String(user.uid) ===
                String(currentId)
        )


    if (
        userData.role === "koordinator" &&
        !sudahAda
    ) {

        anggota.push({

            ...userData,

            uid:
                userData.uid ||
                userData.id

        })

    }


    return anggota

}


// =====================================================
// REKAP BULANAN
// =====================================================

async function loadRekapBulanan() {

    try {

        const bulan =
            parseInt(
                document.getElementById(
                    "filterBulan"
                )?.value
            )


        const tahun =
            parseInt(
                document.getElementById(
                    "filterTahun"
                )?.value
            )


        const kelurahan =
            document.getElementById(
                "filterKelurahan"
            )?.value || ""


        currentFilter.bulan =
            bulan

        currentFilter.tahun =
            tahun

        currentFilter.kelurahan =
            kelurahan


        const bulanString =
            `${tahun}-${String(bulan).padStart(2, "0")}`


        const rekap =
            await getRekapBulanan(
                bulanString
            )


        let anggota =
            getAnggotaKoordinator()


        /*
         * Ambil data hasil rekap
         * berdasarkan UID.
         */

        const rekapMap =
            new Map(
                rekap.data.map(
                    item => [
                        String(item.uid),
                        item
                    ]
                )
            )


        anggota =
            anggota
            .map(user => {

                const result =
                    rekapMap.get(
                        String(user.uid)
                    )


                return {

                    ...user,

                    ...(result || {})

                }

            })


        if (kelurahan) {

            anggota =
                anggota.filter(
                    user =>
                        user.kelurahan ===
                        kelurahan
                )

        }


        anggota.sort(
            (a, b) => {

                const kelA =
                    String(
                        a.kelurahan || ""
                    ).toUpperCase()

                const kelB =
                    String(
                        b.kelurahan || ""
                    ).toUpperCase()


                if (kelA < kelB)
                    return -1

                if (kelA > kelB)
                    return 1


                return String(
                    a.nama || ""
                ).localeCompare(
                    String(
                        b.nama || ""
                    )
                )

            }
        )


        const bulanDisplay =
            document.getElementById(
                "bulanDisplay"
            )


        if (bulanDisplay) {

            bulanDisplay.textContent =
                formatBulan(
                    bulan,
                    tahun
                )

        }


        const daysInMonth =
            new Date(
                tahun,
                bulan,
                0
            ).getDate()


        let totalHariKerja =
            0


        for (
            let d = 1;
            d <= daysInMonth;
            d++
        ) {

            const day =
                new Date(
                    tahun,
                    bulan - 1,
                    d
                ).getDay()


            if (
                day !== 0 &&
                day !== 6
            ) {

                totalHariKerja++

            }

        }


        // =============================================
        // HEADER
        // =============================================

        const header =
            document.getElementById(
                "headerBulanan"
            )


        if (header) {

            let html =
                "<th>No</th>" +
                "<th>Nama Fasilitator</th>" +
                "<th>Kelurahan</th>"


            for (
                let d = 1;
                d <= daysInMonth;
                d++
            ) {

                const day =
                    new Date(
                        tahun,
                        bulan - 1,
                        d
                    ).getDay()


                const weekend =
                    day === 0 ||
                    day === 6


                html += `
                    <th style="
                        background:${weekend
                            ? "#E74C3C"
                            : "#34495E"};
                        color:white;
                        min-width:35px;
                        padding:4px;
                        text-align:center;
                    ">
                        ${d}
                    </th>
                `

            }


            html +=
                "<th>Hadir</th>" +
                "<th>Kerja</th>" +
                "<th>%</th>"


            header.innerHTML =
                html

        }


        // =============================================
        // BUAT MAP PRESENSI
        // =============================================

        const map = {}


        allPresensi.forEach(p => {

            if (!p.uid || !p.tanggal) {
                return
            }


            if (
                !p.tanggal.startsWith(
                    bulanString
                )
            ) {

                return

            }


            if (!map[p.uid]) {
                map[p.uid] = {}
            }


            map[p.uid][p.tanggal] =
                getJamPresensi(p)

        })


        // =============================================
        // BODY
        // =============================================

        let html = ""

        let totalHadirSemua = 0


        anggota.forEach(
            (user, index) => {

                let hadir = 0

                let cells = ""


                for (
                    let d = 1;
                    d <= daysInMonth;
                    d++
                ) {

                    const tanggal =
                        `${bulanString}-${String(d).padStart(2, "0")}`


                    const day =
                        new Date(
                            tahun,
                            bulan - 1,
                            d
                        ).getDay()


                    const weekend =
                        day === 0 ||
                        day === 6


                    if (weekend) {

                        cells += `
                            <td style="
                                background:#FADBD8;
                                color:#C0392B;
                                text-align:center;
                                font-weight:bold;
                            ">
                                L
                            </td>
                        `

                        continue

                    }


                    const jam =
                        map[user.uid]?.[
                            tanggal
                        ]


                    if (jam) {

                        hadir++

                        cells += `
                            <td style="
                                background:#D4EFDF;
                                color:#27AE60;
                                text-align:center;
                                padding:4px;
                            ">
                                <div style="
                                    font-weight:bold;
                                ">
                                    H
                                </div>

                                <div style="
                                    font-size:9px;
                                ">
                                    ${jam}
                                </div>
                            </td>
                        `

                    } else {

                        cells += `
                            <td style="
                                background:#FCF3CF;
                                color:#D35400;
                                text-align:center;
                            ">
                                -
                            </td>
                        `

                    }

                }


                totalHadirSemua +=
                    hadir


                const persen =
                    totalHariKerja > 0
                        ? Math.round(
                            (
                                hadir /
                                totalHariKerja
                            ) * 100
                        )
                        : 0


                const roleBadge =
                    user.role ===
                    "koordinator"
                        ? `
                            <span style="
                                background:#F39C12;
                                color:white;
                                padding:2px 4px;
                                border-radius:10px;
                                font-size:9px;
                            ">
                                K
                            </span>
                        `
                        : ""


                html += `
                    <tr>

                        <td>
                            ${index + 1}
                        </td>

                        <td style="
                            min-width:150px;
                            font-weight:500;
                        ">
                            ${user.nama || "-"}
                            ${roleBadge}
                        </td>

                        <td>
                            ${user.kelurahan || "-"}
                        </td>

                        ${cells}

                        <td style="
                            font-weight:bold;
                            text-align:center;
                            background:#EAF2F8;
                        ">
                            ${hadir}
                        </td>

                        <td style="
                            text-align:center;
                            color:#7F8C8D;
                        ">
                            ${totalHariKerja}
                        </td>

                        <td style="
                            font-weight:bold;
                            text-align:center;
                        ">
                            ${persen}%
                        </td>

                    </tr>
                `

            }
        )


        const table =
            document.getElementById(
                "tableBulanan"
            )


        if (table) {

            table.innerHTML =
                html ||
                `
                    <tr>
                        <td colspan="${
                            daysInMonth + 6
                        }"
                            style="
                                text-align:center;
                                padding:15px;
                            "
                        >
                            Tidak ada data
                        </td>
                    </tr>
                `

        }


        // =============================================
        // STATISTIK
        // =============================================

        const totalAnggota =
            anggota.length


        const rataHadir =
            totalAnggota > 0
                ? (
                    totalHadirSemua /
                    totalAnggota
                ).toFixed(1)
                : "0"


        const persenGlobal =
            totalHariKerja > 0
                ? Math.round(
                    (
                        rataHadir /
                        totalHariKerja
                    ) * 100
                )
                : 0


        const totalHariEl =
            document.getElementById(
                "totalHari"
            )


        if (totalHariEl) {

            totalHariEl.textContent =
                totalHariKerja +
                " Hari"

        }


        const rataHadirEl =
            document.getElementById(
                "rataHadir"
            )


        if (rataHadirEl) {

            rataHadirEl.textContent =
                rataHadir +
                " Hari"

        }


        const persenEl =
            document.getElementById(
                "persenBulanan"
            )


        if (persenEl) {

            persenEl.textContent =
                persenGlobal +
                "%"

        }


        // Grafik

        const grafik =
            anggota
            .map(user => ({

                ...user,

                totalHadir:
                    user.hadir || 0,

                persentase:
                    totalHariKerja > 0
                        ? (
                            (
                                user.hadir || 0
                            ) /
                            totalHariKerja
                        ) * 100
                        : 0

            }))
            .sort(
                (a, b) =>
                    a.totalHadir -
                    b.totalHadir
            )
            .slice(0, 10)


        renderGrafik(
            grafik,
            totalHariKerja
        )


    } catch (error) {

        console.error(
            "Rekap bulanan error:",
            error
        )

        showError(
            "Gagal memuat rekap bulanan: " +
            error.message
        )

    }

}


// =====================================================
// REKAP HARIAN
// =====================================================

async function loadRekapHarian() {

    const tanggalEl =
        document.getElementById(
            "filterTanggal"
        )


    /*
     * Kalau HTML belum mempunyai filterTanggal,
     * fungsi ini dilewati.
     */

    if (!tanggalEl) {

        console.log(
            "Filter tanggal belum tersedia."
        )

        return

    }


    const tanggal =
        tanggalEl.value


    if (!tanggal) {
        return
    }


    currentFilter.tanggal =
        tanggal


    try {

        const rekap =
            await getRekapHarian(
                tanggal
            )


        let anggota =
            getAnggotaKoordinator()


        const rekapMap =
            new Map(
                rekap.data.map(
                    item => [
                        String(item.uid),
                        item
                    ]
                )
            )


        anggota =
            anggota.map(user => {

                return {

                    ...user,

                    ...(rekapMap.get(
                        String(user.uid)
                    ) || {})

                }

            })


        const kelurahan =
            document.getElementById(
                "filterKelurahan"
            )?.value || ""


        if (kelurahan) {

            anggota =
                anggota.filter(
                    user =>
                        user.kelurahan ===
                        kelurahan
                )

        }


        renderTabelHarian(
            anggota
        )


    } catch (error) {

        console.error(
            "Rekap harian error:",
            error
        )

        showError(
            "Gagal memuat rekap harian: " +
            error.message
        )

    }

}


// =====================================================
// TABEL HARIAN
// =====================================================

function renderTabelHarian(users) {

    /*
     * Script mencari beberapa ID yang umum.
     * Kalau HTML kamu memakai salah satunya,
     * langsung digunakan.
     */

    const table =
        document.getElementById(
            "tableHarian"
        )


    if (!table) {
        return
    }


    let html = ""


    users.forEach(
        (user, index) => {

            const status =
                user.status ||
                "-"


            let statusHtml =
                status


            if (
                status.toLowerCase() ===
                "hadir"
            ) {

                statusHtml = `
                    <span style="
                        color:#27AE60;
                        font-weight:bold;
                    ">
                        HADIR
                    </span>
                `

            }


            html += `
                <tr>

                    <td>
                        ${index + 1}
                    </td>

                    <td>
                        ${user.nama || "-"}
                    </td>

                    <td>
                        ${user.kelurahan || "-"}
                    </td>

                    <td>
                        ${statusHtml}
                    </td>

                    <td>
                        ${user.waktu || "-"}
                    </td>

                    <td>
                        ${user.lokasi || "-"}
                    </td>

                </tr>
            `

        }
    )


    table.innerHTML =
        html ||
        `
            <tr>
                <td colspan="6"
                    style="
                        text-align:center;
                        padding:15px;
                    "
                >
                    Tidak ada data
                </td>
            </tr>
        `

}


// =====================================================
// GRAFIK
// =====================================================

function renderGrafik(
    users,
    totalHariKerja
) {

    const container =
        document.getElementById(
            "grafikContainer"
        )


    if (!container) {
        return
    }


    container.innerHTML = ""


    if (!users.length) {

        container.innerHTML =
            `
                <p style="
                    text-align:center;
                    color:#7F8C8D;
                ">
                    Tidak ada data
                </p>
            `

        return

    }


    users.forEach(user => {

        const persen =
            totalHariKerja > 0
                ? (
                    user.totalHadir /
                    totalHariKerja
                ) * 100
                : 0


        const height =
            Math.min(
                persen,
                100
            )


        const bar =
            document.createElement(
                "div"
            )


        bar.style.cssText =
            `
                flex:1;
                display:flex;
                flex-direction:column;
                align-items:center;
                gap:5px;
            `


        bar.innerHTML = `
            <div style="
                height:150px;
                width:100%;
                display:flex;
                align-items:flex-end;
            ">

                <div style="
                    height:${height}%;
                    width:100%;
                    background:${
                        persen >= 75
                            ? "#27AE60"
                            : persen >= 50
                                ? "#F39C12"
                                : "#E74C3C"
                    };
                    border-radius:5px 5px 0 0;
                "></div>

            </div>

            <div style="
                font-size:10px;
                text-align:center;
                white-space:nowrap;
                overflow:hidden;
                text-overflow:ellipsis;
                max-width:80px;
            "
            title="${user.nama || "-"}">

                ${
                    user.nama
                        ?.split(" ")[0] ||
                    "-"
                }

            </div>
        `


        container.appendChild(
            bar
        )

    })

}


// =====================================================
// APPLY FILTER
// =====================================================

window.applyFilter = async function () {

    showLoading(true)

    try {

        await loadRekapBulanan()

        await loadRekapHarian()

    } catch (error) {

        showError(
            error.message
        )

    } finally {

        showLoading(false)

    }

}


// =====================================================
// RESET FILTER
// =====================================================

window.resetFilter = async function () {

    const sekarang =
        new Date()


    const bulan =
        document.getElementById(
            "filterBulan"
        )


    const tahun =
        document.getElementById(
            "filterTahun"
        )


    const kelurahan =
        document.getElementById(
            "filterKelurahan"
        )


    if (bulan) {

        bulan.value =
            sekarang.getMonth() + 1

    }


    if (tahun) {

        tahun.value =
            sekarang.getFullYear()

    }


    if (kelurahan) {

        kelurahan.value =
            ""

    }


    const tanggal =
        document.getElementById(
            "filterTanggal"
        )


    if (tanggal) {

        tanggal.value =
            sekarang
            .toISOString()
            .split("T")[0]

    }


    await loadRekapBulanan()

    await loadRekapHarian()

}


// =====================================================
// EXPORT BULANAN
// =====================================================

window.exportBulanan = async function () {

    showLoading(true)

    try {

        const bulan =
            parseInt(
                document.getElementById(
                    "filterBulan"
                )?.value
            )


        const tahun =
            parseInt(
                document.getElementById(
                    "filterTahun"
                )?.value
            )


        const kelurahan =
            document.getElementById(
                "filterKelurahan"
            )?.value || ""


        const bulanString =
            `${tahun}-${String(bulan).padStart(2, "0")}`


        const rekap =
            await getRekapBulanan(
                bulanString
            )


        let anggota =
            getAnggotaKoordinator()


        const map =
            new Map(
                rekap.data.map(
                    item => [
                        String(item.uid),
                        item
                    ]
                )
            )


        anggota =
            anggota.map(user => ({

                ...user,

                ...(map.get(
                    String(user.uid)
                ) || {})

            }))


        if (kelurahan) {

            anggota =
                anggota.filter(
                    user =>
                        user.kelurahan ===
                        kelurahan
                )

        }


        const daysInMonth =
            new Date(
                tahun,
                bulan,
                0
            ).getDate()


        const header = [

            "No",

            "Nama",

            "Role",

            "Kelurahan",

            "Hadir",

            "Terlambat",

            "Izin",

            "Sakit",

            "Alpha",

            "Total Presensi",

            "Hari Kerja"

        ]


        for (
            let d = 1;
            d <= daysInMonth;
            d++
        ) {

            header.push(
                String(d)
            )

        }


        const excelData = [
            header
        ]


        anggota.forEach(
            (user, index) => {

                const row = [

                    index + 1,

                    user.nama || "-",

                    user.role ===
                        "koordinator"
                        ? "Koordinator"
                        : "Fasilitator",

                    user.kelurahan || "-",

                    user.hadir || 0,

                    user.terlambat || 0,

                    user.izin || 0,

                    user.sakit || 0,

                    user.alpha || 0,

                    user.totalPresensi || 0,

                    hitungHariKerja(
                        tahun,
                        bulan
                    )

                ]


                for (
                    let d = 1;
                    d <= daysInMonth;
                    d++
                ) {

                    const tanggal =
                        `${bulanString}-${String(d).padStart(2, "0")}`


                    const day =
                        new Date(
                            tahun,
                            bulan - 1,
                            d
                        ).getDay()


                    if (
                        day === 0 ||
                        day === 6
                    ) {

                        row.push("L")

                    } else {

                        const detail =
                            user.detail?.find(
                                item =>
                                    item.tanggal ===
                                    tanggal
                            )


                        row.push(
                            detail
                                ? getJamPresensi({
                                    waktu:
                                        detail.waktu
                                })
                                : "-"
                        )

                    }

                }


                excelData.push(
                    row
                )

            }
        )


        const wb =
            XLSX.utils.book_new()


        const ws =
            XLSX.utils.aoa_to_sheet(
                excelData
            )


        XLSX.utils.book_append_sheet(
            wb,
            ws,
            "Rekap Bulanan"
        )


        const namaBulan = [
            "Januari",
            "Februari",
            "Maret",
            "April",
            "Mei",
            "Juni",
            "Juli",
            "Agustus",
            "September",
            "Oktober",
            "November",
            "Desember"
        ]


        const fileName =
            kelurahan
                ? `Rekap_Koordinator_${kelurahan}_${namaBulan[bulan - 1]}_${tahun}.xlsx`
                : `Rekap_Koordinator_${namaBulan[bulan - 1]}_${tahun}.xlsx`


        XLSX.writeFile(
            wb,
            fileName
        )


    } catch (error) {

        console.error(
            "Export bulanan error:",
            error
        )

        alert(
            "Gagal export: " +
            error.message
        )

    } finally {

        showLoading(false)

    }

}


// =====================================================
// EXPORT HARIAN
// =====================================================

window.exportHarian = async function () {

    const tanggalEl =
        document.getElementById(
            "filterTanggal"
        )


    if (!tanggalEl?.value) {

        alert(
            "Pilih tanggal terlebih dahulu."
        )

        return

    }


    showLoading(true)


    try {

        const tanggal =
            tanggalEl.value


        const rekap =
            await getRekapHarian(
                tanggal
            )


        const anggota =
            getAnggotaKoordinator()


        const allowed =
            new Set(
                anggota.map(
                    user =>
                        String(user.uid)
                )
            )


        let data =
            rekap.data.filter(
                item =>
                    allowed.has(
                        String(item.uid)
                    )
            )


        const kelurahan =
            document.getElementById(
                "filterKelurahan"
            )?.value || ""


        if (kelurahan) {

            data =
                data.filter(
                    item =>
                        item.kelurahan ===
                        kelurahan
                )

        }


        const excelData = [

            [
                "No",
                "Nama",
                "Email",
                "Kelurahan",
                "Status",
                "Waktu",
                "Lokasi"
            ]

        ]


        data.forEach(
            (item, index) => {

                excelData.push([

                    index + 1,

                    item.nama || "-",

                    item.email || "-",

                    item.kelurahan || "-",

                    item.status || "-",

                    item.waktu || "-",

                    item.lokasi || "-"

                ])

            }
        )


        const wb =
            XLSX.utils.book_new()


        const ws =
            XLSX.utils.aoa_to_sheet(
                excelData
            )


        XLSX.utils.book_append_sheet(
            wb,
            ws,
            "Rekap Harian"
        )


        XLSX.writeFile(
            wb,
            `Rekap_Koordinator_${tanggal}.xlsx`
        )


    } catch (error) {

        console.error(
            "Export harian error:",
            error
        )

        alert(
            "Gagal export: " +
            error.message
        )

    } finally {

        showLoading(false)

    }

}


// =====================================================
// HITUNG HARI KERJA
// =====================================================

function hitungHariKerja(
    tahun,
    bulan
) {

    const days =
        new Date(
            tahun,
            bulan,
            0
        ).getDate()


    let total = 0


    for (
        let d = 1;
        d <= days;
        d++
    ) {

        const day =
            new Date(
                tahun,
                bulan - 1,
                d
            ).getDay()


        if (
            day !== 0 &&
            day !== 6
        ) {

            total++

        }

    }


    return total

}


console.log(
    "koordinator-dashboard.js siap"
)
